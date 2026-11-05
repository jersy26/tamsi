# Rules for AI coding tools (Claude, Cursor, Antigravity, etc.)

Every tool reads this file. `CLAUDE.md` only points here.

## Source of truth
- Plan files live in `docs/` (`docs/index.md` lists them). What to build: `docs/PRD.md`. How: `docs/SDD.md`. Schedule and risks: `docs/BUILD-PLAN.md`. If code and these files disagree, stop and ask the PM; don't silently pick one.
- Don't create new planning docs. Add a short note to the relevant file instead.

## Hard rules (break these and the project is disqualified or unsafe)
1. **Noir only through `@noirx402/agent-sdk`.** Use `NoirAgentClient` with no network override (built-in `TESTNET` = the live Oct 24 contracts). Never call contracts with raw `@stellar/stellar-sdk` invocations, never deploy contracts, never hard-code contract IDs.
2. **Velo only through `@carts1024/velo-sdk@alpha`**, server-side only.
3. **Testnet only.** `environment: 'testnet'` for Velo; Networks.TESTNET for Stellar.
4. **No secrets in code or git.** Every key comes from env; every env name is listed (empty) in `.env.example`. OFW, agent, treasury and merchant secrets run on the server only, never in `apps/web`.
5. **Amounts are stroops as `bigint`.** Use `toStroops` / `fromStroops`. Never floats, never `Number()` on amounts. Webhook amounts arrive as decimal strings.
6. **Velo webhook:** read the raw body (`express.raw`), verify with `Velo.webhooks.verify`, dedupe on the delivery id, respond 2xx fast, then work. **Noir events** come from `noir.watch` in-process; dedupe on `event.id`.
7. **A top-up is funded only after** a verified `payment.succeeded` webhook **and** `paymentIntents.retrieve` says paid. Never from a browser redirect.
8. **The Tamsi pipeline is deterministic.** Follow the check order in SDD §3. An LLM may only write explanation text; it never changes a decision.
9. **One tap at a time per card** (serial queue keyed by device hash).
10. **Kill switch order:** `revokeAgent` → `defundEscrow(full balance)`. Never revoke the device while escrow > 0.

## Conventions
- pnpm workspaces only. Node `>=24.22.1` (pin in `.nvmrc` and `engines`). TypeScript strict.
- Reason codes live in `packages/shared/reasons.ts`; UI text maps from codes, never ad-hoc strings.
- Catch `NoirContractError` and surface `err.name`.
- Every chain write logs its tx hash and links to `https://stellar.expert/explorer/testnet/tx/<hash>`.
- Solo build: one feature at a time, small commits straight to `main`, and `main` must always deploy. One Railway service: Express serves `apps/web/dist`.
- Work from one SDD section per session. Don't start a Tier 2 item until every Tier 1 box in `docs/PRD.md` is checked.
- When you add or move a file that the README's Noir/Velo integration sections link to, update those links.

## Before saying "done"
- Run it against Testnet, not only unit tests. Paste the tx hash in the PR.
- Explain in the commit message, in 2–3 lines, what the code does and why — the developer must be able to answer judge questions about every file.
