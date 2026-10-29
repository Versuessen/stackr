// The whole API in one request handler (one serverless function = one cold start).
//
//   GET  /api/state               session + the data this person may see (ETag, 304 when unchanged)
//   POST /api/auth/register       new account: Minecraft name + password (+ optional invite code)
//   POST /api/auth/login          name + password
//   POST /api/auth/reset          new password with a one-time reset code from the seller
//   POST /api/auth/password       change password (signed in)
//   POST /api/auth/totp           seller second factor (authenticator code or recovery code)
//   POST /api/auth/enroll/start   seller: first-time 2FA setup (secret + QR)
//   POST /api/auth/enroll/confirm seller: confirm setup, receive recovery codes once
//   POST /api/auth/logout         end this session
//   POST /api/auth/logout-all     end every session of this account
//   POST /api/command             run one validated command as the signed-in person
//   POST /api/seller/invite       seller: invite code bound to one Minecraft name
//   GET  /api/seller/invites      seller: open invites
//   POST /api/seller/invite/revoke  seller: withdraw an invite
//   POST /api/seller/reset-code   seller: one-time password reset code for a client
//   POST /api/seller/release      seller: free a name claimed by the wrong person
//   GET  /api/me/export           download everything stored about me (GDPR Art. 15/20)
//   POST /api/me/delete           erase my account (GDPR Art. 17)
//   GET  /api/cron                daily housekeeping, Vercel Cron only (CRON_SECRET)

import QRCode from 'qrcode';
import { ZodError } from 'zod';
import type { Account, DB } from '../src/domain/types.js';
import {
  ActionError, claimSellerAccount, createAccount, deleteAccount, purgeOld, releaseName, touchLogin,
} from '../src/data/actions.js';
import { SELLER_COMMANDS, toMut, type Command } from '../src/data/commands.js';
import { decrypt, encrypt, newTotpSecret, normRecovery, randomToken, recoveryCodes, safeEqual, sha256, subKey, verifyTotp } from './crypto.js';
import { storeCode, useCode } from './codes.js';
import { audit, migrate, type Sql } from './db.js';
import type { Env } from './env.js';
import { HttpError, checkWriteRequest, clearCookie, clientIp, json, readJson } from './http.js';
import { resolveLines } from './items.js';
import { lookupName } from './mojang.js';
import { dummyHash, hashPassword, passwordProblem, verifyPassword } from './passwords.js';
import { LIMITS, ipHash, limit } from './ratelimit.js';
import {
  accountRef, changePasswordBody, command as commandSchema, deleteConfirm, inviteBody, inviteRef, loginBody, registerBody,
  resetBody, secondFactor, sixDigits,
} from './schemas.js';
import { createSession, endAllSessions, endSession, getSession, markMfa, type Session } from './session.js';
import { mutate, read } from './state.js';
import { viewFor, type Viewer } from './view.js';

interface Ctx {
  req: Request;
  env: Env;
  sql: Sql;
  ip: string;
  session: Session | null;
}

type MfaState = 'needed' | 'enroll' | null;

function routeOf(req: Request): string {
  const url = new URL(req.url);
  let p = url.pathname.replace(/^\/api\/?/, '');
  if (p === '' || p === 'index') p = url.searchParams.get('__p') ?? '';
  return p.replace(/^\/+|\/+$/g, '');
}

function accountOf(db: DB, s: Session | null): Account | null {
  if (!s) return null;
  const a = db.accounts.find((x) => x.id === s.accountId);
  return a && !a.deletedAt && !a.disabledAt ? a : null;
}

/** Seller rights need the seller account and a finished 2FA step in this session. */
function viewerOf(db: DB, s: Session | null): Viewer {
  const account = accountOf(db, s);
  if (!account) return null;
  if (account.sellerId && !s!.mfaOk) return null; // pending 2FA: public view only
  return { account, seller: !!account.sellerId };
}

async function mfaStateFor(ctx: Ctx, db: DB): Promise<MfaState> {
  const account = accountOf(db, ctx.session);
  if (!account?.sellerId || ctx.session!.mfaOk) return null;
  const rows = await ctx.sql.query('select 1 from seller_mfa where account_id = $1 and enrolled_at is not null', [account.id]);
  return rows.length ? 'needed' : 'enroll';
}

