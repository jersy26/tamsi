import assert from 'node:assert/strict'
import { test } from 'node:test'
import { NoirContractError, toStroops } from '@noirx402/agent-sdk'
import type { AgentCard, AgentMerchant, Chain, Decision, TapRequest } from './decide.ts'
import { phDayStart } from './decide.ts'
import { createTamsi, type TapStore } from './tamsi.ts'

const HASH = 'a'.repeat(64)
const xlm = toStroops

const MERCHANTS: AgentMerchant[] = [
  { id: 'grocery', name: "Aling Nena's Store", category: 'grocery', stellarAddress: 'GGROCERY' },
  { id: 'arcade', name: 'Games arcade', category: 'other', stellarAddress: 'GARCADE' },
]

function card(overrides: Partial<AgentCard> = {}): AgentCard {
  return {
    deviceHash: HASH,
    status: 'active',
    dailyCap: xlm('25'),
    iponFloor: xlm('20'),
    allowedCategories: ['grocery', 'pharmacy'],
    ...overrides,
  }
}

// An in-memory store and a fake chain that counts its calls.
function harness(opts: { cards?: AgentCard[]; balance?: bigint; chain?: Partial<Chain>; now?: () => Date } = {}) {
  const cards = opts.cards ?? [card()]
  const saved: { tap: TapRequest; decision: Decision; at: Date }[] = []
  const now = opts.now ?? (() => new Date('2026-11-06T04:00:00Z'))
  const store: TapStore = {
    getCard: (hash) => cards.find((c) => c.deviceHash === hash) ?? null,
    getMerchant: (id) => MERCHANTS.find((m) => m.id === id) ?? null,
    spentSince: (hash, since) =>
      saved
        .filter((s) => s.tap.deviceHash === hash && s.decision.decision === 'approved' && s.at >= since)
        .reduce((sum, s) => sum + s.tap.amount, 0n),
    saveTap(tap, decision) {
      saved.push({ tap, decision, at: now() })
      return `tap-${saved.length}`
    },
  }
  const calls = { balance: 0, check: 0, authorize: 0 }
  let balance = opts.balance ?? xlm('100')
  const chain: Chain = {
    async getEscrowBalance(hash) {
      calls.balance++
      if (opts.chain?.getEscrowBalance) return opts.chain.getEscrowBalance(hash)
      return balance
    },
    async checkPayment(p) {
      calls.check++
      if (opts.chain?.checkPayment) return opts.chain.checkPayment(p)
      return { ok: true }
    },
    async authorizePayment(p) {
      calls.authorize++
      if (opts.chain?.authorizePayment) return opts.chain.authorizePayment(p)
      // Yield so a racing tap would get in here if the queue didn't hold it back.
      await new Promise((resolve) => setTimeout(resolve, 5))
      balance -= p.amount
      return { hash: `hash-${calls.authorize}`, nonce: BigInt(calls.authorize) }
    },
  }
  return { tamsi: createTamsi({ store, chain, now }), calls, saved }
}

const tap = (amount: string, merchantId = 'grocery'): TapRequest => ({ deviceHash: HASH, merchantId, amount: xlm(amount) })

test('allowed tap within limits pays through the chain', async () => {
  const { tamsi, calls, saved } = harness()
  const out = await tamsi.tap(tap('5'))
  assert.equal(out.decision, 'approved')
  assert.equal(out.reasonCode, 'paid')
  assert.equal(out.txHash, 'hash-1')
  assert.equal(out.reasonText, "Paid 5 XLM at Aling Nena's Store — groceries are allowed and you're under today's limit.")
  assert.deepEqual(
    out.checks.map((c) => [c.id, c.ok]),
    [
      ['card_active', true],
      ['merchant_allowed', true],
      ['daily_cap', true],
      ['ipon_floor', true],
      ['noir_policy', true],
      ['noir_payment', true],
    ],
  )
  assert.deepEqual(calls, { balance: 1, check: 1, authorize: 1 })
  assert.equal(saved.length, 1)
})

test('an unknown card is declined with no chain call', async () => {
  const { tamsi, calls } = harness({ cards: [] })
  const out = await tamsi.tap(tap('5'))
  assert.equal(out.reasonCode, 'card_inactive')
  assert.deepEqual(calls, { balance: 0, check: 0, authorize: 0 })
})

test("a turned-off card gets Noir's own refusal and can't pay", async () => {
  const { tamsi, calls } = harness({
    cards: [card({ status: 'revoked' })],
    chain: { checkPayment: async () => ({ ok: false, reason: 'no_agent' }) },
  })
  const out = await tamsi.tap(tap('5'))
  assert.equal(out.decision, 'declined')
  assert.equal(out.reasonCode, 'no_agent')
  assert.deepEqual(calls, { balance: 0, check: 1, authorize: 0 })
})

test('a turned-off card stays declined even if Noir says yes or the chain is down', async () => {
  for (const checkPayment of [
    async () => ({ ok: true as const }),
    async () => {
      throw new Error('rpc down')
    },
  ]) {
    const { tamsi, calls } = harness({ cards: [card({ status: 'revoked' })], chain: { checkPayment } })
    const out = await tamsi.tap(tap('5'))
    assert.equal(out.reasonCode, 'card_inactive')
    assert.equal(calls.authorize, 0)
  }
})

test('allowlist: a merchant outside the card categories makes no chain call', async () => {
  const { tamsi, calls, saved } = harness()
  const out = await tamsi.tap(tap('5', 'arcade'))
  assert.equal(out.decision, 'declined')
  assert.equal(out.reasonCode, 'merchant_not_allowed')
  assert.deepEqual(calls, { balance: 0, check: 0, authorize: 0 })
  assert.equal(saved.length, 1, 'declines are still recorded')
})

