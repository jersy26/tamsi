// Padala in through Velo. A card is funded only after a verified payment.succeeded webhook
// and a retrieved intent that says paid (agents.md rule 7), never from a browser redirect.
import { randomUUID } from 'node:crypto'
import { Velo, type WebhookEvent } from '@carts1024/velo-sdk'
import { fromStroops, toStroops } from '@noirx402/agent-sdk'
import { SerialQueue, TOPUP_MINIMUM, explorerTxUrl, planTopup } from '@tamsi/agent'
import { formatMoney, topupRequestText, type ReasonCode } from '@tamsi/shared'
import type { Store, TopupRecord } from './db.ts'
import { toMoney } from './money.ts'

// SDD §3 assumes Velo takes this for XLM. Its docs only show USDC, so the first real
// checkout has to confirm it.
const VELO_ASSET = 'native'
// Velo's checkouts expire after 30 minutes, so a request is only open that long.
export const CHECKOUT_LIFETIME_MS = 30 * 60 * 1000
const WEEK_MS = 7 * 24 * 60 * 60 * 1000

export function createTopups(deps: {
  velo: Pick<Velo, 'checkout' | 'paymentIntents'>
  webhookSecret: string
  publicUrl: string
  store: Store
  fund(deviceHash: string, amount: bigint): Promise<string>
  getBalance(deviceHash: string): Promise<bigint>
  onRequested(topup: TopupRecord): void
  phpPerXlm?: bigint | null
}) {
  const { velo, webhookSecret, publicUrl, store, fund, getBalance, onRequested, phpPerXlm = null } = deps
  // The formula reads in pesos when there's a rate. In XLM only the total carries the unit.
  const term = (stroops: bigint) => (phpPerXlm === null ? fromStroops(stroops) : formatMoney(toMoney(stroops, phpPerXlm)))
  const requestQueue = new SerialQueue()
  // Treasury transactions share one sequence number, so they go one at a time.
  const treasuryQueue = new SerialQueue()

  async function settle(paymentIntentId: string): Promise<void> {
    const topup = store.getTopupByIntent(paymentIntentId)
    if (!topup) {
      console.warn(`Velo paid an intent we don't know: ${paymentIntentId}`)
      return
    }
    const intent = await velo.paymentIntents.retrieve(paymentIntentId)
    if (intent.status !== 'paid') {
      console.warn(`Velo says ${paymentIntentId} is ${intent.status}, not paid. Not funding.`)
      return
    }
    if (toStroops(intent.amount) !== topup.amount) {
      console.error(`Top-up ${topup.id} expected ${fromStroops(topup.amount)}, Velo paid ${intent.amount}. Not funding.`)
      return
    }
    // Only one caller moves it out of `created`, so a second event for this intent funds nothing.
    if (!store.markTopupPaid(topup.id)) return
    try {
      const hash = await treasuryQueue.run('treasury', () => fund(topup.deviceHash, topup.amount))
      store.markTopupFunded(topup.id, hash)
      console.log(`fundEscrow: ${explorerTxUrl(hash)}`)
    } catch (err) {
      // The transaction may still have landed, so this never retries on its own.
      store.markTopupFailed(topup.id)
      console.error(`Could not fund top-up ${topup.id}:`, err)
    }
  }

  async function create(
    deviceHash: string,
    amount: bigint,
    requestedBy: TopupRecord['requestedBy'],
    reasonText: string | null = null,
  ): Promise<TopupRecord> {
    const id = randomUUID()
    const session = await velo.checkout.sessions.create(
      {
        amount: fromStroops(amount),
        asset: VELO_ASSET,
        description: 'Padala to the family card',
        successUrl: `${publicUrl}/pay/success?topup=${id}`,
        cancelUrl: `${publicUrl}/pay/cancel`,
      },
      { idempotencyKey: id },
    )
    return store.createTopup({
      id,
      deviceHash,
      amount,
      requestedBy,
      paymentIntentId: session.paymentIntentId,
      checkoutUrl: session.checkoutUrl,
      reasonText,
    })
  }

  return {
    create,

    // After a tap: the agent asks for padala when the ipon stopped it, or when a payment left
    // the card low. One open request at a time, so repeated taps don't pile up checkouts.
    considerRequest(deviceHash: string, reasonCode: ReasonCode): Promise<TopupRecord | null> {
      if (reasonCode !== 'ipon_floor' && reasonCode !== 'paid') return Promise.resolve(null)
      return requestQueue.run(deviceHash, async () => {
        const now = new Date()
        if (store.openAgentTopup(deviceHash, new Date(now.getTime() - CHECKOUT_LIFETIME_MS))) return null
        const card = store.getCardDetail(deviceHash)
        if (!card || card.status !== 'active') return null
        const balance = await getBalance(deviceHash)
        const plan = planTopup({
          spentLast7Days: store.spentSince(deviceHash, new Date(now.getTime() - WEEK_MS)),
          dailyCap: card.dailyCap,
          iponFloor: card.iponFloor,
          balance,
          nextPayday: new Date(card.nextPayday),
          now,
        })
        if (reasonCode === 'paid' && !plan.low) return null
        const text = topupRequestText({
          amount: formatMoney(toMoney(plan.amount, phpPerXlm)),
          avgDaily: term(plan.avgDailySpend),
          days: plan.days.toString(),
          ipon: term(card.iponFloor),
          balance: term(balance),
          minimum: term(TOPUP_MINIMUM),
        })
        const topup = await create(deviceHash, plan.amount, 'agent', text)
        onRequested(topup)
        console.log(`Agent requested padala: ${text}`)
        return topup
      })
    },

    // Answers fast. `settled` is the work the caller leaves running after the 2xx.
    async receiveWebhook(req: {
      payload: string
      signature: string | null
      deliveryId: string | null
    }): Promise<{ status: number; settled: Promise<void> }> {
      const done = Promise.resolve()
      let event: WebhookEvent
      try {
        event = await Velo.webhooks.verify({ payload: req.payload, signature: req.signature, secret: webhookSecret })
      } catch (err) {
        console.warn('Velo webhook refused:', err instanceof Error ? err.message : err)
        return { status: 400, settled: done }
      }
      if (!req.deliveryId) return { status: 400, settled: done }
      if (!store.recordVeloDelivery(req.deliveryId)) return { status: 200, settled: done }
      if (event.type !== 'payment.succeeded') return { status: 200, settled: done }
      return {
        status: 200,
        settled: settle(event.paymentIntent.id).catch((err) => {
          console.error(`Could not settle ${event.type} delivery ${req.deliveryId}:`, err)
        }),
      }
    },
  }
}

export type Topups = ReturnType<typeof createTopups>
