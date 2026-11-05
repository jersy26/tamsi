import type { Category } from './categories.ts'
import type { FeedEventType } from './feed.ts'
import type { CheckId, ReasonCode } from './reasons.ts'

export type CardStatus = 'active' | 'revoked'

export interface CheckResult {
  id: CheckId
  ok: boolean
}

// What /api/taps returns. Amounts are decimal XLM strings, already formatted on the server.
export interface TapResponse {
  id: string
  decision: 'approved' | 'declined'
  reasonCode: ReasonCode
  reasonText: string
  amountXlm: string
  // Whole pesos at the mock demo rate, or null when no rate is set.
  amountPhp: string | null
  merchantName: string
  checks: CheckResult[]
  txHash: string | null
  explorerUrl: string | null
}

export interface MerchantSummary {
  id: string
  name: string
  category: Category
}

export interface CardSummary {
  deviceHash: string
  label: string
  holderName: string
}

// An amount as the screens show it: decimal XLM, plus whole pesos at the mock demo rate
// (null when no rate is set).
export interface Money {
  xlm: string
  php: string | null
}

// One receipt on the OFW's feed, from a saved Noir event.
export interface FeedItem {
  id: string
  type: FeedEventType
  text: string
  amount: Money | null
  at: string
  explorerUrl: string
}

// What /api/cards/:hash returns. Balance and ipon are null when the chain can't be read.
export interface CardDetail extends CardSummary {
  status: CardStatus
  maxPerTap: Money
  expiresAt: string | null
  rules: {
    dailyCap: Money
    iponFloor: Money
    allowedCategories: Category[]
    nextPayday: string
  }
  balance: Money | null
  iponKept: Money | null
  spentToday: Money
  // What the family can really spend today: the lower of the day's limit and what's above the ipon.
  leftToday: Money
  leftLimitedByIpon: boolean
  feed: FeedItem[]
  // False until the Velo keys are set, so the screen doesn't offer a checkout that can't open.
  padalaEnabled: boolean
}

export type TopupStatus = 'created' | 'paid' | 'funded' | 'fund_failed'

// What /api/topups returns. A browser only ever reads the status.
export interface TopupDetail {
  id: string
  status: TopupStatus
  amount: Money
  checkoutUrl: string | null
  explorerUrl: string | null
}
