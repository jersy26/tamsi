export function Home() {
  return (
    <main className="page home">
      <h1>Tamsi</h1>
      <p className="lede">
        Padala that stays guarded after it lands. An agent pays only where you allow, and you see every receipt.
      </p>
      <ol className="steps">
        <li>
          <strong>Send padala</strong> to your family's tap card.
        </li>
        <li>
          <strong>They tap</strong> at the shop. The agent checks the shop, today's limit and the ipon.
        </li>
        <li>
          <strong>You see the receipt</strong>, with the reason for every yes and no.
        </li>
      </ol>
      <div className="home-actions">
        <a className="button primary" href="/ofw">
          See the family card
        </a>
        <a className="button secondary" href="/pos">
          Open the shop counter
        </a>
      </div>
    </main>
  )
}