function requireAccount(ctx: Ctx, db: DB, opts: { allowPendingSeller?: boolean } = {}): Account {
  const account = accountOf(db, ctx.session);
  if (!account) throw new HttpError(401, 'err.signInFirst');
  if (account.sellerId && !ctx.session!.mfaOk && !opts.allowPendingSeller) throw new HttpError(401, 'err.mfaRequired');
  return account;
}

function pendingSeller(ctx: Ctx, db: DB): Account {
  const account = accountOf(db, ctx.session);
  if (!account?.sellerId) throw new HttpError(403, 'err.notAllowed');
  return account;
}

const mfaKey = (env: Env) => subKey(env.appSecret, 'totp-secret');

// ---------- Routes ----------

async function getState(ctx: Ctx): Promise<Response> {
  const st = await read(ctx.sql);
  const mfa = await mfaStateFor(ctx, st.db);
  const viewer = viewerOf(st.db, ctx.session);
  const etag = `"${st.version}.${ctx.session ? sha256(ctx.session.idHash).slice(0, 10) : '0'}.${mfa ?? '-'}.${viewer?.seller ? 's' : 'c'}"`;
  if (ctx.req.headers.get('if-none-match') === etag) return json(null, 304, { etag });
  const pending = mfa ? accountOf(st.db, ctx.session) : null;
  return json({
    mode: 'live',
    version: st.version,
    me: viewer?.account.id ?? null,
    pending: pending ? { mcName: pending.mcName } : null,
    mfa,
    auth: { ready: true },
    db: viewFor(st.db, viewer),
  }, 200, { etag });
}

// ---------- Accounts: name + password ----------

async function mfaFor(sql: Sql, accountId: string): Promise<MfaState> {
  const rows = await sql.query('select 1 from seller_mfa where account_id = $1 and enrolled_at is not null', [accountId]);
  return rows.length ? 'needed' : 'enroll';
}

/** Always a fresh session id on sign-in (no session fixation). */
async function startSession(ctx: Ctx, account: Account): Promise<string> {
  if (ctx.session) await endSession(ctx.sql, ctx.session.idHash);
  return createSession(ctx.sql, account.id, !!account.sellerId);
}

async function signedIn(ctx: Ctx, account: Account, event: string, extra: Record<string, unknown> = {}): Promise<Response> {
  const cookie = await startSession(ctx, account);
  await audit(ctx.sql, account.sellerId ? `${event}.seller` : event, account.id, ctx.ip);
  const mfa = account.sellerId ? await mfaFor(ctx.sql, account.id) : null;
  return json({ ok: true, mfa, mcName: account.mcName, ...extra }, 200, {}, [cookie]);
}

async function postLogin(ctx: Ctx): Promise<Response> {
  const body = loginBody.parse(await readJson(ctx.req));
  const nameLc = body.name.toLowerCase();
  await limit(ctx.sql, `login:${ctx.ip}`, ...LIMITS.loginIp);
  await limit(ctx.sql, `login-name:${sha256(nameLc)}`, ...LIMITS.loginName);
  await limit(ctx.sql, 'login:all', ...LIMITS.loginGlobal);
  const rows = await ctx.sql.query<{ account_id: string; pw_hash: string }>('select account_id, pw_hash from credentials where name_lc = $1', [nameLc]);
  const good = await verifyPassword(body.password, rows[0]?.pw_hash ?? await dummyHash());
  const st = await read(ctx.sql);
  const account = rows[0] && good ? st.db.accounts.find((a) => a.id === rows[0].account_id && !a.deletedAt && !a.disabledAt) : undefined;
  if (!account) {
    await audit(ctx.sql, 'login.fail', null, ctx.ip);
    throw new HttpError(400, 'err.loginFailed'); // same message for unknown name and wrong password
  }
  await mutate(ctx.sql, touchLogin(account.id));
  return signedIn(ctx, account, 'login');
}

