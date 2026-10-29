// Input validation for everything the API accepts. Unknown fields are dropped, every string has
// a length limit, control characters are stripped, numbers have ranges. React escapes all output,
// and nothing is ever rendered as HTML, so stored text cannot turn into script (XSS).

import { z } from 'zod';

const CONTROL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F​-‏‪-‮⁦-⁩]/g;

/** Free text: NFC-normalised, control and bidi-override characters removed, trimmed, capped. */
export const text = (max: number, opts: { multiline?: boolean } = {}) =>
  z.string().max(max * 4).transform((s) => {
    let v = s.normalize('NFC').replace(CONTROL, '');
    v = opts.multiline ? v.replace(/\r\n?/g, '\n').replace(/\n{4,}/g, '\n\n\n') : v.replace(/\s+/g, ' ');
    return v.trim();
  }).refine((s) => s.length <= max, { message: 'too_long' });

export const id = z.string().regex(/^[A-Za-z0-9_-]{1,64}$/);
const int = (min: number, max: number) => z.number().int().min(min).max(max);

const coords = z.object({
  x: int(-30_000_000, 30_000_000),
  y: int(-2048, 2048),
  z: int(-30_000_000, 30_000_000),
  dimension: z.enum(['overworld', 'nether', 'end']),
});

export const lineInput = z.object({
  itemId: z.string().regex(/^[a-z0-9_]{1,64}$/),
  n: int(1, 9999),
  unit: z.enum(['piece', 'stack', 'shulker']),
});

const orderInput = z.object({
  serviceId: id,
  title: text(120),
  details: text(2000, { multiline: true }),
  quantity: int(1, 1_000_000).optional(),
  unit: text(30).optional(),
  lines: z.array(lineInput).max(200).optional(),
  customLines: z.array(z.object({ text: text(200) })).max(20).optional(),
  batches: int(1, 3),
  farmTier: z.union([z.literal(1), z.literal(2), z.literal(3)]).optional(),
  extras: z.array(id).max(10),
  coords: coords.optional(),
  deliveryMethod: z.enum(['place_at_coords', 'build_at_coords', 'hand_over']),
  clientProvidesMaterials: z.boolean(),
  offer: text(300, { multiline: true }),
  tokenIds: z.array(id).max(4),
  tosAccepted: z.boolean(),
  vacationAcknowledged: z.boolean(),
});

const orderOnly = <T extends string>(type: T) => z.object({ type: z.literal(type), orderId: id });
const stars = int(1, 5);

export const command = z.discriminatedUnion('type', [
  z.object({ type: z.literal('placeOrder'), input: orderInput }),
  z.object({ type: z.literal('sendMessage'), orderId: id, text: text(1000, { multiline: true }) }),
  z.object({ type: z.literal('proposeTerms'), orderId: id, price: text(200), days: int(1, 365), note: text(500, { multiline: true }) }),
  orderOnly('acceptTerms'), orderOnly('clearOrder'), orderOnly('startProcessing'), orderOnly('startFulfilling'),
  orderOnly('deliverBatch'), orderOnly('cancelByClient'), orderOnly('approve'),
  z.object({ type: z.literal('declineOrder'), orderId: id, note: text(500, { multiline: true }) }),
  z.object({ type: z.literal('cancelBySeller'), orderId: id, note: text(500, { multiline: true }) }),
  z.object({ type: z.literal('complain'), orderId: id, text: text(1000, { multiline: true }) }),
  z.object({
    type: z.literal('rate'), orderId: id, stars,
    tags: z.object({ speed: stars.optional(), quality: stars.optional(), communication: stars.optional(), accuracy: stars.optional() }),
  }),
  z.object({
    type: z.literal('updateSeller'),
    patch: z.object({
      displayName: z.string().regex(/^[A-Za-z0-9_]{3,16}$/).optional(),
      tagline: z.object({ de: text(160), en: text(160) }).optional(),
      accepting: z.boolean().optional(),
      maxConcurrent: int(1, 20).optional(),
      weeklyCapacity: int(1, 100).optional(),
      blacklistPenaltyDays: int(0, 365).optional(),
    }),
  }),
  z.object({ type: z.literal('setVacation'), on: z.boolean() }),
  z.object({ type: z.literal('toggleService'), serviceId: id }),
  z.object({ type: z.literal('blacklistClient'), clientId: id, reason: text(300) }),
  z.object({ type: z.literal('clearBlacklist'), clientId: id }),
  z.object({ type: z.literal('grantToken'), clientId: id, tokenType: z.enum(['priority', 'rush', 'high_effort', 'extra_slot']) }),
  z.object({ type: z.literal('markNoticesRead') }),
]);
export type CommandInput = z.infer<typeof command>;

export const sixDigits = z.object({ code: z.string().regex(/^\s*\d{3}\s?-?\s?\d{3}\s*$/).transform((s) => s.replace(/\D/g, '')) });
export const secondFactor = z.union([
  sixDigits,
  z.object({ recovery: z.string().min(10).max(20) }),
]);
export const deleteConfirm = z.object({ confirm: z.string().max(32) });
