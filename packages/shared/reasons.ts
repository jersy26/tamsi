// Every decision carries one of these codes. UI text comes from here, never ad hoc.
export const NOIR_REFUSALS = [
  'no_agent',
  'wrong_agent',
  'wrong_asset',
  'invalid_amount',
  'over_limit',
  'expired',
  'insufficient_escrow',
] as const

export const REASON_CODES = [
  'paid',
  'card_inactive',
  'merchant_not_allowed',
  'daily_cap',
  'ipon_floor',
  ...NOIR_REFUSALS,
  'contract_error',
  'network_error',
] as const

export type ReasonCode = (typeof REASON_CODES)[number]

export interface ReasonContext {
  amountXlm: string
  merchantName: string
  categoryAllowed: string
  leftTodayXlm: string
  contractError: string
}

const TEMPLATES: Record<ReasonCode, (c: ReasonContext) => string> = {
  paid: (c) => `Paid ${c.amountXlm} XLM at ${c.merchantName} — ${c.categoryAllowed} and you're under today's limit.`,
  card_inactive: () => "This card isn't active right now. The OFW can turn it back on.",
  merchant_not_allowed: (c) => `${c.merchantName} isn't on this card's allowed list. The OFW can add this kind of shop.`,
  daily_cap: (c) => `This goes over today's limit — ${c.leftTodayXlm} XLM left today. Try a smaller amount, or tap again tomorrow.`,
  ipon_floor: () => 'This would dip into the ipon, so the agent kept it safe. The OFW can send more padala.',
  no_agent: () => 'The OFW has turned off spending on this card. They can turn it back on.',
  wrong_agent: () => "This card is set up with a different agent. The OFW needs to set it up again.",
  wrong_asset: () => "This card can't pay in this currency. The OFW needs to set it up again.",
  invalid_amount: () => "That amount isn't valid. Check it and tap again.",
  over_limit: () => "That's above this card's limit for one tap. Try a smaller amount.",
  expired: () => "This card's permission has run out. The OFW can renew it.",
  insufficient_escrow: () => "There isn't enough on the card for this. The OFW can send more padala.",
  contract_error: (c) => `The payment was refused (${c.contractError}). Nothing was paid.`,
  network_error: () => "We couldn't confirm this payment. Check the receipts before tapping again.",
}

export function reasonText(code: ReasonCode, context: Partial<ReasonContext> = {}): string {
  return TEMPLATES[code]({
    amountXlm: '',
    merchantName: 'This shop',
    categoryAllowed: 'this shop is allowed',
    leftTodayXlm: '0',
    contractError: 'unknown',
    ...context,
  })
}

// The checks the agent runs, in SDD §3 order, as shown under a decision.
export const CHECK_IDS = ['card_active', 'merchant_allowed', 'daily_cap', 'ipon_floor', 'noir_policy', 'noir_payment'] as const
export type CheckId = (typeof CHECK_IDS)[number]

export const CHECK_LABELS: Record<CheckId, string> = {
  card_active: 'Card is active',
  merchant_allowed: 'Shop is allowed',
  daily_cap: "Under today's limit",
  ipon_floor: 'Ipon stays safe',
  noir_policy: 'Within the card limit',
  noir_payment: 'Payment approved',
}
