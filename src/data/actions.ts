// Every change to the data goes through one of these functions. Each takes the current DB,
// returns a new DB, and throws ActionError (with an i18n key) when a rule forbids the change.
// A future server would run these same functions, so the rules stay in one place.

import type { CustomLine, DB, FarmTier, ID, Order, OrderLine, OrderStatus, Rating, SellerProfile, TokenType } from '../domain/types.js';
import { cartTotals, unitOk } from '../domain/items.js';
import {
  CONFIG, DAY, activeBlacklist, bulkLimit, checkCanOrder, clientStats, iso, nextLevelState, nowFrom, sellerStats,
} from '../domain/rules.js';
import { emptyDB, exampleDB } from '../domain/catalog.js';

export class ActionError extends Error {
  constructor(public key: string, public vars?: Record<string, string | number>) { super(key); }
}

type Mut = (db: DB, now: number) => void;
export function apply(db: DB, fn: Mut): DB {
  const draft = structuredClone(db);
  fn(draft, nowFrom(draft));
  return draft;
}

// Random ids from the platform CSPRNG (browser and Node both have crypto.getRandomValues).
const uid = (p: string) => {
  const b = new Uint8Array(9);
  globalThis.crypto.getRandomValues(b);
  return `${p}-${Array.from(b, (x) => x.toString(36).padStart(2, '0')).join('').slice(0, 14)}`;
};

function order(db: DB, id: ID): Order {
  const o = db.orders.find((x) => x.id === id);
  if (!o) throw new ActionError('err.orderMissing');
  return o;
}
function seller(db: DB, id: ID): SellerProfile {
  const s = db.sellers.find((x) => x.id === id);
  if (!s) throw new ActionError('err.sellerMissing');
  return s;
}
function sellerAccountId(db: DB, o: Order) { return seller(db, o.sellerId).accountId; }

function notify(db: DB, now: number, accountId: ID, key: string, o?: Order, vars?: Record<string, string | number>) {
  db.notices.push({ id: uid('n'), accountId, orderId: o?.id, key, vars: { number: o?.number ?? '', ...vars }, at: iso(now), read: false });
}

function setStatus(o: Order, status: OrderStatus, by: ID, now: number, note?: string) {
  o.status = status;
  o.history.push({ status, at: iso(now), by, note });
}

function requireStatus(o: Order, ...allowed: OrderStatus[]) {
  if (!allowed.includes(o.status)) throw new ActionError('err.wrongStatus');
}

function requireRole(db: DB, o: Order, actorId: ID, role: 'client' | 'seller') {
  const ok = role === 'client' ? o.clientId === actorId : sellerAccountId(db, o) === actorId;
  if (!ok) throw new ActionError('err.notAllowed');
}

function refundTokens(db: DB, o: Order) {
  for (const t of db.tokens) if (t.usedOnOrderId === o.id) t.usedOnOrderId = undefined;
  o.tokens = [];
}

function touchSeller(db: DB, o: Order, now: number) {
  seller(db, o.sellerId).lastOnlineAt = iso(now);
}

function refreshSellerLevel(db: DB, sellerId: ID, now: number) {
  const s = seller(db, sellerId);
  const earned = sellerStats(db, sellerId).earnedLevel;
  const next = nextLevelState(s.levelState, earned, now);
  if (next.level !== s.levelState.level && next.level !== 'new') notify(db, now, s.accountId, 'notice.levelUp', undefined, { level: next.level });
  s.levelState = next;
}

// ---------- Accounts ----------

export const signIn = (mcName: string, onId: (id: ID) => void): Mut => (db, now) => {
  const name = mcName.trim();
  if (!/^[A-Za-z0-9_]{3,16}$/.test(name)) throw new ActionError('err.badName');
  let acc = db.accounts.find((a) => a.mcName.toLowerCase() === name.toLowerCase());
  if (!acc) {
    acc = { id: uid('acc'), mcName: name, mcUuid: 'pending-verification', createdAt: iso(now), lastSeenAt: iso(now) };
    db.accounts.push(acc);
    db.tokens.push({ id: uid('tok'), ownerId: acc.id, type: 'priority', source: 'first_order', grantedAt: iso(now) });
    notify(db, now, acc.id, 'notice.welcomeToken');
  }
  acc.lastSeenAt = iso(now);
  if (acc.sellerId) seller(db, acc.sellerId).lastOnlineAt = iso(now);
  onId(acc.id);
};

