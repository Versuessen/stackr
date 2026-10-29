// One-time codes the seller hands out in-game:
//   invite → signs up exactly this Minecraft name, already confirmed (7 days)
//   reset  → sets a new password for this account (24 hours)
// Codes are 10 random characters (about 50 bits), stored only as a keyed hash, single use.

import { randomBytes } from 'node:crypto';
import { base32, hmac, normRecovery, subKey } from './crypto.js';
import type { Sql } from './db.js';
import type { Env } from './env.js';

export type CodeKind = 'invite' | 'reset';
export const CODE_TTL_HOURS: Record<CodeKind, number> = { invite: 24 * 7, reset: 24 };

export function newCode(): string {
  const raw = base32(randomBytes(8)).slice(0, 10);
  return `${raw.slice(0, 5)}-${raw.slice(5)}`;
}
export const codeHash = (env: Env, code: string) => hmac(subKey(env.appSecret, 'one-time-codes'), normRecovery(code));

export async function storeCode(sql: Sql, env: Env, kind: CodeKind, name: string, accountId: string | null, createdBy: string) {
  const nameLc = name.toLowerCase();
  const code = newCode();
  // A new code for the same name and purpose replaces older unused ones.
  await sql.query('delete from auth_codes where kind = $1 and name_lc = $2 and used_at is null', [kind, nameLc]);
  const rows = await sql.query<{ id: string; expires_at: string }>(
    `insert into auth_codes (kind, name, name_lc, account_id, code_hash, created_by, expires_at)
     values ($1, $2, $3, $4, $5, $6, now() + make_interval(hours => $7)) returning id, expires_at`,
    [kind, name, nameLc, accountId, codeHash(env, code), createdBy, CODE_TTL_HOURS[kind]],
  );
  return { code, id: String(rows[0].id), expiresAt: new Date(rows[0].expires_at).toISOString() };
}

/** Marks a matching code used and returns it, or null. Atomic, so a code works exactly once. */
export async function useCode(sql: Sql, env: Env, kind: CodeKind, nameLc: string, code: string) {
  const rows = await sql.query<{ id: string; account_id: string | null }>(
    `update auth_codes set used_at = now()
      where kind = $1 and name_lc = $2 and code_hash = $3 and used_at is null and expires_at > now()
      returning id, account_id`,
    [kind, nameLc, codeHash(env, code)],
  );
  return rows[0] ?? null;
}
