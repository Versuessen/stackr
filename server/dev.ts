// Local full-stack development only (never deployed): the real API handler on :3001 with an
// in-process Postgres. Mojang's name lookup is faked (every name exists except "Nobody…").
// Seller setup code for local testing: dev-setup-code-123456
import { PGlite } from '@electric-sql/pglite';
import { createServer, type IncomingMessage } from 'node:http';
import { createHash, randomBytes } from 'node:crypto';
import { createHandler } from './routes.js';
import { readEnv } from './env.js';
import type { Sql } from './db.js';

const realFetch = globalThis.fetch;
globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
  const url = String(input instanceof Request ? input.url : input);
  const m = /^https:\/\/api\.mojang\.com\/users\/profiles\/minecraft\/([^/?]+)$/.exec(url);
  if (m) {
    const name = decodeURIComponent(m[1]);
    if (name.toLowerCase().startsWith('nobody')) return new Response(null, { status: 404 });
    const id = createHash('md5').update(name.toLowerCase()).digest('hex');
    return new Response(JSON.stringify({ id, name }), { status: 200, headers: { 'content-type': 'application/json' } });
  }
  return realFetch(input, init);
}) as typeof fetch;

const pg = new PGlite(process.env.PGLITE_DIR || undefined);
const sql: Sql = { query: async (t, p = []) => (await pg.query(t, p as never[])).rows as never };
const env = readEnv({ DATABASE_URL: 'pglite', APP_SECRET: randomBytes(32).toString('hex'), SELLER_SETUP_CODE: 'dev-setup-code-123456', CRON_SECRET: 'dev' });
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
}).listen(3001, () => console.log('API on :3001 (Mojang lookup faked)'));
