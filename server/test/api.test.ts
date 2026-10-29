// End-to-end API test: real Postgres (PGlite, in-process), mocked Microsoft / Xbox / Minecraft
// endpoints, and the real request handler. Run with: npm run test:api
import { PGlite } from '@electric-sql/pglite';
import { createHandler } from '../routes.js';
import { readEnv } from '../env.js';
import { totpAt } from '../crypto.js';
import type { Sql } from '../db.js';
import type { DB } from '../../src/domain/types.js';

let failures = 0;
const ok = (cond: unknown, msg: string) => { if (cond) console.log('  ✓', msg); else { failures++; console.error('  ✗', msg); } };

const SELLER_UUID = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';

// ---------- Mock of the Microsoft → Xbox → Minecraft chain ----------
// An authorization code maps to a player; special codes trigger the failure branches.
const players = new Map<string, { name: string; id: string } | 'child' | 'noXbox' | 'unapproved' | 'noProfile'>();
const seenVerifiers: string[] = [];
const realFetch = globalThis.fetch;
const reply = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
  const url = String(input instanceof Request ? input.url : input);
  const body = typeof init?.body === 'string' ? init.body : init?.body instanceof URLSearchParams ? init.body.toString() : '';
  if (url.startsWith('https://login.microsoftonline.com/consumers/oauth2/v2.0/token')) {
    const f = new URLSearchParams(body);
    if (f.get('client_secret') !== 'test-client-secret' || f.get('redirect_uri') !== 'https://stackr.test/api/auth/microsoft/callback') return reply(401, { error: 'invalid_client' });
    seenVerifiers.push(f.get('code_verifier') ?? '');
    const code = f.get('code') ?? '';
    if (!players.has(code)) return reply(400, { error: 'invalid_grant' });
    return reply(200, { access_token: `ms-token-${code}`, token_type: 'Bearer' });
  }
  if (url === 'https://user.auth.xboxlive.com/user/authenticate') {
    const ticket = JSON.parse(body).Properties.RpsTicket as string;
    return reply(200, { Token: `xbl-token-${ticket.slice(11)}`, DisplayClaims: { xui: [{ uhs: 'uhs123' }] } });
  }
  if (url === 'https://xsts.auth.xboxlive.com/xsts/authorize') {
    const j = JSON.parse(body);
    const code = (j.Properties.UserTokens[0] as string).slice(10);
    if (j.RelyingParty !== 'rp://api.minecraftservices.com/') return reply(400, {});
    const p = players.get(code);
    if (p === 'child') return reply(401, { XErr: 2148916238 });
    if (p === 'noXbox') return reply(401, { XErr: 2148916233 });
    return reply(200, { Token: `xsts-token-${code}`, DisplayClaims: { xui: [{ uhs: 'uhs123' }] } });
  }
  if (url === 'https://api.minecraftservices.com/authentication/login_with_xbox') {
    const m = /^XBL3\.0 x=uhs123;xsts-token-(.+)$/.exec(JSON.parse(body).identityToken);
    if (!m) return reply(400, {});
    if (players.get(m[1]) === 'unapproved') return reply(403, { error: 'Invalid app registration' });
    return reply(200, { access_token: `mc-token-${m[1]}`, token_type: 'Bearer', expires_in: 86400 });
  }
  if (url === 'https://api.minecraftservices.com/minecraft/profile') {
    const code = String((init?.headers as Record<string, string>)?.authorization ?? '').replace('Bearer mc-token-', '');
    const p = players.get(code);
    if (!p || typeof p === 'string') return reply(404, { error: 'NOT_FOUND' });
    return reply(200, { id: p.id, name: p.name, skins: [], capes: [] });
  }
  return realFetch(input, init);
}) as typeof fetch;

const pg = new PGlite();
const sql: Sql = { query: async (t, p = []) => (await pg.query(t, p as never[])).rows as never };
const env = readEnv({
  DATABASE_URL: 'pglite', APP_SECRET: 'x'.repeat(48), SELLER_MC_UUID: SELLER_UUID, CRON_SECRET: 'cron-secret-123',
  MS_CLIENT_ID: 'test-client-id', MS_CLIENT_SECRET: 'test-client-secret', SITE_URL: 'https://stackr.test',
})!;
const handle = createHandler(env, sql);