test('allowlist: an unknown merchant is declined', async () => {
  const { tamsi, calls } = harness()
  const out = await tamsi.tap(tap('5', 'nobody'))
  assert.equal(out.reasonCode, 'merchant_not_allowed')
  assert.equal(calls.balance, 0)
})

test('daily cap: exactly the cap passes, one stroop over declines without a chain call', async () => {
  const exact = harness()
  assert.equal((await exact.tamsi.tap(tap('25'))).decision, 'approved')

  const { tamsi, calls } = harness()
  await tamsi.tap(tap('20'))
  const before = { ...calls }
  const out = await tamsi.tap(tap('5.0000001'))
  assert.equal(out.reasonCode, 'daily_cap')
  assert.match(out.reasonText, /5 XLM left today/)
  assert.deepEqual(calls, before)
})

test('daily cap resets at Philippine midnight, not UTC midnight', async () => {
  // 15:59 UTC is 23:59 in Manila; 16:01 UTC is the next Manila day.
  let clock = new Date('2026-11-06T15:59:00Z')
  const { tamsi } = harness({ now: () => clock })
  assert.equal((await tamsi.tap(tap('20'))).decision, 'approved')
  assert.equal((await tamsi.tap(tap('10'))).reasonCode, 'daily_cap')
  clock = new Date('2026-11-06T16:01:00Z')
  assert.equal((await tamsi.tap(tap('10'))).decision, 'approved')
  assert.equal(phDayStart(clock).toISOString(), '2026-11-06T16:00:00.000Z')
})

test('declined taps do not count toward the daily cap', async () => {
  const { tamsi } = harness({
    chain: { checkPayment: async () => ({ ok: false, reason: 'over_limit' }) },
  })
  await tamsi.tap(tap('20'))
  const second = await tamsi.tap(tap('20'))
  assert.equal(second.reasonCode, 'over_limit', 'the first decline must not have used up the cap')
})

test('cap race: two taps at once cannot both pass the daily cap', async () => {
  const { tamsi, calls } = harness()
  const results = await Promise.all([tamsi.tap(tap('15')), tamsi.tap(tap('15'))])
  assert.deepEqual(results.map((r) => r.decision).sort(), ['approved', 'declined'])
  assert.equal(results.find((r) => r.decision === 'declined')?.reasonCode, 'daily_cap')
  assert.equal(calls.authorize, 1)
})

test('cap race: a failed tap does not block the next one in the queue', async () => {
  let first = true
  const { tamsi } = harness({
    chain: {
      getEscrowBalance: async () => {
        if (first) {
          first = false
          throw new Error('rpc down')
        }
        return xlm('100')
      },
    },
  })
  const results = await Promise.all([tamsi.tap(tap('5')), tamsi.tap(tap('5'))])
  assert.equal(results[0]?.reasonCode, 'network_error')
  assert.equal(results[1]?.decision, 'approved')
})

test('two different cards do not wait for each other', async () => {
  const other = 'b'.repeat(64)
  let release = () => {}
  const held = new Promise<void>((resolve) => (release = resolve))
  const { tamsi } = harness({
    cards: [card(), card({ deviceHash: other })],
    chain: {
      getEscrowBalance: async (hash) => {
        if (hash === HASH) await held
        return xlm('100')
      },
    },
  })
  const slow = tamsi.tap(tap('5'))
  const fast = await tamsi.tap({ deviceHash: other, merchantId: 'grocery', amount: xlm('5') })
  assert.equal(fast.decision, 'approved')
  release()
  assert.equal((await slow).decision, 'approved')
})

test('savings floor: exactly the floor passes, below it declines before Noir is asked', async () => {
  const exact = harness({ balance: xlm('25') })
  assert.equal((await exact.tamsi.tap(tap('5'))).decision, 'approved')

  const { tamsi, calls } = harness({ balance: xlm('25') })
  const out = await tamsi.tap(tap('5.0000001'))
  assert.equal(out.reasonCode, 'ipon_floor')
  assert.deepEqual(calls, { balance: 1, check: 0, authorize: 0 })
})

test("Noir's own refusal passes through and nothing is paid", async () => {
  const { tamsi, calls } = harness({
    chain: { checkPayment: async () => ({ ok: false, reason: 'over_limit' }) },
  })
  const out = await tamsi.tap(tap('12'))
  assert.equal(out.reasonCode, 'over_limit')
  assert.equal(calls.authorize, 0)
  assert.deepEqual(out.checks.at(-1), { id: 'noir_policy', ok: false })
})

test('a contract refusal surfaces the contract error name and counts as no spend', async () => {
  let refuse = true
  const { tamsi } = harness({
    chain: {
      authorizePayment: async () => {
        if (refuse) throw new NoirContractError('paymentEscrow', 7, 'DuplicateAuth', 'authorize')
        return { hash: 'hash-ok', nonce: 1n }
      },
    },
  })
  const out = await tamsi.tap(tap('20'))
  assert.equal(out.reasonCode, 'contract_error')
  assert.match(out.reasonText, /DuplicateAuth/)
  assert.equal(out.txHash, null)
  refuse = false
  assert.equal((await tamsi.tap(tap('20'))).decision, 'approved')
})

test('a network failure declines calmly and pays nothing', async () => {
  const { tamsi } = harness({
    chain: {
      authorizePayment: async () => {
        throw new Error('timeout')
      },
    },
  })
  const out = await tamsi.tap(tap('5'))
  assert.equal(out.reasonCode, 'network_error')
  assert.equal(out.decision, 'declined')
})
