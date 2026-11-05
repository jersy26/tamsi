// The shop counter: pick the shop, enter the amount, tap. The agent's answer fills the
// screen, readable at arm's length. All decisions and wording come from the server.
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { CHECK_LABELS, type CardSummary, type MerchantSummary, type TapResponse } from '@tamsi/shared'

type TapState =
  | { kind: 'idle' }
  | { kind: 'waiting' }
  | { kind: 'done'; result: TapResponse }
  | { kind: 'error'; message: string }

const AMOUNT_PATTERN = /^\d+(\.\d{1,7})?$/

async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(path)
  if (!res.ok) throw new Error(`${path} answered ${res.status}`)
  return (await res.json()) as T
}

function DecisionCard({ state }: { state: TapState }) {
  if (state.kind === 'idle') return null
  if (state.kind === 'waiting') {
    return (
      <section className="decision waiting" aria-live="polite">
        <div className="decision-word">
          <span aria-hidden="true">⋯</span> Checking
        </div>
        <p className="decision-reason">The agent is checking this tap.</p>
      </section>
    )
  }
  if (state.kind === 'error') {
    return (
      <section className="decision waiting" aria-live="polite">
        <div className="decision-word">
          <span aria-hidden="true">!</span> Try again
        </div>
        <p className="decision-reason">{state.message}</p>
      </section>
    )
  }
  const { result } = state
  const approved = result.decision === 'approved'
  return (
    <section className={`decision ${approved ? 'approved' : 'declined'}`} aria-live="polite">
      <div className="decision-word">
        <span aria-hidden="true">{approved ? '✓' : '✕'}</span> {approved ? 'Approved' : 'Declined'}
      </div>
      <p className="decision-amount">
        {result.amountXlm} XLM
        {result.amountPhp !== null && <span className="decision-php"> ≈ ₱{result.amountPhp} demo rate</span>}
      </p>
      <p className="decision-reason">{result.reasonText}</p>
      <ul className="checks">
        {result.checks.map((check) => (
          <li key={check.id} className={check.ok ? 'check-ok' : 'check-failed'}>
            <span aria-hidden="true">{check.ok ? '✓' : '✕'}</span> {CHECK_LABELS[check.id]}
          </li>
        ))}
      </ul>
      {result.explorerUrl && (
        <a className="explorer-link" href={result.explorerUrl} target="_blank" rel="noreferrer">
          View on Stellar Expert
        </a>
      )}
    </section>
  )
}

export function Pos() {
  const [merchants, setMerchants] = useState<MerchantSummary[]>([])
  const [card, setCard] = useState<CardSummary | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [merchantId, setMerchantId] = useState('')
  const [amount, setAmount] = useState('')
  const [state, setState] = useState<TapState>({ kind: 'idle' })
  const decisionRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    Promise.all([getJson<MerchantSummary[]>('/api/merchants'), getJson<CardSummary[]>('/api/cards')])
      .then(([loadedMerchants, cards]) => {
        setMerchants(loadedMerchants)
        setMerchantId(loadedMerchants[0]?.id ?? '')
        setCard(cards[0] ?? null)
      })
      .catch(() => setLoadError("The counter couldn't load. Refresh to try again."))
  }, [])

  // On a phone the answer lands below the fold; bring it to the person at the counter.
  useEffect(() => {
    if (state.kind === 'done' || state.kind === 'error') decisionRef.current?.scrollIntoView({ block: 'nearest' })
  }, [state])

  const amountValid = AMOUNT_PATTERN.test(amount)
  const canTap = Boolean(card && merchantId && amountValid) && state.kind !== 'waiting'

  async function tap(event: FormEvent) {
    event.preventDefault()
    if (!card || !canTap) return
    setState({ kind: 'waiting' })
    try {
      const res = await fetch('/api/taps', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deviceHash: card.deviceHash, merchantId, amount }),
      })
      if (!res.ok) throw new Error(`Tap answered ${res.status}`)
      setState({ kind: 'done', result: (await res.json()) as TapResponse })
    } catch {
      setState({ kind: 'error', message: "We couldn't reach the server. Check the receipts before tapping again." })
    }
  }

  return (
    <main className="page pos">
      <h1>Shop counter</h1>
      {loadError && <p className="load-error">{loadError}</p>}
      <form onSubmit={tap}>
        <fieldset className="merchants">
          <legend>Shop</legend>
          {merchants.map((merchant) => (
            <label key={merchant.id} className={merchant.id === merchantId ? 'merchant selected' : 'merchant'}>
              <input
                type="radio"
                name="merchant"
                value={merchant.id}
                checked={merchant.id === merchantId}
                onChange={() => setMerchantId(merchant.id)}
              />
              {merchant.name}
            </label>
          ))}
        </fieldset>

        <label className="amount-field">
          <span>Amount (XLM)</span>
          <input
            inputMode="decimal"
            autoComplete="off"
            placeholder="0"
            value={amount}
            onChange={(event) => setAmount(event.target.value.trim())}
          />
        </label>

        <button className="button primary tap-button" type="submit" disabled={!canTap}>
          {state.kind === 'waiting' ? 'Checking…' : 'Tap card'}
        </button>
        {card && (
          <p className="card-line">
            {card.label} · {card.holderName}
          </p>
        )}
      </form>
      <div ref={decisionRef}>
        <DecisionCard state={state} />
      </div>
    </main>
  )
}
