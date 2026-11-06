// How amounts read on screen: pesos first when a demo rate is set, XLM otherwise. All of it is
// decimal strings and bigints (agents.md rule 5), so the browser can use it without floats.
import type { Money } from './types.ts'

const UNITS = 10_000_000n

function toUnits(decimal: string): bigint {
  const [whole = '', fraction = ''] = decimal.split('.')
  return BigInt(whole || '0') * UNITS + BigInt(fraction.padEnd(7, '0').slice(0, 7))
}

function fromUnits(units: bigint): string {
  const fraction = (units % UNITS).toString().padStart(7, '0').replace(/0+$/, '')
  const whole = (units / UNITS).toString()
  return fraction ? `${whole}.${fraction}` : whole
}

export function withCommas(amount: string): string {
  const [whole = '', ...fraction] = amount.split('.')
  return [whole.replace(/\B(?=(\d{3})+$)/g, ','), ...fraction].join('.')
}

// "₱750", or "15 XLM" when no rate is set.
export function formatMoney(money: Money): string {
  return money.php === null ? `${money.xlm} XLM` : `₱${withCommas(money.php)}`
}

// What a peso amount is worth in XLM at the demo rate, rounded down to a stroop.
export function pesosToXlm(pesos: string, phpPerXlm: string): string {
  const rate = toUnits(phpPerXlm)
  return rate === 0n ? '0' : fromUnits((toUnits(pesos) * UNITS) / rate)
}

// For meters only: a whole percent, never an amount.
export function percentOf(part: Money, whole: Money): number {
  const total = toUnits(whole.xlm)
  if (total === 0n) return 0
  const percent = (toUnits(part.xlm) * 100n) / total
  return percent > 100n ? 100 : Number(percent)
}
