// End-to-end API test: real Postgres (PGlite, in-process), a mocked Mojang name lookup, and the
// real request handler. Run with: npm run test:api
import { PGlite } from '@electric-sql/pglite';
import { createHandler } from '../routes.js';
import { readEnv } from '../env.js';
import { totpAt } from '../crypto.js';
import type { Sql } from '../db.js';
import type { DB } from '../../src/domain/types.js';

let failures = 0;
const ok = (cond: unknown, msg: string) => { if (cond) console.log('  ✓', msg); else { failures++; console.error('  ✗', msg); } };

// Mojang's public name lookup: every name exists except ones starting with "Nobody".
const realFetch = globalThis.fetch;
const uuidOf = (name: string) => [...name.toLowerCase().padEnd(32, '0')].map((c) => (c.charCodeAt(0) % 16).toString(16)).join('').slice(0, 32);
globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
  const url = String(input instanceof Request ? input.url : input);
  const m = /^https:\/\/api\.mojang\.com\/users\/profiles\/minecraft\/([^/?]+)$/.exec(url);
  if (m) {
    const name = decodeURIComponent(m[1]);
    if (name.toLowerCase().startsWith('nobody')) return new Response(null, { status: 404 });
    const canonical = name.toLowerCase() === 'kiesel_kai' ? 'Kiesel_Kai' : name; // Mojang returns the real spelling
    return new Response(JSON.stringify({ id: uuidOf(canonical), name: canonical }), { status: 200, headers: { 'content-type': 'application/json' } });
  }
  return realFetch(input, init);
}) as typeof fetch;

const SETUP = 'setup-code-0123456789-abcdef';
const pg = new PGlite();
const sql: Sql = { query: async (t, p = []) => (await pg.query(t, p as never[])).rows as never };
const env = readEnv({ DATABASE_URL: 'pglite', APP_SECRET: 'x'.repeat(48), CRON_SECRET: 'cron-secret-123', SELLER_SETUP_CODE: SETUP })!;
const handle = createHandler(env, sql);

const ORIGIN = 'https://stackr.test';
type Res = { status: number; body: any; cookie: string | null; headers: Headers };
async function call(method: string, path: string, opts: { body?: unknown; cookie?: string | null; ip?: string; headers?: Record<string, string> } = {}): Promise<Res> {
  const h: Record<string, string> = { host: 'stackr.test', 'x-real-ip': opts.ip ?? '10.0.0.1', ...opts.headers };
  if (method === 'POST') Object.assign(h, { origin: ORIGIN, 'x-stackr': '1', 'content-type': 'application/json' }, opts.headers);
  if (opts.cookie) h.cookie = opts.cookie;
  const res = await handle(new Request(`${ORIGIN}/api/${path}`, { method, headers: h, body: method === 'POST' ? JSON.stringify(opts.body ?? {}) : undefined }));
  const sid = res.headers.getSetCookie().find((c) => c.startsWith('__Host-stackr_sid=') && !c.startsWith('__Host-stackr_sid=;'));
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : null, cookie: sid ? sid.split(';')[0] : null, headers: res.headers };
}
let ipN = 20;
const freshIp = () => `10.1.0.${++ipN}`;
const register = (name: string, password: string, code?: string, ip = freshIp()) => call('POST', 'auth/register', { body: { name, password, code }, ip });
const login = (name: string, password: string, ip = freshIp()) => call('POST', 'auth/login', { body: { name, password }, ip });
const cmd = (cookie: string, c: unknown) => call('POST', 'command', { cookie, body: { cmd: c } });
const PW = 'blauer-kaktus-42';

console.log('beta fallback');
{
  const beta = createHandler(null, null);
  const r = await beta(new Request('https://x/api/state'));
  ok(((await r.json()) as { mode: string }).mode === 'beta', 'no env → mode beta');
}