async function postRegister(ctx: Ctx): Promise<Response> {
  const body = registerBody.parse(await readJson(ctx.req));
  await limit(ctx.sql, `register:${ctx.ip}`, ...LIMITS.registerIp);
  const weak = passwordProblem(body.password, body.name);
  if (weak) throw new HttpError(422, weak);

  const who = await lookupName(body.name); // the name must exist; exact spelling + UUID from Mojang
  const nameLc = who.name.toLowerCase();
  const st = await read(ctx.sql);
  const sellerAcc = st.db.accounts.find((a) => a.sellerId);
  const sellerClaimed = !!sellerAcc && (await ctx.sql.query('select 1 from credentials where account_id = $1', [sellerAcc.id])).length > 0;
  const isSetup = !!body.code && !!ctx.env.sellerSetupCode && !sellerClaimed && safeEqual(body.code, ctx.env.sellerSetupCode);
  const inviteOnly = st.db.sellers.some((x) => x.inviteOnly);
  if (!body.code && inviteOnly) throw new HttpError(403, 'err.inviteRequired');

  // Is the name already claimed? An invite for it may take it back from an unconfirmed claim.
  const existing = await ctx.sql.query<{ account_id: string }>('select account_id from credentials where name_lc = $1', [nameLc]);
  const holder = existing[0] ? st.db.accounts.find((a) => a.id === existing[0].account_id) : undefined;
  const canTakeOver = !!holder && !holder.sellerId && !holder.nameConfirmedAt && !!body.code && !isSetup;
  if (existing[0] && !canTakeOver) throw new HttpError(409, 'err.nameTaken');

  if (body.code && !isSetup) {
    await limit(ctx.sql, `code:${sha256(nameLc)}`, ...LIMITS.codeName);
    const invite = await useCode(ctx.sql, ctx.env, 'invite', nameLc, body.code);
    if (!invite) throw new HttpError(400, 'err.codeInvalid');
  }
  if (canTakeOver && holder) {
    await mutate(ctx.sql, releaseName(holder.id));
    await ctx.sql.query('delete from credentials where account_id = $1', [holder.id]);
    await endAllSessions(ctx.sql, holder.id);
    await audit(ctx.sql, 'name.released.invite', holder.id, ctx.ip);
  }

  const id = isSetup ? sellerAcc!.id : `acc-${randomToken(9).replace(/[^A-Za-z0-9]/g, 'x')}`;
  const pwHash = await hashPassword(body.password);
  try {
    await ctx.sql.query('insert into credentials (account_id, name_lc, pw_hash) values ($1, $2, $3)', [id, nameLc, pwHash]);
  } catch {
    throw new HttpError(409, 'err.nameTaken'); // lost a race for the same name
  }
  try {
    const out = await mutate(ctx.sql, isSetup ? claimSellerAccount(who.name, who.uuid) : createAccount(id, who.name, who.uuid, !!body.code));
    const account = out.db.accounts.find((a) => a.id === id)!;
    return signedIn(ctx, account, isSetup ? 'register.setup' : 'register', { confirmed: !!account.nameConfirmedAt });
  } catch (e) {
    await ctx.sql.query('delete from credentials where account_id = $1', [id]);
    throw e;
  }
}

async function postReset(ctx: Ctx): Promise<Response> {
  const body = resetBody.parse(await readJson(ctx.req));
  const nameLc = body.name.toLowerCase();
  await limit(ctx.sql, `login:${ctx.ip}`, ...LIMITS.loginIp);
  await limit(ctx.sql, `code:${sha256(nameLc)}`, ...LIMITS.codeName);
  const weak = passwordProblem(body.password, body.name);
  if (weak) throw new HttpError(422, weak);
  const cred = (await ctx.sql.query<{ account_id: string }>('select account_id from credentials where name_lc = $1', [nameLc]))[0];
  const st = await read(ctx.sql);
  const account = cred ? st.db.accounts.find((a) => a.id === cred.account_id && !a.deletedAt && !a.disabledAt) : undefined;
  if (!account) throw new HttpError(400, 'err.codeInvalid');
  // Clients get reset codes from the seller; the seller resets with the setup code (2FA still applies).
  const ok = account.sellerId
    ? !!ctx.env.sellerSetupCode && safeEqual(body.code, ctx.env.sellerSetupCode)
    : (await useCode(ctx.sql, ctx.env, 'reset', nameLc, body.code))?.account_id === account.id;
  if (!ok) { await audit(ctx.sql, 'reset.fail', account.id, ctx.ip); throw new HttpError(400, 'err.codeInvalid'); }
  await ctx.sql.query('update credentials set pw_hash = $2, updated_at = now() where account_id = $1', [account.id, await hashPassword(body.password)]);
  await endAllSessions(ctx.sql, account.id);
  return signedIn(ctx, account, 'reset');
}

