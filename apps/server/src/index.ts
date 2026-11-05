// One Railway service: this process serves the API and the built web app.
import { NoirAgentClient } from '@noirx402/agent-sdk'
import { createNoirChain, createTamsi, deviceHashFromUid } from '@tamsi/agent'
import { createApp, type Services } from './app.ts'
import { loadConfig } from './config.ts'
import { createStore, openDb, seedDemo } from './db.ts'

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
  return { config, noir, store, tamsi: createTamsi({ store, chain }) }
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
