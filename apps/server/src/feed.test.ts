import assert from 'node:assert/strict'
import { test } from 'node:test'
import { TESTNET, decodeEvent, toStroops, type NoirEvent } from '@noirx402/agent-sdk'
import { Address, Contract, Keypair, nativeToScVal, xdr } from '@stellar/stellar-sdk'
import type { FeedItem } from '@tamsi/shared'
import { createStore, openDb, seedDemo } from './db.ts'
import { createFeed } from './feed.ts'

const CARD = 'a'.repeat(64)
const OTHER_CARD = 'b'.repeat(64)
const GROCERY = 'GROCERYADDRESS'

function setup() {
  const db = openDb(':memory:')
  seedDemo(db, {
    deviceHash: CARD,
    ownerWallet: 'GOFW',
    agentPubkey: 'GAGENT',
    merchantAddresses: { grocery: GROCERY, pharmacy: 'GPHARMACY', arcade: 'GARCADE' },
    policy: null,
  })
  const store = createStore(db)
  const noir = { getEvents: async () => ({ events: [], cursor: '', latestLedger: 1 }), watch: () => () => {} }
  const feed = createFeed({ noir, store, phpPerXlm: toStroops('50') })
  const pushed: FeedItem[] = []
  feed.subscribe(CARD, (item) => pushed.push(item))
  return { store, feed, pushed }
}

function paid(id: string, overrides: Partial<NoirEvent> = {}): NoirEvent {
  return {
    id,
    type: 'payment.authorized',
    deviceHash: CARD,
    merchant: GROCERY,
    amount: toStroops('2'),
    contractId: 'CONTRACT',
    ledger: 100,
    ledgerClosedAt: '2026-11-06T00:00:00Z',
    txHash: `tx-${id}`,
    ...overrides,
  } as NoirEvent
}

// Testnet RPC no longer sends inSuccessfulContractCall, and SDK 0.3.0 dropped every event
// without it. patches/ fixes that; this fails if the patch ever stops being applied.
test('the SDK decodes an event shaped like what Testnet RPC sends today', () => {
  const merchant = Keypair.random().publicKey()
  const raw = {
    id: 'e1',
    ledger: 100,
    ledgerClosedAt: '2026-11-06T00:00:00Z',
    txHash: 'tx-e1',
    contractId: new Contract(TESTNET.contracts.paymentEscrow),
    topic: [
      nativeToScVal('authorize', { type: 'symbol' }),
      xdr.ScVal.scvBytes(Buffer.alloc(32, 0xaa)),
      new Address(merchant).toScVal(),
    ],
    value: nativeToScVal(toStroops('2'), { type: 'i128' }),
  } as unknown as Parameters<typeof decodeEvent>[0]
  const event = decodeEvent(raw, TESTNET.contracts)
  assert.equal(event?.type, 'payment.authorized')
  assert.equal(event && 'deviceHash' in event && event.deviceHash, CARD)
  assert.equal(decodeEvent({ ...raw, inSuccessfulContractCall: false } as typeof raw, TESTNET.contracts), null)
})

test('a redelivered event is saved and pushed once', () => {
  const { feed, pushed } = setup()
  feed.receive(paid('e1'))
  feed.receive(paid('e1'))
  assert.equal(pushed.length, 1)
  assert.equal(feed.list(CARD).length, 1)
  assert.equal(feed.status().eventsSaved, 1)
})

test("another card's events and other merchants' claims are ignored", () => {
  const { store, feed, pushed } = setup()
  feed.receive(paid('e1', { deviceHash: OTHER_CARD } as Partial<NoirEvent>))
  feed.receive({
    id: 'e2',
    type: 'payment.claimed',
    merchant: 'GSOMEONEELSE',
    amount: 1n,
    contractId: 'CONTRACT',
    ledger: 100,
    ledgerClosedAt: '2026-11-06T00:00:00Z',
    txHash: 'tx-e2',
  })
  assert.equal(pushed.length, 0)
  assert.equal(store.lastNoirLedger(), null)
})

