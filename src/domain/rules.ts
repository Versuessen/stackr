// Business rules: the order state machine, queue, limits, tokens and reputation.
// Pure functions over the DB snapshot. The data layer calls these; the UI only reads results.

import type {
  BlacklistEntry, ClientLevelId, DB, FarmTier, ID, Order, OrderStatus, SellerLevelId,
  SellerProfile, Token, TokenType,
} from './types';

export const DAY = 864e5;

export const CONFIG = {
  maxOpenOrdersPerClient: 2, // more needs an extra-slot token
  approvalWindowDays: 3, // client approves or it auto-completes
  sellerGraceDays: 30, // before a seller level drops
  repeatClientEvery: 3, // completed orders per free priority token
};

export const OPEN_STATUSES: OrderStatus[] = ['received', 'cleared', 'processing', 'fulfilling', 'delivered'];
export const WAITING_STATUSES: OrderStatus[] = ['received', 'cleared'];
export const WORKING_STATUSES: OrderStatus[] = ['processing', 'fulfilling'];
export const PROGRESS_STEPS: OrderStatus[] = ['received', 'cleared', 'processing', 'fulfilling', 'completed'];

export const isOpen = (o: Order) => OPEN_STATUSES.includes(o.status);
export const nowFrom = (db: DB) => Date.now() + db.clockOffsetDays * DAY;
export const iso = (t: number) => new Date(t).toISOString();

// ---------- Tokens ----------

export function tokensOf(order: Order, db: DB): Token[] {
  return order.tokens.map((id) => db.tokens.find((t) => t.id === id)).filter(Boolean) as Token[];
}
export function hasToken(order: Order, db: DB, type: TokenType) {
  return tokensOf(order, db).some((t) => t.type === type);
}
export function unusedTokens(db: DB, accountId: ID): Token[] {
  return db.tokens.filter((t) => t.ownerId === accountId && !t.usedOnOrderId);
}

// ---------- Queue ----------

/** Lower = earlier. Rush before priority before normal, then first come first served. */
export function queueRank(order: Order, db: DB): number {
  if (hasToken(order, db, 'rush')) return 0;
  if (hasToken(order, db, 'priority')) return 1;
  return 2;
}

export function sellerQueue(db: DB, sellerId: ID): Order[] {
  return db.orders
    .filter((o) => o.sellerId === sellerId && OPEN_STATUSES.includes(o.status) && o.status !== 'delivered')
    .sort((a, b) => {
      const working = (o: Order) => (WORKING_STATUSES.includes(o.status) ? 0 : 1);
      return working(a) - working(b) || queueRank(a, db) - queueRank(b, db) || a.createdAt.localeCompare(b.createdAt);
    });
}

/** Position among orders still waiting to start (1 = next up). */
export function queuePosition(db: DB, order: Order): number | null {
  if (!WAITING_STATUSES.includes(order.status)) return null;
  const waiting = sellerQueue(db, order.sellerId).filter((o) => WAITING_STATUSES.includes(o.status));
  return waiting.findIndex((o) => o.id === order.id) + 1;
}

/** Rough days until a seller can start something with `ahead` orders in front of it. */
export function estimateWaitDays(seller: SellerProfile, ahead: number): number {
  const perDay = Math.max(seller.weeklyCapacity, 1) / 7;
  return Math.max(1, Math.ceil((ahead + 1) / perDay));
}

export function publicWaitDays(db: DB, seller: SellerProfile): number {
  return estimateWaitDays(seller, sellerQueue(db, seller.id).length);
}

// ---------- Limits ----------

export function activeBlacklist(db: DB, sellerId: ID, clientId: ID, now: number): BlacklistEntry | undefined {
  return db.blacklist.find(
    (b) => b.sellerId === sellerId && b.clientId === clientId &&
      (!b.clearedAt || (b.penaltyUntil && Date.parse(b.penaltyUntil) > now)),
  );
}

export function openOrderCount(db: DB, clientId: ID) {
  return db.orders.filter((o) => o.clientId === clientId && isOpen(o)).length;
}

// ---------- Client reputation ----------

export const CLIENT_LEVELS: { id: ClientLevelId; minPoints: number; minCompleted: number; maxFarmTier: FarmTier }[] = [
  { id: 'new', minPoints: 0, minCompleted: 0, maxFarmTier: 1 },
  { id: 'trusted', minPoints: 110, minCompleted: 2, maxFarmTier: 2 },
  { id: 'regular', minPoints: 125, minCompleted: 5, maxFarmTier: 3 },
];