const ORIGIN = 'https://stackr.test';
type Res = { status: number; body: any; cookie: string | null; cookies: string[]; headers: Headers };
async function call(method: string, path: string, opts: { body?: unknown; cookie?: string | null; ip?: string; headers?: Record<string, string> } = {}): Promise<Res> {
  const h: Record<string, string> = { host: 'stackr.test', 'x-real-ip': opts.ip ?? '10.0.0.1', ...opts.headers };
  if (method === 'POST') Object.assign(h, { origin: ORIGIN, 'x-stackr': '1', 'content-type': 'application/json' }, opts.headers);
  if (opts.cookie) h.cookie = opts.cookie;
  const res = await handle(new Request(`${ORIGIN}/api/${path}`, { method, headers: h, body: method === 'POST' ? JSON.stringify(opts.body ?? {}) : undefined }));
  const cookies = res.headers.getSetCookie();
  const sid = cookies.find((c) => c.startsWith('__Host-stackr_sid=') && !c.startsWith('__Host-stackr_sid=;'));
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : null, cookie: sid ? sid.split(';')[0] : null, cookies, headers: res.headers };
}
let codeN = 0;
/** Full browser round trip: /auth/microsoft → (Microsoft) → /auth/microsoft/callback. */
async function login(player: { name: string; id: string } | 'child' | 'noXbox' | 'unapproved' | 'noProfile', ip = '10.0.0.1', next = '') {
  const start = await call('GET', `auth/microsoft${next ? `?next=${next}` : ''}`, { ip });
  const loc = new URL(start.headers.get('location')!);
  const oauth = start.cookies.find((c) => c.startsWith('__Host-stackr_oauth='))!.split(';')[0];
  const code = `code${++codeN}`;
  players.set(code, player);
  const cb = await call('GET', `auth/microsoft/callback?code=${code}&state=${loc.searchParams.get('state')}`, { ip, cookie: oauth });
  return { start, loc, oauth, cb, location: cb.headers.get('location') ?? '', cookie: cb.cookie };
}
const cmd = (cookie: string, c: unknown) => call('POST', 'command', { cookie, body: { cmd: c } });

console.log('beta fallback');
{
  const beta = createHandler(null, null);
  const r = await beta(new Request('https://x/api/state'));
  ok(((await r.json()) as { mode: string }).mode === 'beta', 'no env → mode beta');
}

console.log('anonymous view');
const anon = await call('GET', 'state');
ok(anon.status === 200 && anon.body.mode === 'live' && anon.body.auth.ready === true, 'state is live, Microsoft sign-in ready');
ok(anon.body.me === null && anon.body.db.accounts.length === 1, 'only the seller account is visible');
ok(anon.headers.get('cache-control') === 'no-store', 'API responses are no-store');

console.log('CSRF checks');
ok((await call('POST', 'auth/logout', { headers: { origin: 'https://evil.test' } })).status === 403, 'foreign Origin rejected');
ok((await call('POST', 'auth/logout', { headers: { 'x-stackr': '0' } })).status === 403, 'missing custom header rejected');

