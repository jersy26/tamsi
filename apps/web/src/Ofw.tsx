// The OFW's view: is my family okay, how much is left, did anything odd happen. Left today
// first, then the actions, then the receipts. New receipts arrive over SSE; every number comes
// from the server. Send padala and Turn off open their own sheets on this same page.
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { formatMoney, percentOf, pesosToXlm, withCommas, type CardDetail, type CardSummary, type FeedItem, type FeedItemType, type KillResult, type Money, type TopupDetail } from '@tamsi/shared'
import { getJson } from './api.ts'
import { Bird, Header, Icon, Keypad, typeKey } from './parts.tsx'

const RECEIPT_ICONS: Record<FeedItemType, { icon: string; className: string }> = {
  'payment.authorized': { icon: '✓', className: 'lm' },
  'payment.claimed': { icon: '₱', className: 'vi' },
  'escrow.funded': { icon: '↓', className: 'bt' },
  'escrow.defunded': { icon: '↩', className: 'sk' },
  'agent.revoked': { icon: '✕', className: 'ch' },
  'tap.declined': { icon: '✕', className: 'ch' },
  'topup.requested': { icon: '₱', className: 'bt' },
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}

// The line is a meter: the marker sits at spent ÷ the day's limit.
const WAVE_WIDTH = 348
const BUBBLE_WIDTH = 150
const waveY = (x: number) => 30 + 13 * Math.sin(x / 38) + 7 * Math.sin(x / 15)
const WAVE_PATH = Array.from({ length: WAVE_WIDTH / 6 + 1 }, (_, i) => `${i ? 'L' : 'M'}${i * 6} ${waveY(i * 6).toFixed(1)}`).join('')

function SpendMeter({ spent, cap, label }: { spent: Money; cap: Money; label: string }) {
  const percent = percentOf(spent, cap)
  const x = (WAVE_WIDTH * percent) / 100
  const bubble = Math.min(Math.max(x - 44, 0), WAVE_WIDTH - BUBBLE_WIDTH)
  return (
    <div className="wave">
      <svg viewBox={`0 0 ${WAVE_WIDTH} 60`} aria-hidden="true">
        <path d={WAVE_PATH} className="w0" />
        <path d={WAVE_PATH} className="w1" pathLength={100} strokeDasharray={`${percent} 100`} />
        <circle cx={Math.max(x, 7)} cy={waveY(x)} r={7} className="wd" />
      </svg>
      <span className="bub" style={{ left: `${(bubble / WAVE_WIDTH) * 100}%` }}>
        {label}
      </span>
    </div>
  )
}

function LeftToday({ card }: { card: CardDetail }) {
  const { leftToday: left, spentToday: spent, rules } = card
  const off = card.status !== 'active'
  const range =
    spent.php === null
      ? `${spent.xlm} of ${rules.dailyCap.xlm}`
      : `${formatMoney(spent)} of ${formatMoney(rules.dailyCap)}`
  return (
    <section className={off ? 'hero flat' : 'hero grad'}>
      {!off && <Bird />}
      <span className="lab">Left today</span>
      {left.php === null ? (
        <div className="big">
          {left.xlm} <small>XLM</small>
        </div>
      ) : (
        <>
          <div className="big">{formatMoney(left)}</div>
          <div className="sub">≈ {left.xlm} XLM</div>
        </>
      )}
      <SpendMeter spent={spent} cap={rules.dailyCap} label={`Spent ${range}`} />
      <p className="note">
        Spent {range}
        {spent.php === null && ' XLM'} today{card.leftLimitedByIpon && '. The rest is kept as ipon.'}
      </p>
    </section>
  )
}

function MoneyRow({ icon, label, money }: { icon: ReactNode; label: string; money: Money | null }) {
  return (
    <div className="mrow">
      <span className="ic gy">{icon}</span>
      <b>{label}</b>
      <span className="mv">
        {money ? formatMoney(money) : '—'}
        {money?.php != null && <small>≈ {money.xlm} XLM</small>}
      </span>
    </div>
  )
}

