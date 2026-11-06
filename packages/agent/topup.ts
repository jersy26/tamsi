// How much padala the agent asks for, from SDD §3. Deterministic, like every other decision:
// avg daily spend × days to payday + ipon floor − balance, rounded up, with a minimum.
const XLM = 10_000_000n
const CENT = 100_000n
const DAY_MS = 24 * 60 * 60 * 1000
export const TOPUP_MINIMUM = 5n * XLM
const LOW_DAYS = 2n

export interface TopupPlanInput {
  spentLast7Days: bigint
  dailyCap: bigint
  iponFloor: bigint
  balance: bigint
  nextPayday: Date
  now: Date
}

export interface TopupPlan {
  amount: bigint
  avgDailySpend: bigint
  days: bigint
  // Usable balance covers less than two days of average spend.
  low: boolean
}

export function planTopup(input: TopupPlanInput): TopupPlan {
  // Whole cents of XLM, so the formula on screen adds up to what's shown.
  const average = input.spentLast7Days > 0n ? input.spentLast7Days / 7n : input.dailyCap / 2n
  const avgDailySpend = (average / CENT) * CENT
  const days = BigInt(Math.max(1, Math.ceil((input.nextPayday.getTime() - input.now.getTime()) / DAY_MS)))

  const needed = avgDailySpend * days + input.iponFloor - input.balance
  const roundedUp = needed > 0n ? ((needed + XLM - 1n) / XLM) * XLM : 0n
  const usable = input.balance > input.iponFloor ? input.balance - input.iponFloor : 0n
  return {
    amount: roundedUp > TOPUP_MINIMUM ? roundedUp : TOPUP_MINIMUM,
    avgDailySpend,
    days,
    low: usable < avgDailySpend * LOW_DAYS,
  }
}
