# Tamsi — Session Handoff

**Date:** 2026-11-06 (second session: Phase 1 code)
**Branch:** `main`, local only. No GitHub remote exists yet, so nothing is pushed.
**Deadline:** submissions close **Sat Nov 7, 12:00 PM**. Aim to submit by 11:00 AM.
**Tests:** `pnpm test` (14 pass), `pnpm typecheck` passes, real taps passed on Testnet.

> **Next session: start with section 0 (To do), then work from one SDD section at a time.** Read `agents.md` first; its hard rules can disqualify the project.

---

## 0. To do

### Finish Phase 1: deploy (needs the user)
Phase 1 is done when a tap on the live URL pays through Noir or declines with a reason. All the code for this is committed; only the deploy is left.

1. Publish the repo to public GitHub (GitHub Desktop is installed). The history has no secrets; `.env` and `tamsi.db` are gitignored.
2. In Railway, create a project from that repo. It finds the `Dockerfile`, which pins Node 24.22.1.
3. Add a volume mounted at `/data`.
4. Set these variables, copying values from `.env`: `AGENT_SECRET`, `OFW_SECRET`, `TREASURY_SECRET`, `MERCHANT_SECRETS`, `DEMO_CARD_UID`, `DEMO_PHP_PER_XLM`. Set `SQLITE_PATH=/data/tamsi.db`.
5. Generate a domain, then check `/api/health` shows `configured: true`, and tap on `/pos`.
6. Put the domain in `PUBLIC_URL` and in the README. Tick the Guarded tap boxes in the PRD once they pass on the live URL.

### Next (code work): Phase 2
`/api/topups`, `/webhooks/velo` → `fundEscrow`, then `/ofw` with the `noir.watch` feed over SSE, and `GET /api/cards/:hash`. `/ofw` can be built before Velo is ready.

### Needs the user (cannot be done from here)
- **Velo project:** create a Testnet project at velo-build.dev using the treasury wallet, `GBRFIH6D4FOG333NO43DRQ74AZLEQQCEI4KJ4H7EAKQ3ACRCUITNCU45`. Import `TREASURY_SECRET` from `.env` into a browser wallet to do it. Put `VELO_API_KEY` and `VELO_WEBHOOK_SECRET` in `.env`, never in chat. Blocks the top-up half of Phase 2.
- **Railway and GitHub:** the deploy steps above.
- **Discord handle:** still a TODO in `README.md`.

### Check before relying on it
- **Velo `asset: 'native'`:** SDD §3 assumes it, but the SDK types only say `string` and its README example uses `USDC`. Try it on the first checkout.
- **Velo delivery id:** `agents.md` rule 6 dedupes on it. Where it comes from isn't confirmed; only the signature header `x-velo-signature` is. Read the webhook section of the Velo README, from about line 400 of 608.
- **Velo SDK version:** `@alpha` is `0.1.0-alpha.4`, as `agents.md` requires. npm also lists `latest` as `1.0.0`, while the package's README says `latest` is `0.1.0-alpha.2`. Not looked into. Ask in the hackathon channel if it matters.
- **Device hash:** we use the SHA-256 of the UID string, as hex. The SDK comments agree, but SDD §3 says to match Noir's NFC hashing doc, which hasn't been checked. It matters only for a real tag (Tier 3).

---

## 1. What exists

| Path | What it is |
| :-- | :-- |
| `packages/shared` | Reason codes and their sentences (`reasons.ts`), categories, shared types, demo family data (`demo.ts`). |
| `packages/agent` | `decide.ts` (SDD §3 checks), `queue.ts` (per-card queue), `tamsi.ts` (ties them together and saves the tap), `noir.ts` (Noir SDK calls), unit tests. |
| `apps/server` | Express: `/api/health`, `/api/merchants`, `/api/cards`, `/api/taps`; serves the web build. `db.ts` holds all SDD §4 tables and an idempotent seed that also runs at boot, so the Railway volume seeds itself. |
| `apps/web` | Vite + React: `/` and `/pos`. No router. |
| `Dockerfile` | The deploy image, Node 24.22.1. Runs through `tsx`, so `pnpm build` builds the web app and only typechecks the server. |
| `scripts/setup.ts` | SDD §3 setup steps 1–6, in one rerunnable command. Also fills `SQLITE_PATH` and `DEMO_PHP_PER_XLM`. |
| `scripts/fund-demo.ts` | `pnpm fund:demo 60`: treasury funds the card by hand. A developer tool, not reachable from the server. |
| `scripts/spike.ts`, `docs/testnet-proof.md` | Phase 0 proof. Each spike run overwrites the proof file. |