console.log('Microsoft sign-in');
const first = await login({ name: 'Kiesel_Kai', id: 'b'.repeat(32) }, '10.0.0.1', 'items');
ok(first.start.status === 302 && first.loc.origin + first.loc.pathname === 'https://login.microsoftonline.com/consumers/oauth2/v2.0/authorize', 'start redirects to Microsoft (consumers tenant)');
ok(first.loc.searchParams.get('scope') === 'XboxLive.signin' && first.loc.searchParams.get('code_challenge_method') === 'S256' && (first.loc.searchParams.get('state') ?? '').length >= 32, 'PKCE S256, state, minimal scope (no offline_access)');
ok(first.loc.searchParams.get('redirect_uri') === 'https://stackr.test/api/auth/microsoft/callback', 'fixed redirect URI from SITE_URL');
ok(/HttpOnly/.test(first.start.cookies[0]) && /Secure/.test(first.start.cookies[0]) && /Max-Age=600/.test(first.start.cookies[0]), 'state cookie HttpOnly, Secure, 10 min');
ok(!first.oauth.includes(first.loc.searchParams.get('state')!), 'state cookie is encrypted');
ok(seenVerifiers.length === 1 && seenVerifiers[0].length >= 43, 'PKCE verifier sent to Microsoft');
ok(first.location === '/?signed_in=1#items' && !!first.cookie, 'signed in, back to where the player was');
ok(first.cb.cookies.some((c) => c.startsWith('__Host-stackr_oauth=;')), 'state cookie cleared after use');
const replay = await call('GET', `auth/microsoft/callback?code=code1&state=${first.loc.searchParams.get('state')}`, { cookie: first.oauth });
ok(replay.headers.get('location') === '/?auth_error=expired#signin' && !replay.cookie, 'replayed code rejected');
const forged = await call('GET', 'auth/microsoft/callback?code=x&state=forged', { cookie: first.oauth });
ok(forged.headers.get('location') === '/?auth_error=expired#signin', 'state mismatch rejected (login CSRF)');
ok((await call('GET', 'auth/microsoft/callback?code=x&state=y')).headers.get('location') === '/?auth_error=expired#signin', 'callback without state cookie rejected');
ok((await call('GET', 'auth/microsoft/callback?error=access_denied&state=y')).headers.get('location') === '/?auth_error=cancelled#signin', 'cancel at Microsoft handled');
ok((await login('child')).location === '/?auth_error=child#signin', 'child account → clear message');
ok((await login('noXbox')).location === '/?auth_error=noXbox#signin', 'no Xbox profile → clear message');
ok((await login('unapproved')).location === '/?auth_error=notApproved#signin', 'app not yet approved by Mojang → clear message');
ok((await login('noProfile')).location === '/?auth_error=noProfile#signin', 'no Minecraft Java profile → clear message');
const evilNext = await call('GET', 'auth/microsoft?next=//evil.test');
ok(!/evil/.test(decodeURIComponent(evilNext.headers.get('location') ?? '')), 'open redirect via next is impossible');

const second = await login({ name: 'Mo0nmoth', id: 'c'.repeat(32) }, '10.0.0.2');
const rawCookie = second.cb.cookies.find((c) => c.startsWith('__Host-stackr_sid='))!;
ok(/^__Host-stackr_sid=[A-Za-z0-9_-]{43};/.test(rawCookie) && /HttpOnly/.test(rawCookie) && /Secure/.test(rawCookie) && /SameSite=Lax/.test(rawCookie), 'session cookie is __Host-, HttpOnly, Secure, SameSite');
const A = first.cookie!;
const B = second.cookie!;
const stA = await call('GET', 'state', { cookie: A });
ok(stA.body.me && stA.body.db.tokens.length === 1, 'new client gets a welcome token');
ok(stA.body.db.accounts.find((x: any) => x.id === stA.body.me).mcUuid === 'b'.repeat(32), 'UUID comes from the Minecraft profile');
const rows = await sql.query<{ id_hash: string }>('select id_hash from sessions');
ok(rows.every((r) => /^[0-9a-f]{64}$/.test(r.id_hash)) && !rows.some((r) => A.includes(r.id_hash)), 'only token hashes are stored');
const tables = JSON.stringify(await sql.query("select * from app_state")) + JSON.stringify(await sql.query("select * from audit_log"));
ok(!/ms-token|xbl-token|xsts-token|mc-token/.test(tables), 'no Microsoft/Xbox/Minecraft tokens stored');

console.log('ordering');
const svc = 'seller-1-items';
const order = await cmd(A, {
  type: 'placeOrder', input: {
    serviceId: svc, title: 'Netherit <script>alert(1)</script>', details: 'bitte‮gespiegelt\u0007', batches: 1, extras: [],
    lines: [{ itemId: 'netherite_ingot', n: 8, unit: 'piece', de: 'GEFÄLSCHT', stack: 9999 }],
    coords: { x: 100, y: 64, z: -200, dimension: 'overworld' }, deliveryMethod: 'place_at_coords',
    clientProvidesMaterials: false, offer: '2 Diamanten', tokenIds: [], tosAccepted: true, vacationAcknowledged: false, clientId: 'acc-seller',
  },
});
ok(order.status === 200 && order.body.id, 'order placed');
const myOrder = (order.body.db as DB).orders.find((o) => o.id === order.body.id)!;
ok(myOrder.clientId !== 'acc-seller', 'clientId from the body is ignored');
ok(myOrder.lines![0].de === 'Netheritbarren' && myOrder.lines![0].stack === 64, 'item name and stack size come from the server list');
ok(myOrder.details === 'bittegespiegelt', 'control and bidi characters stripped');
ok(myOrder.title.includes('<script>'), 'text stored literally (React renders it as text)');
ok((await cmd(A, { type: 'placeOrder', input: { ...{ serviceId: svc, title: 'x', details: '', batches: 1, extras: [], deliveryMethod: 'place_at_coords', clientProvidesMaterials: false, offer: '', tokenIds: [], tosAccepted: true, vacationAcknowledged: false }, lines: [{ itemId: 'not_an_item', n: 1, unit: 'piece' }] } })).body.error.key === 'err.itemUnknown', 'unknown item rejected');
ok((await cmd(A, { type: 'placeOrder', input: { serviceId: svc, title: 'x'.repeat(500), details: '', batches: 1, extras: [], deliveryMethod: 'place_at_coords', clientProvidesMaterials: false, offer: '', tokenIds: [], tosAccepted: true, vacationAcknowledged: false } })).status === 400, 'over-long text rejected');

