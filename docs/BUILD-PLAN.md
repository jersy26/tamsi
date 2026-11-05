# Tamsi — Solo Build Plan (Velo x Noir Agentic Payment Hackathon)

Solo build. Read this first, then `PRD.md` and `SDD.md`.

## 0. What changed since the research memo

The handbook (updated Nov 5) and Noir's contract reference overrule parts of the memo. Build against these, not the memo.

| Memo said | Now true | What we do |
| :-- | :-- | :-- |
| Form's contract IDs are retired pre-fix code; ask organizers, keep IDs in env | Same IDs now run the **fixed Oct 24 deploy**; they are built into the SDK as `TESTNET`. | Use `new NoirAgentClient()` with no overrides. No contract IDs in env. Risk closed. |
| ~2.5 build days, deadline 8:00 AM Nov 8 | **Submissions close Sat Nov 7, 12:00 PM.** Top 10 announced Sat 4 PM. Pitch Sun Nov 8, 1 PM. | Work in phases (§3); submit with at least 1 hour to spare. |
| No judging rubric | Rubric published: Agentic fit 30%, Technical 25%, Innovation 20%, Real-world 15%, Pitch 10% | Every feature must make the agent's decision visible. See PRD §6. |
| Raw contract calls | **Rule: Noir only through `@noirx402/agent-sdk`.** | All Noir calls go through `NoirAgentClient`. |
| Sponsor `authorize` fees with Velo Gas Station | That submits outside the Noir SDK and risks requirement 2. | Agent key pays its own fees (~2.3 XLM first tap). Drop Gas Station. |
| Per-tap alerts from Velo `contract.event` webhooks | Noir SDK has `noir.watch` for `payment.authorized` etc. | Use `noir.watch` in-process. Velo keeps checkout, payment status, `payment.succeeded`. |
| Claim promptly (temporary storage) | Pending payments are **persistent** since the fix. | Claim is a button, not a race. |
| Any wallet can fund any device | Still true on the fixed contract (`fund_escrow` auth is the funding wallet). SDK docs label the signer "owner". | **Phase 0 spike proves a non-owner treasury can fund.** Fallback in §4. |
| No daily total, no merchant allowlist | Still true. Noir's docs call a merchant allowlist "the natural extension". | That gap is the pitch: the Tamsi agent adds daily cap, merchant allowlist and savings floor off-chain. |

## 1. What we are building

The OFW owns a Noir card for a family member. The OFW sends padala through a Velo checkout; the server funds the card's escrow. When the family taps the card at a shop, the **Tamsi agent** decides whether to pay: merchant allowed, under today's cap, savings floor kept. If yes, it pays through Noir; if not, it says why. The OFW sees every receipt live and can kill the card. When money runs low, the agent works out how much the family needs and creates a Velo checkout link for that amount.

## 2. Solo rules

- **AI writes the code; you steer and verify.** Give your coding tool one SDD section at a time, run it on Testnet, commit. Don't let it build two features at once.
- **One deploy.** The Express server serves the built web app. One Railway service, one URL, no CORS.
- **No deck, no Stage 7 research, no stat checking before submission.** All of that is Phase 6, only if you make the top 10.
- **Gates are real.** If a phase gate fails, cut the next tier. Never push Phase 4 back.
- **Rest at phase boundaries, not mid-phase.** Every phase ends with `main` deploying, so you can stop safely.

## 3. Phases

Fixed dates you can't move: **submissions close Sat Nov 7, 12:00 PM** · top 10 announced Sat 4:00 PM · pitch Sun Nov 8, 1:00 PM.

### Phase 0 — Prove the chain
- pnpm monorepo scaffold, `.nvmrc` 24.22.1+, `.env.example`
- `scripts/setup.ts`: generate + Friendbot OFW, agent, treasury, 3 merchant keys
- Velo project created **with the treasury wallet** (a key you hold); API key + webhook secret in `.env`
- `scripts/spike.ts`: register → registerAgent → **treasury** fundEscrow → checkPayment → authorizePayment → claim

**Done when:** tx hashes are in `docs/testnet-proof.md` and you know whether the treasury can fund a card it doesn't own.

### Phase 1 — Live skeleton and the guarded tap
- Hello-world Express on Railway with the Node version pinned, before any feature code
- `packages/agent` decision pipeline + unit tests (cap race, savings floor, allowlist)
- SQLite schema, `/api/taps`, `/pos` page

**Done when:** a tap on the live URL pays through Noir or declines with a reason.

### Phase 2 — Padala in, receipts out
- Velo top-up: `/api/topups`, `/webhooks/velo` → fundEscrow
- `/ofw` dashboard: balance, left today, savings kept, feed from `noir.watch` over SSE

**Done when:** every Tier 1 box in the PRD is checked, on the live URL.

**Gate:** start Phase 3 only with at least 12 hours left before the deadline. Otherwise go straight to Phase 4.

### Phase 3 — Tier 2
- Declined taps in the feed, agent top-up request, kill switch, "Collect payments" button
- Tier 3 only if every Tier 2 box is checked and the gate below is still far off

