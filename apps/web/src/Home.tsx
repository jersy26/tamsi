import { Bird, Header } from './parts.tsx'

export function Home() {
  return (
    <main className="screen">
      <Header title="Tamsi" />
      <section className="hero grad home">
        <Bird standing />
        <p className="lede">
          Padala that stays guarded after it lands. An agent pays only where you allow, and you see every receipt.
        </p>
      </section>
      <section className="card">
        <ol className="fd">
          <li className="rc">
            <span className="ic bt">1</span>
            <div>
              <p>
                <strong>Send padala</strong> to your family's tap card.
              </p>
            </div>
          </li>
          <li className="rc">
            <span className="ic sk">2</span>
            <div>
              <p>
                <strong>They tap</strong> at the shop. The agent checks the shop, today's limit and the ipon.
              </p>
            </div>
          </li>
          <li className="rc">
            <span className="ic lm">3</span>
            <div>
              <p>
                <strong>You see the receipt</strong>, with the reason for every yes and no.
              </p>
            </div>
          </li>
        </ol>
      </section>
      <a className="cta bt" href="/ofw">
        See the family card
      </a>
      <a className="cta ghost" href="/pos">
        Open the shop counter
      </a>
    </main>
  )
}
