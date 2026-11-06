// One Railway service: this process serves the API and the built web app.
import { Velo } from '@carts1024/velo-sdk'
import { NoirAgentClient } from '@noirx402/agent-sdk'
import { XLM_ASSET, createNoirChain, createTamsi, deviceHashFromUid } from '@tamsi/agent'
import { formatMoney } from '@tamsi/shared'
import { createApp, type Services } from './app.ts'
import { loadConfig } from './config.ts'
import { createStore, openDb, seedDemo } from './db.ts'
import { createFeed } from './feed.ts'
import { toMoney } from './money.ts'
import { createTopups } from './topups.ts'

async function buildServices(): Promise<Services> {
  const config = loadConfig()
  const noir = new NoirAgentClient()
  const db = openDb(config.sqlitePath)
  const deviceHash = deviceHashFromUid(config.demoCardUid)
  let policy
  try {
    policy = await noir.getPolicy(deviceHash)
  } catch (err) {
    console.error('Could not read the card policy at boot; keeping the saved card status.', err)
  }
  seedDemo(db, {
    deviceHash,
    ownerWallet: config.ofw.publicKey,
    agentPubkey: config.agent.publicKey,
    merchantAddresses: config.merchantAddresses,
    policy,
  })
  const store = createStore(db)
  const chain = createNoirChain(noir, config.agent)
  const feed = createFeed({ noir, store, phpPerXlm: config.phpPerXlm })
  const topups = config.velo
    ? createTopups({
        velo: new Velo({ apiKey: config.velo.apiKey, environment: 'testnet' }),
        webhookSecret: config.velo.webhookSecret,
        publicUrl: config.velo.publicUrl,
        store,
        phpPerXlm: config.phpPerXlm,
        fund: async (cardHash, amount) => {
          const { hash } = await noir.execute(config.treasury, {
            kind: 'fundEscrow',
            deviceHash: cardHash,
            token: XLM_ASSET,
            amount,
          })
          return hash
        },
        getBalance: (cardHash) => noir.getEscrowBalance(cardHash),
        onRequested: (topup) => feed.topupRequested(topup),
      })
    : null
  if (!topups) console.log('Velo keys not set: padala top-ups are off.')
  return { config, noir, store, tamsi: createTamsi({ store, chain, display: (stroops) => formatMoney(toMoney(stroops, config.phpPerXlm)) }), feed, topups }
}

let services: Services | null = null
try {
  services = await buildServices()
} catch (err) {
  console.error('Starting with /api/health only:', err instanceof Error ? err.message : err)
}

const port = Number(process.env.PORT) || 3000
createApp(services).listen(port, () => {
  console.log(`Tamsi server listening on :${port} (Node ${process.version})`)
})
void services?.feed.start()
