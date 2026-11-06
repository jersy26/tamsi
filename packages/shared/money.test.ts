import assert from 'node:assert/strict'
import { test } from 'node:test'
import { formatMoney, percentOf, pesosToXlm, withCommas } from './money.ts'

test('an amount reads in pesos when there is a rate, and in XLM when there is not', () => {
  assert.equal(formatMoney({ xlm: '35', php: '1750' }), '₱1,750')
  assert.equal(formatMoney({ xlm: '0', php: '0' }), '₱0')
  assert.equal(formatMoney({ xlm: '35', php: null }), '35 XLM')
})

test('commas go on the whole part only', () => {
  assert.equal(withCommas('1250'), '1,250')
  assert.equal(withCommas('1250.5'), '1,250.5')
  assert.equal(withCommas('1250.'), '1,250.')
  assert.equal(withCommas('999'), '999')
})

test('pesos become XLM at the demo rate, without floats', () => {
  assert.equal(pesosToXlm('250', '50'), '5')
  assert.equal(pesosToXlm('1,050'.replace(',', ''), '50'), '21')
  assert.equal(pesosToXlm('33', '50'), '0.66')
  assert.equal(pesosToXlm('0.1', '50'), '0.002')
  // 0.1 + 0.2 style drift would show here.
  assert.equal(pesosToXlm('0.3', '3'), '0.1')
  assert.equal(pesosToXlm('1', '3'), '0.3333333')
  assert.equal(pesosToXlm('12.', '50'), '0.24')
  assert.equal(pesosToXlm('0', '50'), '0')
  assert.equal(pesosToXlm('5', '0'), '0')
})

test('a meter percent stops at 100 and survives a zero limit', () => {
  const money = (xlm: string) => ({ xlm, php: null })
  assert.equal(percentOf(money('1'), money('25')), 4)
  assert.equal(percentOf(money('30'), money('25')), 100)
  assert.equal(percentOf(money('1'), money('0')), 0)
})
