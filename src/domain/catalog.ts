// Starting catalog and example data. Seller and catalog live in the DB so a second seller
// can be added later without code changes; this file only seeds a fresh install.

import type { Account, DB, Localized, Order, SellerProfile, Service, ServiceExtra } from './types.js';
import { DAY, iso } from './rules.js';

export const SCHEMA_VERSION = 2;

const L = (de: string, en: string): Localized => ({ de, en });

const FARM_TIERS = [
  { tier: 1 as const, label: L('Kompakt', 'Compact') },
  { tier: 2 as const, label: L('Standard', 'Standard') },
  { tier: 3 as const, label: L('Hochleistung', 'High output') },
];
const FARM_EXTRAS: ServiceExtra[] = [
  { id: 'storage', name: L('Größeres Lager', 'Larger storage') },
  { id: 'sorting', name: L('Item-Sortierung', 'Item sorting') },
];

function services(sellerId: string): Service[] {
  const mat = (id: string, name: Localized, description: Localized, unitHint: Localized): Service => ({
    id: `${sellerId}-${id}`, sellerId, kind: 'material', name, description, unitHint, active: true,
  });
  const farm = (id: string, name: Localized, description: Localized): Service => ({
    id: `${sellerId}-${id}`, sellerId, kind: 'farm', name, description, tiers: FARM_TIERS, extras: FARM_EXTRAS, active: true,
  });
  return [
    mat('items', L('Material-Lieferung', 'Material delivery'), L('Alles aus der Item-Liste von Minecraft 26.3, als ein Auftrag aus dem Warenkorb.', 'Anything from the Minecraft 26.3 item list, as one order from the cart.'), L('Stück', 'pieces')),
    farm('iron', L('Eisenfarm', 'Iron farm'), L('Golem-Farm mit Dorfbewohnern.', 'Golem farm with villagers.')),
    farm('raid', L('Raidfarm', 'Raid farm'), L('Totems, Smaragde und mehr.', 'Totems, emeralds and more.')),
    farm('wool', L('Wollfarm', 'Wool farm'), L('Schafe und Scheren, auf Wunsch alle Farben.', 'Sheep and shears, all colours on request.')),
    farm('stone', L('Stein-/Bruchsteingenerator', 'Stone / cobblestone generator'), L('Für Baumaterial in Mengen.', 'Building material in bulk.')),
    farm('tree', L('Baumfarm', 'Tree farm'), L('Holz nach Wahl der Baumart.', 'Logs from the tree type of your choice.')),
    farm('gold', L('Goldfarm', 'Gold farm'), L('Piglin-Farm auf dem Netherdach.', 'Piglin farm on the nether roof.')),
    {
      id: `${sellerId}-custom`, sellerId, kind: 'custom', active: true,
      name: L('Eigener Auftrag', 'Custom request'),
      description: L('Etwas, das hier nicht steht? Beschreib es.', 'Something not listed? Describe it.'),
    },
  ];
}

/** A fresh database: one seller (you) and nothing else. */
export function emptyDB(now: number): DB {
  const t = iso(now);
  const seller: Account = { id: 'acc-seller', mcName: 'DeinName', mcUuid: '00000000-0000-0000-0000-000000000001', createdAt: t, lastSeenAt: t, sellerId: 'seller-1' };
  const profile: SellerProfile = {
    id: 'seller-1', accountId: seller.id, displayName: 'DeinName',
    tagline: L('Farmen bauen und seltene Materialien besorgen.', 'Building farms and grinding rare materials.'),
    accepting: true, vacation: { on: false }, lastOnlineAt: t, maxConcurrent: 2, weeklyCapacity: 10,
    blacklistPenaltyDays: 7, levelState: { level: 'new' }, createdAt: t,
  };
  return {
    version: SCHEMA_VERSION, accounts: [seller], sellers: [profile], services: services(profile.id),
    orders: [], tokens: [], blacklist: [], notices: [], nextOrderNumber: 1001, clockOffsetDays: 0,
  };
}

