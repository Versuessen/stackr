// End-to-end API test: real Postgres (PGlite, in-process), a mock mc-oauth server, and the real
// request handler. Run with: npm run test:api
import { PGlite } from '@electric-sql/pglite';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { createHandler } from '../routes.js';
import { readEnv } from '../env.js';
import { totpAt } from '../crypto.js';
import type { Sql } from '../db.js';
import type { DB } from '../../src/domain/types.js';

let failures = 0;
const ok = (cond: unknown, msg: string) => { if (cond) console.log('  ✓', msg); else { failures++; console.error('  ✗', msg); } };

const SELLER_UUID = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const codes = new Map<string, { nickname: string; UUID: string }>();
const mock = createServer((req, res) => {
  if (req.headers['x-stackr-key'] !== 'proxy-key') { res.writeHead(404).end(); return; }
  const m = /^\/code\/(\d{6})$/.exec(req.url || '');
  const hit = m && codes.get(m[1]);
  if (!hit) { res.writeHead(404).end(); return; }
  codes.delete(m![1]);
  res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ ...hit, properties: [] }));
});
await new Promise<void>((r) => mock.listen(0, r));
const mockUrl = `http://127.0.0.1:${(mock.address() as AddressInfo).port}`;

const pg = new PGlite();
const sql: Sql = { query: async (t, p = []) => (await pg.query(t, p as never[])).rows as never };
const env = readEnv({
  DATABASE_URL: 'pglite', APP_SECRET: 'x'.repeat(48), SELLER_MC_UUID: SELLER_UUID, MC_AUTH_URL: mockUrl,
  MC_AUTH_KEY: 'proxy-key', MC_JOIN_HOST: 'auth.example.test', CRON_SECRET: 'cron-secret-123',
})!;
const handle = createHandler(env, sql);

const ORIGIN = 'https://stackr.test';
type Res = { status: number; body: any; cookie: string | null; headers: Headers };
async function call(method: string, path: string, opts: { body?: unknown; cookie?: string | null; ip?: string; headers?: Record<string, string> } = {}): Promise<Res> {
  const h: Record<string, string> = { host: 'stackr.test', 'x-real-ip': opts.ip ?? '10.0.0.1', ...opts.headers };
  if (method === 'POST') Object.assign(h, { origin: ORIGIN, 'x-stackr': '1', 'content-type': 'application/json' }, opts.headers);
  if (opts.cookie) h.cookie = opts.cookie;
  const res = await handle(new Request(`${ORIGIN}/api/${path}`, { method, headers: h, body: method === 'POST' ? JSON.stringify(opts.body ?? {}) : undefined }));
  const sc = res.headers.get('set-cookie');
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : null, cookie: sc ? sc.split(';')[0] : null, headers: res.headers };
}
async function login(name: string, uuid: string, ip = '10.0.0.1') {
  const code = String(100000 + Math.floor(Math.random() * 899999));
  codes.set(code, { nickname: name, UUID: uuid });
  const r = await call('POST', 'auth/code', { body: { code }, ip });
  return r;
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
ok(anon.status === 200 && anon.body.mode === 'live', 'state is live');
ok(anon.body.me === null && anon.body.db.accounts.length === 1, 'only the seller account is visible');
ok(anon.headers.get('cache-control') === 'no-store', 'API responses are no-store');

console.log('CSRF and input checks');
ok((await call('POST', 'auth/code', { body: { code: '123456' }, headers: { origin: 'https://evil.test' } })).status === 403, 'foreign Origin rejected');
ok((await call('POST', 'auth/code', { body: { code: '123456' }, headers: { 'x-stackr': '0' } })).status === 403, 'missing custom header rejected');
ok((await call('POST', 'auth/code', { body: { code: 'abc' } })).status === 400, 'malformed code rejected');
ok((await call('POST', 'auth/code', { body: { code: '000000' } })).body.error.key === 'auth.wrongCode', 'unknown code rejected');

console.log('client sign-in');
const a = await login('Kiesel_Kai', 'b'.repeat(32));
ok(a.status === 200 && a.body.mfa === null, 'client signs in without 2FA');
const rawCookie = (await (async () => { codes.set('111222', { nickname: 'Mo0nmoth', UUID: 'c'.repeat(32) }); return handle(new Request(`${ORIGIN}/api/auth/code`, { method: 'POST', headers: { host: 'stackr.test', origin: ORIGIN, 'x-stackr': '1', 'content-type': 'application/json', 'x-real-ip': '10.0.0.2' }, body: JSON.stringify({ code: '111 222' }) })); })()).headers.get('set-cookie')!;
ok(/^__Host-stackr_sid=[A-Za-z0-9_-]{43};/.test(rawCookie) && /HttpOnly/.test(rawCookie) && /Secure/.test(rawCookie) && /SameSite=Lax/.test(rawCookie), 'cookie is __Host-, HttpOnly, Secure, SameSite');
const A = a.cookie!;
const B = rawCookie.split(';')[0];
const stA = await call('GET', 'state', { cookie: A });
ok(stA.body.me && stA.body.db.tokens.length === 1, 'new client gets a welcome token');
const rows = await sql.query<{ id_hash: string }>('select id_hash from sessions');
ok(rows.every((r) => /^[0-9a-f]{64}$/.test(r.id_hash)) && !rows.some((r) => A.includes(r.id_hash)), 'only token hashes are stored');

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
const s = await login('RealSeller', SELLER_UUID);
ok(s.body.mfa === 'enroll', 'seller must set up 2FA first');
const S = s.cookie!;
const pendingState = await call('GET', 'state', { cookie: S });
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
const s2 = await login('RealSeller', SELLER_UUID, '10.0.0.9');
ok(s2.body.mfa === 'needed', 'next login asks for the code');
const S2 = s2.cookie!;
ok((await call('POST', 'auth/totp', { cookie: S2, body: { code: totpAt(en.body.secret, step) } })).status === 400, 'used TOTP code cannot be replayed');
ok((await call('POST', 'auth/totp', { cookie: S2, body: { recovery: conf.body.recovery[0] } })).status === 200, 'recovery code works');
const S3 = (await login('RealSeller', SELLER_UUID, '10.0.0.9')).cookie!;
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
for (let i = 0; i < 12; i++) last = (await call('POST', 'auth/code', { body: { code: '999999' }, ip: '10.9.9.9' })).status;
ok(last === 429, 'sign-in attempts limited per IP');
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

mock.close();
console.log(failures ? `\n${failures} FAILED` : '\nall passed');
process.exit(failures ? 1 : 0);