/**
 * Live sign-in after the verification server confirmed the Minecraft account.
 * Accounts are keyed by UUID, because names can change. The seller account is the one whose
 * UUID matches the server's SELLER_MC_UUID setting.
 */
export const signInVerified = (mcName: string, mcUuid: string, isSeller: boolean, onId: (id: ID) => void): Mut => (db, now) => {
  if (!/^[A-Za-z0-9_]{3,16}$/.test(mcName) || !/^[0-9a-f]{32}$/.test(mcUuid)) throw new ActionError('err.badName');
  let acc = db.accounts.find((a) => a.mcUuid === mcUuid && !a.deletedAt);
  if (!acc && isSeller) acc = db.accounts.find((a) => a.sellerId);
  if (!acc) {
    acc = { id: uid('acc'), mcName, mcUuid, createdAt: iso(now), lastSeenAt: iso(now) };
    db.accounts.push(acc);
    db.tokens.push({ id: uid('tok'), ownerId: acc.id, type: 'priority', source: 'first_order', grantedAt: iso(now) });
    notify(db, now, acc.id, 'notice.welcomeToken');
  }
  if (acc.sellerId && !isSeller) throw new ActionError('err.notAllowed');
  acc.mcName = mcName;
  acc.mcUuid = mcUuid;
  acc.lastSeenAt = iso(now);
  if (acc.sellerId) {
    const s = seller(db, acc.sellerId);
    s.lastOnlineAt = iso(now);
    if (s.displayName === 'DeinName') s.displayName = mcName;
  }
  onId(acc.id);
};

const OPEN_FOR_DELETE: OrderStatus[] = ['received', 'cleared', 'processing', 'fulfilling', 'delivered'];

/**
 * GDPR erasure. Removes everything that identifies the person; the order records stay as
 * anonymous bookkeeping (status, dates, rating) so seller statistics remain correct.
 */
export const deleteAccount = (accountId: ID): Mut => (db, now) => {
  const acc = db.accounts.find((a) => a.id === accountId);
  if (!acc || acc.deletedAt) throw new ActionError('err.accountMissing');
  if (acc.sellerId) throw new ActionError('err.notAllowed');
  if (db.orders.some((o) => o.clientId === accountId && OPEN_FOR_DELETE.includes(o.status))) throw new ActionError('err.openOrders');
  acc.mcName = 'deleted';
  acc.mcUuid = '';
  acc.deletedAt = iso(now);
  for (const o of db.orders.filter((x) => x.clientId === accountId)) scrubOrder(o);
  db.notices = db.notices.filter((n) => n.accountId !== accountId);
  db.tokens = db.tokens.filter((t) => t.ownerId !== accountId || t.usedOnOrderId);
  for (const b of db.blacklist) if (b.clientId === accountId) b.reason = '—';
};

function scrubOrder(o: Order) {
  o.title = '—';
  o.details = '';
  o.offer = '';
  o.coords = undefined;
  o.messages = [];
  o.customLines = o.customLines?.map(() => ({ text: '—' }));
  o.complaints = o.complaints.map((c) => ({ ...c, text: '—' }));
  if (o.terms) o.terms = { ...o.terms, price: '—', note: undefined };
  for (const h of o.history) h.note = undefined;
  o.scrubbed = true;
}

