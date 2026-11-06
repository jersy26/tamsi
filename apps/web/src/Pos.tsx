// The shop counter: pick the shop, enter the amount, tap. The agent's answer takes the top of
// the screen, readable at arm's length. All decisions and wording come from the server.
import { useCallback, useEffect, useRef, useState } from 'react'
import { formatMoney, pesosToXlm, withCommas, type CardSummary, type ClaimResult, type MerchantSummary, type TapResponse } from '@tamsi/shared'
import { getJson } from './api.ts'
import { Decision, Header, Keypad, typeKey } from './parts.tsx'

type TapState =
  | { kind: 'idle' }
  | { kind: 'waiting' }
  | { kind: 'done'; result: TapResponse }
  | { kind: 'error'; message: string }

const XLM_PATTERN = /^\d+(\.\d{1,7})?$/
const PESO_PATTERN = /^\d+(\.\d{1,2})?$/

function DecisionCard({ state }: { state: TapState }) {
  if (state.kind === 'idle') return null
  if (state.kind === 'waiting') {
    return (
      <Decision kind="wt" icon="⋯" word="Checking">
        <p className="dr">The agent is checking this tap.</p>
      </Decision>
    )
  }
  if (state.kind === 'error') {
    return (
      <Decision kind="wt" icon="!" word="Try again">
        <p className="dr">{state.message}</p>
      </Decision>
    )
  }
  const { result } = state
  const approved = result.decision === 'approved'
  return (
    <Decision kind={approved ? 'ok' : 'no'} icon={approved ? '✓' : '✕'} word={approved ? 'Approved' : 'Declined'}>
      <p className="da">
        {formatMoney({ xlm: result.amountXlm, php: result.amountPhp })}
        {result.amountPhp !== null && <small> ≈ {result.amountXlm} XLM demo rate</small>}
      </p>
      <p className="dr">{result.reasonText}</p>
      {result.explorerUrl && (
        <a className="tx" href={result.explorerUrl} target="_blank" rel="noreferrer">
          View on Stellar Expert ↗
        </a>
      )}
    </Decision>
  )
}

type ClaimState = { kind: 'idle' } | { kind: 'working' } | { kind: 'done'; result: ClaimResult } | { kind: 'error' }

function CollectPayments({ merchant }: { merchant: MerchantSummary }) {
  const [state, setState] = useState<ClaimState>({ kind: 'idle' })

  // A different shop starts clean, so one shop's result never shows under another.
  useEffect(() => setState({ kind: 'idle' }), [merchant.id])

  async function collect() {
    setState({ kind: 'working' })
    try {
      const res = await fetch(`/api/merchants/${encodeURIComponent(merchant.id)}/claim`, { method: 'POST' })
      if (!res.ok) throw new Error(`Claim answered ${res.status}`)
      setState({ kind: 'done', result: (await res.json()) as ClaimResult })
    } catch {
      setState({ kind: 'error' })
    }
  }

  return (
    <section className="coll" aria-live="polite">
      <button className="cta ghost" type="button" disabled={state.kind === 'working'} onClick={collect}>
        {state.kind === 'working' ? 'Collecting…' : `Collect payments for ${merchant.name}`}
      </button>
      {state.kind === 'error' && <p>We couldn't collect right now. Try again in a moment.</p>}
      {state.kind === 'done' && !state.result.explorerUrl && <p>Nothing to collect right now.</p>}
      {state.kind === 'done' && state.result.explorerUrl && (
        <p>
          Collected {formatMoney(state.result.collected)}.{' '}
          <a href={state.result.explorerUrl} target="_blank" rel="noreferrer">
            View on Stellar Expert
          </a>
        </p>
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

  // On a phone the answer can land out of view; bring it to the person at the counter.
  useEffect(() => {
    if (state.kind === 'done' || state.kind === 'error') decisionRef.current?.scrollIntoView({ block: 'nearest' })
  }, [state])

  const rate = card?.phpPerXlm ?? null
  const amountValid = (rate === null ? XLM_PATTERN : PESO_PATTERN).test(amount)
  const amountXlm = rate !== null && amountValid ? pesosToXlm(amount, rate) : amount
  const canTap = Boolean(card && merchantId && amountValid) && state.kind !== 'waiting'
  const selected = merchants.find((merchant) => merchant.id === merchantId)
  const pressKey = useCallback(
    (key: string) => setAmount((current) => typeKey(current, key, rate === null ? 7 : 2)),
    [rate],
  )

  async function tap() {
    if (!card || !canTap) return
    setState({ kind: 'waiting' })
    try {
      const res = await fetch('/api/taps', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deviceHash: card.deviceHash, merchantId, amount: amountXlm }),
      })
      if (!res.ok) throw new Error(`Tap answered ${res.status}`)
      setState({ kind: 'done', result: (await res.json()) as TapResponse })
    } catch {
      setState({ kind: 'error', message: "We couldn't reach the server. Check the receipts before tapping again." })
    }
  }

  return (
    <main className="screen">
      <Header title="Shop counter" back="/" />
      {loadError && <p className="err">{loadError}</p>}
      <div ref={decisionRef}>
        <DecisionCard state={state} />
      </div>
      <fieldset className="card shops">
        <legend>Shop</legend>
        {merchants.length === 0 && (
          <>
            <div className="skr" />
            <div className="skr" />
            <div className="skr" />
          </>
        )}
        {merchants.map((merchant) => (
          <label key={merchant.id} className={merchant.id === merchantId ? 'shop on' : 'shop'}>
            <input
              type="radio"
              name="merchant"
              value={merchant.id}
              checked={merchant.id === merchantId}
              onChange={() => setMerchantId(merchant.id)}
            />
            <u aria-hidden="true" />
            {merchant.name}
          </label>
        ))}
      </fieldset>

      <button
        className="gcard vi amount"
        type="button"
        aria-label="Change the amount"
        disabled={state.kind !== 'done' && state.kind !== 'error'}
        onClick={() => setState({ kind: 'idle' })}
      >
        <span className="wtop">
          <b>Amount</b>
          {card && (
            <em>
              {card.label} · {card.holderName}
            </em>
          )}
        </span>
        <span className={amount ? 'amt' : 'amt ph'}>
          {rate === null ? (
            <>
              {amount || '0'}
              <small> XLM</small>
            </>
          ) : (
            <>
              ₱{withCommas(amount || '0')}
              {amountValid && <small> ≈ {amountXlm} XLM</small>}
            </>
          )}
        </span>
      </button>

      {state.kind === 'idle' && <Keypad onKey={pressKey} />}
      <button className="cta bt" type="button" disabled={!canTap} onClick={tap}>
        {state.kind === 'waiting' ? 'Checking…' : 'Tap card'}
      </button>
      {selected && <CollectPayments merchant={selected} />}
    </main>
  )
}
