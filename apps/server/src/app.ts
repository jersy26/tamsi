import { createHash, timingSafeEqual } from 'node:crypto'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import express, { type NextFunction, type Request, type Response } from 'express'
import { fromStroops, keypairSigner, normalizeDeviceHash, toStroops, type NoirAgentClient } from '@noirx402/agent-sdk'
import { XLM_ASSET, deviceHashFromUid, explorerTxUrl, phDayStart, type createTamsi } from '@tamsi/agent'
import type { CardDetail, ClaimResult, KillResult, TapResponse, TopupDetail } from '@tamsi/shared'
import type { Config } from './config.ts'
import type { Store, TopupRecord } from './db.ts'
import type { Feed } from './feed.ts'
import { killCard } from './kill.ts'
import { toMoney } from './money.ts'
import { CHECKOUT_LIFETIME_MS, type Topups } from './topups.ts'

export interface Services {
  config: Config
  noir: NoirAgentClient
  store: Store
  tamsi: ReturnType<typeof createTamsi>
  feed: Feed
  // Null until the Velo keys are set.
  topups: Topups | null
}

const WEB_DIST = resolve(import.meta.dirname, '../../web/dist')
const STREAM_HEARTBEAT_MS = 25_000

async function xlmBalance(address: string): Promise<string | null> {
  const res = await fetch(`https://horizon-testnet.stellar.org/accounts/${address}`)
  if (!res.ok) return null
  const account = (await res.json()) as { balances: { asset_type: string; balance: string }[] }
  return account.balances.find((b) => b.asset_type === 'native')?.balance ?? null
}

function settledValue<T>(result: PromiseSettledResult<T>): T | null {
  return result.status === 'fulfilled' ? result.value : null
}

const AMOUNT_PATTERN = /^\d+(\.\d{1,7})?$/
const AMOUNT_ERROR = 'amount must be a decimal string with at most 7 decimals'

function parseTapBody(body: unknown): { deviceHash: string; merchantId: string; amount: bigint } | { error: string } {
  const { uid, deviceHash, merchantId, amount } = (body ?? {}) as Record<string, unknown>
  if (typeof merchantId !== 'string' || !merchantId) return { error: 'merchantId is required' }
  if (typeof amount !== 'string' || !AMOUNT_PATTERN.test(amount)) return { error: AMOUNT_ERROR }
  if (typeof uid === 'string' && uid) {
    return { deviceHash: deviceHashFromUid(uid), merchantId, amount: toStroops(amount) }
  }
  if (typeof deviceHash !== 'string') return { error: 'uid or deviceHash is required' }
  try {
    return { deviceHash: normalizeDeviceHash(deviceHash), merchantId, amount: toStroops(amount) }
  } catch {
    return { error: 'deviceHash must be 32 bytes of hex' }
  }
}

// Hashed first, so the comparison takes the same time whatever the guess's length.
function pinMatches(guess: unknown, pin: string): boolean {
  if (typeof guess !== 'string') return false
  const digest = (value: string) => createHash('sha256').update(value).digest()
  return timingSafeEqual(digest(guess), digest(pin))
}

function parseDeviceHash(raw: string): string | null {
  try {
    return normalizeDeviceHash(raw)
  } catch {
    return null
  }
}

