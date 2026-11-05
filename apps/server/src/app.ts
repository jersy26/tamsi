import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import express, { type NextFunction, type Request, type Response } from 'express'
import { fromStroops, normalizeDeviceHash, toStroops, type NoirAgentClient } from '@noirx402/agent-sdk'
import { deviceHashFromUid, explorerTxUrl, type createTamsi } from '@tamsi/agent'
import type { TapResponse } from '@tamsi/shared'
import type { Config } from './config.ts'
import type { Store } from './db.ts'

export interface Services {
  config: Config
  noir: NoirAgentClient
  store: Store
  tamsi: ReturnType<typeof createTamsi>
}

const WEB_DIST = resolve(import.meta.dirname, '../../web/dist')
const STROOPS_PER_XLM_SQUARED = 10n ** 14n

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

// `services` is null until the env is set, so a bare deploy still answers /api/health.
export function createApp(services: Services | null) {
  const app = express()
  app.use('/api', express.json())

  app.get('/api/health', async (_req, res) => {
    if (!services) {
      res.status(503).json({ ok: false, node: process.version, configured: false })
      return
    }
    const { config, noir } = services
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
    })
  })

  if (services) {
    const { config, store, tamsi } = services

    app.get('/api/merchants', (_req, res) => {
      res.json(store.listMerchants())
    })

    app.get('/api/cards', (_req, res) => {
      res.json(store.listCards())
    })

    app.post('/api/taps', async (req, res) => {
      const tap = parseTapBody(req.body)
      if ('error' in tap) {
        res.status(400).json({ error: tap.error })
        return
      }
      const outcome = await tamsi.tap(tap)
      const body: TapResponse = {
        id: outcome.id,
        decision: outcome.decision,
        reasonCode: outcome.reasonCode,
        reasonText: outcome.reasonText,
        amountXlm: fromStroops(tap.amount),
        amountPhp: config.phpPerXlm === null ? null : ((tap.amount * config.phpPerXlm) / STROOPS_PER_XLM_SQUARED).toString(),
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