console.log('isolation between clients');
const stB = await call('GET', 'state', { cookie: B });
const seenByB = (stB.body.db as DB).orders.find((o) => o.id === order.body.id)!;
ok(seenByB && seenByB.title === '' && !seenByB.coords && seenByB.offer === '' && !seenByB.lines && seenByB.clientId.startsWith('anon-'), 'B sees only an anonymous stub of A\'s order');
ok(!(stB.body.db as DB).accounts.some((x) => x.mcName === 'Kiesel_Kai'), 'B cannot see A\'s account');
ok(!JSON.stringify(stB.body).includes('Diamanten') && !JSON.stringify(stB.body).includes('Kiesel'), 'no trace of A\'s data in B\'s response');
ok((await cmd(B, { type: 'sendMessage', orderId: order.body.id, text: 'hi' })).body.error.key === 'err.notAllowed', 'B cannot write in A\'s order');
ok((await cmd(B, { type: 'cancelByClient', orderId: order.body.id })).body.error.key === 'err.notAllowed', 'B cannot cancel A\'s order');
ok((await cmd(A, { type: 'proposeTerms', orderId: order.body.id, price: '1', days: 2, note: '' })).status === 403, 'client cannot send seller commands');
ok((await cmd(A, { type: 'advanceClock', days: 30 })).status === 400, 'beta clock tool refused');
ok((await call('GET', 'state')).body.db.orders.every((o: any) => o.title === '' && o.messages.length === 0), 'anonymous view has no order content');

console.log('seller 2FA');
const s = await login({ name: 'RealSeller', id: SELLER_UUID }, '10.0.0.5', 'items');
ok(s.location === '/?signed_in=1#signin', 'seller goes to the 2FA step');
const S = s.cookie!;
const pendingState = await call('GET', 'state', { cookie: S });
ok(pendingState.body.mfa === 'enroll', 'seller must set up 2FA first');
ok(pendingState.body.me === null && pendingState.body.mfa === 'enroll' && pendingState.body.db.orders.every((o: any) => o.title === ''), 'before 2FA the seller sees only public data');
ok((await cmd(S, { type: 'proposeTerms', orderId: order.body.id, price: '1', days: 2, note: '' })).status === 401, 'seller commands blocked before 2FA');
ok((await call('POST', 'auth/enroll/start', { cookie: A })).status === 403, 'clients cannot enroll 2FA');
const en = await call('POST', 'auth/enroll/start', { cookie: S });
ok(en.status === 200 && /^[A-Z2-7]{32}$/.test(en.body.secret) && en.body.qr.startsWith('<svg'), 'enrollment returns secret and QR');
const enc = await sql.query<{ secret_enc: string }>('select secret_enc from seller_mfa');
ok(!enc[0].secret_enc.includes(en.body.secret), 'TOTP secret stored encrypted');
ok((await call('POST', 'auth/enroll/confirm', { cookie: S, body: { code: '000000' } })).status === 400, 'wrong confirm code rejected');
const step = Math.floor(Date.now() / 30000);
const conf = await call('POST', 'auth/enroll/confirm', { cookie: S, body: { code: totpAt(en.body.secret, step) } });
ok(conf.status === 200 && conf.body.recovery.length === 8, 'enrolled, 8 recovery codes');
const sellerState = await call('GET', 'state', { cookie: S });
ok(sellerState.body.me === 'acc-seller' && sellerState.body.db.orders.some((o: any) => o.title.startsWith('Netherit')), 'after 2FA the seller sees order details');
ok(sellerState.body.db.accounts.find((x: any) => x.id === 'acc-seller').mcName === 'RealSeller', 'seller account linked by UUID');