console.log('anonymous view');
const anon = await call('GET', 'state');
ok(anon.status === 200 && anon.body.mode === 'live', 'state is live');
ok(anon.body.me === null && anon.body.db.accounts.length === 1, 'only the seller account is visible');
ok(anon.headers.get('cache-control') === 'no-store', 'API responses are no-store');

console.log('CSRF checks');
ok((await call('POST', 'auth/login', { body: { name: 'abc', password: 'x' }, headers: { origin: 'https://evil.test' } })).status === 403, 'foreign Origin rejected');
ok((await call('POST', 'auth/login', { body: { name: 'abc', password: 'x' }, headers: { 'x-stackr': '0' } })).status === 403, 'missing custom header rejected');

console.log('registration');
ok((await register('Kiesel_Kai', 'kurz')).body.error.key === 'err.pwShort', 'short password rejected');
ok((await register('Kiesel_Kai', 'kiesel_kai_rocks')).body.error.key === 'err.pwWeak', 'password containing the name rejected');
ok((await register('NobodyHere', PW)).body.error.key === 'err.nameUnknown', 'name that does not exist at Mojang rejected');
ok((await register('bad name!', PW)).status === 400, 'invalid name rejected');
const a = await register('kiesel_kai', PW);
ok(a.status === 200 && a.body.mfa === null && a.body.confirmed === false && a.body.mcName === 'Kiesel_Kai', 'open sign-up works, exact spelling from Mojang, name unconfirmed');
const rawCookie = (await (async () => {
  const r = await handle(new Request(`${ORIGIN}/api/auth/register`, { method: 'POST', headers: { host: 'stackr.test', origin: ORIGIN, 'x-stackr': '1', 'content-type': 'application/json', 'x-real-ip': '10.0.0.2' }, body: JSON.stringify({ name: 'Mo0nmoth', password: PW }) }));
  return r.headers.getSetCookie().find((c) => c.startsWith('__Host-stackr_sid='))!;
})());
ok(/^__Host-stackr_sid=[A-Za-z0-9_-]{43};/.test(rawCookie) && /HttpOnly/.test(rawCookie) && /Secure/.test(rawCookie) && /SameSite=Lax/.test(rawCookie), 'session cookie is __Host-, HttpOnly, Secure, SameSite');
ok((await register('KIESEL_KAI', PW)).body.error.key === 'err.nameTaken', 'name already taken (case-insensitive)');
const A = a.cookie!;
const B = rawCookie.split(';')[0];
const stA = await call('GET', 'state', { cookie: A });
const meA = stA.body.db.accounts.find((x: any) => x.id === stA.body.me);
ok(stA.body.me && stA.body.db.tokens.length === 1, 'new client gets a welcome token');
ok(meA.mcUuid === uuidOf('Kiesel_Kai') && !meA.nameConfirmedAt, 'UUID from Mojang stored, name not confirmed yet');
const cred = await sql.query<{ pw_hash: string }>('select pw_hash from credentials');
ok(cred.every((r) => r.pw_hash.startsWith('scrypt$32768$8$1$')) && !JSON.stringify(cred).includes(PW), 'passwords stored only as scrypt hashes');
ok(!JSON.stringify(await sql.query('select doc from app_state')).includes('scrypt$'), 'no password hash in the shop document');
const rows = await sql.query<{ id_hash: string }>('select id_hash from sessions');
ok(rows.every((r) => /^[0-9a-f]{64}$/.test(r.id_hash)) && !rows.some((r) => A.includes(r.id_hash)), 'only session token hashes are stored');

console.log('login');
ok((await login('Kiesel_Kai', 'wrong-password-1')).body.error.key === 'err.loginFailed', 'wrong password rejected');
ok((await login('NoSuchPlayer1', PW)).body.error.key === 'err.loginFailed', 'unknown name gives the same message');
const relog = await login('kiesel_kai', PW);
ok(relog.status === 200 && !!relog.cookie && relog.cookie !== A, 'login works (case-insensitive) with a fresh session id');
let lockedStatus = 0;
for (let i = 0; i < 9; i++) lockedStatus = (await login('Mo0nmoth', 'guess-number-' + i)).status;
ok(lockedStatus === 429, 'password guessing on one name is throttled (across IPs)');

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

