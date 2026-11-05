// The Tamsi agent's only door to Noir: the SDK client, with the built-in TESTNET contracts.
import { createHash } from 'node:crypto'
import { Asset, Networks } from '@stellar/stellar-sdk'
import type { NoirAgentClient, NoirSigner } from '@noirx402/agent-sdk'
import type { Chain } from './decide.ts'

export const XLM_ASSET = Asset.native().contractId(Networks.TESTNET)

// SHA-256 of the UID string, as hex. Tier 3 real tags must check this against Noir's NFC doc.
export function deviceHashFromUid(uid: string): string {
  return createHash('sha256').update(uid).digest('hex')
}

export function explorerTxUrl(hash: string): string {
  return `https://stellar.expert/explorer/testnet/tx/${hash}`
}

export function createNoirChain(noir: NoirAgentClient, agent: NoirSigner): Chain {
  return {
    getEscrowBalance: (deviceHash) => noir.getEscrowBalance(deviceHash),
    checkPayment: ({ deviceHash, amount }) =>
      noir.checkPayment({ deviceHash, agent: agent.publicKey, asset: XLM_ASSET, amount }),
    async authorizePayment({ deviceHash, merchant, amount }) {
      const paid = await noir.authorizePayment({ agent, deviceHash, merchant, asset: XLM_ASSET, amount })
      console.log(`authorizePayment: ${explorerTxUrl(paid.hash)}`)
      return paid
    },
  }
}