async function postChangePassword(ctx: Ctx): Promise<Response> {
  const st = await read(ctx.sql);
  const account = requireAccount(ctx, st.db);
  await limit(ctx.sql, `login-name:${sha256(account.mcName.toLowerCase())}`, ...LIMITS.loginName);
  const body = changePasswordBody.parse(await readJson(ctx.req));
  const row = (await ctx.sql.query<{ pw_hash: string }>('select pw_hash from credentials where account_id = $1', [account.id]))[0];
  if (!row || !(await verifyPassword(body.current, row.pw_hash))) throw new HttpError(400, 'err.pwCurrent');
  const weak = passwordProblem(body.password, account.mcName);
  if (weak) throw new HttpError(422, weak);
  await ctx.sql.query('update credentials set pw_hash = $2, updated_at = now() where account_id = $1', [account.id, await hashPassword(body.password)]);
  await ctx.sql.query('delete from sessions where account_id = $1 and id_hash <> $2', [account.id, ctx.session!.idHash]);
  await audit(ctx.sql, 'password.changed', account.id, ctx.ip);
  return json({ ok: true });
}

// ---------- Seller: invites, reset codes, releasing names ----------

async function requireSeller(ctx: Ctx): Promise<{ db: DB; account: Account }> {
  const st = await read(ctx.sql);
  const v = viewerOf(st.db, ctx.session);
  if (!v?.seller) throw new HttpError(403, 'err.notAllowed');
  return { db: st.db, account: v.account };
}

async function postInvite(ctx: Ctx): Promise<Response> {
  const { account } = await requireSeller(ctx);
  await limit(ctx.sql, `seller-codes:${account.id}`, ...LIMITS.sellerCodes);
  const body = inviteBody.parse(await readJson(ctx.req));
  const who = await lookupName(body.name);
  const st = await read(ctx.sql);
  const holder = st.db.accounts.find((a) => !a.deletedAt && !a.disabledAt && a.mcName.toLowerCase() === who.name.toLowerCase());
  if (holder && (holder.nameConfirmedAt || holder.sellerId)) throw new HttpError(409, 'err.nameTaken');
  const c = await storeCode(ctx.sql, ctx.env, 'invite', who.name, null, account.id);
  await audit(ctx.sql, 'invite.create', account.id, ctx.ip);
  return json({ ok: true, ...c, name: who.name, takesOver: !!holder });
}

async function getInvites(ctx: Ctx): Promise<Response> {
  await requireSeller(ctx);
  const rows = await ctx.sql.query<{ id: string; name: string; created_at: string; expires_at: string }>(
    "select id, name, created_at, expires_at from auth_codes where kind = 'invite' and used_at is null and expires_at > now() order by created_at desc limit 100");
  return json({ invites: rows.map((r) => ({ id: String(r.id), name: r.name, createdAt: new Date(r.created_at).toISOString(), expiresAt: new Date(r.expires_at).toISOString() })) });
}

async function postRevokeInvite(ctx: Ctx): Promise<Response> {
  const { account } = await requireSeller(ctx);
  const { id } = inviteRef.parse(await readJson(ctx.req));
  await ctx.sql.query("delete from auth_codes where id = $1 and kind = 'invite' and used_at is null", [id]);
  await audit(ctx.sql, 'invite.revoke', account.id, ctx.ip);
  return json({ ok: true });
}

async function postResetCode(ctx: Ctx): Promise<Response> {
  const { db, account } = await requireSeller(ctx);
  await limit(ctx.sql, `seller-codes:${account.id}`, ...LIMITS.sellerCodes);
  const { accountId } = accountRef.parse(await readJson(ctx.req));
  const target = db.accounts.find((a) => a.id === accountId && !a.deletedAt && !a.disabledAt && !a.sellerId);
  const cred = target && (await ctx.sql.query('select 1 from credentials where account_id = $1', [target.id]))[0];
  if (!target || !cred) throw new HttpError(404, 'err.accountMissing');
  const c = await storeCode(ctx.sql, ctx.env, 'reset', target.mcName, target.id, account.id);
  await audit(ctx.sql, 'reset.create', account.id, ctx.ip);
  return json({ ok: true, ...c, name: target.mcName });
}

