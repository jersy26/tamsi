// The OFW's view: is my family okay, how much is left, did anything odd happen. Three
// numbers, then the receipts. New receipts arrive over SSE; every number comes from the server.
import { useEffect, useRef, useState, type FormEvent } from 'react'
import type { CardDetail, CardSummary, FeedItem, FeedItemType, Money, TopupDetail } from '@tamsi/shared'
import { getJson } from './api.ts'

const RECEIPT_ICONS: Record<FeedItemType, { icon: string; className: string }> = {
  'payment.authorized': { icon: '✓', className: 'paid' },
  'payment.claimed': { icon: '₱', className: '' },
  'escrow.funded': { icon: '↓', className: 'funded' },
  'escrow.defunded': { icon: '↩', className: '' },
  'agent.revoked': { icon: '✕', className: 'off' },
  'tap.declined': { icon: '✕', className: 'declined' },
  'topup.requested': { icon: '₱', className: 'funded' },
}

function formatPesos(php: string): string {
  return php.replace(/\B(?=(\d{3})+$)/g, ',')
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}

function NumberTile(props: { label: string; money: Money | null; note?: string; lead?: boolean }) {
  const { label, money, note, lead } = props
  return (
    <div className={lead ? 'number lead' : 'number'}>
      <dt>{label}</dt>
      <dd>
        <span className="number-value">
          {money ? money.xlm : '—'} {money && <span className="number-unit">XLM</span>}
        </span>
        {money?.php != null && <span className="number-note">≈ ₱{formatPesos(money.php)}</span>}
        {note && <span className="number-note">{note}</span>}
      </dd>
    </div>
  )
}

const AMOUNT_PATTERN = /^\d+(\.\d{1,7})?$/
// A plain zero in any form: "0", "00", "0.00".
const ZERO_PATTERN = /^0+(\.0*)?$/

function SendPadala({ deviceHash }: { deviceHash: string }) {
  const [amount, setAmount] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const valid = AMOUNT_PATTERN.test(amount) && !ZERO_PATTERN.test(amount)

  async function send(event: FormEvent) {
    event.preventDefault()
    if (!valid || sending) return
    setSending(true)
    setError(null)
    try {
      const res = await fetch('/api/topups', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deviceHash, amount }),
      })
      if (!res.ok) throw new Error(`Top-up answered ${res.status}`)
      const { checkoutUrl } = (await res.json()) as TopupDetail
      if (!checkoutUrl) throw new Error('No checkout link')
      window.location.assign(checkoutUrl)
    } catch {
      setError("We couldn't open the checkout. Try again in a moment.")
      setSending(false)
    }
  }

  return (
    <form className="padala" onSubmit={send}>
      <label className="padala-field">
        <span>Send padala (XLM)</span>
        <input
          inputMode="decimal"
          autoComplete="off"
          placeholder="0"
          value={amount}
          onChange={(event) => setAmount(event.target.value.trim())}
        />
      </label>
      <button className="button primary" type="submit" disabled={!valid || sending}>
        {sending ? 'Opening…' : 'Send padala'}
      </button>
      {error && <p className="padala-error">{error}</p>}
    </form>
  )
}

function Receipt({ item }: { item: FeedItem }) {
  const { icon, className } = RECEIPT_ICONS[item.type]
  return (
    <li className="receipt">
      <span className={`receipt-icon ${className}`} aria-hidden="true">
        {icon}
      </span>
      <div className="receipt-body">
        <p className="receipt-text">{item.text}</p>
        <p className="receipt-meta">
          {formatTime(item.at)}
          {item.amount?.php != null && ` · ≈ ₱${formatPesos(item.amount.php)}`}
          {item.explorerUrl && (
            <>
              <br />
              <a href={item.explorerUrl} target="_blank" rel="noreferrer">
                View on Stellar Expert
              </a>
            </>
          )}
        </p>
      </div>
    </li>
  )
}

export function Ofw() {
  const [card, setCard] = useState<CardDetail | null>(null)
  const [live, setLive] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const latestRequest = useRef(0)

  useEffect(() => {
    let closed = false
    let stream: EventSource | null = null

    // Only the newest answer counts, so a slow reply can't undo a newer one.
    async function refresh(deviceHash: string) {
      const request = ++latestRequest.current
      const detail = await getJson<CardDetail>(`/api/cards/${deviceHash}`)
      if (!closed && request === latestRequest.current) {
        setCard(detail)
        setLoadError(null)
      }
    }

    getJson<CardSummary[]>('/api/cards')
      .then((cards) => {
        const deviceHash = cards[0]?.deviceHash
        if (!deviceHash) throw new Error('No card yet')
        if (closed) return
        stream = new EventSource(`/api/stream/${deviceHash}`)
        // Also fires on every reconnect, which picks up what patchy Wi-Fi missed.
        stream.onopen = () => {
          setLive(true)
          refresh(deviceHash).catch(() => setLoadError("We couldn't update the card. It'll retry on its own."))
        }
        stream.onerror = () => setLive(false)
        stream.addEventListener('feed', (message) => {
          const item = JSON.parse((message as MessageEvent<string>).data) as FeedItem
          setCard(
            (current) =>
              current && {
                ...current,
                feed: current.feed.some((known) => known.id === item.id)
                  ? current.feed.map((known) => (known.id === item.id ? item : known))
                  : [item, ...current.feed],
              },
          )
          void refresh(deviceHash).catch(() => {})
        })
      })
      .catch(() => setLoadError("The card couldn't load. Refresh to try again."))

    return () => {
      closed = true
      stream?.close()
    }
  }, [])

  const hasPesos = card?.balance?.php != null

  return (
    <main className="page ofw">
      <div className="ofw-head">
        <h1>{card ? `${card.holderName}'s card` : 'Family card'}</h1>
        <span className={live ? 'live on' : 'live'}>{live ? 'Live' : 'Connecting…'}</span>
      </div>
      {loadError && <p className="load-error">{loadError}</p>}
      {card && (
        <>
          {card.status !== 'active' && <p className="card-off">Spending on this card is turned off.</p>}
          <dl className="numbers">
            <NumberTile
              lead
              label="Left today"
              money={card.leftToday}
              note={
                card.leftLimitedByIpon
                  ? `Spent ${card.spentToday.xlm} of ${card.rules.dailyCap.xlm} XLM today. The rest is kept as ipon.`
                  : `Spent ${card.spentToday.xlm} of ${card.rules.dailyCap.xlm} XLM today`
              }
            />
            <NumberTile label="Balance" money={card.balance} />
            <NumberTile label="Ipon kept" money={card.iponKept} />
          </dl>
          {hasPesos && <p className="rate-note">Demo rate — Testnet XLM, no real money.</p>}
          {card.topupRequest?.checkoutUrl && (
            <section className="topup-request">
              <h2>The agent is asking for padala</h2>
              <p>{card.topupRequest.text}</p>
              <a className="button primary" href={card.topupRequest.checkoutUrl}>
                Pay {card.topupRequest.amount.xlm} XLM
              </a>
            </section>
          )}
          {card.padalaEnabled && <SendPadala deviceHash={card.deviceHash} />}

          <h2 className="feed-title">Receipts</h2>
          {card.feed.length === 0 ? (
            <p className="feed-empty">No receipts yet. They'll show up here the moment {card.holderName} taps.</p>
          ) : (
            <ul className="feed">
              {card.feed.map((item) => (
                <Receipt key={item.id} item={item} />
              ))}
            </ul>
          )}
        </>
      )}
    </main>
  )
}
