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
  deletedAt?: ISODate; // set when the person erased their account
  nameConfirmedAt?: ISODate; // seller confirmed in-game that the name belongs to this person
  disabledAt?: ISODate; // name released by the seller (claimed by the wrong person)
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
  inviteOnly?: boolean; // live: sign-up only with an invite code
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
  source: 'first_order' | 'repeat_client' | 'granted' | 'shop' | 'gift' | 'subscription';
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
  autoAccepted?: boolean; // the seller kept the client's offer, so no confirmation was needed
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
  batches: number; // client-chosen delivery waves, 1 = all at once
  waveDates?: string[]; // wished date per wave (YYYY-MM-DD), optional
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
  scrubbed?: boolean; // free text removed (erasure or retention period)
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

/** One change to a player's points: positive when earned, negative when spent. */
export interface PointEntry {
  id: ID;
  accountId: ID;
  delta: number;
  reason: string; // i18n key, e.g. points.r.order
  vars?: Record<string, string | number>;
  orderId?: ID;
  at: ISODate;
}

/** A time-limited bonus the seller starts (e.g. double points over Christmas). */
export interface ShopEvent {
  id: ID;
  name: string;
  multiplier: number; // 2 = double points
  startsAt: ISODate;
  endsAt: ISODate;
}

export type SubscriptionPlan = 'regular' | 'project';

/** Paid in-game and switched on by the seller; credits points every 30 days until it ends. */
export interface Subscription {
  accountId: ID;
  plan: SubscriptionPlan;
  startedAt: ISODate;
  endsAt: ISODate;
  nextCreditAt: ISODate;
  cancelledAt?: ISODate;
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
  points?: PointEntry[];
  events?: ShopEvent[];
  subscriptions?: Subscription[];
  nextOrderNumber: number;
  clockOffsetDays: number; // beta tool: simulate time passing
}
