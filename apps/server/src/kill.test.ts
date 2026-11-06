import assert from 'node:assert/strict'
import type { AddressInfo } from 'node:net'
import { test } from 'node:test'
import { keypairSigner, toStroops } from '@noirx402/agent-sdk'
import { Keypair } from '@stellar/stellar-sdk'
import { createApp, type Services } from './app.ts'
import { createStore, openDb, seedDemo } from './db.ts'

const CARD = 'a'.repeat(64)
const PIN = '4821'

function setup(opts: { balance?: string; hasPolicy?: boolean; failDefund?: boolean; killPin?: string | null } = {}) {
  const db = openDb(':memory:')
  seedDemo(db, {
    deviceHash: CARD,
    ownerWallet: 'GOFW',
    agentPubkey: 'GAGENT',
    merchantAddresses: { grocery: Keypair.random().publicKey(), pharmacy: 'GPHARMACY', arcade: 'GARCADE' },
    policy: undefined,
  })
  const store = createStore(db)
  const steps: string[] = []
  const claims: unknown[] = []
  let pending = toStroops('3')
  let hasPolicy = opts.hasPolicy ?? true
  const noir = {
    getPolicy: async () => (hasPolicy ? { agent: 'GAGENT' } : null),
    getEscrowBalance: async () => toStroops(opts.balance ?? '20'),
    getPendingBalance: async () => pending,
    claim: async (p: unknown) => {
      claims.push(p)
      pending = 0n
      return { hash: 'claim-tx' }
    },
    execute: async (_signer: unknown, op: { kind: string; amount?: bigint }) => {
      steps.push(op.kind)
      if (op.kind === 'defundEscrow' && opts.failDefund) throw new Error('rpc down')
      if (op.kind === 'revokeAgent') hasPolicy = false
      return { hash: `${op.kind}-tx` }
    },
  }
  const services = {
    config: {
      phpPerXlm: null,
      ofw: keypairSigner(Keypair.random().secret()),
      killPin: opts.killPin === undefined ? PIN : opts.killPin,
      merchantSecrets: { grocery: Keypair.random().secret() },
    },
    noir,
    store,
    tamsi: { exclusive: (_hash: string, task: () => Promise<unknown>) => task() },
    feed: { list: () => [], status: () => ({}) },
    topups: null,
  } as unknown as Services
  return { store, steps, claims, app: createApp(services) }
}

async function withServer<T>(app: ReturnType<typeof createApp>, run: (base: string) => Promise<T>): Promise<T> {
  const server = app.listen(0)
  try {
    return await run(`http://localhost:${(server.address() as AddressInfo).port}`)
  } finally {
    server.close()
  }
}

const post = (url: string, body?: unknown) =>
  fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body ?? {}) })

test('kill revokes the agent, then withdraws the full balance, and never revokes the device', async () => {
  const { app, steps, store } = setup()
  await withServer(app, async (base) => {
    const res = await post(`${base}/api/cards/${CARD}/kill`, { pin: PIN })
    assert.equal(res.status, 200)
    const body = (await res.json()) as { returned: { xlm: string }; revokeExplorerUrl: string; defundExplorerUrl: string }
    assert.equal(body.returned.xlm, '20')
    assert.match(body.revokeExplorerUrl, /revokeAgent-tx$/)
    assert.match(body.defundExplorerUrl, /defundEscrow-tx$/)
  })
  assert.deepEqual(steps, ['revokeAgent', 'defundEscrow'])
  assert.equal(store.getCard(CARD)?.status, 'revoked')
})

test('a wrong or missing PIN changes nothing', async () => {
  const { app, steps, store } = setup()
  await withServer(app, async (base) => {
    assert.equal((await post(`${base}/api/cards/${CARD}/kill`, { pin: '0000' })).status, 403)
    assert.equal((await post(`${base}/api/cards/${CARD}/kill`)).status, 403)
  })
  assert.deepEqual(steps, [])
  assert.equal(store.getCard(CARD)?.status, 'active')
})

test('with no PIN configured the kill switch stays off', async () => {
  const { app, steps } = setup({ killPin: null })
  await withServer(app, async (base) => {
    assert.equal((await post(`${base}/api/cards/${CARD}/kill`, { pin: '' })).status, 503)
  })
  assert.deepEqual(steps, [])
})

test('a failed withdrawal leaves the card off, and a retry only withdraws', async () => {
  const failing = setup({ failDefund: true })
  await withServer(failing.app, async (base) => {
    assert.equal((await post(`${base}/api/cards/${CARD}/kill`, { pin: PIN })).status, 502)
    assert.equal(failing.store.getCard(CARD)?.status, 'revoked')
    assert.equal((await post(`${base}/api/cards/${CARD}/kill`, { pin: PIN })).status, 502)
  })
  assert.deepEqual(failing.steps, ['revokeAgent', 'defundEscrow', 'defundEscrow'])
})

test('an empty card only revokes the agent', async () => {
  const { app, steps } = setup({ balance: '0' })
  await withServer(app, async (base) => {
    assert.equal((await post(`${base}/api/cards/${CARD}/kill`, { pin: PIN })).status, 200)
  })
  assert.deepEqual(steps, ['revokeAgent'])
})

test('collecting claims what is pending, then has nothing left to collect', async () => {
  const { app, claims } = setup()
  await withServer(app, async (base) => {
    const first = (await (await post(`${base}/api/merchants/grocery/claim`)).json()) as { collected: { xlm: string }; explorerUrl: string }
    assert.equal(first.collected.xlm, '3')
    assert.match(first.explorerUrl, /claim-tx$/)
    const second = (await (await post(`${base}/api/merchants/grocery/claim`)).json()) as { collected: { xlm: string }; explorerUrl: null }
    assert.equal(second.collected.xlm, '0')
    assert.equal(second.explorerUrl, null)
    assert.equal((await post(`${base}/api/merchants/nope/claim`)).status, 404)
  })
  assert.equal(claims.length, 1)
})
