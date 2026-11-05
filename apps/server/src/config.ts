// Every key comes from the environment (agents.md rule 4). Names are in .env.example.
import { Keypair } from '@stellar/stellar-sdk'
import { keypairSigner, toStroops, type NoirSigner } from '@noirx402/agent-sdk'

export interface Config {
  agent: NoirSigner
  ofw: NoirSigner
  treasury: NoirSigner
  merchantSecrets: Record<string, string>
  merchantAddresses: Record<string, string>
  demoCardUid: string
  sqlitePath: string
  // Stroops of pesos per XLM; null hides the peso figure.
  phpPerXlm: bigint | null
}

// A dashboard paste can keep the quotes .env needs around JSON, so they're allowed here.
function parseMerchantSecrets(raw: string): Record<string, string> {
  return JSON.parse(raw.trim().replace(/^'|'$/g, '')) as Record<string, string>
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const required = ['AGENT_SECRET', 'OFW_SECRET', 'TREASURY_SECRET', 'MERCHANT_SECRETS', 'DEMO_CARD_UID'] as const
  const missing = required.filter((name) => !env[name])
  if (missing.length) throw new Error(`Missing env: ${missing.join(', ')}`)

  const merchantSecrets = parseMerchantSecrets(env.MERCHANT_SECRETS!)
  return {
    agent: keypairSigner(env.AGENT_SECRET!),
    ofw: keypairSigner(env.OFW_SECRET!),
    treasury: keypairSigner(env.TREASURY_SECRET!),
    merchantSecrets,
    merchantAddresses: Object.fromEntries(
      Object.entries(merchantSecrets).map(([id, secret]) => [id, Keypair.fromSecret(secret).publicKey()]),
    ),
    demoCardUid: env.DEMO_CARD_UID!,
    sqlitePath: env.SQLITE_PATH || 'tamsi.db',
    phpPerXlm: env.DEMO_PHP_PER_XLM ? toStroops(env.DEMO_PHP_PER_XLM) : null,
  }
}
