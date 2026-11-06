// Developer tool: takes Testnet XLM off the demo card and back to the OFW, to set up a demo
// run. `pnpm defund:demo 24`. Like fund-demo.ts, it isn't reachable from the server.
import { NoirAgentClient, fromStroops, keypairSigner, toStroops } from '@noirx402/agent-sdk'
import { XLM_ASSET, deviceHashFromUid, explorerTxUrl } from '@tamsi/agent'

const amountArg = process.argv[2]
const { OFW_SECRET, DEMO_CARD_UID } = process.env
if (!amountArg) throw new Error('Usage: pnpm defund:demo <amount in XLM>')
if (!OFW_SECRET || !DEMO_CARD_UID) throw new Error('Run pnpm setup:testnet first.')

const noir = new NoirAgentClient()
const deviceHash = deviceHashFromUid(DEMO_CARD_UID)
const { hash } = await noir.execute(keypairSigner(OFW_SECRET), {
  kind: 'defundEscrow',
  deviceHash,
  token: XLM_ASSET,
  amount: toStroops(amountArg),
})
console.log(`defundEscrow: ${explorerTxUrl(hash)}`)
console.log(`Card balance: ${fromStroops(await noir.getEscrowBalance(deviceHash))} XLM`)