async function postRelease(ctx: Ctx): Promise<Response> {
  const { account } = await requireSeller(ctx);
  const { accountId } = accountRef.parse(await readJson(ctx.req));
  const st = await mutate(ctx.sql, releaseName(accountId));
  await ctx.sql.query('delete from credentials where account_id = $1', [accountId]);
  await endAllSessions(ctx.sql, accountId);
  await audit(ctx.sql, 'name.released', account.id, ctx.ip);
  return json({ ok: true, version: st.version, db: viewFor(st.db, viewerOf(st.db, ctx.session)) });
}

async function postTotp(ctx: Ctx): Promise<Response> {
  const st = await read(ctx.sql);
  const account = pendingSeller(ctx, st.db);
  await limit(ctx.sql, `mfa:${account.id}`, ...LIMITS.mfaAccount);
  const body = secondFactor.parse(await readJson(ctx.req));
  const rows = await ctx.sql.query<{ secret_enc: string; last_step: string; recovery_hashes: string[] }>(
    'select secret_enc, last_step, recovery_hashes from seller_mfa where account_id = $1 and enrolled_at is not null', [account.id]);
  if (!rows.length) throw new HttpError(409, 'err.mfaNotSetUp');
  const row = rows[0];
  if ('code' in body) {
    const step = verifyTotp(decrypt(mfaKey(ctx.env), row.secret_enc), body.code, Date.now(), Number(row.last_step));
    if (step === null) { await audit(ctx.sql, 'mfa.fail', account.id, ctx.ip); throw new HttpError(400, 'auth.wrongCode'); }
    await ctx.sql.query('update seller_mfa set last_step = $2, updated_at = now() where account_id = $1', [account.id, step]);
  } else {
    const h = sha256(normRecovery(body.recovery));
    if (!row.recovery_hashes.some((x) => safeEqual(x, h))) { await audit(ctx.sql, 'mfa.fail', account.id, ctx.ip); throw new HttpError(400, 'auth.wrongCode'); }
    await ctx.sql.query('update seller_mfa set recovery_hashes = array_remove(recovery_hashes, $2), updated_at = now() where account_id = $1', [account.id, h]);
    await audit(ctx.sql, 'mfa.recovery', account.id, ctx.ip);
  }
  await markMfa(ctx.sql, ctx.session!.idHash);
  await audit(ctx.sql, 'mfa.ok', account.id, ctx.ip);
  return json({ ok: true });
}

async function postEnrollStart(ctx: Ctx): Promise<Response> {
  const st = await read(ctx.sql);
  const account = pendingSeller(ctx, st.db);
  await limit(ctx.sql, `mfa:${account.id}`, ...LIMITS.mfaAccount);
  const done = await ctx.sql.query('select 1 from seller_mfa where account_id = $1 and enrolled_at is not null', [account.id]);
  if (done.length) throw new HttpError(409, 'err.mfaAlreadySetUp');
  const secret = newTotpSecret();
  await ctx.sql.query(
    `insert into seller_mfa (account_id, secret_enc) values ($1, $2)
     on conflict (account_id) do update set secret_enc = excluded.secret_enc, updated_at = now() where seller_mfa.enrolled_at is null`,
    [account.id, encrypt(mfaKey(ctx.env), secret)],
  );
  const uri = `otpauth://totp/${encodeURIComponent(`Stackr:${account.mcName}`)}?secret=${secret}&issuer=Stackr&algorithm=SHA1&digits=6&period=30`;
  const qr = await QRCode.toString(uri, { type: 'svg', margin: 1, errorCorrectionLevel: 'M' });
  return json({ secret, uri, qr });
}

