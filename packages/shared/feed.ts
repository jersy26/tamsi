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
