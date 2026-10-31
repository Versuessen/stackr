// Points: earned through orders and loyalty, spent on tokens. All amounts in one place so they
// are easy to tune. Pure functions over the DB snapshot.

import type { DB, ID, Order, ShopEvent, SubscriptionPlan, TokenType } from './types.js';

export const EARN = {
  order: 10, // every completed order
  ownMaterials: 25, // client brought the materials (farms and custom builds)
  rating: 3, // rated the order
  loyaltyEvery: 5, // every 5th completed order …
  loyalty: 20, // … gives this bonus
  welcome: 10, // new account
};

/** Points per token in the shop. */
export const TOKEN_PRICE: Record<TokenType, number> = { priority: 60, extra_slot: 90, high_effort: 120, rush: 150 };

/** Subscriptions are agreed and paid in-game; the seller switches them on here. */
export const PLANS: Record<SubscriptionPlan, { points: number; token?: TokenType }> = {
  regular: { points: 40 },
  project: { points: 100, token: 'priority' },
};
export const SUB_PERIOD_DAYS = 30;

export function balance(db: DB, accountId: ID): number {
  return (db.points ?? []).filter((p) => p.accountId === accountId).reduce((a, p) => a + p.delta, 0);
}

export function activeEvent(db: DB, now: number): ShopEvent | undefined {
  return (db.events ?? []).find((e) => Date.parse(e.startsAt) <= now && Date.parse(e.endsAt) > now);
}

/** What a completed order earns, before the event multiplier. */
export function orderEarnings(o: Order): { base: number; own: number } {
  return { base: EARN.order, own: o.clientProvidesMaterials && o.kind !== 'material' ? EARN.ownMaterials : 0 };
}

/** Gift codes: XXXX-XXXX-XXXX-XXXX from an alphabet without look-alike characters. */
export const GIFT_ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
export const GIFT_RE = /^[2-9A-HJKMNP-Z]{4}-[2-9A-HJKMNP-Z]{4}-[2-9A-HJKMNP-Z]{4}-[2-9A-HJKMNP-Z]{4}$/;
export const normGift = (s: string) => {
  const raw = s.toUpperCase().replace(/[^0-9A-Z]/g, '').replace(/O/g, '0').replace(/[IL]/g, '1');
  return raw.length === 16 ? `${raw.slice(0, 4)}-${raw.slice(4, 8)}-${raw.slice(8, 12)}-${raw.slice(12)}` : raw;
};

export type GiftReward = { kind: 'points'; n: number } | { kind: 'token'; type: TokenType };
