// What the screens share: the header, the keypad, the mascot and the decision card.
import { useEffect, type ReactNode } from 'react'
import { PERCHED, STANDING } from './birdMarkup.ts'

export function Header(props: { title: string; back?: string | (() => void); status?: ReactNode }) {
  const { title, back, status } = props
  return (
    <header className="hd">
      <div className="hd-row">
        {typeof back === 'string' && (
          <a className="rnd" href={back} aria-label="Back">
            ←
          </a>
        )}
        {typeof back === 'function' && (
          <button className="rnd" type="button" aria-label="Back" onClick={back}>
            ←
          </button>
        )}
        <div className="pill">
          <h1>{title}</h1>
          {status}
        </div>
      </div>
    </header>
  )
}

export function Bird({ standing }: { standing?: boolean }) {
  return (
    <div
      className={standing ? 'bird bird-home' : 'bird bird-perch'}
      role="img"
      aria-label={`A chubby rainbow bird in clay style, ${standing ? 'standing' : 'perched on a branch'}`}
    >
      <div dangerouslySetInnerHTML={{ __html: standing ? STANDING : PERCHED }} />
    </div>
  )
}

export function Icon({ name }: { name: 'power' | 'savings' | 'delete' }) {
  const paths = {
    power: 'M12 3v9M6.3 7.3a8 8 0 1 0 11.4 0',
    savings: 'M4 11l8-7 8 7M6 10v9h12v-9',
    delete: 'M9 5h11v14H9l-6-7zM13 9.500l5 5M18 9.500l-5 5',
  }
  return (
    <svg className="glyph" viewBox="0 0 24 24" aria-hidden="true">
      <path d={paths[name]} />
    </svg>
  )
}

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '.', '0', 'delete'] as const

// Tapped on a phone, typed on a laptop. `decimal` is off for the PIN.
export function Keypad(props: { onKey(key: string): void; disabled?: boolean; decimal?: boolean }) {
  const { onKey, disabled = false, decimal = true } = props

  useEffect(() => {
    if (disabled) return
    function press(event: KeyboardEvent) {
      if (event.ctrlKey || event.metaKey || event.altKey) return
      if (event.key === 'Backspace') onKey('delete')
      else if (/^\d$/.test(event.key) || (decimal && event.key === '.')) onKey(event.key)
    }
    window.addEventListener('keydown', press)
    return () => window.removeEventListener('keydown', press)
  }, [onKey, disabled, decimal])

  return (
    <div className={disabled ? 'keys dim' : 'keys'}>
      {KEYS.map((key) =>
        key === '.' && !decimal ? (
          <span key={key} />
        ) : (
          <button
            key={key}
            type="button"
            disabled={disabled}
            aria-label={key === 'delete' ? 'Delete' : undefined}
            onClick={() => onKey(key)}
          >
            {key === 'delete' ? <Icon name="delete" /> : key}
          </button>
        ),
      )}
    </div>
  )
}

export function Decision(props: { kind: 'ok' | 'no' | 'wt'; icon: string; word: string; children?: ReactNode }) {
  const { kind, icon, word, children } = props
  return (
    <section className={`dec ${kind}`} aria-live="polite">
      <div className="dw">
        <i className="stamp" aria-hidden="true">
          {icon}
        </i>
        {word}
      </div>
      {children}
    </section>
  )
}