function Receipt({ item }: { item: FeedItem }) {
  const { icon, className } = RECEIPT_ICONS[item.type]
  return (
    <li className="rc">
      <span className={`ic ${className}`} aria-hidden="true">
        {icon}
      </span>
      <div>
        <p>{item.text}</p>
        <div className="rm">
          <span>{formatTime(item.at)}</span>
          {item.amount?.php != null && <b>≈ {item.amount.xlm} XLM</b>}
        </div>
        {item.explorerUrl && (
          <a className="tx" href={item.explorerUrl} target="_blank" rel="noreferrer">
            View on Stellar Expert ↗
          </a>
        )}
      </div>
    </li>
  )
}

const XLM_PATTERN = /^\d+(\.\d{1,7})?$/
const PESO_PATTERN = /^\d+(\.\d{1,2})?$/
// A plain zero in any form: "0", "00", "0.00".
const ZERO_PATTERN = /^0+(\.0*)?$/

function PadalaSheet({ card, onBack }: { card: CardDetail; onBack(): void }) {
  const rate = card.phpPerXlm
  const [amount, setAmount] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const typed = (rate === null ? XLM_PATTERN : PESO_PATTERN).test(amount)
  const amountXlm = rate !== null && typed ? pesosToXlm(amount, rate) : amount
  const valid = typed && !ZERO_PATTERN.test(amountXlm)
  const pressKey = useCallback(
    (key: string) => setAmount((current) => typeKey(current, key, rate === null ? 7 : 2)),
    [rate],
  )

  async function send() {
    if (!valid || sending) return
    setSending(true)
    setError(null)
    try {
      const res = await fetch('/api/topups', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deviceHash: card.deviceHash, amount: amountXlm }),
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

  const value = (
    <div className={amount ? 'amt' : 'amt ph'}>
      {rate === null ? (
        <>
          {amount || '0'}
          <small> XLM</small>
        </>
      ) : (
        <>
          ₱{withCommas(amount || '0')}
          {typed && <small> ≈ {amountXlm} XLM</small>}
        </>
      )}
    </div>
  )
  return (
    <main className="screen">
      <Header title="Send padala" back={onBack} />
      <section className="wcard">
        <div className="wtop">
          <span className="ic gy">₱</span>
          <b>Your padala</b>
          <em>You send</em>
        </div>
        {value}
      </section>
      <div className="swap">
        <i aria-hidden="true">↓</i>
      </div>
      <section className="gcard vi">
        <div className="wtop">
          <span className="ic wh">{card.holderName.slice(0, 1)}</span>
          <div>
            <b>{card.holderName}'s card</b>
            <small>{card.label}</small>
          </div>
          <em>Lands on</em>
        </div>
        {value}
      </section>
      <Keypad onKey={pressKey} disabled={sending} />
      {error && <p className="err">{error}</p>}
      <button className="cta bt" type="button" disabled={!valid || sending} onClick={send}>
        {sending ? 'Opening…' : 'Send padala'}
      </button>
    </main>
  )
}

const PIN_DOTS = 4

function TurnOffSheet(props: { deviceHash: string; onBack(): void; onDone(result: KillResult): void }) {
  const { deviceHash, onBack, onDone } = props
  const [pin, setPin] = useState('')
  const [working, setWorking] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const pressKey = useCallback((key: string) => setPin((current) => typeKey(current, key, 0)), [])

  async function turnOff() {
    setWorking(true)
    setError(null)
    try {
      const res = await fetch(`/api/cards/${deviceHash}/kill`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin }),
      })
      if (res.status === 403) {
        setError("That PIN isn't right.")
        setWorking(false)
        return
      }
      if (!res.ok) throw new Error(`Kill answered ${res.status}`)
      onDone((await res.json()) as KillResult)
    } catch {
      setError("It didn't finish. Try again; it picks up where it stopped.")
      setWorking(false)
    }
  }

  return (
    <main className="screen">
      <Header title="Turn off this card" back={working ? undefined : onBack} />
      <section className="gcard hot">
        <h2>This stops all spending right away and brings the whole balance back to you.</h2>
      </section>
      <section className="wcard">
        <div className="wtop">
          <span className="ic gy">
            <Icon name="power" />
          </span>
          <b>PIN</b>
        </div>
        <div className="pin" role="status" aria-label={`${pin.length} digits entered`}>
          {Array.from({ length: Math.max(PIN_DOTS, pin.length) }, (_, i) => (i < pin.length ? <i key={i} /> : <u key={i} />))}
        </div>
      </section>
      <Keypad onKey={pressKey} disabled={working} decimal={false} />
      {error && (
        <p className="err" aria-live="polite">
          {error}
        </p>
      )}
      <button className="cta ch" type="button" disabled={working || !pin} onClick={turnOff}>
        {working ? 'Turning off… about a minute' : 'Turn off and bring the money back'}
      </button>
      <button className="cta ghost" type="button" disabled={working} onClick={onBack}>
        Keep the card on
      </button>
    </main>
  )
}

