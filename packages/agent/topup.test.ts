import assert from 'node:assert/strict'
import { test } from 'node:test'
import { toStroops } from '@noirx402/agent-sdk'
import { planTopup } from './topup.ts'

const now = new Date('2026-11-07T00:00:00Z')
const days = (n: number) => new Date(now.getTime() + n * 24 * 60 * 60 * 1000)
const base = {
  spentLast7Days: toStroops('21'),
  dailyCap: toStroops('25'),
  iponFloor: toStroops('20'),
  balance: toStroops('21'),
  nextPayday: days(10),
  now,
}

test('the amount follows the formula and rounds up to a whole XLM', () => {
  // 3 a day × 10 days + 20 ipon − 21.5 balance = 28.5, so 29.
  const plan = planTopup({ ...base, balance: toStroops('21.5') })
  assert.equal(plan.avgDailySpend, toStroops('3'))
  assert.equal(plan.days, 10n)
  assert.equal(plan.amount, toStroops('29'))
})

test('with no spending yet, the average is half the daily cap', () => {
  const plan = planTopup({ ...base, spentLast7Days: 0n })
  assert.equal(plan.avgDailySpend, toStroops('12.5'))
})

test('the amount never drops below the minimum', () => {
  const plan = planTopup({ ...base, balance: toStroops('500') })
  assert.equal(plan.amount, toStroops('5'))
})

test('a payday that has passed still counts as one day', () => {
  assert.equal(planTopup({ ...base, nextPayday: days(-3) }).days, 1n)
})

test('low means under two days of average spend above the ipon', () => {
  assert.equal(planTopup({ ...base, balance: toStroops('25.99') }).low, true)
  assert.equal(planTopup({ ...base, balance: toStroops('26') }).low, false)
})

test('a balance under the ipon counts as nothing usable, not a negative', () => {
  assert.equal(planTopup({ ...base, balance: toStroops('10') }).low, true)
})
