// Where Velo sends the payer back. This page only reads: coming back here never funds
// anything. The card is funded by the verified webhook, and this waits to hear about it.
import { useEffect, useState } from 'react'
import type { TopupDetail, TopupStatus } from '@tamsi/shared'
import { getJson } from './api.ts'

const POLL_MS = 3_000

const STATUS_VIEW: Record<TopupStatus, { className: string; icon: string; word: string; text: string }> = {
  created: {
    className: 'waiting',
    icon: '⋯',
    word: 'Waiting',
    text: "We're waiting for confirmation of your payment. This page updates by itself.",
  },
  paid: {
    className: 'waiting',
    icon: '⋯',
    word: 'Paid',
    text: 'Your payment is confirmed. Putting it on the card now.',
  },
  funded: {
    className: 'approved',
    icon: '✓',
    word: 'Funded',
    text: 'Your padala is on the card.',
  },
  fund_failed: {
    className: 'declined',
    icon: '!',
    word: 'Not on the card yet',
    text: "Your payment went through, but it hasn't reached the card. Check your receipts before sending again.",
  },
}

export function PaySuccess() {
  const topupId = new URLSearchParams(window.location.search).get('topup')
  const [topup, setTopup] = useState<TopupDetail | null>(null)
  const [missing, setMissing] = useState(!topupId)

  useEffect(() => {
    if (!topupId) return
    let closed = false
    let timer: ReturnType<typeof setTimeout>
    async function poll() {
      try {
        const latest = await getJson<TopupDetail>(`/api/topups/${encodeURIComponent(topupId!)}`)
        if (closed) return
        setTopup(latest)
        if (latest.status === 'funded' || latest.status === 'fund_failed') return
      } catch (err) {
        if (closed) return
        if (err instanceof Error && err.message.endsWith('404')) {
          setMissing(true)
          return
        }
      }
      timer = setTimeout(poll, POLL_MS)
    }
    void poll()
    return () => {
      closed = true
      clearTimeout(timer)
    }
  }, [topupId])

  const view = topup ? STATUS_VIEW[topup.status] : STATUS_VIEW.created
  return (
    <main className="page pay">
      <h1>Send padala</h1>
      {missing ? (
        <p className="load-error">We can't find this padala. Your receipts on the card page are always up to date.</p>
      ) : (
        <section className={`decision ${view.className}`} aria-live="polite">
          <div className="decision-word">
            <span aria-hidden="true">{view.icon}</span> {view.word}
          </div>
          {topup && <p className="decision-amount">{topup.amount.xlm} XLM</p>}
          <p className="decision-reason">{view.text}</p>
          {topup?.explorerUrl && (
            <a className="explorer-link" href={topup.explorerUrl} target="_blank" rel="noreferrer">
              View on Stellar Expert
            </a>
          )}
        </section>
      )}
      <a className="button secondary pay-back" href="/ofw">
        Back to the card
      </a>
    </main>
  )
}

export function PayCancel() {
  return (
    <main className="page pay">
      <h1>Padala cancelled</h1>
      <p className="lede">Nothing was paid, and the card hasn't changed.</p>
      <a className="button primary" href="/ofw">
        Back to the card
      </a>
    </main>
  )
}