export function Ofw() {
  const [card, setCard] = useState<CardDetail | null>(null)
  const [live, setLive] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [sheet, setSheet] = useState<'padala' | 'turn-off' | null>(null)
  const [killed, setKilled] = useState<KillResult | null>(null)
  const latestRequest = useRef(0)
  const refreshCard = useRef<() => void>(() => {})
  const receipts = useRef<HTMLElement>(null)

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
        refreshCard.current = () => void refresh(deviceHash).catch(() => {})
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

  const active = card?.status === 'active'
  const closeSheet = useCallback(() => setSheet(null), [])
  const status = live ? undefined : <span className="live">Connecting…</span>

  if (card && sheet === 'padala' && active && card.padalaEnabled) {
    return <PadalaSheet card={card} onBack={closeSheet} />
  }
  if (card && sheet === 'turn-off' && card.killEnabled) {
    return (
      <TurnOffSheet
        deviceHash={card.deviceHash}
        onBack={closeSheet}
        onDone={(result) => {
          setKilled(result)
          setSheet(null)
          refreshCard.current()
        }}
      />
    )
  }

  return (
    <main className="screen">
      <Header title={card ? `${card.holderName}'s card` : 'Family card'} back="/" status={status} />
      {loadError && <p className="err">{loadError}</p>}
      {!card && !loadError && (
        <>
          <div className="sk-block tall" />
          <div className="sk-block" />
          <div className="sk-block" />
        </>
      )}
      {card && (
        <>
          {card.status !== 'active' && <p className="off">Spending on this card is turned off.</p>}
          {killed && (
            <section className="card" aria-live="polite">
              <p className="big-note">
                <strong>The card is off.</strong> {formatMoney(killed.returned)} came back to you.
              </p>
              {killed.revokeExplorerUrl && (
                <a className="tx" href={killed.revokeExplorerUrl} target="_blank" rel="noreferrer">
                  Spending turned off: View on Stellar Expert ↗
                </a>
              )}
              {killed.defundExplorerUrl && (
                <a className="tx" href={killed.defundExplorerUrl} target="_blank" rel="noreferrer">
                  Money returned: View on Stellar Expert ↗
                </a>
              )}
            </section>
          )}
          <LeftToday card={card} />
          {active && card.topupRequest?.checkoutUrl && (
            <section className="req">
              <h2>The agent is asking for padala</h2>
              <p>{card.topupRequest.text}</p>
              <a className="cta ink" href={card.topupRequest.checkoutUrl}>
                Pay {formatMoney(card.topupRequest.amount)}
              </a>
            </section>
          )}
          {active && (card.padalaEnabled || card.killEnabled) && (
            <nav className="acts">
              {card.padalaEnabled && (
                <button className="act burst" type="button" onClick={() => setSheet('padala')}>
                  <i aria-hidden="true">+</i>Send padala
                </button>
              )}
              <button className="act c1" type="button" onClick={() => receipts.current?.scrollIntoView({ behavior: 'smooth' })}>
                <i aria-hidden="true">≡</i>Receipts
              </button>
              {card.killEnabled && (
                <button className="act c2" type="button" onClick={() => setSheet('turn-off')}>
                  <i aria-hidden="true">
                    <Icon name="power" />
                  </i>
                  Turn off
                </button>
              )}
            </nav>
          )}
          <section className="card">
            <MoneyRow icon="₱" label="Balance" money={card.balance} />
            <MoneyRow icon={<Icon name="savings" />} label="Ipon kept" money={card.iponKept} />
          </section>
          <section className="card" ref={receipts}>
            <h2>Receipts</h2>
            {card.feed.length === 0 ? (
              <p className="empty">No receipts yet. They'll show up here the moment {card.holderName} taps.</p>
            ) : (
              <ul className="fd">
                {card.feed.map((item) => (
                  <Receipt key={item.id} item={item} />
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </main>
  )
}
