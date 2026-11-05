// The Tamsi agent's decision, in the check order of SDD §3. Deterministic code only:
// no LLM touches this path. The first failed check ends it. Checks 1-3 make no
// chain call, so a tap the rules refuse costs nothing.
import { NoirContractError, fromStroops, type PaymentCheck } from '@noirx402/agent-sdk'
import {
  CATEGORY_ALLOWED,
  reasonText,
  type CardStatus,
  type Category,
  type CheckId,
  type CheckResult,
  type ReasonCode,
  type ReasonContext,
} from '@tamsi/shared'

export interface AgentCard {
  deviceHash: string
  status: CardStatus
  dailyCap: bigint
  iponFloor: bigint
  allowedCategories: Category[]
}

export interface AgentMerchant {
  id: string
  name: string
  category: Category
  stellarAddress: string
}

export interface TapRequest {
  deviceHash: string
  merchantId: string
  amount: bigint
}

export interface Decision {
  decision: 'approved' | 'declined'
  reasonCode: ReasonCode
  reasonText: string
  checks: CheckResult[]
  merchant: AgentMerchant | null
  txHash: string | null
  nonce: bigint | null
}

export interface DecisionStore {
  getCard(deviceHash: string): AgentCard | null
  getMerchant(id: string): AgentMerchant | null
  // Sum of approved taps on this card since the given moment.
  spentSince(deviceHash: string, since: Date): bigint
}

export interface Chain {
  getEscrowBalance(deviceHash: string): Promise<bigint>
  checkPayment(p: { deviceHash: string; amount: bigint }): Promise<PaymentCheck>
  authorizePayment(p: { deviceHash: string; merchant: string; amount: bigint }): Promise<{ hash: string; nonce: bigint }>
}

const PH_OFFSET_MS = 8 * 60 * 60 * 1000
const DAY_MS = 24 * 60 * 60 * 1000

// Midnight in the Philippines (UTC+8, no daylight saving) for the day `now` falls in.
export function phDayStart(now: Date): Date {
  const shifted = now.getTime() + PH_OFFSET_MS
  return new Date(shifted - (shifted % DAY_MS) - PH_OFFSET_MS)
}

export async function decide(
  tap: TapRequest,
  deps: { store: DecisionStore; chain: Chain; now?: () => Date },
): Promise<Decision> {
  const { store, chain } = deps
  const checks: CheckResult[] = []
  const merchant = store.getMerchant(tap.merchantId)
  const context: Partial<ReasonContext> = {
    amountXlm: fromStroops(tap.amount),
    ...(merchant && { merchantName: merchant.name, categoryAllowed: CATEGORY_ALLOWED[merchant.category] }),
  }

  const decline = (id: CheckId, reasonCode: ReasonCode): Decision => {
    checks.push({ id, ok: false })
    return {
      decision: 'declined',
      reasonCode,
      reasonText: reasonText(reasonCode, context),
      checks,
      merchant,
      txHash: null,
      nonce: null,
    }
  }

  const card = store.getCard(tap.deviceHash)
  if (!card || card.status !== 'active') return decline('card_active', 'card_inactive')
  checks.push({ id: 'card_active', ok: true })

  if (!merchant || !card.allowedCategories.includes(merchant.category)) {
    return decline('merchant_allowed', 'merchant_not_allowed')
  }
  checks.push({ id: 'merchant_allowed', ok: true })

  const spentToday = store.spentSince(card.deviceHash, phDayStart(deps.now?.() ?? new Date()))
  if (spentToday + tap.amount > card.dailyCap) {
    const left = card.dailyCap - spentToday
    context.leftTodayXlm = fromStroops(left > 0n ? left : 0n)
    return decline('daily_cap', 'daily_cap')
  }
  checks.push({ id: 'daily_cap', ok: true })

  let step: CheckId = 'ipon_floor'
  try {
    const balance = await chain.getEscrowBalance(card.deviceHash)
    if (balance - tap.amount < card.iponFloor) return decline('ipon_floor', 'ipon_floor')
    checks.push({ id: 'ipon_floor', ok: true })

    step = 'noir_policy'
    const check = await chain.checkPayment({ deviceHash: card.deviceHash, amount: tap.amount })
    if (!check.ok) return decline('noir_policy', check.reason)
    checks.push({ id: 'noir_policy', ok: true })

    step = 'noir_payment'
    const paid = await chain.authorizePayment({
      deviceHash: card.deviceHash,
      merchant: merchant.stellarAddress,
      amount: tap.amount,
    })
    checks.push({ id: 'noir_payment', ok: true })
    return {
      decision: 'approved',
      reasonCode: 'paid',
      reasonText: reasonText('paid', context),
      checks,
      merchant,
      txHash: paid.hash,
      nonce: paid.nonce,
    }
  } catch (err) {
    if (err instanceof NoirContractError) {
      console.error(`Noir refused ${err.method}: ${err.errorName}`)
      context.contractError = err.errorName
      return decline(step, 'contract_error')
    }
    console.error('Chain call failed during a tap:', err)
    return decline(step, 'network_error')
  }
}