console.log('seller setup + 2FA');
ok((await register('RealSeller', PW, 'wrong-setup-code-1234567')).body.error.key === 'err.codeInvalid', 'wrong setup code does nothing');
const s = await register('RealSeller', PW, SETUP);
ok(s.status === 200 && s.body.mfa === 'enroll', 'setup code claims the seller account, 2FA setup next');
ok((await register('SomeoneElse', PW, SETUP)).body.error.key === 'err.codeInvalid', 'setup code works only once');
const S = s.cookie!;
const pendingState = await call('GET', 'state', { cookie: S });
ok(pendingState.body.me === null && pendingState.body.mfa === 'enroll' && pendingState.body.db.orders.every((o: any) => o.title === ''), 'before 2FA the seller sees only public data');
ok((await cmd(S, { type: 'proposeTerms', orderId: order.body.id, price: '1', days: 2, note: '' })).status === 401, 'seller commands blocked before 2FA');
ok((await call('POST', 'seller/invite', { cookie: S, body: { name: 'Steve' } })).status === 403, 'seller tools blocked before 2FA');
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
ok(sellerState.body.db.accounts.find((x: any) => x.id === 'acc-seller').mcName === 'RealSeller', 'seller account carries the real name');

console.log('second seller login');
const s2 = await login('RealSeller', PW);
ok(s2.body.mfa === 'needed', 'next login asks for the code');
const S2 = s2.cookie!;
ok((await call('POST', 'auth/totp', { cookie: S2, body: { code: totpAt(en.body.secret, step) } })).status === 400, 'used TOTP code cannot be replayed');
ok((await call('POST', 'auth/totp', { cookie: S2, body: { recovery: conf.body.recovery[0] } })).status === 200, 'recovery code works');
const S3 = (await login('RealSeller', PW)).cookie!;
ok((await call('POST', 'auth/totp', { cookie: S3, body: { recovery: conf.body.recovery[0] } })).status === 400, 'recovery code is single-use');
ok((await call('POST', 'auth/totp', { cookie: A, body: { code: '123456' } })).status === 403, 'client cannot use the seller 2FA endpoint');