console.log('second seller login');
const s2 = await login({ name: 'RealSeller', id: SELLER_UUID }, '10.0.0.9');
ok((await call('GET', 'state', { cookie: s2.cookie })).body.mfa === 'needed', 'next login asks for the code');
const S2 = s2.cookie!;
ok((await call('POST', 'auth/totp', { cookie: S2, body: { code: totpAt(en.body.secret, step) } })).status === 400, 'used TOTP code cannot be replayed');
ok((await call('POST', 'auth/totp', { cookie: S2, body: { recovery: conf.body.recovery[0] } })).status === 200, 'recovery code works');
const S3 = (await login({ name: 'RealSeller', id: SELLER_UUID }, '10.0.0.9')).cookie!;
ok((await call('POST', 'auth/totp', { cookie: S3, body: { recovery: conf.body.recovery[0] } })).status === 400, 'recovery code is single-use');
ok((await call('POST', 'auth/totp', { cookie: A, body: { code: '123456' } })).status === 403, 'client cannot use the seller 2FA endpoint');

console.log('order lifecycle across the API');
const oid = order.body.id;
const steps: [string, unknown][] = [
  [S, { type: 'proposeTerms', orderId: oid, price: '3 Diamanten', days: 2, note: '' }],
  [A, { type: 'acceptTerms', orderId: oid }],
  [S, { type: 'clearOrder', orderId: oid }],
  [S, { type: 'startProcessing', orderId: oid }],
  [S, { type: 'startFulfilling', orderId: oid }],
  [S, { type: 'deliverBatch', orderId: oid }],
  [A, { type: 'approve', orderId: oid }],
  [A, { type: 'rate', orderId: oid, stars: 5, tags: { speed: 5 } }],
];
let allOk = true;
for (const [c, x] of steps) { const r = await cmd(c, x); if (r.status !== 200) { allOk = false; console.error('    step failed', x, r.body); } }
ok(allOk, 'terms → cleared → processing → fulfilling → delivered → completed → rated');
const audits = await sql.query<{ event: string }>("select event from audit_log where event like 'cmd.%'");
ok(audits.length >= 5, 'seller actions are audit-logged');

console.log('ETag');
const e1 = await call('GET', 'state', { cookie: A });
const e2 = await call('GET', 'state', { cookie: A, headers: { 'if-none-match': e1.headers.get('etag')! } });
ok(e2.status === 304, 'unchanged state answers 304');

console.log('rate limits');
let last = 0;
let lastLoc = '';
for (let i = 0; i < 17; i++) { const r = await call('GET', 'auth/microsoft', { ip: '10.9.9.9' }); last = r.status; lastLoc = r.headers.get('location') ?? r.body?.error?.key; }
ok(last === 429 || /tooMany/.test(lastLoc), 'sign-in attempts limited per IP');
const rl = await sql.query<{ key: string }>('select key from rate_limits');
ok(!rl.some((r) => r.key.includes('10.9.9.9')), 'IPs are not stored in clear');

console.log('GDPR');
const ex = await call('GET', 'me/export', { cookie: B });
ok(ex.status === 200 && ex.body.account.mcName === 'Mo0nmoth' && /attachment/.test(ex.headers.get('content-disposition')!), 'export works');
ok((await call('POST', 'me/delete', { cookie: B, body: { confirm: 'wrong' } })).status === 400, 'delete needs the name typed');
const del = await call('POST', 'me/delete', { cookie: B, body: { confirm: 'mo0nmoth' } });
ok(del.status === 200, 'account deleted');
ok((await call('GET', 'state', { cookie: B })).body.me === null, 'sessions ended after delete');
const after = (await call('GET', 'state', { cookie: S })).body.db as DB;
ok(!after.accounts.some((x) => x.mcName === 'Mo0nmoth'), 'name gone from the data');

console.log('logout');
await call('POST', 'auth/logout', { cookie: A });
ok((await call('GET', 'state', { cookie: A })).body.me === null, 'logout ends the session');

console.log('cron');
ok((await call('GET', 'cron')).status === 401, 'cron needs the secret');
ok((await call('GET', 'cron', { headers: { authorization: 'Bearer cron-secret-123' } })).status === 200, 'cron runs with the secret');

globalThis.fetch = realFetch;
console.log(failures ? `\n${failures} FAILED` : '\nall passed');
process.exit(failures ? 1 : 0);
