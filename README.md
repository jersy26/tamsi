# Tamsi

An AI agent that spends an OFW's padala for the family one card tap at a time — only at shops the OFW allows, under a daily limit, always keeping savings — and shows the OFW every receipt.

**Live website:** https://tamsi-production.up.railway.app
**Demo video (2 min):** https://TODO
**Team:** Jersylle Hannah B. Nismal (TODO Discord handle) — solo

## Problem
Overseas Filipino workers send money home every month, but once it lands they can't see or guide how it's spent. Asking for receipts feels like distrust, so almost nobody does, and savings quietly run out. TODO: add verified BCG / PSA figures with links.

## Solution
The OFW owns a Noir tap card for a family member and funds it through a Velo checkout. Every tap goes to the Tamsi agent, which decides whether to pay: is this shop allowed, is it under today's limit, does it keep the savings floor, does the OFW need to approve? It pays the merchant through the Noir contracts, explains every decision, streams receipts to the OFW, and asks the OFW for a top-up — with an amount it worked out — when money runs low.

## How the agentic payment works
1. A family member taps the card at a shop; the shop's POS sends the tap to our server.
2. The Tamsi agent checks, in order: card active → merchant category allowed → under daily cap → savings floor kept → Noir `checkPayment`.
3. If every check passes, the agent signs `authorizePayment` with its constrained Noir key, paying the merchant from the card's escrow. Otherwise it declines with a reason code.
4. When usable balance drops below about two days of spending, the agent computes `avg daily spend × days to next payday + savings floor − balance` and creates a Velo checkout link for that amount on the OFW's dashboard.
5. Merchants collect their pending balance with `claim`.

## Architecture
TODO: paste the Mermaid diagram from `docs/SDD.md` §1.

## Noir integration
- SDK: `@noirx402/agent-sdk` TODO version
- Contracts: `device_registry`, `agent_registry`, `payment_escrow` (built-in `TESTNET`, Oct 24 deploy)
- Methods and files:
  - `registerDevice`, `execute(registerAgent)` — TODO link `scripts/setup.ts#Lx`
  - `execute(fundEscrow)` (treasury, after Velo payment) — TODO link
  - `checkPayment`, `authorizePayment`, `getEscrowBalance` — TODO link `packages/agent/...#Lx`
  - `claim`, `getPendingBalance` — TODO link
  - `watch`, `getEvents` — TODO link
  - `execute(revokeAgent)`, `execute(defundEscrow)` (kill switch) — TODO link
- Demo note: the OFW (device owner) key is held server-side for the demo; in production the OFW signs with the Noir extension.

## Velo integration
- SDK: `@carts1024/velo-sdk` TODO alpha version
- Checkout sessions for padala top-ups and agent-requested top-ups; `paymentIntents.retrieve` for payment status; `Velo.webhooks.verify` on `payment.succeeded` before funding the card.
- Files: TODO links

## Testnet proof
- Agent authorize: TODO https://stellar.expert/explorer/testnet/tx/...
- Treasury fund after Velo payment: TODO
- Merchant claim: TODO

## Repo structure
```
apps/web/         OFW dashboard + merchant POS (Vite + React), served by the server
apps/server/      API, Velo webhook, Noir event watcher, SSE (Express)
packages/agent/   Tamsi decision pipeline and Noir SDK calls
packages/shared/  Types, reason codes, stroops helpers
scripts/          Testnet setup and spike scripts
docs/             Plan files, screenshots, Testnet proof
```

## Run it locally
1. Node 24.22.1+ (see `.nvmrc`), pnpm, Chrome with the Noir extension, Testnet XLM from Friendbot
2. `pnpm install`
3. Copy `.env.example` to `.env` and fill it in; run `pnpm setup:testnet` to create agent, treasury and merchant keys
4. `pnpm dev`

## Environment variables
| Name | What it is | Where to get it |
| :-- | :-- | :-- |
| TODO copy from `docs/SDD.md` §7 | | |

## Screenshots
TODO

## What's next
Peso cash-out once Velo's Philippine settlement or Noir's PDAX bridge goes live; merchant allowlist on-chain if Noir adds it to `AgentPolicy`; multiple family cards per OFW.

## Credits
`@noirx402/agent-sdk`, `@carts1024/velo-sdk`, `@stellar/stellar-sdk`, TODO other libraries. Research: BCG (June 2026 OFW survey), PSA via Philstar. TODO.