/** Fresh database plus clearly-marked example clients and orders, so every screen has something on it. */
export function exampleDB(now: number): DB {
  const db = emptyDB(now);
  const ago = (d: number) => iso(now - d * DAY);
  const mk = (id: string, name: string): Account => ({ id, mcName: name, mcUuid: `example-${id}`, createdAt: ago(20), lastSeenAt: ago(1) });
  db.accounts.push(mk('acc-ex1', 'Kiesel_Kai'), mk('acc-ex2', 'Mo0nmoth'));
  const base = (n: number, over: Partial<Order>): Order => ({
    id: `ord-ex${n}`, number: 1000 + n, clientId: 'acc-ex1', sellerId: 'seller-1', serviceId: 'seller-1-items',
    kind: 'material', title: '', details: '', batches: 1, batchesDelivered: 0, extras: [],
    deliveryMethod: 'place_at_coords', clientProvidesMaterials: false, offer: '', tokens: [], status: 'received',
    history: [], messages: [], createdAt: ago(1), tosAcceptedAt: ago(1), complaints: [], ...over,
  });
  db.orders.push(
    base(1, {
      title: '4 Positionen', batches: 2, offer: '2 Diamantblöcke',
      lines: [
        { itemId: 'netherite_ingot', de: 'Netheritbarren', en: 'Netherite Ingot', stack: 64, n: 8, unit: 'piece' },
        { itemId: 'purple_shulker_box', de: 'Violette Shulker-Kiste', en: 'Purple Shulker Box', stack: 1, n: 2, unit: 'piece' },
        { itemId: 'oak_log', de: 'Eichenstamm', en: 'Oak Log', stack: 64, n: 3, unit: 'stack' },
        { itemId: 'ender_pearl', de: 'Enderperle', en: 'Ender Pearl', stack: 16, n: 2, unit: 'stack' },
      ],
      details: '[Beispiel] Die Netheritbarren gern als zweite Lieferung.',
      coords: { x: 412, y: 70, z: -1280, dimension: 'overworld' },
      status: 'received', createdAt: ago(0.4), tosAcceptedAt: ago(0.4),
      history: [{ status: 'received', at: ago(0.4), by: 'acc-ex1' }],
      messages: [{ id: 'm1', authorId: 'acc-ex1', at: ago(0.3), text: '[Beispiel] Geht auch in 2 Lieferungen?' }],
    }),
    base(2, {
      clientId: 'acc-ex2', serviceId: 'seller-1-iron', kind: 'farm', title: 'Eisenfarm', farmTier: 1,
      extras: ['storage'], deliveryMethod: 'build_at_coords', offer: 'Ein Gefallen später', details: '[Beispiel] Neben meiner Basis, Ostseite.',
      coords: { x: -220, y: 64, z: 515, dimension: 'overworld' }, status: 'processing',
      terms: { price: 'Ein Gefallen + 1 Stack Eisenblöcke', days: 4, proposedAt: ago(3), acceptedAt: ago(2.8) },
      createdAt: ago(3.2), clearedAt: ago(2.8), dueAt: ago(-1.2), tosAcceptedAt: ago(3.2),
      history: [
        { status: 'received', at: ago(3.2), by: 'acc-ex2' },
        { status: 'cleared', at: ago(2.8), by: 'acc-seller' },
        { status: 'processing', at: ago(1), by: 'acc-seller' },
      ],
    }),
    base(3, {
      title: 'Enderperle', offer: '1 Diamantblock',
      lines: [{ itemId: 'ender_pearl', de: 'Enderperle', en: 'Ender Pearl', stack: 16, n: 4, unit: 'stack' }],
      details: '[Beispiel]', status: 'completed', terms: { price: '1 Diamantblock', days: 2, proposedAt: ago(12), acceptedAt: ago(12) },
      createdAt: ago(12.5), clearedAt: ago(12), dueAt: ago(10), deliveredAt: ago(10.5), completedAt: ago(9), tosAcceptedAt: ago(12.5),
      history: [
        { status: 'received', at: ago(12.5), by: 'acc-ex1' }, { status: 'cleared', at: ago(12), by: 'acc-seller' },
        { status: 'processing', at: ago(11.5), by: 'acc-seller' }, { status: 'fulfilling', at: ago(10.6), by: 'acc-seller' },
        { status: 'delivered', at: ago(10.5), by: 'acc-seller' }, { status: 'completed', at: ago(9), by: 'acc-ex1' },
      ],
      batchesDelivered: 1, rating: { stars: 5, tags: { speed: 5, communication: 4 }, at: ago(9) },
    }),
  );
  db.tokens.push(
    { id: 'tok-ex1', ownerId: 'acc-ex1', type: 'priority', source: 'first_order', grantedAt: ago(20) },
    { id: 'tok-ex2', ownerId: 'acc-ex2', type: 'priority', source: 'first_order', grantedAt: ago(20) },
  );
  db.nextOrderNumber = 1004;
  return db;
}
