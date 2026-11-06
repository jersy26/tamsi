// Where Velo sends the payer back. This page only reads: coming back here never funds
// anything. The card is funded by the verified webhook, and this waits to hear about it.
import { useEffect, useState } from 'react'
import { formatMoney, type TopupDetail, type TopupStatus } from '@tamsi/shared'
import { getJson } from './api.ts'
import { Decision, Header } from './parts.tsx'

const POLL_MS = 3_000

const STATUS_VIEW: Record<TopupStatus, { kind: 'ok' | 'no' | 'wt'; icon: string; word: string; text: string }> = {
  created: {
    kind: 'wt',
    icon: '⋯',
    word: 'Waiting',
    text: "We're waiting for confirmation of your payment. This page updates by itself.",
  },
  paid: {
    kind: 'wt',
    icon: '⋯',
    word: 'Paid',
    text: 'Your payment is confirmed. Putting it on the card now.',
  },
  funded: {
    kind: 'ok',
    icon: '✓',
    word: 'Funded',
    text: 'Your padala is on the card.',
  },
  fund_failed: {
    kind: 'no',
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
    <main className="screen">
      <Header title="Send padala" />
      {missing ? (
        <p className="err">We can't find this padala. Your receipts on the card page are always up to date.</p>
      ) : (
        <Decision kind={view.kind} icon={view.icon} word={view.word}>
          {topup && (
            <p className="da">
              {formatMoney(topup.amount)}
              {topup.amount.php !== null && <small> ≈ {topup.amount.xlm} XLM</small>}
            </p>
          )}
          <p className="dr">{view.text}</p>
          {topup?.explorerUrl && (
            <a className="tx" href={topup.explorerUrl} target="_blank" rel="noreferrer">
              View on Stellar Expert ↗
            </a>
          )}
        </Decision>
      )}
      <a className="cta ghost" href="/ofw">
        Back to the card
      </a>
    </main>
  )
}

export function PayCancel() {
  return (
    <main className="screen">
      <Header title="Padala cancelled" />
      <section className="hero vi home">
        <p className="lede">Nothing was paid, and the card hasn't changed.</p>
      </section>
      <a className="cta bt" href="/ofw">
        Back to the card
      </a>
    </main>
  )
}
