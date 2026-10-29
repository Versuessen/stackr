// Sessions: a random 256-bit token in an HttpOnly cookie; the database stores only its SHA-256
// hash, so a database leak does not hand out logins. Seller sessions are short and need 2FA.

import { randomToken, sha256 } from './crypto.js';
import type { Sql } from './db.js';
import { SESSION_COOKIE, readCookie, sessionCookie } from './http.js';

export const CLIENT_TTL_DAYS = 30;
export const CLIENT_IDLE_DAYS = 14;
export const SELLER_TTL_HOURS = 12;

export interface Session { idHash: string; accountId: string; mfaOk: boolean; expiresAt: Date }

export async function createSession(sql: Sql, accountId: string, seller: boolean): Promise<string> {
  const token = randomToken(32);
  const ttlSec = seller ? SELLER_TTL_HOURS * 3600 : CLIENT_TTL_DAYS * 86400;
  await sql.query(
    "insert into sessions (id_hash, account_id, mfa_ok, expires_at) values ($1, $2, false, now() + make_interval(secs => $3))",
    [sha256(token), accountId, ttlSec],
  );
  return sessionCookie(token, ttlSec);
}

export async function getSession(sql: Sql, req: Request): Promise<Session | null> {
  const token = readCookie(req, SESSION_COOKIE);
  if (!token || !/^[A-Za-z0-9_-]{40,64}$/.test(token)) return null;
  const idHash = sha256(token);
  const rows = await sql.query<{ account_id: string; mfa_ok: boolean; expires_at: string; idle: boolean; stale: boolean }>(
    `select account_id, mfa_ok, expires_at,
            last_seen_at < now() - make_interval(days => $2) as idle,
            last_seen_at < now() - interval '10 minutes' as stale
       from sessions where id_hash = $1 and expires_at > now()`,
    [idHash, CLIENT_IDLE_DAYS],
  );
  const r = rows[0];
  if (!r) return null;
  if (r.idle) { await endSession(sql, idHash); return null; }
  if (r.stale) await sql.query('update sessions set last_seen_at = now() where id_hash = $1', [idHash]);
  return { idHash, accountId: r.account_id, mfaOk: r.mfa_ok, expiresAt: new Date(r.expires_at) };
}

export async function markMfa(sql: Sql, idHash: string) {
  await sql.query('update sessions set mfa_ok = true where id_hash = $1', [idHash]);
}
export async function endSession(sql: Sql, idHash: string) {
  await sql.query('delete from sessions where id_hash = $1', [idHash]);
}
export async function endAllSessions(sql: Sql, accountId: string) {
  await sql.query('delete from sessions where account_id = $1', [accountId]);
}
