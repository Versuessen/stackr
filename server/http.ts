// Response helpers, cookies and request checks shared by all routes.

export const SESSION_COOKIE = '__Host-stackr_sid';
export const OAUTH_COOKIE = '__Host-stackr_oauth';

const API_HEADERS: Record<string, string> = {
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'no-store',
  'x-content-type-options': 'nosniff',
  'content-security-policy': "default-src 'none'; frame-ancestors 'none'",
  'cross-origin-resource-policy': 'same-origin',
  'referrer-policy': 'no-referrer',
};

export class HttpError extends Error {
  constructor(public status: number, public key: string, public vars?: Record<string, string | number>) { super(key); }
}

export function json(body: unknown, status = 200, extra: Record<string, string> = {}, cookies: string[] = []): Response {
  const h = new Headers({ ...API_HEADERS, ...extra });
  for (const c of cookies) h.append('set-cookie', c);
  return new Response(status === 304 ? null : JSON.stringify(body), { status, headers: h });
}

export function sessionCookie(token: string, maxAgeSec: number) {
  // __Host- prefix: browser enforces Secure, Path=/ and no Domain, so subdomains cannot set or read it.
  return `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAgeSec}; Priority=High`;
}
export const clearCookie = (name = SESSION_COOKIE) => `${name}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
/** Short-lived cookie that carries the OAuth state + PKCE verifier (encrypted) to the callback. */
export const oauthCookie = (value: string, maxAgeSec: number) => `${OAUTH_COOKIE}=${value}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAgeSec}`;

/** Browser redirect (sign-in flow). Never cached, never leaks the URL as a referrer. */
export function redirect(location: string, cookies: string[] = []): Response {
  const h = new Headers({ location, 'cache-control': 'no-store', 'referrer-policy': 'no-referrer', 'x-content-type-options': 'nosniff' });
  for (const c of cookies) h.append('set-cookie', c);
  return new Response(null, { status: 302, headers: h });
}

export function readCookie(req: Request, name: string): string | null {
  const raw = req.headers.get('cookie');
  if (!raw) return null;
  for (const part of raw.split(';')) {
    const i = part.indexOf('=');
    if (i > 0 && part.slice(0, i).trim() === name) return part.slice(i + 1).trim();
  }
  return null;
}

export function clientIp(req: Request): string {
  // Vercel sets x-real-ip itself and overwrites spoofed x-forwarded-for values.
  return req.headers.get('x-real-ip') || req.headers.get('x-forwarded-for')?.split(',')[0].trim() || 'unknown';
}

/**
 * Cross-site request forgery guard for every state-changing request: same-origin Origin header,
 * a custom header (forces a CORS preflight, which this API never answers) and a JSON body.
 * Together with SameSite cookies this stops other sites from acting in a user's name.
 */
export function checkWriteRequest(req: Request) {
  const origin = req.headers.get('origin');
  const host = req.headers.get('x-forwarded-host') || req.headers.get('host') || new URL(req.url).host;
  let ok = false;
  try { ok = !!origin && new URL(origin).host === host; } catch { ok = false; }
  if (!ok) throw new HttpError(403, 'err.origin');
  if (req.headers.get('x-stackr') !== '1') throw new HttpError(403, 'err.origin');
  if (!(req.headers.get('content-type') || '').toLowerCase().startsWith('application/json')) throw new HttpError(415, 'err.badRequest');
}

const MAX_BODY = 64 * 1024;
export async function readJson(req: Request): Promise<unknown> {
  const len = Number(req.headers.get('content-length') || 0);
  if (len > MAX_BODY) throw new HttpError(413, 'err.badRequest');
  const raw = await req.text();
  if (raw.length > MAX_BODY) throw new HttpError(413, 'err.badRequest');
  if (!raw) return {};
  try { return JSON.parse(raw); } catch { throw new HttpError(400, 'err.badRequest'); }
}
