// Local full-stack development only (never deployed): the real API handler on :3001 with an
// in-process Postgres and a fake verification server. `npm run dev:api`, then `npm run dev`.
// Get a sign-in code: GET http://localhost:3002/issue?name=Steve&uuid=<32 hex>
import { PGlite } from '@electric-sql/pglite';
import { createServer, type IncomingMessage } from 'node:http';
import { randomBytes } from 'node:crypto';
import { createHandler } from './routes.js';
import { readEnv } from './env.js';
import type { Sql } from './db.js';

const codes = new Map<string, { nickname: string; UUID: string }>();
const KEY = randomBytes(16).toString('hex');
createServer((req, res) => {
  const url = new URL(req.url || '/', 'http://x');
  if (url.pathname === '/issue') {
    const code = String(100000 + Math.floor(Math.random() * 899999));
    codes.set(code, { nickname: url.searchParams.get('name') || 'Steve', UUID: url.searchParams.get('uuid') || randomBytes(16).toString('hex') });
    res.writeHead(200, { 'content-type': 'application/json', 'access-control-allow-origin': '*' }).end(JSON.stringify({ code }));
    return;
  }
  const m = /^\/code\/(\d{6})$/.exec(url.pathname);
  const hit = m && req.headers['x-stackr-key'] === KEY && codes.get(m[1]);
  if (!hit) { res.writeHead(404).end(); return; }
  codes.delete(m![1]);
  res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ ...hit, properties: [] }));
}).listen(3002);

const pg = new PGlite(process.env.PGLITE_DIR || undefined);
const sql: Sql = { query: async (t, p = []) => (await pg.query(t, p as never[])).rows as never };
const env = readEnv({
  DATABASE_URL: 'pglite', APP_SECRET: randomBytes(32).toString('hex'), SELLER_MC_UUID: process.env.SELLER_MC_UUID || 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
  MC_AUTH_URL: 'http://127.0.0.1:3002', MC_AUTH_KEY: KEY, MC_JOIN_HOST: 'auth.localhost', CRON_SECRET: 'dev',
});
const handle = createHandler(env, sql);

async function body(req: IncomingMessage) {
  const chunks: Buffer[] = [];
  for await (const c of req) chunks.push(c as Buffer);
  return Buffer.concat(chunks);
}
createServer(async (req, res) => {
  const headers = new Headers();
  for (const [k, v] of Object.entries(req.headers)) if (typeof v === 'string') headers.set(k, v);
  headers.set('x-real-ip', req.socket.remoteAddress || '127.0.0.1');
  const host = req.headers.host || 'localhost:3001';
  const r = await handle(new Request(`http://${host}${req.url}`, {
    method: req.method, headers, body: req.method === 'POST' ? await body(req) : undefined,
  }));
  const out: Record<string, string | string[]> = {};
  r.headers.forEach((v, k) => { if (k !== 'set-cookie') out[k] = v; });
  const cookies = r.headers.getSetCookie();
  if (cookies.length) out['set-cookie'] = cookies;
  res.writeHead(r.status, out).end(Buffer.from(await r.arrayBuffer()));
}).listen(3001, () => console.log('API on :3001, fake verification server on :3002'));
