# Tamsi — Session Handoff

**Date:** 2026-11-06, about 03:00 Philippine time (third session: Phase 2, all but real Velo keys)
**Branch:** `main` at https://github.com/jersy26/tamsi (public). Run `git status -sb` to see whether this file's commit has been pushed.
**Live:** https://tamsi-production.up.railway.app (Railway Trial plan, project `stunning-amazement`; the dashboard shows "30 days or $5.00 left")
**Deadline:** submissions close **Sat Nov 7, 12:00 PM**. Aim to submit by 11:00 AM.
**Plan gates:** start Phase 3 only by Sat 12:00 AM, otherwise skip to Phase 4. Start Phase 4 by Sat 4:00 AM, wherever Phase 3 is.
**Tests:** `pnpm test` (32 pass), `pnpm typecheck` passes. The OFW feed passed with a real tap on the live URL. Padala has never run against real Velo.

> **Next session: start with section 0 (To do), then work from one SDD section at a time.** Read `agents.md` first; its hard rules can disqualify the project.

---

## 0. To do

### Next: finish Phase 2 (blocked on the user's Velo project)
The padala code is written and deployed, and stays off until the keys are set. Once they are:
1. Open `/ofw`, send a small padala and pay it from a wallet. This is the first real test of `asset: 'native'`, the amount format and Velo's webhook payload.
2. Check the page goes created → paid → funded, the balance rises, and a receipt lands on `/ofw`.
3. Resend the webhook from Velo's dashboard if it offers that, to see it funds once. Open `/pay/success` before paying to see the redirect funds nothing.
4. Tick the three Padala boxes in the PRD. That finishes Tier 1. Then Phase 3, subject to the gate above.

If Velo keys are going to be late, tell the user rather than starting Tier 2: `agents.md` says no Tier 2 until every Tier 1 box is checked.

### Needs the user (cannot be done from here)
- **Velo project:** create a Testnet project at velo-build.dev using the treasury wallet, `GBRFIH6D4FOG333NO43DRQ74AZLEQQCEI4KJ4H7EAKQ3ACRCUITNCU45`. Import `TREASURY_SECRET` from `.env` into a browser wallet to do it. Set the webhook URL to `https://tamsi-production.up.railway.app/webhooks/velo`. Put `VELO_API_KEY` and `VELO_WEBHOOK_SECRET` in `.env`, never in chat, and paste them into Railway's Raw Editor too. Blocks the rest of Phase 2.
- **Railway GitHub App:** install it so pushes deploy, limited to the `tamsi` repo. Confirmed needed: a push started no deployment in 4 minutes. Until then, deploy by hand: Railway dashboard → open the service → Ctrl+K → type "deploy latest" → Enter. Clicking the palette item often does nothing, so check for the "Deployment triggered" toast and a new BUILDING row, then check `/api/health` shows the new build.
- **Noir SDK bug:** tell Noir in `#noir-sdk-and-extension` (see "SDK patch" below), and ask whether the patch is acceptable under the "Noir only through the SDK" rule.
- **Discord handle:** still a TODO in `README.md`.