test('a receipt names the shop and shows the demo-rate pesos', () => {
  const { feed, pushed } = setup()
  feed.receive(paid('e1'))
  assert.equal(pushed[0]!.text, "Paid ₱100 at Aling Nena's Store.")
  assert.deepEqual(pushed[0]!.amount, { xlm: '2', php: '100' })
  assert.equal(pushed[0]!.explorerUrl, 'https://stellar.expert/explorer/testnet/tx/tx-e1')
})

test("the agent's sentence replaces the plain one once the tap is saved", () => {
  const { store, feed, pushed } = setup()
  feed.receive(paid('e1'))
  store.saveTap(
    { deviceHash: CARD, merchantId: 'grocery', amount: toStroops('2') },
    {
      decision: 'approved',
      reasonCode: 'paid',
      reasonText: 'The agent sentence.',
      checks: [],
      merchant: null,
      txHash: 'tx-e1',
      nonce: 1n,
    },
  )
  feed.tapSaved('tx-e1')
  assert.equal(pushed.length, 2)
  assert.equal(pushed[1]!.id, pushed[0]!.id)
  assert.equal(pushed[1]!.text, "Paid ₱100 at Aling Nena's Store — groceries are allowed and you're under today's limit.")
})

test('a merchant claim reaches the card feed; the newest receipt comes first', () => {
  const { feed, pushed } = setup()
  feed.receive(paid('e1'))
  feed.receive({
    id: 'e2',
    type: 'payment.claimed',
    merchant: GROCERY,
    amount: toStroops('2'),
    contractId: 'CONTRACT',
    ledger: 101,
    ledgerClosedAt: '2026-11-06T00:01:00Z',
    txHash: 'tx-e2',
  })
  assert.equal(pushed.length, 2)
  assert.deepEqual(
    feed.list(CARD).map((item) => item.text),
    ["Aling Nena's Store collected ₱100.", "Paid ₱100 at Aling Nena's Store."],
  )
})

test('a restart resumes from the last saved ledger', async () => {
  const { store } = setup()
  store.saveNoirEvent(paid('e1', { ledger: 5000 }))
  let fromLedger: number | undefined
  const noir = {
    getEvents: async () => ({ events: [], cursor: '', latestLedger: 6000 }),
    watch: (opts: { fromLedger?: number }) => {
      fromLedger = opts.fromLedger
      return () => {}
    },
  }
  await createFeed({ noir, store, phpPerXlm: null }).start()
  assert.equal(fromLedger, 5000)
})

test('a backfill never reaches past what the RPC keeps', async () => {
  const { store } = setup()
  let fromLedger: number | undefined
  const noir = {
    getEvents: async () => ({ events: [], cursor: '', latestLedger: 500_000 }),
    watch: (opts: { fromLedger?: number }) => {
      fromLedger = opts.fromLedger
      return () => {}
    },
  }
  await createFeed({ noir, store, phpPerXlm: null }).start()
  assert.equal(fromLedger, 400_000)
})

test('a declined tap joins the feed by time, in the OFW voice, with no explorer link', () => {
  const { store, feed, pushed } = setup()
  feed.receive(paid('e1', { ledgerClosedAt: '2020-01-01T00:00:00Z' } as Partial<NoirEvent>))
  const id = store.saveTap(
    { deviceHash: CARD, merchantId: 'arcade', amount: toStroops('5') },
    {
      decision: 'declined',
      reasonCode: 'merchant_not_allowed',
      reasonText: 'Shown at the counter.',
      checks: [],
      merchant: null,
      txHash: null,
      nonce: null,
    },
  )
  feed.tapDeclined(CARD, id)
  assert.equal(pushed.length, 2)
  const [newest, oldest] = feed.list(CARD)
  assert.equal(newest!.type, 'tap.declined')
  assert.equal(newest!.text, "Declined ₱250 at Games arcade: this kind of shop isn't on your allowed list.")
  assert.equal(newest!.explorerUrl, null)
  assert.equal(oldest!.id, 'e1')
})
