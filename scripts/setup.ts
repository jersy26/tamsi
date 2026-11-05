// Creates the Testnet keys and funds them with Friendbot. Rerunnable: keys already
// in .env are reused, so only a Testnet reset needs a fresh Friendbot top-up.
// Secrets go to .env only; this script prints public keys and never a secret.
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { Keypair } from '@stellar/stellar-sdk'

const ENV_PATH = '.env'
const MERCHANT_IDS = ['grocery', 'pharmacy', 'arcade'] as const
const DEFAULT_CARD_UID = 'tamsi-demo-card-1'

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

writeEnv({
  OFW_SECRET: secrets.OFW,
  AGENT_SECRET: secrets.AGENT,
  TREASURY_SECRET: secrets.TREASURY,
  MERCHANT_SECRETS: `'${JSON.stringify(merchants)}'`,
  DEMO_CARD_UID: process.env.DEMO_CARD_UID || DEFAULT_CARD_UID,
})

const accounts = [
  ...Object.entries(secrets).map(([label, secret]) => [label, secret] as const),
  ...Object.entries(merchants).map(([id, secret]) => [`merchant:${id}`, secret] as const),
]
for (const [label, secret] of accounts) {
  const publicKey = Keypair.fromSecret(secret).publicKey()
  console.log(`${label.padEnd(18)} ${publicKey}  ${await friendbot(publicKey)}`)
}
console.log('\nKeys saved to .env. Create the Velo project with the TREASURY wallet above.')