console.log('confirming names, invites, impostors');
ok((await cmd(A, { type: 'confirmName', clientId: stA.body.me })).status === 403, 'clients cannot confirm names');
const clientA = stA.body.me as string;
ok((await cmd(S, { type: 'confirmName', clientId: clientA })).status === 200, 'seller confirms a name after seeing the player');
ok((await call('GET', 'state', { cookie: A })).body.db.accounts.find((x: any) => x.id === clientA).nameConfirmedAt, 'player sees the name as confirmed');
ok((await call('POST', 'seller/invite', { cookie: A, body: { name: 'Steve' } })).status === 403, 'clients cannot create invites');
ok((await call('POST', 'seller/invite', { cookie: S, body: { name: 'Kiesel_Kai' } })).body.error.key === 'err.nameTaken', 'no invite for a confirmed name');
const inv = await call('POST', 'seller/invite', { cookie: S, body: { name: 'steve' } });
ok(inv.status === 200 && /^[A-Z2-7]{5}-[A-Z2-7]{5}$/.test(inv.body.code) && inv.body.name === 'steve', 'invite code bound to one name');
ok(!JSON.stringify(await sql.query('select * from auth_codes')).includes(inv.body.code.replace('-', '')), 'codes stored only as hashes');
ok((await call('GET', 'seller/invites', { cookie: S })).body.invites.some((x: any) => x.name === 'steve' && !x.code), 'seller sees open invites (without codes)');
ok((await register('Alex', PW, inv.body.code)).body.error.key === 'err.codeInvalid', 'invite does not work for another name');
const steve = await register('Steve', PW, inv.body.code);
ok(steve.status === 200 && steve.body.confirmed === true, 'invite sign-up is confirmed immediately');
ok((await register('Steve2', PW, inv.body.code)).status !== 200, 'invite works once');
// An impostor grabs "Herobrine"; the real player gets an invite and takes the name back.
const fake = await register('Herobrine', PW);
const fakeId = (await call('GET', 'state', { cookie: fake.cookie })).body.me;
const inv2 = await call('POST', 'seller/invite', { cookie: S, body: { name: 'Herobrine' } });
ok(inv2.status === 200 && inv2.body.takesOver === true, 'invite for a name held by an unconfirmed account is allowed');
const real = await register('Herobrine', 'echtes-passwort-99', inv2.body.code);
ok(real.status === 200 && real.body.confirmed === true, 'real player takes the name back with the invite');
ok((await call('GET', 'state', { cookie: fake.cookie })).body.me === null, 'impostor is signed out everywhere');
ok((await login('Herobrine', PW)).body.error.key === 'err.loginFailed', 'impostor password no longer works');
ok((await call('GET', 'state', { cookie: S })).body.db.accounts.find((x: any) => x.id === fakeId).disabledAt, 'impostor account is disabled, visible to the seller');
// Seller releases a wrong claim manually.
const fake2 = await register('Notch', PW);
const fake2Id = (await call('GET', 'state', { cookie: fake2.cookie })).body.me;
ok((await call('POST', 'seller/release', { cookie: S, body: { accountId: clientA } })).body.error.key === 'err.nameConfirmed', 'confirmed names cannot be released');
ok((await call('POST', 'seller/release', { cookie: S, body: { accountId: fake2Id } })).status === 200, 'seller releases a wrong claim');
ok((await register('Notch', PW)).status === 200, 'released name can be registered again');

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


console.log('auto-accept and waves');
const ST = steve.cookie!;
const baseInput = { serviceId: svc, title: 'Eisen', details: '', extras: [], lines: [{ itemId: 'iron_ingot', n: 15, unit: 'stack' }],
  coords: { x: 1, y: 64, z: 1, dimension: 'overworld' }, deliveryMethod: 'place_at_coords', clientProvidesMaterials: false, tokenIds: [], tosAccepted: true, vacationAcknowledged: false };
const past = await cmd(ST, { type: 'placeOrder', input: { ...baseInput, offer: '5 Eisenblöcke', batches: 2, waveDates: ['2001-01-01', '2001-01-02'] } });
ok(past.status === 200 && (past.body.db as DB).orders.find((o) => o.id === past.body.id)!.waveDates!.every((d) => d === ''), 'wished dates in the past are dropped');
ok((await cmd(ST, { type: 'cancelByClient', orderId: past.body.id })).status === 200, 'client cancels before work starts');
const wav = await cmd(ST, { type: 'placeOrder', input: { ...baseInput, offer: '5 Eisenblöcke', batches: 3, waveDates: ['2099-01-01', '', '2099-01-15'] } });
ok(wav.status === 200, 'order in 3 waves with wished dates placed');
const wo = (wav.body.db as DB).orders.find((o) => o.id === wav.body.id)!;
ok(wo.batches === 3 && wo.waveDates?.length === 3, 'waves and dates stored');
const same = await cmd(S, { type: 'proposeTerms', orderId: wav.body.id, price: ' 5 eisenblöcke ', days: 3, note: '' });
const so = (same.body.db as DB).orders.find((o) => o.id === wav.body.id)!;
ok(same.status === 200 && !!so.terms?.acceptedAt && so.terms.autoAccepted === true, 'price equal to the offer is accepted automatically');
const wav2 = await cmd(ST, { type: 'placeOrder', input: { ...baseInput, offer: '5 Eisenblöcke', batches: 1 } });
const diff = await cmd(S, { type: 'proposeTerms', orderId: wav2.body.id, price: '8 Eisenblöcke', days: 3, note: '' });
ok(!(diff.body.db as DB).orders.find((o) => o.id === wav2.body.id)!.terms?.acceptedAt, 'a different price waits for the client');

