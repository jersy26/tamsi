// One command from an empty state to a card the agent can pay from (SDD §3 setup):
// Testnet keys + Friendbot, the demo card and its agent on Noir, then the local database.
// Rerunnable: keys in .env are reused and each on-chain step first reads whether it's needed,
// so a rerun after the kill switch re-registers the agent, and a Testnet reset rebuilds it all.
// Secrets go to .env only; this script prints public keys and never a secret.
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { Keypair } from '@stellar/stellar-sdk'
import { NoirAgentClient, fromStroops, keypairSigner, toStroops } from '@noirx402/agent-sdk'
import { XLM_ASSET, deviceHashFromUid, explorerTxUrl } from '@tamsi/agent'
import { DEMO_CARD } from '@tamsi/shared'
import { openDb, seedDemo } from '../apps/server/src/db.ts'

const ENV_PATH = '.env'
const MERCHANT_IDS = ['grocery', 'pharmacy', 'arcade'] as const
const DEFAULT_CARD_UID = 'tamsi-demo-card-1'
const DEFAULT_SQLITE_PATH = 'tamsi.db'
const DEFAULT_PHP_PER_XLM = '50'

function secretFromEnv(name: string): string {
  return process.env[name] || Keypair.random().secret()
}

function merchantSecretsFromEnv(): Record<string, string> {
  const saved: Record<string, string> = JSON.parse(process.env.MERCHANT_SECRETS || '{}')
  return Object.fromEntries(MERCHANT_IDS.map((id) => [id, saved[id] ?? Keypair.random().secret()]))
}

// Fills an empty `NAME=` line or appends one; lines with a value are left alone.
function writeEnv(values: Record<string, string>): void {
  const base = existsSync('.env') ? readFileSync(ENV_PATH, 'utf8') : readFileSync('.env.example', 'utf8')
  let text = base
  for (const [name, value] of Object.entries(values)) {
    const line = new RegExp(`^${name}=(.*)$`, 'm')
    const match = text.match(line)
    if (!match) text = `${text.trimEnd()}\n${name}=${value}\n`
    else if (!match[1]) text = text.replace(line, () => `${name}=${value}`)
  }
  writeFileSync(ENV_PATH, text)
}

// Friendbot answers 400 for an account it already funded, which is fine on a rerun.
// Horizon decides whether the account really exists, so we don't depend on its wording.
async function friendbot(publicKey: string): Promise<'funded' | 'already funded'> {
  const res = await fetch(`https://friendbot.stellar.org?addr=${encodeURIComponent(publicKey)}`)
  if (res.ok) return 'funded'
  const body = await res.text()
  if (res.status === 400) {
    const account = await fetch(`https://horizon-testnet.stellar.org/accounts/${publicKey}`)
    if (account.ok) return 'already funded'
  }
  throw new Error(`Friendbot failed for ${publicKey}: ${res.status} ${body.slice(0, 200)}`)
}

const secrets = {
  OFW: secretFromEnv('OFW_SECRET'),
  AGENT: secretFromEnv('AGENT_SECRET'),
  TREASURY: secretFromEnv('TREASURY_SECRET'),
}
const merchants = merchantSecretsFromEnv()
const cardUid = process.env.DEMO_CARD_UID || DEFAULT_CARD_UID
const sqlitePath = process.env.SQLITE_PATH || DEFAULT_SQLITE_PATH

writeEnv({
  OFW_SECRET: secrets.OFW,
  AGENT_SECRET: secrets.AGENT,
  TREASURY_SECRET: secrets.TREASURY,
  MERCHANT_SECRETS: `'${JSON.stringify(merchants)}'`,
  DEMO_CARD_UID: cardUid,
  SQLITE_PATH: sqlitePath,
  DEMO_PHP_PER_XLM: process.env.DEMO_PHP_PER_XLM || DEFAULT_PHP_PER_XLM,
})

const accounts = [
  ...Object.entries(secrets).map(([label, secret]) => [label, secret] as const),
  ...Object.entries(merchants).map(([id, secret]) => [`merchant:${id}`, secret] as const),
]
for (const [label, secret] of accounts) {
  const publicKey = Keypair.fromSecret(secret).publicKey()
  console.log(`${label.padEnd(18)} ${publicKey}  ${await friendbot(publicKey)}`)
}

const noir = new NoirAgentClient()
const ofw = keypairSigner(secrets.OFW)
const agentPublicKey = Keypair.fromSecret(secrets.AGENT).publicKey()
const deviceHash = deviceHashFromUid(cardUid)
console.log(`\nDemo card "${cardUid}"  device hash ${deviceHash}`)

const owner = await noir.getDeviceOwner(deviceHash)
if (owner && owner !== ofw.publicKey) {
  throw new Error(`Card is owned by ${owner}, not the OFW key in .env. Set a new DEMO_CARD_UID.`)
}
if (owner) {
  console.log('registerDevice    already registered')
} else {
  const { hash } = await noir.execute(ofw, { kind: 'registerDevice', deviceHash, agent: agentPublicKey })
  console.log(`registerDevice    ${explorerTxUrl(hash)}`)
}

const existing = await noir.getPolicy(deviceHash)
const stillValid = existing && existing.agent === agentPublicKey && (!existing.expiresAt || existing.expiresAt > new Date())
if (stillValid) {
  console.log(`registerAgent     already registered, expires ${existing.expiresAt?.toISOString() ?? 'never'}`)
} else {
  const { hash } = await noir.execute(ofw, {
    kind: 'registerAgent',
    deviceHash,
    agent: agentPublicKey,
    asset: XLM_ASSET,
    maxAmount: toStroops(DEMO_CARD.maxPerTapXlm),
    expiresAt: new Date(Date.now() + DEMO_CARD.policyDays * 24 * 60 * 60 * 1000),
  })
  console.log(`registerAgent     ${explorerTxUrl(hash)}`)
}

const db = openDb(sqlitePath)
seedDemo(db, {
  deviceHash,
  ownerWallet: ofw.publicKey,
  agentPubkey: agentPublicKey,
  merchantAddresses: Object.fromEntries(
    Object.entries(merchants).map(([id, secret]) => [id, Keypair.fromSecret(secret).publicKey()]),
  ),
  policy: await noir.getPolicy(deviceHash),
})
db.close()
console.log(`Database seeded    ${sqlitePath}`)

const balance = await noir.getEscrowBalance(deviceHash)
console.log(`Card balance       ${fromStroops(balance)} XLM`)
if (balance === 0n) console.log('The card is empty: run pnpm fund:demo, or send padala once Velo is set up.')
console.log('\nKeys saved to .env. Create the Velo project with the TREASURY wallet above.')
