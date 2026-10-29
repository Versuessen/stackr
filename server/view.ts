// What each person is allowed to see. The browser only ever receives this filtered copy:
//  - everyone: the catalog, the seller's public profile, and anonymous order stubs (status,
//    dates, stars) so wait times and seller level can be shown. No names, texts or coordinates.
//  - a client: additionally their own account, orders, tokens, notices and blacklist status.
//  - the seller (after 2FA): everything except other people's notices.

import type { Account, BlacklistEntry, DB, ID, Order, Token } from '../src/domain/types.js';

export type Viewer = { account: Account; seller: boolean } | null;

function stub(o: Order, anon: (id: ID) => ID): Order {
  return {
    id: o.id, number: 0, clientId: anon(o.clientId), sellerId: o.sellerId, serviceId: o.serviceId, kind: o.kind,
    title: '', details: '', batches: o.batches, batchesDelivered: o.batchesDelivered, farmTier: o.farmTier, extras: [],
    deliveryMethod: o.deliveryMethod, clientProvidesMaterials: false, offer: '', tokens: o.tokens, status: o.status,
    history: [], messages: [], createdAt: o.createdAt, dueAt: o.dueAt, deliveredAt: o.deliveredAt,
    completedAt: o.completedAt, autoCompleted: o.autoCompleted, tosAcceptedAt: o.createdAt,
    rating: o.rating ? { stars: o.rating.stars, tags: o.rating.tags, at: o.rating.at } : undefined,
    complaints: o.complaints.map(() => ({ at: '', text: '' })), cancelledBy: o.cancelledBy,
  };
}

const tokenStub = (t: Token, anon: (id: ID) => ID): Token => ({ id: t.id, ownerId: anon(t.ownerId), type: t.type, source: 'granted', grantedAt: '', usedOnOrderId: t.usedOnOrderId });

export function viewFor(db: DB, viewer: Viewer): DB {
  if (viewer?.seller) {
    return { ...db, notices: db.notices.filter((n) => n.accountId === viewer.account.id) };
  }
  const me = viewer?.account.id ?? null;
  const pseudo = new Map<ID, ID>();
  const anon = (id: ID) => {
    if (id === me) return id;
    let p = pseudo.get(id);
    if (!p) { p = `anon-${pseudo.size + 1}`; pseudo.set(id, p); }
    return p;
  };
  const sellerAccounts = new Set(db.sellers.map((s) => s.accountId));
  const accounts = db.accounts
    .filter((a) => a.id === me || sellerAccounts.has(a.id))
    .map((a) => (a.id === me ? a : { id: a.id, mcName: a.mcName, mcUuid: '', createdAt: a.createdAt, lastSeenAt: a.createdAt, sellerId: a.sellerId }));
  const orders = db.orders.map((o) => (o.clientId === me ? o : stub(o, anon)));
  const myOrderIds = new Set(orders.filter((o) => o.clientId === me).map((o) => o.id));
  const usedOnOthers = new Set(db.orders.filter((o) => !myOrderIds.has(o.id)).flatMap((o) => o.tokens));
  const tokens = db.tokens
    .filter((t) => t.ownerId === me || usedOnOthers.has(t.id))
    .map((t) => (t.ownerId === me ? t : tokenStub(t, anon)));
  const blacklist: BlacklistEntry[] = db.blacklist
    .filter((b) => b.clientId === me)
    .map((b) => ({ ...b, reason: '' }));
  return {
    ...db,
    accounts,
    orders,
    tokens,
    blacklist,
    notices: db.notices.filter((n) => n.accountId === me),
  };
}