console.log('credits');
const pA = (await call('GET', 'state', { cookie: A })).body.db as DB;
const balA = (pA.points ?? []).reduce((x, p) => x + p.delta, 0);
ok(balA === 23, 'welcome + completed order + rating = 23 credits');
ok((pA.points ?? []).every((p) => p.accountId === clientA), 'a player only sees their own credits');
ok((await cmd(A, { type: 'buyToken', tokenType: 'priority' })).body.error?.key === 'err.notEnoughPoints', 'cannot buy a token without enough credits');
ok((await cmd(A, { type: 'grantPoints', clientId: clientA, n: 500, note: '' })).status === 403, 'clients cannot grant credits');
ok((await cmd(S, { type: 'grantPoints', clientId: clientA, n: 100, note: 'Danke' })).status === 200, 'seller grants credits');
const bought = await cmd(A, { type: 'buyToken', tokenType: 'priority' });
ok(bought.status === 200 && (bought.body.db as DB).tokens.some((t) => t.ownerId === clientA && t.source === 'shop'), 'token bought with credits');
ok(((bought.body.db as DB).points ?? []).reduce((x, p) => x + p.delta, 0) === 63, 'price deducted');

console.log('gift codes');
ok((await call('POST', 'seller/gift', { cookie: A, body: { reward: { kind: 'points', n: 50 }, uses: 1, days: 7, note: '' } })).status === 403, 'clients cannot create gift codes');
const gift = await call('POST', 'seller/gift', { cookie: S, body: { reward: { kind: 'points', n: 50 }, uses: 1, days: 7, note: 'Discord' } });
ok(gift.status === 200 && /^[2-9A-HJKMNP-Z]{4}(-[2-9A-HJKMNP-Z]{4}){3}$/.test(gift.body.code), 'gift code in XXXX-XXXX-XXXX-XXXX format');
const gl = await call('GET', 'seller/gifts', { cookie: S });
ok(gl.body.gifts.length === 1 && !JSON.stringify(gl.body).includes(gift.body.code), 'gift list never contains the code');
const gstore = await sql.query<{ code_hash: string }>('select code_hash from gift_codes');
ok(!gstore.some((r) => r.code_hash.includes(gift.body.code)), 'gift codes are stored hashed');
ok((await call('POST', 'shop/redeem', { cookie: ST, body: { code: 'AAAA-BBBB-CCCC-DDDD' } })).status === 400, 'unknown code rejected');
const red = await call('POST', 'shop/redeem', { cookie: ST, body: { code: gift.body.code.toLowerCase().replace(/-/g, ' ') } });
ok(red.status === 200 && red.body.reward.n === 50, 'code redeemed (case and separators do not matter)');
ok((await call('POST', 'shop/redeem', { cookie: ST, body: { code: gift.body.code } })).body.error?.key === 'err.giftUsed', 'same player cannot redeem twice');
ok((await call('POST', 'shop/redeem', { cookie: A, body: { code: gift.body.code } })).body.error?.key === 'err.giftInvalid', 'used-up code rejected');
ok((await call('POST', 'shop/redeem', { body: { code: gift.body.code } })).status === 401, 'redeeming needs an account');
const tg = await call('POST', 'seller/gift', { cookie: S, body: { reward: { kind: 'token', type: 'rush' }, uses: 5, days: 7, note: '' } });
ok((await call('POST', 'seller/gift/revoke', { cookie: S, body: { id: tg.body.id } })).status === 200, 'seller revokes a code');
ok((await call('POST', 'shop/redeem', { cookie: A, body: { code: tg.body.code } })).status === 400, 'revoked code rejected');