/** Retention: free text, coordinates and chat of closed orders go after RETENTION_DAYS. Old notices too. */
export const RETENTION_DAYS = 365;
export const NOTICE_DAYS = 180;
export const purgeOld: Mut = (db, now) => {
  const cut = now - RETENTION_DAYS * DAY;
  for (const o of db.orders) {
    if (o.scrubbed || OPEN_FOR_DELETE.includes(o.status)) continue;
    const last = o.history.length ? Date.parse(o.history[o.history.length - 1].at) : Date.parse(o.createdAt);
    if (last < cut) scrubOrder(o);
  }
  const noticeCut = now - NOTICE_DAYS * DAY;
  db.notices = db.notices.filter((n) => Date.parse(n.at) >= noticeCut);
};

// ---------- Placing an order ----------

export interface OrderInput {
  clientId: ID;
  serviceId: ID;
  title: string;
  details: string;
  quantity?: number;
  unit?: string;
  lines?: OrderLine[];
  customLines?: CustomLine[];
  batches: number;
  farmTier?: FarmTier;
  extras: string[];
  coords?: Order['coords'];
  deliveryMethod: Order['deliveryMethod'];
  clientProvidesMaterials: boolean;
  offer: string;
  tokenIds: ID[];
  tosAccepted: boolean;
  vacationAcknowledged: boolean;
}

export const placeOrder = (input: OrderInput, onId: (id: ID) => void): Mut => (db, now) => {
  const svc = db.services.find((s) => s.id === input.serviceId && s.active);
  if (!svc) throw new ActionError('err.serviceMissing');
  const s = seller(db, svc.sellerId);
  const tokens = input.tokenIds.map((id) => db.tokens.find((t) => t.id === id && t.ownerId === input.clientId && !t.usedOnOrderId));
  if (tokens.some((t) => !t)) throw new ActionError('err.tokenInvalid');
  const types = new Set(tokens.map((t) => t!.type));

  const check = checkCanOrder(db, s, input.clientId, now, types.has('extra_slot'));
  if (!check.ok) throw new ActionError(check.reasons[0]);
  if (!input.tosAccepted) throw new ActionError('err.tos');
  if (s.vacation.on && !input.vacationAcknowledged) throw new ActionError('err.vacationAck');
  if (!input.title.trim()) throw new ActionError('err.titleRequired');
  if (svc.kind === 'farm') {
    if (!input.farmTier) throw new ActionError('err.tierRequired');
    const max = clientStats(db, input.clientId).maxFarmTier;
    if (input.farmTier > max && !types.has('high_effort')) throw new ActionError('err.tierLocked', { max });
    if (!input.coords) throw new ActionError('err.coordsRequired');
  }
  let slots = 1;
  if (svc.kind === 'material') {
    const lines = (input.lines ?? []).filter((l) => l.n >= 1 && unitOk(l, l.unit));
    if (!lines.length && !(input.customLines ?? []).length) throw new ActionError('err.cartEmpty');
    slots = Math.max(1, cartTotals(lines).slots);
    const limit = bulkLimit(s.levelState.level);
    if (limit !== null && slots > limit) throw new ActionError('err.bulkLimit', { limit });
    input = { ...input, lines };
  }
  const batches = Math.max(1, Math.min(input.batches || 1, svc.kind === 'material' ? Math.min(3, slots) : 1));

  const o: Order = {
    id: uid('ord'), number: db.nextOrderNumber++, clientId: input.clientId, sellerId: s.id, serviceId: svc.id,
    kind: svc.kind, title: input.title.trim(), details: input.details.trim(), quantity: input.quantity, unit: input.unit,
    lines: input.lines, customLines: input.customLines,
    batches, batchesDelivered: 0, farmTier: svc.kind === 'farm' ? input.farmTier : undefined, extras: input.extras,
    coords: input.coords, deliveryMethod: input.deliveryMethod, clientProvidesMaterials: input.clientProvidesMaterials,
    offer: input.offer.trim(), tokens: input.tokenIds, status: 'received', history: [], messages: [],
    createdAt: iso(now), tosAcceptedAt: iso(now), vacationAcknowledged: s.vacation.on ? true : undefined, complaints: [],
  };
  setStatus(o, 'received', input.clientId, now);
  for (const t of tokens) t!.usedOnOrderId = o.id;
  db.orders.push(o);
  notify(db, now, s.accountId, 'notice.newOrder', o);
  onId(o.id);
};