// `services` is null until the env is set, so a bare deploy still answers /api/health.
export function createApp(services: Services | null) {
  const app = express()
  app.use('/api', express.json())

  // Raw body: the signature covers the exact bytes Velo sent (agents.md rule 6).
  app.post('/webhooks/velo', express.raw({ type: '*/*' }), async (req, res) => {
    if (!services?.topups) {
      res.sendStatus(503)
      return
    }
    const { status, settled } = await services.topups.receiveWebhook({
      payload: Buffer.isBuffer(req.body) ? req.body.toString('utf8') : '',
      signature: req.get('x-velo-signature') ?? null,
      deliveryId: req.get('x-velo-delivery') ?? null,
    })
    res.sendStatus(status)
    await settled
  })

  app.get('/api/health', async (_req, res) => {
    if (!services) {
      res.status(503).json({ ok: false, node: process.version, configured: false })
      return
    }
    const { config, noir, feed } = services
    const deviceHash = deviceHashFromUid(config.demoCardUid)
    const [agent, treasury, escrow, policy] = await Promise.allSettled([
      xlmBalance(config.agent.publicKey),
      xlmBalance(config.treasury.publicKey),
      noir.getEscrowBalance(deviceHash),
      noir.getPolicy(deviceHash),
    ])
    const escrowStroops = settledValue(escrow)
    res.json({
      ok: true,
      node: process.version,
      configured: true,
      agentXlm: settledValue(agent),
      treasuryXlm: settledValue(treasury),
      demoCard: {
        deviceHash,
        escrowXlm: escrowStroops === null ? null : fromStroops(escrowStroops),
        policyRegistered: settledValue(policy) !== null,
      },
      watcher: feed.status(),
      veloConfigured: services.topups !== null,
    })
  })

  if (services) {
    const { config, noir, store, tamsi, feed, topups } = services
    const money = (stroops: bigint) => toMoney(stroops, config.phpPerXlm)
    const phpPerXlm = config.phpPerXlm === null ? null : fromStroops(config.phpPerXlm)
    const topupBody = (topup: TopupRecord): TopupDetail => ({
      id: topup.id,
      status: topup.status,
      amount: money(topup.amount),
      checkoutUrl: topup.checkoutUrl,
      explorerUrl: topup.fundTxHash ? explorerTxUrl(topup.fundTxHash) : null,
    })

    app.get('/api/merchants', (_req, res) => {
      res.json(store.listMerchants())
    })

    app.get('/api/cards', (_req, res) => {
      res.json(store.listCards().map((card) => ({ ...card, phpPerXlm })))
    })

    app.get('/api/cards/:hash', async (req, res) => {
      const deviceHash = parseDeviceHash(req.params.hash)
      const card = deviceHash && store.getCardDetail(deviceHash)
      if (!card) {
        res.status(404).json({ error: 'Card not found' })
        return
      }
      const [balanceResult] = await Promise.allSettled([noir.getEscrowBalance(card.deviceHash)])
      if (balanceResult.status === 'rejected') console.error('Could not read the card balance:', balanceResult.reason)
      const balance = settledValue(balanceResult)

      const spentToday = store.spentSince(card.deviceHash, phDayStart(new Date()))
      const capLeft = spentToday < card.dailyCap ? card.dailyCap - spentToday : 0n
      const aboveIpon = balance !== null && balance > card.iponFloor ? balance - card.iponFloor : 0n
      const leftLimitedByIpon = balance !== null && aboveIpon < capLeft

      const openRequest = store.openAgentTopup(card.deviceHash, new Date(Date.now() - CHECKOUT_LIFETIME_MS))
      const body: CardDetail = {
        deviceHash: card.deviceHash,
        label: card.label,
        holderName: card.holderName,
        phpPerXlm,
        status: card.status,
        maxPerTap: money(card.maxPerTap),
        expiresAt: card.expiresAt,
        rules: {
          dailyCap: money(card.dailyCap),
          iponFloor: money(card.iponFloor),
          allowedCategories: card.allowedCategories,
          nextPayday: card.nextPayday,
        },
        balance: balance === null ? null : money(balance),
        iponKept: balance === null ? null : money(balance < card.iponFloor ? balance : card.iponFloor),
        spentToday: money(spentToday),
        leftToday: money(leftLimitedByIpon ? aboveIpon : capLeft),
        leftLimitedByIpon,
        feed: feed.list(card.deviceHash),
        padalaEnabled: topups !== null,
        killEnabled: config.killPin !== null,
        topupRequest: openRequest && {
          amount: money(openRequest.amount),
          text: openRequest.reasonText ?? '',
          checkoutUrl: openRequest.checkoutUrl,
        },
      }
      res.json(body)
    })

    app.post('/api/cards/:hash/kill', async (req, res) => {
      const deviceHash = parseDeviceHash(req.params.hash)
      if (!deviceHash || !store.getCard(deviceHash)) {
        res.status(404).json({ error: 'Card not found' })
        return
      }
      if (config.killPin === null) {
        res.status(503).json({ error: 'The kill switch is not set up' })
        return
      }
      if (!pinMatches((req.body as { pin?: unknown } | undefined)?.pin, config.killPin)) {
        res.status(403).json({ error: "That PIN isn't right" })
        return
      }
      try {
        const outcome = await tamsi.exclusive(deviceHash, () => killCard({ noir, ofw: config.ofw, store, deviceHash }))
        const body: KillResult = {
          returned: money(outcome.returned),
          revokeExplorerUrl: outcome.revokeTxHash ? explorerTxUrl(outcome.revokeTxHash) : null,
          defundExplorerUrl: outcome.defundTxHash ? explorerTxUrl(outcome.defundTxHash) : null,
        }
        res.json(body)
      } catch (err) {
        console.error('Kill switch failed:', err)
        res.status(502).json({ error: 'The kill switch stopped partway. Try again; it picks up where it stopped.' })
      }
    })

    app.get('/api/stream/:hash', (req, res) => {
      const deviceHash = parseDeviceHash(req.params.hash)
      if (!deviceHash || !store.getCard(deviceHash)) {
        res.status(404).json({ error: 'Card not found' })
        return
      }
      res.set({
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no',
      })
      res.flushHeaders()
      res.write(': connected\n\n')
      const unsubscribe = feed.subscribe(deviceHash, (item) => {
        res.write(`event: feed\ndata: ${JSON.stringify(item)}\n\n`)
      })
      // Proxies drop a quiet connection, and a dashboard left open is mostly quiet.
      const heartbeat = setInterval(() => res.write(': ping\n\n'), STREAM_HEARTBEAT_MS)
      req.on('close', () => {
        clearInterval(heartbeat)
        unsubscribe()
      })
    })

    app.post('/api/merchants/:id/claim', async (req, res) => {
      const merchant = store.getMerchant(req.params.id)
      const secret = merchant && config.merchantSecrets[merchant.id]
      if (!merchant || !secret) {
        res.status(404).json({ error: 'Shop not found' })
        return
      }
      try {
        const pending = await noir.getPendingBalance(merchant.stellarAddress)
        if (pending === 0n) {
          const body: ClaimResult = { collected: money(0n), explorerUrl: null }
          res.json(body)
          return
        }
        const { hash } = await noir.claim({ merchant: keypairSigner(secret), token: XLM_ASSET })
        console.log(`claim: ${explorerTxUrl(hash)}`)
        const body: ClaimResult = { collected: money(pending), explorerUrl: explorerTxUrl(hash) }
        res.json(body)
      } catch (err) {
        console.error(`Could not collect for ${merchant.id}:`, err)
        res.status(502).json({ error: "We couldn't collect right now. Try again in a moment." })
      }
    })

    app.post('/api/topups', async (req, res) => {
      if (!topups) {
        res.status(503).json({ error: 'Padala is not set up yet' })
        return
      }
      const { deviceHash: rawHash, amount } = (req.body ?? {}) as Record<string, unknown>
      const deviceHash = typeof rawHash === 'string' ? parseDeviceHash(rawHash) : null
      if (!deviceHash || !store.getCard(deviceHash)) {
        res.status(404).json({ error: 'Card not found' })
        return
      }
      if (typeof amount !== 'string' || !AMOUNT_PATTERN.test(amount)) {
        res.status(400).json({ error: AMOUNT_ERROR })
        return
      }
      const stroops = toStroops(amount)
      if (stroops <= 0n) {
        res.status(400).json({ error: 'amount must be above zero' })
        return
      }
      try {
        res.json(topupBody(await topups.create(deviceHash, stroops, 'ofw')))
      } catch (err) {
        console.error('Could not open a Velo checkout:', err)
        res.status(502).json({ error: "We couldn't open the checkout. Try again in a moment." })
      }
    })

    app.get('/api/topups/:id', (req, res) => {
      const topup = store.getTopup(req.params.id)
      if (!topup) {
        res.status(404).json({ error: 'Top-up not found' })
        return
      }
      res.json(topupBody(topup))
    })

    app.post('/api/taps', async (req, res) => {
      const tap = parseTapBody(req.body)
      if ('error' in tap) {
        res.status(400).json({ error: tap.error })
        return
      }
      const outcome = await tamsi.tap(tap)
      if (outcome.txHash) feed.tapSaved(outcome.txHash)
      else feed.tapDeclined(tap.deviceHash, outcome.id)
      // Runs after the answer: a slow checkout shouldn't keep the counter waiting.
      void topups?.considerRequest(tap.deviceHash, outcome.reasonCode).catch((err) => {
        console.error('Could not create the agent top-up request:', err)
      })
      const { xlm: amountXlm, php: amountPhp } = money(tap.amount)
      const body: TapResponse = {
        id: outcome.id,
        decision: outcome.decision,
        reasonCode: outcome.reasonCode,
        reasonText: outcome.reasonText,
        amountXlm,
        amountPhp,
        merchantName: outcome.merchant?.name ?? 'Unknown shop',
        checks: outcome.checks,
        txHash: outcome.txHash,
        explorerUrl: outcome.txHash ? explorerTxUrl(outcome.txHash) : null,
      }
      res.json(body)
    })
  }

  app.use('/api', (_req, res) => {
    res.status(404).json({ error: 'Not found' })
  })

  if (existsSync(WEB_DIST)) {
    app.use(express.static(WEB_DIST))
    app.get('/{*page}', (_req, res) => {
      res.sendFile(resolve(WEB_DIST, 'index.html'))
    })
  }

  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    console.error(err)
    res.status(500).json({ error: 'Something went wrong' })
  })

  return app
}
