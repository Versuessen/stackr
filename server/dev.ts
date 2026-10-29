// Local full-stack development only (never deployed): the real API handler on :3001 with an
// in-process Postgres. The Microsoft → Xbox → Minecraft calls are faked: an authorization code
// of the form "dev.<Name>.<32-hex-uuid>" signs in as that player. In a browser test, intercept
// login.microsoftonline.com/…/authorize and redirect to /api/auth/microsoft/callback?code=…&state=…
import { PGlite } from '@electric-sql/pglite';
import { createServer, type IncomingMessage } from 'node:http';
import { randomBytes } from 'node:crypto';
import { createHandler } from './routes.js';
import { readEnv } from './env.js';
import type { Sql } from './db.js';

const realFetch = globalThis.fetch;
const reply = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });
globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
  const url = String(input instanceof Request ? input.url : input);
  const body = typeof init?.body === 'string' ? init.body : init?.body?.toString() ?? '';
  if (url.includes('login.microsoftonline.com')) return reply({ access_token: `fake-ms.${new URLSearchParams(body).get('code')}` });
  if (url.includes('user.auth.xboxlive.com')) return reply({ Token: `fake-xb.${JSON.parse(body).Properties.RpsTicket.slice(10)}`, DisplayClaims: { xui: [{ uhs: 'dev' }] } });
  if (url.includes('xsts.auth.xboxlive.com')) return reply({ Token: `fake-xs.${JSON.parse(body).Properties.UserTokens[0].slice(8)}`, DisplayClaims: { xui: [{ uhs: 'dev' }] } });
  if (url.includes('login_with_xbox')) return reply({ access_token: `fake-mc.${JSON.parse(body).identityToken.split(';fake-xs.')[1]}` });
  if (url.includes('minecraft/profile')) {
    const [, name, id] = String((init?.headers as Record<string, string>).authorization).replace('Bearer fake-mc.', '').split('.');
    return reply({ id, name });
  }
  return realFetch(input, init);
}) as typeof fetch;

const pg = new PGlite(process.env.PGLITE_DIR || undefined);
const sql: Sql = { query: async (t, p = []) => (await pg.query(t, p as never[])).rows as never };
const env = readEnv({
  DATABASE_URL: 'pglite', APP_SECRET: randomBytes(32).toString('hex'), SELLER_MC_UUID: process.env.SELLER_MC_UUID || 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
  MS_CLIENT_ID: 'dev-client', MS_CLIENT_SECRET: 'dev-secret', SITE_URL: 'http://localhost:4173', CRON_SECRET: 'dev',
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
}).listen(3001, () => console.log('API on :3001 (Microsoft sign-in faked)'));