### Open problems
- **SDK patch.** Testnet RPC no longer sends `inSuccessfulContractCall`, and `@noirx402/agent-sdk` 0.3.0 (the newest) drops every event without it, so `noir.watch`, `getEvents` and `pastEvents` returned nothing. `patches/@noirx402__agent-sdk@0.3.0.patch` changes that one check. All Noir calls still go through the SDK, with no raw RPC and no network override. The README must disclose it (Phase 4). A test in `apps/server/src/feed.test.ts` fails if the patch stops applying. Remove it if Noir ships a fix.
- **Paid taps take about 21–29 s.** Measured 21 s from this PC and 29 s on the live URL, so it isn't Railway. One balance read took 1.3–4.8 s here, and a tap makes several reads plus a submit and confirmation polling, so the likely cause is RPC latency. The counter says "Checking" the whole time, which is long for the demo video. Consider saying what's happening at the counter, or trimming the wait in the video edit.
- **A failed funding isn't retried.** If `fundEscrow` throws, the top-up becomes `fund_failed`, because the transaction may still have landed. Check Stellar Expert, then use `pnpm fund:demo` if it didn't. A restart between the 200 and the retrieve also loses that webhook: rule 7 forbids funding from a retrieve alone, so there's no poll on boot. Both are narrow, and acceptable for the demo.
- **Railway partial outage:** some networks block Railway IPs (https://status.railway.com/incident/QBCLHG1V, the banner was still up Nov 6). The URL opens from this PC. Test it on phone data too before submitting. The Docker image can move to another host without code changes.
- **`/api/taps` has no login.** Anyone with the URL can spend Testnet money, within the card's limits. That's acceptable for the demo, but the Phase 3 kill switch would let anyone turn the card off mid-judging. Decide how to guard it when building it.

### Check before relying on it
- **Velo `asset: 'native'`:** SDD §3 assumes it, but the SDK types only say `string` and its README example uses `USDC`. Try it on the first checkout.
- **Velo SDK version:** `@alpha` is `0.1.0-alpha.4`, as `agents.md` requires. npm also lists `latest` as `1.0.0`, while the package's README says `latest` is `0.1.0-alpha.2`. Not looked into. Ask in the hackathon channel if it matters.
- **Device hash:** we use the SHA-256 of the UID string, as hex. The SDK comments agree, but SDD §3 says to match Noir's NFC hashing doc, which hasn't been checked. It matters only for a real tag (Tier 3).

---

## 1. What exists

| Path | What it is |
| :-- | :-- |
| `packages/shared` | Reason codes and their sentences (`reasons.ts`), categories, shared types, demo family data (`demo.ts`). |
| `packages/agent` | `decide.ts` (SDD §3 checks), `queue.ts` (per-card queue), `tamsi.ts` (ties them together and saves the tap), `noir.ts` (Noir SDK calls), unit tests. |
| `apps/server` | Express: `/api/health`, `/api/merchants`, `/api/cards`, `/api/cards/:hash`, `/api/stream/:hash`, `/api/taps`, `/api/topups`, `/webhooks/velo`; serves the web build. `feed.ts` is `noir.watch` → `noir_events` → SSE. `topups.ts` is checkout and webhook funding, created only when the Velo keys are set. `db.ts` holds all SDD §4 tables and an idempotent seed that also runs at boot, so the Railway volume seeds itself. |
| `apps/web` | Vite + React: `/`, `/pos`, `/ofw`, `/pay/success`, `/pay/cancel`. No router. |
| `patches/` | One-line fix to the Noir SDK's event filter. See "SDK patch". |
| `Dockerfile` | The deploy image, Node 24.22.1. Runs through `tsx`, so `pnpm build` builds the web app and only typechecks the server. |
| `scripts/setup.ts` | SDD §3 setup steps 1–6, in one rerunnable command. Also fills `SQLITE_PATH` and `DEMO_PHP_PER_XLM`. |
| `scripts/fund-demo.ts` | `pnpm fund:demo 60`: treasury funds the card by hand. A developer tool, not reachable from the server. |
| `scripts/spike.ts`, `docs/testnet-proof.md` | Phase 0 proof. Each spike run overwrites the proof file. |

**Railway setup:** Dockerfile build, volume at `/data`, target port 8080, region US West, 8 variables (`AGENT_SECRET`, `OFW_SECRET`, `TREASURY_SECRET`, `MERCHANT_SECRETS`, `DEMO_CARD_UID`, `DEMO_PHP_PER_XLM`, `SQLITE_PATH=/data/tamsi.db`, `PUBLIC_URL`). Dashboard: https://railway.com/project/53c5e340-7385-4edd-a6a6-a885d79b8d11

**`.env`:** everything is set except `VELO_API_KEY` and `VELO_WEBHOOK_SECRET`.

**Demo card now:** 31.5 XLM on the card, 11.5 above the floor. Per-tap max 10, daily cap 25, ipon floor 20, all in XLM (`packages/shared/demo.ts`). Demo rate ₱50 per XLM.

**Live spend today (Nov 6):** 16.5 of the 25 XLM cap. It resets at Philippine midnight. Before recording, wait for the reset and refill the card with Velo padala or `pnpm fund:demo`.

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

**Feed, on the live URL:** a 0.5 XLM tap reached `/api/stream` about 4 s after the tap answered (https://stellar.expert/explorer/testnet/tx/f366f29faf1dc2079b2f4e64c3d287444f015d7a7e4587d8c4d39483eaa8e5b7). A hand funding with `pnpm fund:demo` showed as a receipt too (https://stellar.expert/explorer/testnet/tx/e31781c1fc942e4f7a580c0800eddb1b4b02ddcc7093eb87e217d4ffb304c705). A restart resumed without duplicates. With Velo off, `/webhooks/velo` and `/api/topups` answer 503 and `/ofw` hides the form.

**Padala is tested only without real Velo:** unit and HTTP tests use the SDK's real signature check with a fake Velo (`apps/server/src/topups.test.ts`), and a fake key got `invalid_api_key` from Velo's real API. No checkout has ever opened. `Funded` on `/pay/success` has only been seen with a seeded database row.

**Receipts wording:** taps made on another database (a local server, for example) show the plain "Paid X at Y." on the live feed, because the agent's sentence lives in that server's `taps` table.

**Agent pays, on the live URL:** https://stellar.expert/explorer/testnet/tx/c16968ef017896a0d1a94ee6e94da7f5afed13c1a26f24a77fa5de45609a1929

**Not done:** the rest of Phase 2 (the three Padala boxes need real keys), then Phases 3–5. The six Guarded tap boxes and the OFW feed box in the PRD are ticked. The top-up request on `ipon_floor` and low balance is Phase 3. `README.md` still has its TODOs (Phase 4), and the "Testnet proof" section should use the link above.

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
