# Tamsi — Session Handoff

**Date:** 2026-11-06, about 02:15 Philippine time (second session: Phase 1, built and deployed)
**Branch:** `main` at https://github.com/jersy26/tamsi (public). Run `git status -sb` to see whether this file's commit has been pushed.
**Live:** https://tamsi-production.up.railway.app (Railway Trial plan, project `stunning-amazement`, running commit `78eb6c0`; later commits so far change docs only)
**Deadline:** submissions close **Sat Nov 7, 12:00 PM**, about 34 hours after this was written. Aim to submit by 11:00 AM.
**Plan gates:** start Phase 3 only by Sat 12:00 AM, otherwise skip to Phase 4. Start Phase 4 by Sat 4:00 AM, wherever Phase 3 is.
**Tests:** `pnpm test` (14 pass), `pnpm typecheck` passes, and all six Guarded tap checks passed as real taps on the live URL.

> **Next session: start with section 0 (To do), then work from one SDD section at a time.** Read `agents.md` first; its hard rules can disqualify the project.

---

## 0. To do

### Next (code work): Phase 2
1. `GET /api/cards/:hash`: card, rules, balance, spent today.
2. `noir.watch` in the server with a `pastEvents` backfill, saved to `noir_events`, deduped on `event.id`, and pushed over SSE at `/api/stream/:hash`.
3. `/ofw` page: left today, balance, ipon kept, live feed. Link it from the home page. Follow `docs/brands.md`.
4. Once Velo keys exist: `/api/topups`, `/webhooks/velo` → `fundEscrow`, `/pay/success`, `/pay/cancel`.

Steps 1–3 don't need Velo. Phase 2 is done when every Tier 1 box in the PRD is checked on the live URL.

### Needs the user (cannot be done from here)
- **Velo project:** create a Testnet project at velo-build.dev using the treasury wallet, `GBRFIH6D4FOG333NO43DRQ74AZLEQQCEI4KJ4H7EAKQ3ACRCUITNCU45`. Import `TREASURY_SECRET` from `.env` into a browser wallet to do it. Set the webhook URL to `https://tamsi-production.up.railway.app/webhooks/velo`. Put `VELO_API_KEY` and `VELO_WEBHOOK_SECRET` in `.env`, never in chat, and paste them into Railway's Raw Editor too. Blocks the top-up half of Phase 2.
- **Railway GitHub App:** install it so pushes deploy (see "Open problems"). Limit it to the `tamsi` repo. Until then, new code needs a manual deploy.
- **Railway Trial limits:** not checked. Make sure the plan lasts through Sunday's pitch.
- **Discord handle:** still a TODO in `README.md`.

