import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import express, { type NextFunction, type Request, type Response } from 'express'
import { fromStroops, normalizeDeviceHash, toStroops, type NoirAgentClient } from '@noirx402/agent-sdk'
import { deviceHashFromUid, explorerTxUrl, phDayStart, type createTamsi } from '@tamsi/agent'
import type { CardDetail, TapResponse } from '@tamsi/shared'
import type { Config } from './config.ts'
import type { Store } from './db.ts'
import type { Feed } from './feed.ts'
import { toMoney } from './money.ts'

export interface Services {
  config: Config
  noir: NoirAgentClient
  store: Store
  tamsi: ReturnType<typeof createTamsi>
  feed: Feed
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

function parseTapBody(body: unknown): { deviceHash: string; merchantId: string; amount: bigint } | { error: string } {
  const { uid, deviceHash, merchantId, amount } = (body ?? {}) as Record<string, unknown>
  if (typeof merchantId !== 'string' || !merchantId) return { error: 'merchantId is required' }
  if (typeof amount !== 'string' || !/^\d+(\.\d{1,7})?$/.test(amount)) {
    return { error: 'amount must be a decimal string with at most 7 decimals' }
  }
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
    })
  })

  if (services) {
    const { config, noir, store, tamsi, feed } = services
    const money = (stroops: bigint) => toMoney(stroops, config.phpPerXlm)

    app.get('/api/merchants', (_req, res) => {
      res.json(store.listMerchants())
    })

    app.get('/api/cards', (_req, res) => {
      res.json(store.listCards())
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

      const body: CardDetail = {
        deviceHash: card.deviceHash,
        label: card.label,
        holderName: card.holderName,
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
      }
      res.json(body)
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

    app.post('/api/taps', async (req, res) => {
      const tap = parseTapBody(req.body)
      if ('error' in tap) {
        res.status(400).json({ error: tap.error })
        return
      }
      const outcome = await tamsi.tap(tap)
      if (outcome.txHash) feed.tapSaved(outcome.txHash)
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
