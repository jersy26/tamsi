// Noir events become the OFW's receipts. One noir.watch serves the whole server. It starts
// from the last saved ledger, so a restart backfills what it missed; each event is saved
// once (dedupe on event.id, agents.md rule 6) and only then pushed to the open SSE streams.
import { fromStroops, type NoirAgentClient, type NoirEvent } from '@noirx402/agent-sdk'
import { explorerTxUrl } from '@tamsi/agent'
import { FEED_EVENT_TYPES, declinedText, feedText, type FeedItem } from '@tamsi/shared'
import type { DeclinedTap, StoredNoirEvent, Store, TopupRecord } from './db.ts'
import { toMoney } from './money.ts'

// RPC keeps about 7 days (~120,000 ledgers) and rejects older ones.
const MAX_BACKFILL_LEDGERS = 100_000
const RETRY_MS = 5_000
const FEED_LENGTH = 30

type Listener = (item: FeedItem) => void

export function createFeed(deps: {
  noir: Pick<NoirAgentClient, 'getEvents' | 'watch'>
  store: Store
  phpPerXlm: bigint | null
}) {
  const { noir, store, phpPerXlm } = deps
  const listeners = new Map<Listener, string>()
  const status = { watching: false, eventsSaved: 0, lastError: null as string | null }

  function toItem(event: StoredNoirEvent): FeedItem {
    const amount = event.amount === undefined ? null : BigInt(event.amount)
    // The agent's own sentence when this server made the payment.
    const reason = event.type === 'payment.authorized' ? store.tapReasonByTx(event.txHash) : null
    const merchantName = event.merchant ? store.getMerchantByAddress(event.merchant)?.name : undefined
    return {
      id: event.id,
      type: event.type,
      text:
        reason ??
        feedText(event.type, {
          ...(amount !== null && { amountXlm: fromStroops(amount) }),
          ...(merchantName && { merchantName }),
        }),
      amount: amount === null ? null : toMoney(amount, phpPerXlm),
      at: event.ledgerClosedAt,
      explorerUrl: explorerTxUrl(event.txHash),
    }
  }

  function declinedItem(tap: DeclinedTap): FeedItem {
    return {
      id: `tap-${tap.id}`,
      type: 'tap.declined',
      text: declinedText(tap.reasonCode, {
        amountXlm: fromStroops(tap.amount),
        merchantName: tap.merchantName ?? 'A shop',
      }),
      amount: toMoney(tap.amount, phpPerXlm),
      at: tap.createdAt,
      explorerUrl: null,
    }
  }

  function requestItem(topup: TopupRecord): FeedItem {
    return {
      id: `topup-${topup.id}`,
      type: 'topup.requested',
      text: topup.reasonText ?? '',
      amount: toMoney(topup.amount, phpPerXlm),
      at: topup.createdAt ?? new Date().toISOString(),
      explorerUrl: null,
    }
  }

  function pushToCard(deviceHash: string, item: FeedItem) {
    for (const [listener, listenerHash] of listeners) {
      if (listenerHash === deviceHash) listener(item)
    }
  }

  // A merchant's claim names no card, so it goes to every stream.
  function push(event: StoredNoirEvent) {
    const item = toItem(event)
    for (const [listener, deviceHash] of listeners) {
      if (event.deviceHash === undefined || event.deviceHash === deviceHash) listener(item)
    }
  }

  function isOurs(event: NoirEvent): boolean {
    if ('deviceHash' in event) return store.getCard(event.deviceHash) !== null
    return 'merchant' in event && store.getMerchantByAddress(event.merchant) !== null
  }

  function receive(event: NoirEvent) {
    if (!isOurs(event)) return
    const saved = store.saveNoirEvent(event)
    if (!saved) return
    status.eventsSaved += 1
    push(saved)
  }

  return {
    receive,

    // Retries until the RPC answers, so a chain hiccup at boot doesn't leave the feed dead.
    async start() {
      for (;;) {
        try {
          const { latestLedger } = await noir.getEvents({ limit: 1 })
          const fromLedger = Math.max(store.lastNoirLedger() ?? 0, latestLedger - MAX_BACKFILL_LEDGERS)
          noir.watch({
            types: [...FEED_EVENT_TYPES],
            fromLedger,
            // The SDK has already moved its cursor past this page, so a throw here would
            // lose the rest of it. Log and carry on with the next event.
            onEvent: (event) => {
              try {
                receive(event)
              } catch (err) {
                console.error(`Could not save Noir event ${event.id}:`, err)
              }
            },
            onError: (err) => {
              status.lastError = err instanceof Error ? err.message : String(err)
              console.error('noir.watch:', status.lastError)
            },
          })
          status.watching = true
          console.log(`noir.watch started from ledger ${fromLedger} (latest ${latestLedger})`)
          return
        } catch (err) {
          status.lastError = err instanceof Error ? err.message : String(err)
          console.error('Could not start noir.watch, retrying:', status.lastError)
          await new Promise((resolve) => setTimeout(resolve, RETRY_MS))
        }
      }
    },

    // Chain events and declined taps, newest first. Dates are compared as instants
    // because the chain and this server format them differently.
    list(deviceHash: string): FeedItem[] {
      return [
        ...store.listNoirEvents(deviceHash, FEED_LENGTH).map(toItem),
        ...store.listDeclinedTaps(deviceHash, FEED_LENGTH).map(declinedItem),
        ...store.listAgentTopups(deviceHash, FEED_LENGTH).map(requestItem),
      ]
        .sort((a, b) => Date.parse(b.at) - Date.parse(a.at))
        .slice(0, FEED_LENGTH)
    },

    // A declined tap never reaches the chain, so the watcher won't see it.
    tapDeclined(deviceHash: string, tapId: string) {
      const tap = store.listDeclinedTaps(deviceHash, FEED_LENGTH).find((row) => row.id === tapId)
      if (tap) pushToCard(deviceHash, declinedItem(tap))
    },

    topupRequested(topup: TopupRecord) {
      pushToCard(topup.deviceHash, requestItem(topup))
    },

    subscribe(deviceHash: string, listener: Listener): () => void {
      listeners.set(listener, deviceHash)
      return () => listeners.delete(listener)
    },

    // The event can reach the watcher before /api/taps has saved the tap. Once it has,
    // push the receipt again with the agent's sentence; screens replace it by id.
    tapSaved(txHash: string) {
      for (const event of store.noirEventsByTx(txHash)) push(event)
    },

    status: () => ({ ...status }),
  }
}

export type Feed = ReturnType<typeof createFeed>
