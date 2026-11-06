# Tamsi — Product Requirements (solo build)

## 1. One sentence

OFWs send money home every month but can't see or guide how it gets spent, so Tamsi puts an agent on the family's tap card that pays only for what the OFW allows and shows the OFW every receipt.

## 2. Problem

- An OFW sends padala; once it lands, it's gone from their view. Few ask for receipts, and savings shrink.
- Evidence (from the research memo — **verify before use**, see BUILD-PLAN §8): BCG June 2026, ~90% of OFWs remit monthly or more often, only 8% always ask for receipts. PSA via Philstar, the share of OFWs who save fell from 53.1% to 34.6%.
- Urgency (check 5): years without savings can't be recovered — an OFW who comes home with nothing saved has no second contract to fix it.

## 3. Ideal customer (one person)

**Primary — the OFW (card owner, payer).** Example persona: Maria, 34, caregiver in Riyadh, sends money every payday to her husband in Tondo. Wants groceries, school costs and medicine covered, wants something left over, hates asking for receipts because it feels like distrust.

**Secondary — the family holder.** Taps the card at the sari-sari store, grocery, pharmacy. Needs it to just work at the counter.

**Tertiary — the merchant.** Gets paid; collects pending payments.

## 4. Scope in tiers

Build Tier 1 completely before touching Tier 2. Tier 3 only if every Tier 2 box is checked early in Phase 3.

### Tier 1 — must ship (Phases 1–2)

**Guarded tap.** A tap on `/pos` goes to the Tamsi agent, which runs the checks in SDD §3 and pays through Noir or declines with a reason.
- [x] Allowed merchant within limits → paid through Noir; tx hash with Stellar Expert link
- [x] Non-allowed merchant → `merchant_not_allowed`, no chain call
- [x] Over daily cap → `daily_cap`
- [x] Below savings floor → `ipon_floor`
- [x] Over on-chain per-tap max → Noir's `over_limit`
- [x] Two taps within 1 s can't both pass the daily cap

**Padala top-up (Velo).** "Send padala" on `/ofw` opens a Velo checkout; the card is funded through Noir only after the verified `payment.succeeded` webhook and a retrieved intent showing paid.
- [x] Status goes created → paid → funded; balance rises
- [x] A browser redirect alone never marks it funded
- [x] Duplicate webhook delivery funds once

**OFW view.** `/ofw` shows left today, balance, savings kept, and a live feed of approved taps from `noir.watch`.
- [x] Approved tap appears on `/ofw` within ~10 s

### Tier 2 — should ship (Phase 3)
- [x] Declined taps appear in the OFW feed with their reason
- [x] Agent top-up request: when balance runs low, the agent computes an amount (formula shown) and creates a Velo checkout link on `/ofw`
- [ ] Kill switch: revoke agent → withdraw full balance to OFW; next tap refused (`no_agent`)
- [x] "Collect payments" button claims a merchant's pending balance

### Tier 3 — only if ahead
- OFW approval for large taps (wait ≤ 90 s, else decline)
- Rules editor on `/ofw`
- Auto-claim timer
- Web NFC tap on Android Chrome
- Noir extension signs the kill switch in the browser instead of the server
- "Replay last authorize" button showing `DuplicateAuth`

## 5. Not in scope

Real pesos or cash-out (mocked and labelled), required NFC hardware, native mobile app, multiple families, an LLM making money decisions, Velo Gas Station, deploying our own contracts, a separate merchant app.

## 6. Rubric map

| Criterion (weight) | How we score |
| :-- | :-- |
| Agentic payments fit (30%) | The agent chooses whether and whom to pay (allowlist, cap, floor) and requests top-ups with an amount it computed. Every decision shows its reasons. |
| Technical execution (25%) | Velo checkout → verified webhook → Noir fund → agent authorize → merchant claim → Noir event feed, all on Testnet, on the live URL. |
| Innovation (20%) | Remittance that stays guarded after it lands; the agent adds the daily cap, merchant allowlist and savings floor that Noir's policy lacks. |
| Real-world potential (15%) | OFW remittance is a monthly-or-more habit across millions of families (verify figures before the pitch). |
| Pitch and demo (10%) | Demo script in BUILD-PLAN §5. |

## 7. Handbook requirements (all six must pass)

- [ ] Agentic payment: the agent decides and makes the payment
- [ ] Noir only through `@noirx402/agent-sdk`, on the deployed Testnet contracts
- [ ] Velo SDK `@carts1024/velo-sdk@alpha` for checkout, payment status, signed webhooks
- [ ] Stellar Testnet only
- [ ] Public monorepo with the required README
- [ ] Live website at a public URL