// ---------- Conversation and terms ----------

export const sendMessage = (orderId: ID, authorId: ID, text: string): Mut => (db, now) => {
  const o = order(db, orderId);
  const isSeller = sellerAccountId(db, o) === authorId;
  if (o.clientId !== authorId && !isSeller) throw new ActionError('err.notAllowed');
  if (!text.trim()) return;
  o.messages.push({ id: uid('m'), authorId, at: iso(now), text: text.trim().slice(0, 1000) });
  notify(db, now, isSeller ? o.clientId : sellerAccountId(db, o), 'notice.message', o);
  if (isSeller) touchSeller(db, o, now);
};

export const proposeTerms = (orderId: ID, actorId: ID, price: string, days: number, note: string): Mut => (db, now) => {
  const o = order(db, orderId);
  requireRole(db, o, actorId, 'seller');
  requireStatus(o, 'received');
  if (!price.trim() || !(days >= 1)) throw new ActionError('err.termsIncomplete');
  o.terms = { price: price.trim(), days: Math.round(days), note: note.trim() || undefined, proposedAt: iso(now) };
  notify(db, now, o.clientId, 'notice.termsProposed', o);
  touchSeller(db, o, now);
};

export const acceptTerms = (orderId: ID, actorId: ID): Mut => (db, now) => {
  const o = order(db, orderId);
  requireRole(db, o, actorId, 'client');
  requireStatus(o, 'received');
  if (!o.terms) throw new ActionError('err.noTerms');
  o.terms.acceptedAt = iso(now);
  notify(db, now, sellerAccountId(db, o), 'notice.termsAccepted', o);
};

// ---------- Seller moves the order forward ----------

export const clearOrder = (orderId: ID, actorId: ID): Mut => (db, now) => {
  const o = order(db, orderId);
  requireRole(db, o, actorId, 'seller');
  requireStatus(o, 'received');
  if (!o.terms?.acceptedAt) throw new ActionError('err.termsNotAccepted');
  setStatus(o, 'cleared', actorId, now);
  o.clearedAt = iso(now);
  o.dueAt = iso(now + o.terms.days * DAY);
  notify(db, now, o.clientId, 'notice.status.cleared', o);
  touchSeller(db, o, now);
};

export const startProcessing = (orderId: ID, actorId: ID): Mut => (db, now) => {
  const o = order(db, orderId);
  requireRole(db, o, actorId, 'seller');
  requireStatus(o, 'cleared');
  setStatus(o, 'processing', actorId, now);
  notify(db, now, o.clientId, 'notice.status.processing', o);
  touchSeller(db, o, now);
};

export const startFulfilling = (orderId: ID, actorId: ID): Mut => (db, now) => {
  const o = order(db, orderId);
  requireRole(db, o, actorId, 'seller');
  requireStatus(o, 'processing');
  setStatus(o, 'fulfilling', actorId, now);
  notify(db, now, o.clientId, 'notice.status.fulfilling', o);
  touchSeller(db, o, now);
};

/** Logs one delivery stage. The last stage hands the order to the client for approval. */
export const deliverBatch = (orderId: ID, actorId: ID): Mut => (db, now) => {
  const o = order(db, orderId);
  requireRole(db, o, actorId, 'seller');
  requireStatus(o, 'fulfilling');
  o.batchesDelivered = Math.min(o.batches, o.batchesDelivered + 1);
  touchSeller(db, o, now);
  if (o.batchesDelivered < o.batches) {
    o.history.push({ status: 'fulfilling', at: iso(now), by: actorId, note: `batch:${o.batchesDelivered}/${o.batches}` });
    notify(db, now, o.clientId, 'notice.batch', o, { done: o.batchesDelivered, total: o.batches });
    return;
  }
  setStatus(o, 'delivered', actorId, now);
  o.deliveredAt = iso(now);
  notify(db, now, o.clientId, 'notice.status.delivered', o, { days: CONFIG.approvalWindowDays });
};