### Open problems
- **Paid taps take about 22–25 s on the live URL.** Declines take 0.6–8 s. The counter says "Checking" the whole time, which is long for the demo video. The cause hasn't been looked into, and paid-tap time wasn't measured locally to compare.
- **Pushes don't seem to redeploy.** One push had started no deployment about a minute later. Railway was linked by pasting the public repo URL, so its GitHub App isn't installed; that's the likely cause, not a confirmed one.
- **Railway partial outage:** some networks block Railway IPs (https://status.railway.com/incident/QBCLHG1V, last update seen Nov 4, no fix date). The URL opens from this PC. Test it on phone data too before submitting. The Docker image can move to another host without code changes.
- **`/api/taps` has no login.** Anyone with the URL can spend Testnet money, within the card's limits. That's acceptable for the demo, but the Phase 3 kill switch would let anyone turn the card off mid-judging. Decide how to guard it when building it.

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
| `apps/server` | Express: `/api/health`, `/api/merchants`, `/api/cards`, `/api/taps`; serves the web build. `db.ts` holds all SDD §4 tables and an idempotent seed that also runs at boot, so the Railway volume seeds itself. `topups`, `noir_events` and `velo_deliveries` exist but nothing uses them yet. |
| `apps/web` | Vite + React: `/` and `/pos`. No router. |
| `Dockerfile` | The deploy image, Node 24.22.1. Runs through `tsx`, so `pnpm build` builds the web app and only typechecks the server. |
| `scripts/setup.ts` | SDD §3 setup steps 1–6, in one rerunnable command. Also fills `SQLITE_PATH` and `DEMO_PHP_PER_XLM`. |
| `scripts/fund-demo.ts` | `pnpm fund:demo 60`: treasury funds the card by hand. A developer tool, not reachable from the server. |
| `scripts/spike.ts`, `docs/testnet-proof.md` | Phase 0 proof. Each spike run overwrites the proof file. |

**Railway setup:** Dockerfile build, volume at `/data`, target port 8080, region US West, 8 variables (`AGENT_SECRET`, `OFW_SECRET`, `TREASURY_SECRET`, `MERCHANT_SECRETS`, `DEMO_CARD_UID`, `DEMO_PHP_PER_XLM`, `SQLITE_PATH=/data/tamsi.db`, `PUBLIC_URL`). Dashboard: https://railway.com/project/53c5e340-7385-4edd-a6a6-a885d79b8d11

**`.env`:** everything is set except `VELO_API_KEY` and `VELO_WEBHOOK_SECRET`.

**Demo card now:** 23.5 XLM on the card, only 3.5 above the floor. Per-tap max 10, daily cap 25, ipon floor 20, all in XLM (`packages/shared/demo.ts`). Demo rate ₱50 per XLM.

**Live spend today:** 16 of the 25 XLM cap. It resets at Philippine midnight. Before recording, wait for the reset and refill the card with Velo padala or `pnpm fund:demo`.

**Proved on the live URL:**

| Tap | Result | Time |
| :-- | :-- | :-- |
| 2 XLM at Aling Nena's Store, through `/pos` | `paid` | over 20 s, not timed exactly |
| 5 XLM at Games arcade | `merchant_not_allowed` | 0.6 s |
| 12 XLM, over the per-tap max | `over_limit` | 8.4 s |
| 24 XLM, over the daily cap | `daily_cap` | 0.7 s |
| 10 XLM twice at once | one `paid`, one `daily_cap` | 25 s |
| 4 XLM, would go below the floor | `ipon_floor` | 5.4 s |

Today's spend also survived a Railway redeploy, so the volume works.

**Agent pays, on the live URL:** https://stellar.expert/explorer/testnet/tx/c16968ef017896a0d1a94ee6e94da7f5afed13c1a26f24a77fa5de45609a1929

**Not done:** Phases 2–5. Only the six Guarded tap boxes in the PRD are ticked. The top-up request on `ipon_floor` and low balance is Phase 3. `README.md` still has its TODOs (Phase 4), and the "Testnet proof" section should use the link above.

---

## 2. Things that will trip you up

- **AI tools can't type secret keys into a website.** For Railway variables, the user pastes them into the Raw Editor. Last time, a gitignored file was copied to the clipboard with `clip.exe`, without printing it, and the clipboard was cleared afterwards. The app warns that a Railway button also writes to the clipboard, so copy after clicking it.
- **Browser sign-ins:** GitHub and Railway are signed in, in the Claude app's built-in browser pane. GitHub's Authorize button stays disabled for a moment after the page loads, so an early click does nothing.
- **Local Node is outside the SDK's range.** This PC has Node 25.9.0 and no version manager; the SDK wants `^22.23.4 || ^24.22.1 || >=26.12.1`. The Dockerfile pins 24.22.1, and the full flow passed in that image and on Railway.
- **`engines` is `>=24.22.1` on purpose**, as `agents.md` says. An upper limit such as `<25` would exclude this PC's Node 25.9, and pnpm may then refuse to run here (not tested).
- **Don't add `devEngines.runtime`.** pnpm's Node download timed out twice on this connection and made every later pnpm command fail. The other packages installed fine.
- **pnpm 11 stops on unapproved build scripts.** `pnpm-workspace.yaml` has `allowBuilds` with `esbuild: true`. New native dependencies will need their own entry, or pnpm fails with `ERR_PNPM_IGNORED_BUILDS`. We use `node:sqlite`, so SQLite needs no entry.
- **Local and Railway databases are separate, but the card is one.** Today's spend is counted per database; the card balance is on-chain and shared. Taps from a local server spend real card balance, and `tamsi.db` has its own cap count.
- **Card status syncs from the chain only at boot.** After the Phase 3 kill switch and a rerun of `pnpm setup:testnet`, restart the Railway service, or the card stays `revoked` in its database.
- **`pnpm start` needs a web build and doesn't watch files.** Run `pnpm build` first, and restart after code changes. `pnpm dev` watches both, with Vite proxying `/api` to port 3000.
- **`.claude/launch.json` is local only** (gitignored). It starts `pnpm start` for the browser pane, which may pick a port other than 3000.
- **`pnpm fund:demo` failed once** straight after the card was registered, and worked on the rerun. The error wasn't captured, so the cause is unknown. Rerun it if it happens again.
- **Friendbot:** `setup.ts` asks Horizon whether an account exists rather than trusting Friendbot's error wording. Friendbot also tops up accounts below its starting balance, so a rerun may report some as `funded`.
- **Git identity is set in this repo only** (`jersy26`), because there's no global one.

---

## 3. Noir SDK facts confirmed from `@noirx402/agent-sdk` 0.3.0

- The card is registered with `execute(owner, { kind: 'registerDevice', deviceHash, agent })`.
- `keypairSigner(secret)` makes a server signer. `toStroops` and `fromStroops` come from the SDK.
- `authorizePayment` defaults its nonce to milliseconds since epoch. The nonce must increase per device and agent, and the per-card queue keeps that true.
- `noir.watch` takes one `deviceHash` or `merchant` filter, plus `fromLedger` and `types`. It has no list of devices. `pastEvents(fromLedger)` covers the backfill; RPC keeps about 7 days.
- The kill switch in SDD §3 still works as written. The SDK also has `unlinkDevice`, which revokes the device as well as the agent. The kill switch doesn't need that, so keep the SDD's order.
- `NoirContractError.errorName` is the contract's error. `err.name` is always `NoirContractError`, so `agents.md` and the SDD now say `errorName`.
