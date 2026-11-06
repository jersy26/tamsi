import assert from 'node:assert/strict'
import { createHmac } from 'node:crypto'
import type { AddressInfo } from 'node:net'
import { test } from 'node:test'
import { fromStroops, toStroops } from '@noirx402/agent-sdk'
import { createApp, type Services } from './app.ts'
import { createStore, openDb, seedDemo } from './db.ts'
import { createTopups } from './topups.ts'

const CARD = 'a'.repeat(64)
const SECRET = 'whsec_test'
const TEN = toStroops('10')

function setup(overrides: { intentStatus?: string; intentAmount?: string; fund?: () => Promise<string>; balance?: string } = {}) {
  const db = openDb(':memory:')
  seedDemo(db, {
    deviceHash: CARD,
    ownerWallet: 'GOFW',
    agentPubkey: 'GAGENT',
    merchantAddresses: { grocery: 'GGROCERY', pharmacy: 'GPHARMACY', arcade: 'GARCADE' },
    policy: undefined,
  })
  const store = createStore(db)
  const funded: { deviceHash: string; amount: bigint }[] = []
  const sessions: { params: Record<string, unknown>; options: unknown }[] = []
  const requested: string[] = []
  const velo = {
    checkout: {
      sessions: {
        create: async (params: Record<string, unknown>, options: unknown) => {
          sessions.push({ params, options })
          return { checkoutUrl: `https://velo.test/pay/pi_${sessions.length}`, paymentIntentId: `pi_${sessions.length}` }
        },
      },
    },
    paymentIntents: {
      retrieve: async (id: string) => ({
        status: overrides.intentStatus ?? 'paid',
        amount: overrides.intentAmount ?? fromStroops(store.getTopupByIntent(id)?.amount ?? 0n),
      }),
    },
  } as unknown as Parameters<typeof createTopups>[0]['velo']
  const topups = createTopups({
    velo,
    webhookSecret: SECRET,
    publicUrl: 'https://tamsi.test',
    store,
    fund: async (deviceHash, amount) => {
      funded.push({ deviceHash, amount })
      if (overrides.fund) return overrides.fund()
      return 'fund-tx'
    },
    getBalance: async () => toStroops(overrides.balance ?? '21'),
    onRequested: (topup) => requested.push(topup.id),
  })
  return { store, topups, funded, sessions, requested }
}