async function postEnrollConfirm(ctx: Ctx): Promise<Response> {
  const st = await read(ctx.sql);
  const account = pendingSeller(ctx, st.db);
  await limit(ctx.sql, `mfa:${account.id}`, ...LIMITS.mfaAccount);
  const { code } = sixDigits.parse(await readJson(ctx.req));
  const rows = await ctx.sql.query<{ secret_enc: string }>('select secret_enc from seller_mfa where account_id = $1 and enrolled_at is null', [account.id]);
  if (!rows.length) throw new HttpError(409, 'err.mfaNotSetUp');
  const step = verifyTotp(decrypt(mfaKey(ctx.env), rows[0].secret_enc), code);
  if (step === null) throw new HttpError(400, 'auth.wrongCode');
  const codes = recoveryCodes();
  await ctx.sql.query(
    'update seller_mfa set enrolled_at = now(), last_step = $2, recovery_hashes = $3, updated_at = now() where account_id = $1 and enrolled_at is null',
    [account.id, step, codes.map((c) => sha256(normRecovery(c)))],
  );
  await markMfa(ctx.sql, ctx.session!.idHash);
  await audit(ctx.sql, 'mfa.enrolled', account.id, ctx.ip);
  return json({ ok: true, recovery: codes });
}

async function postLogout(ctx: Ctx, all: boolean): Promise<Response> {
  if (ctx.session) {
    if (all) await endAllSessions(ctx.sql, ctx.session.accountId);
    else await endSession(ctx.sql, ctx.session.idHash);
    await audit(ctx.sql, all ? 'logout.all' : 'logout', ctx.session.accountId, ctx.ip);
  }
  return json({ ok: true }, 200, {}, [clearCookie()]);
}

async function postCommand(ctx: Ctx): Promise<Response> {
  const cur = await read(ctx.sql);
  const account = requireAccount(ctx, cur.db);
  const viewer = viewerOf(cur.db, ctx.session)!;
  await limit(ctx.sql, `cmd:${account.id}`, ...LIMITS.commandAccount);
  const raw = await readJson(ctx.req) as { cmd?: unknown };
  const parsed = commandSchema.parse(raw?.cmd);
  if (SELLER_COMMANDS.has(parsed.type) && !viewer.seller) throw new HttpError(403, 'err.notAllowed');
  if (parsed.type === 'sendMessage') await limit(ctx.sql, `msg:${account.id}`, ...LIMITS.messageAccount);
  let cmd: Command;
  if (parsed.type === 'placeOrder') {
    await limit(ctx.sql, `order:${account.id}`, ...LIMITS.orderAccount);
    cmd = { type: 'placeOrder', input: { ...parsed.input, lines: parsed.input.lines ? resolveLines(parsed.input.lines) : undefined } };
  } else {
    cmd = parsed as Command;
  }
  let id: string | undefined;
  const st = await mutate(ctx.sql, toMut(cmd, account, (x) => { id = x; }));
  if (viewer.seller) await audit(ctx.sql, `cmd.${cmd.type}`, account.id, ctx.ip);
  const fresh = viewerOf(st.db, ctx.session);
  return json({ ok: true, id, version: st.version, db: viewFor(st.db, fresh) });
}

async function getExport(ctx: Ctx): Promise<Response> {
  const st = await read(ctx.sql);
  const account = requireAccount(ctx, st.db);
  const db = st.db;
  const sessions = await ctx.sql.query('select created_at, last_seen_at, expires_at from sessions where account_id = $1', [account.id]);
  const data = {
    exportedAt: new Date().toISOString(),
    note: 'Alle Daten, die Stackr über dich speichert. / Everything Stackr stores about you.',
    account,
    orders: db.orders.filter((o) => o.clientId === account.id),
    tokens: db.tokens.filter((t) => t.ownerId === account.id),
    notices: db.notices.filter((n) => n.accountId === account.id),
    blacklist: db.blacklist.filter((b) => b.clientId === account.id),
    sessions,
  };
  await audit(ctx.sql, 'account.export', account.id, ctx.ip);
  return json(data, 200, { 'content-disposition': `attachment; filename="stackr-${account.mcName}.json"` });
}