export const declineOrder = (orderId: ID, actorId: ID, note: string): Mut => (db, now) => {
  const o = order(db, orderId);
  requireRole(db, o, actorId, 'seller');
  requireStatus(o, 'received');
  setStatus(o, 'declined', actorId, now, note.trim() || undefined);
  refundTokens(db, o);
  notify(db, now, o.clientId, 'notice.status.declined', o);
  touchSeller(db, o, now);
};

export const cancelBySeller = (orderId: ID, actorId: ID, note: string): Mut => (db, now) => {
  const o = order(db, orderId);
  requireRole(db, o, actorId, 'seller');
  requireStatus(o, 'cleared', 'processing', 'fulfilling');
  setStatus(o, 'cancelled', actorId, now, note.trim() || undefined);
  o.cancelledBy = 'seller';
  refundTokens(db, o);
  notify(db, now, o.clientId, 'notice.status.cancelledBySeller', o);
  refreshSellerLevel(db, o.sellerId, now);
};

// ---------- Client side ----------

export const cancelByClient = (orderId: ID, actorId: ID): Mut => (db, now) => {
  const o = order(db, orderId);
  requireRole(db, o, actorId, 'client');
  requireStatus(o, 'received', 'cleared');
  if (o.status === 'received') refundTokens(db, o);
  setStatus(o, 'cancelled', actorId, now);
  o.cancelledBy = 'client';
  notify(db, now, sellerAccountId(db, o), 'notice.cancelledByClient', o);
};

function complete(db: DB, o: Order, by: ID, now: number, auto: boolean) {
  setStatus(o, 'completed', by, now);
  o.completedAt = iso(now);
  o.autoCompleted = auto;
  const done = db.orders.filter((x) => x.clientId === o.clientId && x.status === 'completed').length;
  if (done % CONFIG.repeatClientEvery === 0) {
    db.tokens.push({ id: uid('tok'), ownerId: o.clientId, type: 'priority', source: 'repeat_client', grantedAt: iso(now) });
    notify(db, now, o.clientId, 'notice.repeatToken', o);
  }
  notify(db, now, o.clientId, auto ? 'notice.autoCompleted' : 'notice.status.completed', o);
  notify(db, now, sellerAccountId(db, o), auto ? 'notice.autoCompleted' : 'notice.approved', o);
  refreshSellerLevel(db, o.sellerId, now);
}

export const approve = (orderId: ID, actorId: ID): Mut => (db, now) => {
  const o = order(db, orderId);
  requireRole(db, o, actorId, 'client');
  requireStatus(o, 'delivered');
  complete(db, o, actorId, now, false);
};

/** Within the approval window: something is missing or the farm doesn't work. Back to work. */
export const complain = (orderId: ID, actorId: ID, text: string): Mut => (db, now) => {
  const o = order(db, orderId);
  requireRole(db, o, actorId, 'client');
  requireStatus(o, 'delivered');
  if (!text.trim()) throw new ActionError('err.complaintText');
  o.complaints.push({ at: iso(now), text: text.trim().slice(0, 1000) });
  o.batchesDelivered = Math.max(0, o.batches - 1);
  setStatus(o, 'processing', actorId, now, 'complaint');
  notify(db, now, sellerAccountId(db, o), 'notice.complaint', o);
};

export const rate = (orderId: ID, actorId: ID, rating: Omit<Rating, 'at'>): Mut => (db, now) => {
  const o = order(db, orderId);
  requireRole(db, o, actorId, 'client');
  requireStatus(o, 'completed');
  if (o.rating) throw new ActionError('err.alreadyRated');
  if (!(rating.stars >= 1 && rating.stars <= 5)) throw new ActionError('err.starsRequired');
  o.rating = { ...rating, at: iso(now) };
  notify(db, now, sellerAccountId(db, o), 'notice.rated', o, { stars: rating.stars });
  refreshSellerLevel(db, o.sellerId, now);
};

// ---------- Seller settings and client management ----------

