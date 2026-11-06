// The kill switch. The order is agents.md rule 10: revoke the agent, then withdraw the full
// balance to the OFW. The device itself is never revoked. Each step is decided by a read, so
// retrying after a failure picks up where it stopped.
import type { NoirAgentClient, NoirSigner } from '@noirx402/agent-sdk'
import { XLM_ASSET, explorerTxUrl } from '@tamsi/agent'
import type { Store } from './db.ts'

export interface KillOutcome {
  revokeTxHash: string | null
  defundTxHash: string | null
  returned: bigint
}

export async function killCard(deps: {
  noir: Pick<NoirAgentClient, 'getPolicy' | 'getEscrowBalance' | 'execute'>
  ofw: NoirSigner
  store: Pick<Store, 'setCardStatus'>
  deviceHash: string
}): Promise<KillOutcome> {
  const { noir, ofw, store, deviceHash } = deps

  let revokeTxHash: string | null = null
  if (await noir.getPolicy(deviceHash)) {
    revokeTxHash = (await noir.execute(ofw, { kind: 'revokeAgent', deviceHash })).hash
    console.log(`revokeAgent: ${explorerTxUrl(revokeTxHash)}`)
  }
  // From here the agent can't pay, so the card reads as off even if the withdrawal fails.
  store.setCardStatus(deviceHash, 'revoked')

  const returned = await noir.getEscrowBalance(deviceHash)
  let defundTxHash: string | null = null
  if (returned > 0n) {
    defundTxHash = (await noir.execute(ofw, { kind: 'defundEscrow', deviceHash, token: XLM_ASSET, amount: returned })).hash
    console.log(`defundEscrow: ${explorerTxUrl(defundTxHash)}`)
  }
  return { revokeTxHash, defundTxHash, returned }
}
