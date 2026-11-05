// Developer tool: puts Testnet XLM on the demo card from the treasury, for testing taps
// without a checkout. `pnpm fund:demo 60`. It isn't reachable from the server, so the only
// way the running app funds a card stays the verified Velo webhook (agents.md rule 7).
import { NoirAgentClient, fromStroops, keypairSigner, toStroops } from '@noirx402/agent-sdk'
import { XLM_ASSET, deviceHashFromUid, explorerTxUrl } from '@tamsi/agent'

const amountArg = process.argv[2]
const { TREASURY_SECRET, DEMO_CARD_UID } = process.env
if (!amountArg) throw new Error('Usage: pnpm fund:demo <amount in XLM>')
if (!TREASURY_SECRET || !DEMO_CARD_UID) throw new Error('Run pnpm setup:testnet first.')

const noir = new NoirAgentClient()
const deviceHash = deviceHashFromUid(DEMO_CARD_UID)
const { hash } = await noir.execute(keypairSigner(TREASURY_SECRET), {
  kind: 'fundEscrow',
  deviceHash,
  token: XLM_ASSET,
  amount: toStroops(amountArg),
})
console.log(`fundEscrow: ${explorerTxUrl(hash)}`)
console.log(`Card balance: ${fromStroops(await noir.getEscrowBalance(deviceHash))} XLM`)