export const updateSeller = (sellerId: ID, actorId: ID, patch: Partial<Pick<SellerProfile,
  'displayName' | 'tagline' | 'accepting' | 'maxConcurrent' | 'weeklyCapacity' | 'blacklistPenaltyDays'>>): Mut => (db, now) => {
  const s = seller(db, sellerId);
  if (s.accountId !== actorId) throw new ActionError('err.notAllowed');
  Object.assign(s, patch);
  if (patch.displayName) {
    const acc = db.accounts.find((a) => a.id === actorId);
    if (acc && /^[A-Za-z0-9_]{3,16}$/.test(patch.displayName)) acc.mcName = patch.displayName;
  }
  s.lastOnlineAt = iso(now);
};

export const setVacation = (sellerId: ID, actorId: ID, on: boolean): Mut => (db, now) => {
  const s = seller(db, sellerId);
  if (s.accountId !== actorId) throw new ActionError('err.notAllowed');
  if (!on) s.lastOnlineAt = iso(now);
  s.vacation = on ? { on: true, since: iso(now) } : { on: false };
};

export const toggleService = (serviceId: ID, actorId: ID): Mut => (db) => {
  const svc = db.services.find((x) => x.id === serviceId);
  if (!svc || seller(db, svc.sellerId).accountId !== actorId) throw new ActionError('err.notAllowed');
  svc.active = !svc.active;
};

export const blacklistClient = (sellerId: ID, actorId: ID, clientId: ID, reason: string): Mut => (db, now) => {
  const s = seller(db, sellerId);
  if (s.accountId !== actorId) throw new ActionError('err.notAllowed');
  if (!db.accounts.some((a) => a.id === clientId)) throw new ActionError('err.accountMissing');
  if (activeBlacklist(db, sellerId, clientId, now)) return;
  db.blacklist.push({ sellerId, clientId, reason: reason.trim() || '—', since: iso(now) });
  notify(db, now, clientId, 'notice.blacklisted', undefined, { seller: s.displayName });
};

export const clearBlacklist = (sellerId: ID, actorId: ID, clientId: ID): Mut => (db, now) => {
  const s = seller(db, sellerId);
  if (s.accountId !== actorId) throw new ActionError('err.notAllowed');
  const entry = db.blacklist.find((b) => b.sellerId === sellerId && b.clientId === clientId && !b.clearedAt);
  if (!entry) return;
  entry.clearedAt = iso(now);
  entry.penaltyUntil = iso(now + s.blacklistPenaltyDays * DAY);
  notify(db, now, clientId, 'notice.blacklistCleared', undefined, { seller: s.displayName, days: s.blacklistPenaltyDays });
};

export const grantToken = (actorId: ID, clientId: ID, type: TokenType): Mut => (db, now) => {
  if (!db.accounts.find((a) => a.id === actorId)?.sellerId) throw new ActionError('err.notAllowed');
  if (!db.accounts.some((a) => a.id === clientId && !a.deletedAt)) throw new ActionError('err.accountMissing');
  db.tokens.push({ id: uid('tok'), ownerId: clientId, type, source: 'granted', grantedAt: iso(now) });
  notify(db, now, clientId, 'notice.tokenGranted', undefined, { type });
};

export const markNoticesRead = (accountId: ID): Mut => (db) => {
  for (const n of db.notices) if (n.accountId === accountId) n.read = true;
};

// ---------- Time-based housekeeping (runs on every load and every minute) ----------

export const tick: Mut = (db, now) => {
  for (const o of db.orders) {
    if (o.status === 'delivered' && o.deliveredAt && Date.parse(o.deliveredAt) + CONFIG.approvalWindowDays * DAY <= now) {
      complete(db, o, 'system', now, true);
    }
  }
  for (const s of db.sellers) refreshSellerLevel(db, s.id, now);
};

// ---------- Beta tools ----------

export const advanceClock = (days: number): Mut => (db) => { db.clockOffsetDays += days; };
export const resetTo = (kind: 'examples' | 'empty') => (): DB => (kind === 'examples' ? exampleDB(Date.now()) : emptyDB(Date.now()));
