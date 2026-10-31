// Gift codes (XXXX-XXXX-XXXX-XXXX) the seller hands out in-game or on Discord. Stored only as a
// keyed hash plus the last block as a hint; each account can redeem a code once, and a code has a
// use limit and an expiry date.

import { randomBytes } from 'node:crypto';
import { GIFT_ALPHABET, GIFT_RE, normGift, type GiftReward } from '../src/domain/points.js';
import { hmac, subKey } from './crypto.js';
import type { Sql } from './db.js';
import type { Env } from './env.js';
import { HttpError } from './http.js';

const giftHash = (env: Env, code: string) => hmac(subKey(env.appSecret, 'gift-codes'), code);

export function newGiftCode(): string {
  const out: string[] = [];
  while (out.length < 16) {
    for (const b of randomBytes(32)) {
      if (b < 256 - (256 % GIFT_ALPHABET.length) && out.length < 16) out.push(GIFT_ALPHABET[b % GIFT_ALPHABET.length]);
    }
  }
  return `${out.slice(0, 4).join('')}-${out.slice(4, 8).join('')}-${out.slice(8, 12).join('')}-${out.slice(12).join('')}`;
}

export async function createGift(sql: Sql, env: Env, reward: GiftReward, uses: number, days: number, note: string, by: string) {
  const code = newGiftCode();
  const rows = await sql.query<{ id: string; expires_at: string }>(
    `insert into gift_codes (code_hash, hint, reward, max_uses, note, created_by, expires_at)
     values ($1, $2, $3::jsonb, $4, $5, $6, now() + make_interval(days => $7)) returning id, expires_at`,
    [giftHash(env, code), code.slice(-4), JSON.stringify(reward), uses, note, by, days],
  );
  return { code, id: String(rows[0].id), expiresAt: new Date(rows[0].expires_at).toISOString() };
}

export async function listGifts(sql: Sql) {
  const rows = await sql.query<{ id: string; hint: string; reward: GiftReward | string; max_uses: number; uses: number; note: string; created_at: string; expires_at: string; revoked_at: string | null }>(
    'select id, hint, reward, max_uses, uses, note, created_at, expires_at, revoked_at from gift_codes order by created_at desc limit 100');
  return rows.map((r) => ({
    id: String(r.id), hint: r.hint, reward: typeof r.reward === 'string' ? JSON.parse(r.reward) as GiftReward : r.reward,
    maxUses: Number(r.max_uses), uses: Number(r.uses), note: r.note,
    createdAt: new Date(r.created_at).toISOString(), expiresAt: new Date(r.expires_at).toISOString(),
    active: !r.revoked_at && Date.parse(r.expires_at) > Date.now() && Number(r.uses) < Number(r.max_uses),
  }));
}

export async function revokeGift(sql: Sql, id: string) {
  await sql.query('update gift_codes set revoked_at = now() where id = $1 and revoked_at is null', [id]);
}

/** Claims one use of a code for this account. Returns the reward, or throws with the reason. */
export async function claimGift(sql: Sql, env: Env, raw: string, accountId: string): Promise<GiftReward> {
  const code = normGift(raw);
  if (!GIFT_RE.test(code)) throw new HttpError(400, 'err.giftInvalid');
  const rows = await sql.query<{ id: string; reward: GiftReward | string; valid: boolean }>(
    'select id, reward, (revoked_at is null and expires_at > now() and uses < max_uses) as valid from gift_codes where code_hash = $1',
    [giftHash(env, code)],
  );
  const gift = rows[0];
  if (!gift) throw new HttpError(400, 'err.giftInvalid');
  const before = await sql.query('select 1 from gift_redemptions where code_id = $1 and account_id = $2', [gift.id, accountId]);
  if (before.length) throw new HttpError(409, 'err.giftUsed');
  if (!gift.valid) throw new HttpError(400, 'err.giftInvalid');
  const mine = await sql.query('insert into gift_redemptions (code_id, account_id) values ($1, $2) on conflict do nothing returning 1', [gift.id, accountId]);
  if (!mine.length) throw new HttpError(409, 'err.giftUsed');
  const taken = await sql.query('update gift_codes set uses = uses + 1 where id = $1 and uses < max_uses returning 1', [gift.id]);
  if (!taken.length) {
    await sql.query('delete from gift_redemptions where code_id = $1 and account_id = $2', [gift.id, accountId]);
    throw new HttpError(400, 'err.giftInvalid');
  }
  return typeof gift.reward === 'string' ? JSON.parse(gift.reward) as GiftReward : gift.reward;
}