export function clientStats(db: DB, clientId: ID) {
  const mine = db.orders.filter((o) => o.clientId === clientId);
  const completed = mine.filter((o) => o.status === 'completed');
  let points = 100;
  for (const o of completed) points += 5 + (o.autoCompleted ? 0 : 2);
  for (const o of mine) {
    const wasCleared = o.history.some((h) => h.status === 'cleared');
    if (o.status === 'cancelled' && o.cancelledBy === 'client' && wasCleared) points -= 5;
  }
  points -= 25 * db.blacklist.filter((b) => b.clientId === clientId).length;
  const level = [...CLIENT_LEVELS].reverse().find((l) => points >= l.minPoints && completed.length >= l.minCompleted)!;
  return { points, completed: completed.length, level: level.id, maxFarmTier: level.maxFarmTier };
}

// ---------- Seller reputation ----------

export const SELLER_LEVELS: { id: SellerLevelId; minPoints: number; minCompleted: number; minClients: number; minStars: number; bulkLimit: number | null }[] = [
  { id: 'new', minPoints: 0, minCompleted: 0, minClients: 0, minStars: 0, bulkLimit: 16 },
  { id: 'level1', minPoints: 1040, minCompleted: 3, minClients: 2, minStars: 0, bulkLimit: 32 },
  { id: 'level2', minPoints: 1120, minCompleted: 10, minClients: 4, minStars: 4, bulkLimit: 64 },
  { id: 'top', minPoints: 1250, minCompleted: 25, minClients: 6, minStars: 4.5, bulkLimit: null },
];

const BASE_POINTS = { material: 10, custom: 12, farm: { 1: 15, 2: 25, 3: 40 } as Record<FarmTier, number> };

export function sellerStats(db: DB, sellerId: ID) {
  const mine = db.orders.filter((o) => o.sellerId === sellerId);
  const completed = mine.filter((o) => o.status === 'completed');
  const rated = completed.filter((o) => o.rating);
  const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
  const avgStars = avg(rated.map((o) => o.rating!.stars));
  const tagAvg = (k: 'speed' | 'quality' | 'communication' | 'accuracy') =>
    avg(rated.map((o) => o.rating!.tags[k]).filter((v): v is number => typeof v === 'number'));
  const onTime = completed.filter((o) => o.dueAt && o.deliveredAt && o.deliveredAt <= o.dueAt);

  let points = 1000;
  for (const o of completed) {
    const base = o.kind === 'farm' ? BASE_POINTS.farm[o.farmTier ?? 1] : BASE_POINTS[o.kind];
    const mult = o.rating ? 0.5 + (o.rating.stars - 1) / 4 : 1; // 1★ = 0.5x, 5★ = 1.5x
    points += Math.round(base * mult);
    const late = o.dueAt && o.deliveredAt && o.deliveredAt > o.dueAt;
    points += late ? -10 : 5;
    points -= 5 * o.complaints.length;
  }
  points -= 15 * mine.filter((o) => o.status === 'cancelled' && o.cancelledBy === 'seller').length;

  const uniqueClients = new Set(completed.map((o) => o.clientId)).size;
  const earned = [...SELLER_LEVELS].reverse().find(
    (l) => points >= l.minPoints && completed.length >= l.minCompleted && uniqueClients >= l.minClients &&
      (l.minStars === 0 || (avgStars ?? 0) >= l.minStars),
  )!;
  return {
    points, completed: completed.length, uniqueClients, ratedCount: rated.length, avgStars,
    tags: { speed: tagAvg('speed'), quality: tagAvg('quality'), communication: tagAvg('communication'), accuracy: tagAvg('accuracy') },
    onTimeRate: completed.length ? onTime.length / completed.length : null,
    earnedLevel: earned.id,
  };
}

const levelIndex = (id: SellerLevelId) => SELLER_LEVELS.findIndex((l) => l.id === id);

/** Applies the 30-day grace period: promotions are immediate, demotions wait. */
export function nextLevelState(current: SellerProfile['levelState'], earned: SellerLevelId, now: number): SellerProfile['levelState'] {
  if (levelIndex(earned) >= levelIndex(current.level)) return { level: earned };
  if (!current.graceUntil) return { level: current.level, graceUntil: iso(now + CONFIG.sellerGraceDays * DAY) };
  if (Date.parse(current.graceUntil) <= now) return { level: earned };
  return current;
}

export function bulkLimit(level: SellerLevelId) {
  return SELLER_LEVELS[levelIndex(level)].bulkLimit;
}

// ---------- Ordering checks ----------

export interface OrderCheck {
  ok: boolean;
  reasons: string[]; // i18n keys
}

export function checkCanOrder(db: DB, seller: SellerProfile, clientId: ID, now: number, extraSlot: boolean): OrderCheck {
  const reasons: string[] = [];
  if (seller.accountId === clientId) reasons.push('check.ownSeller');
  if (!seller.accepting) reasons.push('check.notAccepting');
  if (activeBlacklist(db, seller.id, clientId, now)) reasons.push('check.blacklisted');
  if (openOrderCount(db, clientId) >= CONFIG.maxOpenOrdersPerClient && !extraSlot) reasons.push('check.openLimit');
  return { ok: reasons.length === 0, reasons };
}