async function postDelete(ctx: Ctx): Promise<Response> {
  const cur = await read(ctx.sql);
  const account = requireAccount(ctx, cur.db);
  const { confirm } = deleteConfirm.parse(await readJson(ctx.req));
  if (confirm.trim().toLowerCase() !== account.mcName.toLowerCase()) throw new HttpError(400, 'err.confirmName');
  await mutate(ctx.sql, deleteAccount(account.id));
  await ctx.sql.query('delete from credentials where account_id = $1', [account.id]);
  await ctx.sql.query('delete from auth_codes where account_id = $1 or name_lc = $2', [account.id, account.mcName.toLowerCase()]);
  await endAllSessions(ctx.sql, account.id);
  await audit(ctx.sql, 'account.delete', account.id, null);
  return json({ ok: true }, 200, {}, [clearCookie()]);
}

async function getCron(ctx: Ctx): Promise<Response> {
  const auth = ctx.req.headers.get('authorization') || '';
  if (!ctx.env.cronSecret || !safeEqual(auth, `Bearer ${ctx.env.cronSecret}`)) throw new HttpError(401, 'err.notAllowed');
  await mutate(ctx.sql, purgeOld);
  const del = async (q: string) => (await ctx.sql.query(`${q} returning 1`)).length;
  const result = {
    sessions: await del('delete from sessions where expires_at < now()'),
    rateLimits: await del("delete from rate_limits where reset_at < now() - interval '1 day'"),
    audit: await del("delete from audit_log where at < now() - interval '90 days'"),
    pendingMfa: await del("delete from seller_mfa where enrolled_at is null and updated_at < now() - interval '1 day'"),
    codes: await del("delete from auth_codes where expires_at < now() - interval '7 days'"),
  };
  return json({ ok: true, ...result });
}

// ---------- Entry ----------

export function createHandler(env: Env | null, sql: Sql | null) {
  return async function handle(req: Request): Promise<Response> {
    const path = routeOf(req);
    const method = req.method.toUpperCase();
    try {
      if (!env || !sql) {
        if (path === 'state' && method === 'GET') return json({ mode: 'beta' });
        throw new HttpError(503, 'err.notLive');
      }
      await migrate(sql);
      const ip = ipHash(env.appSecret, clientIp(req));
      await limit(sql, `any:${ip}`, ...LIMITS.anyRequest);
      const base = { req, env, sql, ip, session: null as Session | null };
      if (path === 'cron' && method === 'GET') return await getCron(base);
      if (method === 'POST') {
        checkWriteRequest(req);
        await limit(sql, `write:${ip}`, ...LIMITS.write);
      } else if (method !== 'GET') {
        throw new HttpError(405, 'err.badRequest');
      }
      const ctx: Ctx = { ...base, session: await getSession(sql, req) };
      const key = `${method} ${path}`;
      switch (key) {
        case 'GET state': return await getState(ctx);
        case 'POST auth/login': return await postLogin(ctx);
        case 'POST auth/register': return await postRegister(ctx);
        case 'POST auth/reset': return await postReset(ctx);
        case 'POST auth/password': return await postChangePassword(ctx);
        case 'POST seller/invite': return await postInvite(ctx);
        case 'GET seller/invites': return await getInvites(ctx);
        case 'POST seller/invite/revoke': return await postRevokeInvite(ctx);
        case 'POST seller/reset-code': return await postResetCode(ctx);
        case 'POST seller/release': return await postRelease(ctx);
        case 'POST auth/totp': return await postTotp(ctx);
        case 'POST auth/enroll/start': return await postEnrollStart(ctx);
        case 'POST auth/enroll/confirm': return await postEnrollConfirm(ctx);
        case 'POST auth/logout': return await postLogout(ctx, false);
        case 'POST auth/logout-all': return await postLogout(ctx, true);
        case 'POST command': return await postCommand(ctx);
        case 'GET me/export': return await getExport(ctx);
        case 'POST me/delete': return await postDelete(ctx);
        default: throw new HttpError(404, 'err.badRequest');
      }
    } catch (e) {
      if (e instanceof HttpError) return json({ error: { key: e.key, vars: e.vars } }, e.status);
      if (e instanceof ActionError) return json({ error: { key: e.key, vars: e.vars } }, 422);
      if (e instanceof ZodError) return json({ error: { key: 'err.invalidInput' } }, 400);
      // Log the error type and message only: never bodies, cookies or personal data.
      console.error('api error', path, e instanceof Error ? `${e.name}: ${e.message}` : 'unknown');
      return json({ error: { key: 'err.unknown' } }, 500);
    }
  };
}
