// Fixed-window rate limits stored in Postgres, so they hold across all serverless instances.
// IP addresses are never stored: the key is an HMAC of the IP with a key that rotates daily.

import { hmac, subKey } from './crypto.js';
import type { Sql } from './db.js';
import { HttpError } from './http.js';

export function ipHash(secret: string, ip: string, now = Date.now()) {
  const day = Math.floor(now / 864e5);
  return hmac(subKey(secret, 'ip-hash'), `${day}:${ip}`).slice(0, 22);
}

export async function hit(sql: Sql, key: string, limit: number, windowSec: number): Promise<boolean> {
  const rows = await sql.query<{ count: number }>(
    `insert into rate_limits (key, count, reset_at) values ($1, 1, now() + make_interval(secs => $2))
     on conflict (key) do update set
       count = case when rate_limits.reset_at <= now() then 1 else rate_limits.count + 1 end,
       reset_at = case when rate_limits.reset_at <= now() then excluded.reset_at else rate_limits.reset_at end
     returning count`,
    [key.slice(0, 200), windowSec],
  );
  return Number(rows[0].count) <= limit;
}

export async function limit(sql: Sql, key: string, max: number, windowSec: number) {
  if (!(await hit(sql, key, max, windowSec))) throw new HttpError(429, 'err.tooMany');
}

export const LIMITS = {
  anyRequest: [300, 60], // per IP per minute, all API calls
  write: [60, 60], // per IP per minute, state-changing calls
  loginIp: [20, 600], // password attempts per IP per 10 minutes
  loginName: [8, 900], // password attempts per account name per 15 minutes (guessing brake)
  loginGlobal: [500, 600], // all sign-in attempts per 10 minutes (distributed guessing brake)
  registerIp: [5, 3600], // new accounts per IP per hour
  codeName: [6, 3600], // invite/reset code attempts per name per hour
  sellerCodes: [60, 3600], // invite/reset codes the seller creates per hour
  mfaAccount: [10, 900], // 2FA attempts per account per 15 minutes
  commandAccount: [40, 60], // per account per minute
  messageAccount: [20, 600], // chat messages per account per 10 minutes
  orderAccount: [6, 3600], // new orders per account per hour
} as const satisfies Record<string, readonly [number, number]>;
