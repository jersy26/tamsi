import type { ReasonCode } from './reasons.ts'

// The chain events the OFW sees as receipts. The feed is read by the OFW only, so it
// says "you"; the wording lives here for the same reason reason codes do.
export const FEED_EVENT_TYPES = [
  'payment.authorized',
  'payment.claimed',
  'escrow.funded',
  'escrow.defunded',
  'agent.revoked',
] as const

export type FeedEventType = (typeof FEED_EVENT_TYPES)[number]

// Chain events, plus what only this server knows: a declined tap never reaches the chain.
export type FeedItemType = FeedEventType | 'tap.declined' | 'topup.requested'

export interface FeedContext {
  amountXlm: string
  merchantName: string
}

const TEMPLATES: Record<FeedEventType, (c: FeedContext) => string> = {
  'payment.authorized': (c) => `Paid ${c.amountXlm} XLM at ${c.merchantName}.`,
  'payment.claimed': (c) => `${c.merchantName} collected ${c.amountXlm} XLM.`,
  'escrow.funded': (c) => `Your padala of ${c.amountXlm} XLM landed on the card.`,
  'escrow.defunded': (c) => `${c.amountXlm} XLM came back to you from the card.`,
  'agent.revoked': () => 'You turned off spending on this card.',
}

export function feedText(type: FeedEventType, context: Partial<FeedContext> = {}): string {
  return TEMPLATES[type]({ amountXlm: '', merchantName: 'A shop', ...context })
}

// A decline on the OFW's feed: the rule that stopped it, and what they can do. Calm, not alarming.
const DECLINE_ADVICE: Record<Exclude<ReasonCode, 'paid'>, string> = {
  card_inactive: 'the card is turned off.',
  merchant_not_allowed: "this kind of shop isn't on your allowed list.",
  daily_cap: "it would go over today's limit. The limit resets at midnight.",
  ipon_floor: 'it would dip into the ipon, so the agent kept it safe. You can send more padala.',
  no_agent: 'spending on this card is turned off.',
  wrong_agent: 'the card is set up with a different agent.',
  wrong_asset: "the card can't pay in this currency.",
  invalid_amount: "the amount wasn't valid.",
  over_limit: "it's above the card's limit for one tap.",
  expired: "the card's permission has run out. You can renew it.",
  insufficient_escrow: "there isn't enough on the card. You can send more padala.",
  contract_error: 'the payment was refused. Nothing was paid.',
  network_error: "we couldn't confirm the payment, so check your receipts.",
}

export function declinedText(code: ReasonCode, context: FeedContext): string {
  const advice = code === 'paid' ? '' : DECLINE_ADVICE[code]
  return `Declined ${context.amountXlm} XLM at ${context.merchantName}: ${advice}`
}

export interface TopupRequestContext {
  amountXlm: string
  avgDailyXlm: string
  days: string
  iponXlm: string
  balanceXlm: string
}

// The formula filled in, so the OFW sees how the agent got its number.
export function topupRequestText(c: TopupRequestContext): string {
  return `The agent asks for ${c.amountXlm} XLM: ${c.avgDailyXlm} a day × ${c.days} days to payday + ${c.iponXlm} ipon − ${c.balanceXlm} on the card, rounded up (minimum 5).`
}