**Done when:** every Tier 2 box in the PRD is checked.

**Gate:** start Phase 4 no later than 8 hours before the deadline (Sat 4:00 AM), wherever Phase 3 is. Unfinished Tier 2 items are cut, not rushed.

### Phase 4 — Freeze and document
- **Feature freeze.** Bug fixes only from here.
- README with real file/line links, screenshots, Stellar Expert links
- Fresh `setup.ts` run works from an empty state

**Done when:** the README has no TODO and a fresh setup runs clean.

### Phase 5 — Ship
- Bug bash on the live URL in an incognito window
- Record the 2-min demo video (screen recording of §5)
- Write-up, submission checklist (§6), submit

**Done when:** submitted with at least 1 hour before the deadline.

### Phase 6 — Pitch prep (only if top 10)
- Verify stats (§8), Stage 7 research (§7)
- 5-slide deck, rehearse 3× out loud, Q&A drill on your own code
- Laptop with the demo running + backup video + phone hotspot for Sunday

Stop rule: once every Tier 1 and Tier 2 box in the PRD is checked, stop adding and only polish.

## 4. Risks and fallbacks

| Risk | Check | Fallback |
| :-- | :-- | :-- |
| SDK's `fundEscrow` won't accept a non-owner signer | Phase 0 spike | Treasury becomes the device owner (custodial, say so in README). Post the question in `#noir-sdk-and-extension` at the same time. |
| Velo project made with a wallet whose secret you don't hold | Phase 0 | New Velo project with the treasury keypair imported into a wallet. |
| Host Node version too old for Noir SDK (`^22.23.4`, `^24.22.1`, `>=26.12.1`) | Phase 1 hello-world deploy | Pin `engines` + `.nvmrc`; set the Node version in Railway. |
| Server restarts → missed events | — | Backfill with `noir.getEvents({ startLedger })` on boot; poll open top-ups with `paymentIntents.retrieve`. |
| Two fast taps both pass the daily cap | Unit test | Per-card serial queue. |
| Agent key runs out of fee XLM | `/api/health` | Keep agent ≥ 50 XLM. |
| Testnet reset | — | `setup.ts` rebuilds everything in one command. |
| Stuck > 45 min on one bug | — | Post in `#dev-help` / office hours, switch to the next task while waiting. |
| Live demo network fails Sunday | — | Backup video; phone hotspot. |

## 5. Demo script (2-min video and live pitch)

Built to hit Noir's success metrics ("over-limit rejected", "revoked device rejected", "replay validation") and Velo's rule of trusting ledger evidence.

1. **OFW sends padala** (Velo checkout, pays from wallet) → `/ofw` shows "Funded" with a Stellar Expert link only after the verified webhook.
2. **Grocery tap** → agent approves, reasons listed, tx link; OFW feed updates.
3. **Tap at a non-allowed merchant** → declined `merchant_not_allowed`; no chain fee spent.
4. **Tap that breaks today's cap** → declined `daily_cap`.
5. **Tap over the on-chain per-tap max** → declined by Noir's own check (`over_limit`).
6. **Balance near savings floor** → agent computes the top-up amount and creates a Velo link.
7. **Kill switch** → agent revoked, funds back to OFW; next tap refused by the contract's check (`no_agent`).

If Phase 3 was cut, the video ends at step 5. Label clearly: Testnet XLM only; peso cash-out is mocked (Velo PH settlement and Noir PDAX bridge are not live).

## 6. Submission checklist (Phase 5)

- [ ] Public GitHub monorepo, root README in the handbook's exact section order
- [ ] README links in Noir integration / Velo integration / Testnet proof point to real files and lines
- [ ] 2-minute demo video showing the agent deciding and paying
- [ ] Short write-up: problem, how the agent works, payment flow through Velo and Noir
- [ ] Live website URL works in an incognito window
- [ ] Your name + Discord handle (solo entry, registered via the Google Form)
- [ ] At least one Stellar Expert link to an agent `authorize` tx
- [ ] No secrets in git; `.env.example` complete
- [ ] Credits section lists libraries and research sources

## 7. Stage 7 — the judges (Phase 6)

No judge list is published. Likely judges are the maintainers, who read code paths (inference from the memo): Velo's Carl Aldrey Bergado; Noir's Richie Christian De Guzman, Johnrick Rabara, Jefferson Tuparan. Community partners: Highrable, GigPay, TyFi.

- Say plainly what Noir's policy lacks (daily total, merchant allowlist) and show the agent filling it without touching their contracts.
- Show the safe unlink order (revoke the agent, then withdraw) — it's in their docs.
- For Velo: a top-up is funded only from the verified webhook + retrieved intent, never a browser redirect.
- Solo is a strength in Q&A: you can answer every code question. Make sure that's true by Sunday.

## 8. Before slides: verify the numbers

From the memo, not re-checked:
- BCG June 2026 OFW survey: ~90% remit monthly or more often; 8% always ask for receipts
- PSA via Philstar: OFWs who save fell from 53.1% to 34.6%

If a number can't be traced to its source, it doesn't go on a slide.
