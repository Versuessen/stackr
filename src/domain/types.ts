// Core records for the SMP gig board. Everything the site stores is one of these.
// The data layer (src/data) persists them; the rules (src/domain/rules.ts) change them.

export type ID = string;
export type ISODate = string;
export type Lang = 'de' | 'en';
export type Localized = { de: string; en: string };

export interface Account {
  id: ID;
  mcName: string; // Minecraft username, verified at sign-in
  mcUuid: string; // Minecraft UUID (placeholder in beta)
  createdAt: ISODate;
  lastSeenAt: ISODate;
  sellerId?: ID; // set when this account runs a seller profile
}

export interface SellerProfile {
  id: ID;
  accountId: ID;
  displayName: string;
  tagline: Localized;
  accepting: boolean; // closed = no new orders at all
  vacation: { on: boolean; since?: ISODate };
  lastOnlineAt: ISODate;
  maxConcurrent: number; // orders in active work at once
  weeklyCapacity: number; // orders per week, used for wait estimates
  blacklistPenaltyDays: number; // waiting time after a blacklist entry is cleared
  levelState: { level: SellerLevelId; graceUntil?: ISODate };
  createdAt: ISODate;
}

export type ServiceKind = 'material' | 'farm' | 'custom';
export type FarmTier = 1 | 2 | 3;

export interface ServiceExtra {
  id: string;
  name: Localized;
}

export interface Service {
  id: ID;
  sellerId: ID;
  kind: ServiceKind;
  name: Localized;
  description: Localized;
  unitHint?: Localized; // e.g. "Stück", "Shulker"
  tiers?: { tier: FarmTier; label: Localized }[]; // farms only
  extras?: ServiceExtra[];
  active: boolean;
}

// The five status messages from the questionnaire, plus the states around them.
export type OrderStatus =
  | 'received' // Order has been received (terms being negotiated)
  | 'cleared' // Order has been cleared for preparation
  | 'processing' // Order is being processed
  | 'fulfilling' // Order is being fulfilled (delivery / building on site)
  | 'delivered' // Seller marked done, client approval window running
  | 'completed' // Order has been completed
  | 'cancelled'
  | 'declined';

export type TokenType = 'priority' | 'rush' | 'high_effort' | 'extra_slot';

export interface Token {
  id: ID;
  ownerId: ID; // client account
  type: TokenType;
  source: 'first_order' | 'repeat_client' | 'granted';
  grantedAt: ISODate;
  usedOnOrderId?: ID;
}

export interface Coords {
  x: number;
  y: number;
  z: number;
  dimension: 'overworld' | 'nether' | 'end';
}

export interface Terms {
  price: string; // free text: in-game items, favours, anything agreed
  days: number; // real days until delivery once cleared
  note?: string;
  proposedAt: ISODate;
  acceptedAt?: ISODate;
}

export interface StatusEvent {
  status: OrderStatus;
  at: ISODate;
  by: ID; // account id
  note?: string;
}

export interface Message {
  id: ID;
  authorId: ID;
  at: ISODate;
  text: string;
}

export interface RatingTags {
  speed: number;
  quality: number;
  communication: number;
  accuracy: number;
}

export interface Rating {
  stars: number; // 1–5 overall
  tags: Partial<RatingTags>;
  at: ISODate;
}

export interface Complaint {
  at: ISODate;
  text: string;
  resolvedAt?: ISODate;
}

export type ItemUnit = 'piece' | 'stack' | 'shulker';

/** One line of a material order: an item from the 26.3 list, an amount and a unit. */
export interface OrderLine {
  itemId: string; // Minecraft id, e.g. "netherite_ingot"
  de: string;
  en: string;
  stack: number; // stack size of the item (1, 16 or 64)
  n: number;
  unit: ItemUnit;
}

/** A request for something that is not in the item list. */
export interface CustomLine {
  text: string;
}

export interface Order {
  id: ID;
  number: number; // human-readable order number
  clientId: ID;
  sellerId: ID;
  serviceId: ID;
  kind: ServiceKind;
  title: string;
  details: string;
  quantity?: number;
  unit?: string;
  lines?: OrderLine[]; // material orders from the cart
  customLines?: CustomLine[]; // "Sonderwunsch" lines from the cart
  batches: number; // client-chosen delivery stages, 1 = all at once
  batchesDelivered: number;
  farmTier?: FarmTier;
  extras: string[];
  coords?: Coords;
  deliveryMethod: 'place_at_coords' | 'build_at_coords' | 'hand_over';
  clientProvidesMaterials: boolean;
  offer: string; // what the client offers to pay
  terms?: Terms;
  tokens: ID[]; // token ids spent on this order
  status: OrderStatus;
  history: StatusEvent[];
  messages: Message[];
  createdAt: ISODate;
  clearedAt?: ISODate;
  dueAt?: ISODate;
  deliveredAt?: ISODate;
  completedAt?: ISODate;
  autoCompleted?: boolean;
  tosAcceptedAt: ISODate;
  vacationAcknowledged?: boolean;
  rating?: Rating;
  complaints: Complaint[];
  cancelledBy?: 'client' | 'seller';
}

export interface BlacklistEntry {
  sellerId: ID;
  clientId: ID;
  reason: string;
  since: ISODate;
  clearedAt?: ISODate;
  penaltyUntil?: ISODate;
}

export interface Notice {
  id: ID;
  accountId: ID;
  orderId?: ID;
  key: string; // i18n key
  vars?: Record<string, string | number>;
  at: ISODate;
  read: boolean;
}

export type SellerLevelId = 'new' | 'level1' | 'level2' | 'top';
export type ClientLevelId = 'new' | 'trusted' | 'regular';

export interface DB {
  version: number;
  accounts: Account[];
  sellers: SellerProfile[];
  services: Service[];
  orders: Order[];
  tokens: Token[];
  blacklist: BlacklistEntry[];
  notices: Notice[];
  nextOrderNumber: number;
  clockOffsetDays: number; // beta tool: simulate time passing
}