**Demo card now:** 39.5 XLM on the card; per-tap max 10, daily cap 25, ipon floor 20, all in XLM (`packages/shared/demo.ts`). Demo rate ₱50 per XLM.

**Proved on Testnet (this session):** the local server gave `paid`, `merchant_not_allowed`, `over_limit`, `daily_cap` and `invalid_amount`; two taps sent at once gave one `paid` and one `daily_cap`; `ipon_floor` fired with the floor raised in the local DB only. The Docker image on Node 24.22.1 paid a tap, and its spend survived a restart on a volume.

**Agent pays:** https://stellar.expert/explorer/testnet/tx/681c1a218357afb18bf31b4ab9304fbb8503a63ace3a69e8ddb2a5ff1fce3649 and, on Node 24.22.1, https://stellar.expert/explorer/testnet/tx/d1f482476d8fb46c3343da10cc52e5651571fac3a579d1ac005c3c4d8f64abbd

**Not done:** the live deploy and Phases 2–5. No PRD box is ticked yet. A top-up request on `ipon_floor` and low balance is Phase 3.

---

## 2. Things that will trip you up

- **Local Node is outside the SDK's range.** This PC has Node 25.9.0 and no version manager; the SDK wants `^22.23.4 || ^24.22.1 || >=26.12.1`. The Dockerfile pins 24.22.1, and the full flow passed in that image.
- **`engines` is `>=24.22.1` on purpose**, as `agents.md` says. An upper limit such as `<25` would exclude this PC's Node 25.9, and pnpm may then refuse to run here (not tested).
- **Don't add `devEngines.runtime`.** pnpm's Node download timed out twice on this connection and made every later pnpm command fail. The other packages installed fine.
- **pnpm 11 stops on unapproved build scripts.** `pnpm-workspace.yaml` has `allowBuilds` with `esbuild: true`. New native dependencies (a SQLite driver, for example) will need their own entry, or pnpm fails with `ERR_PNPM_IGNORED_BUILDS`. We use `node:sqlite`, so SQLite needs no entry.
- **Friendbot errors:** its "already funded" message didn't match the wording the script first looked for and crashed a rerun, so `setup.ts` now asks Horizon whether the account exists. Friendbot also tops up accounts that fall below its starting balance, so a rerun may report some as `funded`.
- **Git identity is set in this repo only** (`jersy26`), because there's no global one.

- **Local and Railway databases are separate, but the card is one.** Today's spend is counted per database; the card balance is on-chain and shared. Local taps today used 19 of the 25 XLM cap in `tamsi.db`, which doesn't affect Railway.
- **`pnpm fund:demo` failed once** straight after the card was registered, and worked on the rerun. The error wasn't captured, so the cause is unknown. Rerun it if it happens again.
- **Editing shared or agent code needs a server restart.** `pnpm start` doesn't watch files; `pnpm dev` does.

---

## 3. Noir SDK facts confirmed from `@noirx402/agent-sdk` 0.3.0

- The card is registered with `execute(owner, { kind: 'registerDevice', deviceHash, agent })`.
- `keypairSigner(secret)` makes a server signer. `toStroops` and `fromStroops` come from the SDK.
- `authorizePayment` defaults its nonce to milliseconds since epoch. The nonce must increase per device and agent, and the per-card queue keeps that true.
- `noir.watch` takes one `deviceHash` or `merchant` filter, plus `fromLedger` and `types`. It has no list of devices. `pastEvents(fromLedger)` covers the backfill; RPC keeps about 7 days.
- The kill switch in SDD §3 still works as written. The SDK also has `unlinkDevice`, which revokes the device as well as the agent. The kill switch doesn't need that, so keep the SDD's order.
- `NoirContractError.errorName` is the contract's error. `err.name` is always `NoirContractError`, so `agents.md` and the SDD now say `errorName`.