function paidEvent(paymentIntentId = 'pi_1', type = 'payment.succeeded') {
  return JSON.stringify({
    version: '1',
    id: 'evt_1',
    type,
    test: true,
    sentAt: new Date().toISOString(),
    project: { id: 'p', registryProjectId: 'r', name: 'Tamsi', slug: 'tamsi' },
    paymentIntent: {
      id: paymentIntentId,
      amount: '10.00',
      asset: 'native',
      merchantName: 'Tamsi',
      description: null,
      status: 'paid',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  })
}

function sign(payload: string, secret = SECRET): string {
  const timestamp = Math.floor(Date.now() / 1000)
  const signature = createHmac('sha256', secret).update(`${timestamp}.${payload}`).digest('hex')
  return `t=${timestamp},v1=${signature}`
}

async function deliver(topups: ReturnType<typeof setup>['topups'], deliveryId: string, payload = paidEvent()) {
  const { status, settled } = await topups.receiveWebhook({ payload, signature: sign(payload), deliveryId })
  await settled
  return status
}

test('a checkout carries the amount, return URLs and an idempotency key', async () => {
  const { topups, sessions, store } = setup()
  const topup = await topups.create(CARD, TEN, 'ofw')
  assert.equal(topup.status, 'created')
  assert.equal(topup.checkoutUrl, 'https://velo.test/pay/pi_1')
  assert.equal(sessions[0]!.params.amount, '10')
  assert.equal(sessions[0]!.params.successUrl, `https://tamsi.test/pay/success?topup=${topup.id}`)
  assert.deepEqual(sessions[0]!.options, { idempotencyKey: topup.id })
  assert.equal(store.getTopupByIntent('pi_1')?.id, topup.id)
})

test('verified webhook and a paid intent take it from created to funded', async () => {
  const { topups, funded, store } = setup()
  const { id } = await topups.create(CARD, TEN, 'ofw')
  assert.equal(await deliver(topups, 'd1'), 200)
  assert.deepEqual(funded, [{ deviceHash: CARD, amount: TEN }])
  const topup = store.getTopup(id)!
  assert.equal(topup.status, 'funded')
  assert.equal(topup.fundTxHash, 'fund-tx')
})

test('a duplicate delivery funds once', async () => {
  const { topups, funded } = setup()
  await topups.create(CARD, TEN, 'ofw')
  assert.equal(await deliver(topups, 'd1'), 200)
  assert.equal(await deliver(topups, 'd1'), 200)
  assert.equal(funded.length, 1)
})

test('a second delivery id for the same payment also funds once', async () => {
  const { topups, funded } = setup()
  await topups.create(CARD, TEN, 'ofw')
  await Promise.all([deliver(topups, 'd1'), deliver(topups, 'd2')])
  await deliver(topups, 'd3')
  assert.equal(funded.length, 1)
})

// Velo's real payment.succeeded failed the SDK's own check on its metadata fields.
// patches/ relaxes that check; the signature and the retrieved intent still decide.
test('a signed event with odd metadata still funds, and only with a valid signature', async () => {
  const { topups, funded } = setup()
  await topups.create(CARD, TEN, 'ofw')
  const event = JSON.parse(paidEvent()) as { project: Record<string, unknown>; paymentIntent: Record<string, unknown> }
  event.project.registryProjectId = null
  event.paymentIntent.merchantName = null
  const payload = JSON.stringify(event)
  const forged = await topups.receiveWebhook({ payload, signature: sign(payload, 'wrong'), deliveryId: 'd0' })
  assert.equal(forged.status, 400)
  assert.equal(funded.length, 0)
  assert.equal(await deliver(topups, 'd1', payload), 200)
  assert.equal(funded.length, 1)
})

test('the ipon floor makes the agent ask once, with the formula filled in', async () => {
  const { topups, sessions, store, requested } = setup()
  const topup = await topups.considerRequest(CARD, 'ipon_floor')
  assert.equal(topup?.requestedBy, 'agent')
  assert.match(topup?.reasonText ?? '', /The agent asks for \d+ XLM: 12\.5 a day × \d+ days to payday \+ 20 ipon − 21 on the card/)
  assert.equal(sessions.length, 1)
  assert.deepEqual(requested, [topup?.id])
  assert.equal(store.openAgentTopup(CARD, new Date(0))?.id, topup?.id)
  // A second decline finds the open request and opens no new checkout.
  assert.equal(await topups.considerRequest(CARD, 'ipon_floor'), null)
  assert.equal(sessions.length, 1)
})

test('money landing closes the open request, but its checkout still funds if paid', async () => {
  const { topups, store, funded, sessions } = setup()
  const topup = await topups.considerRequest(CARD, 'ipon_floor')
  assert.ok(topup)
  store.saveNoirEvent({
    id: 'funded-1',
    type: 'escrow.funded',
    deviceHash: CARD,
    amount: toStroops('60'),
    contractId: 'CONTRACT',
    ledger: 200,
    ledgerClosedAt: new Date(Date.now() + 60_000).toISOString(),
    txHash: 'tx-funded',
  })
  assert.equal(store.openAgentTopup(CARD, new Date(0)), null)
  // With nothing open, the agent can ask again from the new numbers.
  assert.equal((await topups.considerRequest(CARD, 'ipon_floor'))?.requestedBy, 'agent')
  assert.equal(sessions.length, 2)
  assert.equal(await deliver(topups, 'd1'), 200)
  assert.equal(funded.length, 1)
  assert.equal(store.getTopup(topup.id)?.status, 'funded')
})

test('an agent request is only made for the ipon floor or a low balance after paying', async () => {
  const rich = setup({ balance: '500' })
  assert.equal(await rich.topups.considerRequest(CARD, 'paid'), null)
  assert.equal(await rich.topups.considerRequest(CARD, 'merchant_not_allowed'), null)
  assert.equal(rich.sessions.length, 0)
  const low = setup({ balance: '21' })
  assert.equal((await low.topups.considerRequest(CARD, 'paid'))?.requestedBy, 'agent')
})

test('a bad signature is refused and funds nothing', async () => {
  const { topups, funded, store } = setup()
  const { id } = await topups.create(CARD, TEN, 'ofw')
  const payload = paidEvent()
  const { status } = await topups.receiveWebhook({ payload, signature: sign(payload, 'wrong'), deliveryId: 'd1' })
  assert.equal(status, 400)
  assert.equal(funded.length, 0)
  assert.equal(store.getTopup(id)?.status, 'created')
  // The refused delivery wasn't recorded, so the genuine one still counts.
  assert.equal(await deliver(topups, 'd1'), 200)
  assert.equal(funded.length, 1)
})

test('the webhook alone is not enough: an unpaid intent funds nothing', async () => {
  const { topups, funded, store } = setup({ intentStatus: 'pending' })
  const { id } = await topups.create(CARD, TEN, 'ofw')
  assert.equal(await deliver(topups, 'd1'), 200)
  assert.equal(funded.length, 0)
  assert.equal(store.getTopup(id)?.status, 'created')
})

test('a paid amount that differs from the top-up funds nothing', async () => {
  const { topups, funded, store } = setup({ intentAmount: '9.99' })
  const { id } = await topups.create(CARD, TEN, 'ofw')
  await deliver(topups, 'd1')
  assert.equal(funded.length, 0)
  assert.equal(store.getTopup(id)?.status, 'created')
})

test('an unknown payment and other event types fund nothing', async () => {
  const { topups, funded } = setup()
  await topups.create(CARD, TEN, 'ofw')
  assert.equal(await deliver(topups, 'd1', paidEvent('pi_other')), 200)
  assert.equal(await deliver(topups, 'd2', paidEvent('pi_1', 'payment.failed')), 200)
  assert.equal(funded.length, 0)
})

test('a failed funding is marked and never retried by a later delivery', async () => {
  const { topups, funded, store } = setup({
    fund: async () => {
      throw new Error('rpc down')
    },
  })
  const { id } = await topups.create(CARD, TEN, 'ofw')
  await deliver(topups, 'd1')
  assert.equal(store.getTopup(id)?.status, 'fund_failed')
  await deliver(topups, 'd2')
  assert.equal(funded.length, 1)
})

test('over HTTP: raw body is verified, and the redirect page changes nothing', async () => {
  const { topups, funded, store } = setup()
  const services = {
    config: { phpPerXlm: null },
    noir: { getEscrowBalance: async () => 0n },
    store,
    tamsi: {},
    feed: { list: () => [], status: () => ({}) },
    topups,
  } as unknown as Services
  const server = createApp(services).listen(0)
  const base = `http://localhost:${(server.address() as AddressInfo).port}`
  try {
    const created = await fetch(`${base}/api/topups`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ deviceHash: CARD, amount: '10' }),
    })
    assert.equal(created.status, 200)
    const { id, checkoutUrl } = (await created.json()) as { id: string; checkoutUrl: string }
    assert.equal(checkoutUrl, 'https://velo.test/pay/pi_1')

    await fetch(`${base}/pay/success?topup=${id}`)
    const afterRedirect = (await (await fetch(`${base}/api/topups/${id}`)).json()) as { status: string }
    assert.equal(afterRedirect.status, 'created')
    assert.equal(funded.length, 0)

    const payload = paidEvent()
    const unsigned = await fetch(`${base}/webhooks/velo`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-velo-delivery': 'd0' },
      body: payload,
    })
    assert.equal(unsigned.status, 400)

    const hook = await fetch(`${base}/webhooks/velo`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-velo-signature': sign(payload), 'x-velo-delivery': 'd1' },
      body: payload,
    })
    assert.equal(hook.status, 200)
    for (let i = 0; i < 50 && store.getTopup(id)?.status !== 'funded'; i++) {
      await new Promise((resolve) => setTimeout(resolve, 10))
    }
    const after = (await (await fetch(`${base}/api/topups/${id}`)).json()) as { status: string; explorerUrl: string }
    assert.equal(after.status, 'funded')
    assert.equal(after.explorerUrl, 'https://stellar.expert/explorer/testnet/tx/fund-tx')

    const badAmount = await fetch(`${base}/api/topups`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ deviceHash: CARD, amount: '0' }),
    })
    assert.equal(badAmount.status, 400)
  } finally {
    server.close()
  }
})
