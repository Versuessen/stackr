// Commands are the only way the UI asks for a change. They are plain data, so the same
// command can run in the browser (beta) or be sent to the server (live). The actor is never
// part of a command: in beta it is the local session, on the server it comes from the
// session cookie. That keeps a client from acting as someone else.

import type { Account, DB, FarmTier, ID, RatingTags, SellerProfile, SubscriptionPlan, TokenType } from '../domain/types.js';
import {
  ActionError, acceptTerms, buyToken, cancelSubscription, endEvent, grantPoints, setSubscription, startEvent, advanceClock, approve, blacklistClient, cancelByClient, cancelBySeller, clearBlacklist,
  clearOrder, complain, confirmName, declineOrder, deliverBatch, grantToken, markNoticesRead, placeOrder, proposeTerms, rate,
  sendMessage, setVacation, startFulfilling, startProcessing, toggleService, updateSeller, type OrderInput,
} from './actions.js';

type Mut = (db: DB, now: number) => void;

export type OrderCommandInput = Omit<OrderInput, 'clientId'>;
export type SellerPatch = Partial<Pick<SellerProfile, 'displayName' | 'tagline' | 'accepting' | 'maxConcurrent' | 'weeklyCapacity' | 'blacklistPenaltyDays' | 'inviteOnly'>>;

export type Command =
  | { type: 'placeOrder'; input: OrderCommandInput }
  | { type: 'sendMessage'; orderId: ID; text: string }
  | { type: 'proposeTerms'; orderId: ID; price: string; days: number; note: string }
  | { type: 'acceptTerms' | 'clearOrder' | 'startProcessing' | 'startFulfilling' | 'deliverBatch' | 'cancelByClient' | 'approve'; orderId: ID }
  | { type: 'declineOrder' | 'cancelBySeller'; orderId: ID; note: string }
  | { type: 'complain'; orderId: ID; text: string }
  | { type: 'rate'; orderId: ID; stars: number; tags: Partial<RatingTags> }
  | { type: 'updateSeller'; patch: SellerPatch }
  | { type: 'setVacation'; on: boolean }
  | { type: 'toggleService'; serviceId: ID }
  | { type: 'blacklistClient'; clientId: ID; reason: string }
  | { type: 'clearBlacklist'; clientId: ID }
  | { type: 'grantToken'; clientId: ID; tokenType: TokenType }
  | { type: 'markNoticesRead' }
  | { type: 'confirmName'; clientId: ID }
  | { type: 'buyToken'; tokenType: TokenType }
  | { type: 'grantPoints'; clientId: ID; n: number; note: string }
  | { type: 'startEvent'; name: string; multiplier: number; days: number }
  | { type: 'endEvent' }
  | { type: 'setSubscription'; clientId: ID; plan: SubscriptionPlan; months: number }
  | { type: 'cancelSubscription'; clientId: ID }
  | { type: 'advanceClock'; days: number }; // beta only, refused by the server

export type CommandType = Command['type'];

/** Commands only the seller may send. The server also requires a finished 2FA step for these. */
export const SELLER_COMMANDS: ReadonlySet<CommandType> = new Set<CommandType>([
  'proposeTerms', 'clearOrder', 'startProcessing', 'startFulfilling', 'deliverBatch', 'declineOrder', 'cancelBySeller',
  'updateSeller', 'setVacation', 'toggleService', 'blacklistClient', 'clearBlacklist', 'grantToken', 'confirmName', 'grantPoints', 'startEvent', 'endEvent', 'setSubscription', 'cancelSubscription',
]);
export const BETA_ONLY_COMMANDS: ReadonlySet<CommandType> = new Set<CommandType>(['advanceClock']);

function sellerOf(actor: Account): ID {
  if (!actor.sellerId) throw new ActionError('err.notAllowed');
  return actor.sellerId;
}

/** Turns a command into the pure action that applies it, with `actor` as the one acting. */
export function toMut(cmd: Command, actor: Account, onId: (id: ID) => void = () => {}): Mut {
  const a = actor.id;
  switch (cmd.type) {
    case 'placeOrder': return placeOrder({ ...cmd.input, clientId: a, farmTier: cmd.input.farmTier as FarmTier | undefined }, onId);
    case 'sendMessage': return sendMessage(cmd.orderId, a, cmd.text);
    case 'proposeTerms': return proposeTerms(cmd.orderId, a, cmd.price, cmd.days, cmd.note);
    case 'acceptTerms': return acceptTerms(cmd.orderId, a);
    case 'clearOrder': return clearOrder(cmd.orderId, a);
    case 'startProcessing': return startProcessing(cmd.orderId, a);
    case 'startFulfilling': return startFulfilling(cmd.orderId, a);
    case 'deliverBatch': return deliverBatch(cmd.orderId, a);
    case 'cancelByClient': return cancelByClient(cmd.orderId, a);
    case 'approve': return approve(cmd.orderId, a);
    case 'declineOrder': return declineOrder(cmd.orderId, a, cmd.note);
    case 'cancelBySeller': return cancelBySeller(cmd.orderId, a, cmd.note);
    case 'complain': return complain(cmd.orderId, a, cmd.text);
    case 'rate': return rate(cmd.orderId, a, { stars: cmd.stars, tags: cmd.tags });
    case 'updateSeller': return updateSeller(sellerOf(actor), a, cmd.patch);
    case 'setVacation': return setVacation(sellerOf(actor), a, cmd.on);
    case 'toggleService': return toggleService(cmd.serviceId, a);
    case 'blacklistClient': return blacklistClient(sellerOf(actor), a, cmd.clientId, cmd.reason);
    case 'clearBlacklist': return clearBlacklist(sellerOf(actor), a, cmd.clientId);
    case 'grantToken': return grantToken(a, cmd.clientId, cmd.tokenType);
    case 'markNoticesRead': return markNoticesRead(a);
    case 'confirmName': return confirmName(a, cmd.clientId);
    case 'buyToken': return buyToken(a, cmd.tokenType);
    case 'grantPoints': return grantPoints(a, cmd.clientId, cmd.n, cmd.note);
    case 'startEvent': return startEvent(a, cmd.name, cmd.multiplier, cmd.days);
    case 'endEvent': return endEvent(a);
    case 'setSubscription': return setSubscription(a, cmd.clientId, cmd.plan, cmd.months);
    case 'cancelSubscription': return cancelSubscription(a, cmd.clientId);
    case 'advanceClock': return advanceClock(cmd.days);
  }
}
