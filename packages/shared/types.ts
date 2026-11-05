import type { Category } from './categories.ts'
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