console.log('password reset and change');
ok((await call('POST', 'seller/reset-code', { cookie: A, body: { accountId: clientA } })).status === 403, 'clients cannot create reset codes');
const rc = await call('POST', 'seller/reset-code', { cookie: S, body: { accountId: clientA } });
ok(rc.status === 200 && rc.body.name === 'Kiesel_Kai', 'seller creates a reset code');
ok((await call('POST', 'auth/reset', { body: { name: 'Mo0nmoth', code: rc.body.code, password: 'neues-passwort-1' }, ip: freshIp() })).body.error.key === 'err.codeInvalid', 'reset code only works for its account');
const reset = await call('POST', 'auth/reset', { body: { name: 'Kiesel_Kai', code: rc.body.code, password: 'neues-passwort-1' }, ip: freshIp() });
ok(reset.status === 200 && !!reset.cookie, 'reset sets the new password and signs in');
ok((await call('GET', 'state', { cookie: A })).body.me === null, 'old sessions end after a reset');
ok((await call('POST', 'auth/reset', { body: { name: 'Kiesel_Kai', code: rc.body.code, password: 'noch-ein-passwort-2' }, ip: freshIp() })).status === 400, 'reset code works once');
const A2 = reset.cookie!;
ok((await call('POST', 'auth/password', { cookie: A2, body: { current: 'falsch-falsch-1', password: 'drittes-passwort-3' } })).body.error.key === 'err.pwCurrent', 'change needs the current password');
ok((await call('POST', 'auth/password', { cookie: A2, body: { current: 'neues-passwort-1', password: 'drittes-passwort-3' } })).status === 200, 'password changed');
ok((await login('Kiesel_Kai', 'drittes-passwort-3')).status === 200, 'new password works');
const sellerReset = await call('POST', 'auth/reset', { body: { name: 'RealSeller', code: SETUP, password: 'seller-neu-12345' }, ip: freshIp() });
ok(sellerReset.status === 200 && sellerReset.body.mfa === 'needed', 'seller can reset with the setup code, 2FA still required');
const S5 = sellerReset.cookie!;
ok((await call('POST', 'auth/totp', { cookie: S5, body: { recovery: conf.body.recovery[1] } })).status === 200, 'seller back in after 2FA');

console.log('rate limits');
let last = 0;
for (let i = 0; i < 22; i++) last = (await call('POST', 'auth/login', { body: { name: `Spammer${i}`, password: 'x'.repeat(12) }, ip: '10.9.9.9' })).status;
ok(last === 429, 'password attempts limited per IP');
const rl = await sql.query<{ key: string }>('select key from rate_limits');
ok(!rl.some((r) => r.key.includes('10.9.9.9')), 'IPs are not stored in clear');

console.log('GDPR');
const ex = await call('GET', 'me/export', { cookie: B });
ok(ex.status === 200 && ex.body.account.mcName === 'Mo0nmoth' && /attachment/.test(ex.headers.get('content-disposition')!), 'export works');
ok((await call('POST', 'me/delete', { cookie: B, body: { confirm: 'wrong' } })).status === 400, 'delete needs the name typed');
const del = await call('POST', 'me/delete', { cookie: B, body: { confirm: 'mo0nmoth' } });
ok(del.status === 200, 'account deleted');
ok((await call('GET', 'state', { cookie: B })).body.me === null, 'sessions ended after delete');
const after = (await call('GET', 'state', { cookie: S5 })).body.db as DB;
ok(!after.accounts.some((x) => x.mcName === 'Mo0nmoth'), 'name gone from the data');

console.log('logout');
await call('POST', 'auth/logout', { cookie: A2, ip: freshIp() }); // fresh IP: the suite itself exceeds 60 writes a minute
ok((await call('GET', 'state', { cookie: A2 })).body.me === null, 'logout ends the session');

console.log('cron');
ok((await call('GET', 'cron')).status === 401, 'cron needs the secret');
ok((await call('GET', 'cron', { headers: { authorization: 'Bearer cron-secret-123' } })).status === 200, 'cron runs with the secret');

globalThis.fetch = realFetch;
console.log(failures ? `\n${failures} FAILED` : '\nall passed');
process.exit(failures ? 1 : 0);
