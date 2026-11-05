// Phase 0 proof: register -> registerAgent -> treasury fundEscrow -> checkPayment ->
// authorizePayment -> claim, on a fresh card each run. It answers the plan's open
// question (can a treasury that doesn't own the card fund it?) and writes the
// tx hashes to docs/testnet-proof.md.
import { createHash } from 'node:crypto'
import { writeFileSync } from 'node:fs'
import { Asset, Keypair, Networks } from '@stellar/stellar-sdk'
import { NoirAgentClient, NoirContractError, fromStroops, keypairSigner, toStroops } from '@noirx402/agent-sdk'

function requireEnv(name: string): string {
  const value = process.env[name]
  if (!value) throw new Error(`${name} is missing. Run pnpm setup:testnet first.`)
  return value
}

const noir = new NoirAgentClient()
const ofw = keypairSigner(requireEnv('OFW_SECRET'))
const agent = keypairSigner(requireEnv('AGENT_SECRET'))
const treasury = keypairSigner(requireEnv('TREASURY_SECRET'))
const merchantSecrets: Record<string, string> = JSON.parse(requireEnv('MERCHANT_SECRETS'))
const merchant = keypairSigner(merchantSecrets.grocery!)

const asset = Asset.native().contractId(Networks.TESTNET)
const uid = `spike-${Date.now()}`
const deviceHash = createHash('sha256').update(uid).digest('hex')
const maxAmount = toStroops('5')
const fundAmount = toStroops('20')
const payAmount = toStroops('1.5')

const proof: string[] = []
function record(label: string, hash: string): void {
  const link = `https://stellar.expert/explorer/testnet/tx/${hash}`
  console.log(`${label}: ${link}`)
  proof.push(`- ${label}: ${link}`)
}

function saveProof(fundingAnswer: string): void {
  const text = [
    '# Testnet proof',
    '',
    `Run: ${new Date().toISOString()}. Written by \`scripts/spike.ts\`.`,
    '',
    `**Can a non-owner treasury fund a card?** ${fundingAnswer}`,
    '',
    `- Card UID: \`${uid}\``,
    `- Device hash: \`${deviceHash}\``,
    `- Owner (OFW): \`${ofw.publicKey}\``,
    `- Treasury: \`${treasury.publicKey}\``,
    `- Agent: \`${agent.publicKey}\``,
    `- Merchant: \`${merchant.publicKey}\``,
    '',
    ...proof,
    '',
  ].join('\n')
  writeFileSync('docs/testnet-proof.md', text)
}

const registered = await noir.execute(ofw, { kind: 'registerDevice', deviceHash, agent: agent.publicKey })
record('registerDevice (OFW)', registered.hash)

const policy = await noir.execute(ofw, {
  kind: 'registerAgent',
  deviceHash,
  agent: agent.publicKey,
  asset,
  maxAmount,
  expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
})
record('registerAgent (OFW)', policy.hash)

try {
  const funded = await noir.execute(treasury, { kind: 'fundEscrow', deviceHash, token: asset, amount: fundAmount })
  record('fundEscrow (treasury, not the owner)', funded.hash)
} catch (err) {
  if (!(err instanceof NoirContractError)) throw err
  saveProof(`No. The contract refused with \`${err.name}\`; use the BUILD-PLAN §4 fallback.`)
  console.error(`Treasury could not fund: ${err.name}`)
  process.exit(1)
}

const balance = await noir.getEscrowBalance(deviceHash)
if (balance !== fundAmount) throw new Error(`Expected escrow ${fundAmount}, got ${balance}`)
console.log(`Escrow balance: ${fromStroops(balance)} XLM`)

const overLimit = await noir.checkPayment({
  deviceHash,
  agent: agent.publicKey,
  asset,
  amount: maxAmount + 1n,
})
if (overLimit.ok || overLimit.reason !== 'over_limit') {
  throw new Error(`Expected over_limit, got ${JSON.stringify(overLimit)}`)
}
console.log(`checkPayment over the per-tap max: ${overLimit.reason}`)

const allowed = await noir.checkPayment({ deviceHash, agent: agent.publicKey, asset, amount: payAmount })
if (!allowed.ok) throw new Error(`checkPayment refused: ${allowed.reason}`)
console.log('checkPayment within limits: ok')

const paid = await noir.authorizePayment({
  agent,
  deviceHash,
  merchant: merchant.publicKey,
  asset,
  amount: payAmount,
})
record('authorizePayment (agent)', paid.hash)

const pending = await noir.getPendingBalance(merchant.publicKey)
if (pending < payAmount) throw new Error(`Expected at least ${payAmount} pending, got ${pending}`)
console.log(`Merchant pending: ${fromStroops(pending)} XLM`)

const claimed = await noir.claim({ merchant, token: asset })
record('claim (merchant)', claimed.hash)

const escrowAfter = await noir.getEscrowBalance(deviceHash)
const pendingAfter = await noir.getPendingBalance(merchant.publicKey)
if (escrowAfter !== fundAmount - payAmount) throw new Error(`Unexpected escrow after payment: ${escrowAfter}`)
if (pendingAfter !== 0n) throw new Error(`Unexpected pending after claim: ${pendingAfter}`)
console.log(`After claim: escrow ${fromStroops(escrowAfter)} XLM, pending ${fromStroops(pendingAfter)} XLM`)

saveProof('Yes. The treasury funded a card owned by a different wallet, and the agent then spent from it.')
console.log('\nSpike passed. Proof saved to docs/testnet-proof.md')
