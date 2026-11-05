# Tamsi — Brand and design notes

## Who we design for
- **The OFW (dashboard, `/ofw`).** Abroad, on a phone, often on break or after a long shift, on patchy Wi-Fi. Wants to know in two seconds: is my family okay, how much is left, did anything weird happen. Feels guilty asking for receipts — the app must feel like *care*, not surveillance.
- **The family holder and the shopkeeper (`/pos`).** At a counter with people waiting. One big result, readable at arm's length.

## Behaviour rules
- Mobile-first. `/ofw` must work one-handed at 360 px wide.
- Lead with three numbers: **Left today**, **Balance**, **Ipon (savings) kept**.
- Every agent decision reads as one plain sentence, e.g. "Paid ₱-equiv. 120 at Aling Nena's Store — groceries are allowed and you're under today's limit."
- Declines are calm, not alarming: say what rule stopped it and what the OFW can do.
- Every on-chain action has a small "View on Stellar Expert" link — judges look for it.
- Always show "Testnet — demo money" somewhere visible.

## Voice
Warm, short, English with light Filipino words people already use: *padala*, *ipon*, *sari-sari*. No crypto jargon on user-facing screens (say "card balance", not "escrow"; "payment approved", not "authorize succeeded"). Jargon is fine on `/api/health` and in the README.

## Look
- Calm and trustworthy: deep navy or teal base, one warm accent (mango/amber) for money-in, green for approved, muted red for declined.
- One sans-serif family (e.g. Inter or Plus Jakarta Sans), large numerals.
- POS decision card: full-width, green / red / amber, icon + one word + reason.
