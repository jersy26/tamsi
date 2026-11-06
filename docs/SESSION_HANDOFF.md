# Tamsi — Session Handoff

**Date:** 2026-11-07, about 01:45 Philippine time (Tier 1 and Tier 2 done on the live URL)
**Branch:** `main` at https://github.com/jersy26/tamsi (public). Run `git status -sb` to see whether this file's commit has been pushed.
**Live:** https://tamsi-production.up.railway.app (Railway Trial plan, project `stunning-amazement`; the dashboard shows "30 days or $4.99 left")
**Deadline:** submissions close **Sat Nov 7, 12:00 PM**. Aim to submit by 11:00 AM.
**Plan gates:** Phase 3 is done. Phase 4 is done except the two README TODOs (video link, Discord handle). Feature freeze: bug fixes only.
**Design:** the Nov 7 redesign is live (floating cards, the bird, pesos first). `docs/wireframes.html` is the uncommitted mockup.
**Tests:** `pnpm test` (57 pass), `pnpm typecheck` passes. Every Tier 1 and Tier 2 box passed on the live URL.

> **Next session: start with section 0 (To do), then work from one SDD section at a time.** Read `agents.md` first; its hard rules can disqualify the project.

---

## 0. To do

### Next: Phase 5, ship
1. Demo video, 2 minutes, following BUILD-PLAN §5. Add its link to the README.
2. Discord handle in the README.
3. Check the live URL in an incognito window and on phone data (Railway's network blocks).
4. Submit, using the checklist in BUILD-PLAN §6.

Before recording, make sure the card is on (`/ofw` shows no "turned off" notice) and has plenty on it. Today's spend resets at Philippine midnight.

### Demo video amounts
Set up for a card holding 35 XLM (₱1,750) with little spent today (`pnpm defund:demo` and `pnpm fund:demo` set the balance, in XLM). Each paid tap adds to today's spend, so a re-take may need different amounts. The keypads take pesos, at ₱50 per XLM.

| Step | Do | Result |
| :-- | :-- | :-- |
| 1 | Send padala, ₱250, paid from Account 1 (`GBB553…`) | Funded; balance ₱2,000 |
| 2 | Aling Nena's, ₱250 | Approved |
| 3 | Games arcade, ₱250 | Declined `merchant_not_allowed`, no chain call |
| 4 | Aling Nena's, ₱1,050 | Declined `daily_cap` |
| 5 | Aling Nena's, ₱600 | Declined by Noir's `over_limit` |
| 6 | Aling Nena's, ₱800 | Declined `ipon_floor`; the agent's request appears on `/ofw` |
| 7 | Turn off, with the PIN | ₱1,750 returned; the next tap gets `no_agent` |

**Turn the card back on after recording,** or judges will find it off.

### Kill switch plan for the video
Step 7 is the first real run of the kill switch with the new screens, and it takes the card offline for judges until it's turned back on. Paying and declining are proven on the live URL; this isn't, on purpose.
1. Record steps 1 to 6 first, and check them. A card can only be turned off once per recovery.
2. Have the PIN ready: it's `KILL_SWITCH_PIN`, in `.env` and on Railway. The keypad takes digits, or type it on a laptop.
3. In step 7, tap Turn off, enter the PIN, and tap "Turn off and bring the money back". It takes about a minute. Don't leave the page.
4. Check: the banner says spending is off, "The card is off" shows two Stellar Expert links, and a tap gets `no_agent`.
5. If it says "It didn't finish", tap the button again. It picks up where it stopped.
6. Recover straight away, using the steps below. Allow 15 minutes, and finish before submitting.

### After the kill switch, to turn the card back on
1. `pnpm setup:testnet` re-registers the agent (the device stays registered).
2. Redeploy on Railway, because card status only syncs from the chain at boot.
3. `pnpm fund:demo 60`. The withdrawn money stays with the OFW wallet.
4. Check the live URL: `/ofw` shows no "turned off" notice and `/api/health` says `policyRegistered: true`, then tap ₱25 at Aling Nena's.

### Needs the user
- **Noir SDK bug:** tell Noir in `#noir-sdk-and-extension`, and ask whether the patch is acceptable under the "Noir only through the SDK" rule. Same for Velo's webhook validator in the Velo channel.
- **Railway GitHub App:** optional now. Without it, deploy by hand: Railway dashboard → open the service → click the page, Ctrl+K, click "Deploy latest commit". Check for a new BUILDING row. The tool-driven route became unreliable, so a person should press it.
- **Discord handle and video link:** still TODO in `README.md`.

### Open problems
- **Two SDK patches.** `patches/` holds one for Noir (Testnet RPC dropped `inSuccessfulContractCall`, so the SDK discarded every event) and one for Velo (its validator refused real events on metadata fields, after the signature had passed). Both are disclosed in the README and have tests that fail if they stop applying.
- **Paid taps take about 21–29 s.** Measured 21 s from this PC and 29 s on the live URL, so it isn't Railway. One balance read took 1.3–4.8 s, and a tap makes several reads plus a submit and confirmation polling, so the likely cause is RPC latency. The counter says "Checking" the whole time. Trim the wait in the video edit.
- **The first real padala stayed unfunded by the webhook.** Top-up `45b3707d…` hit the validator bug and still reads `created`, so its `/pay/success` page says Waiting. Velo has no replay button, so the 5 XLM was put on the card by hand with `pnpm fund:demo 5`.
- **A failed funding isn't retried.** If `fundEscrow` throws, the top-up becomes `fund_failed`, because the transaction may still have landed. Check Stellar Expert, then use `pnpm fund:demo` if it didn't. A restart between the 200 and the retrieve also loses that webhook: rule 7 forbids funding from a retrieve alone, so there's no poll on boot.
- **Railway partial outage:** some networks block Railway IPs (https://status.railway.com/incident/QBCLHG1V, the banner was still up Nov 7). The Docker image can move to another host without code changes.
- **`/api/taps`, `/api/topups` and the claim route have no login.** Anyone with the URL can spend Testnet money within the card's limits, which is acceptable for the demo. The kill switch has a PIN (`KILL_SWITCH_PIN`) so nobody can turn the card off mid-judging.

### Check before relying on it
- **Velo `tk_live_` key prefix:** Velo issued this prefix for a Testnet project. Real payments landed on Testnet, so it's fine; the name just reads oddly.
- **Velo SDK version:** `@alpha` is `0.1.0-alpha.4`, as `agents.md` requires. npm also lists `latest` as `1.0.0`, while the package's README says `latest` is `0.1.0-alpha.2`. Not looked into. Ask in the hackathon channel if it matters.
- **Device hash:** we use the SHA-256 of the UID string, as hex. The SDK comments agree, but SDD §3 says to match Noir's NFC hashing doc, which hasn't been checked. It matters only for a real tag (Tier 3).

---

## 1. What exists

| Path | What it is |
| :-- | :-- |
| `packages/shared` | Reason codes and their sentences (`reasons.ts`), categories, shared types, demo family data (`demo.ts`). |
| `packages/agent` | `decide.ts` (SDD §3 checks), `queue.ts` (per-card queue), `tamsi.ts` (ties them together and saves the tap), `noir.ts` (Noir SDK calls), unit tests. |
| `apps/server` | Express: `/api/health`, `/api/merchants`, `/api/cards`, `/api/cards/:hash`, `/api/stream/:hash`, `/api/taps`, `/api/topups`, `/webhooks/velo`; serves the web build. `feed.ts` merges `noir.watch` events, declined taps and agent requests into SSE receipts. `topups.ts` is checkout, webhook funding and the agent's request. `kill.ts` is the kill switch. `db.ts` holds all SDD §4 tables and an idempotent seed that also runs at boot, so the Railway volume seeds itself. |
| `apps/web` | Vite + React: `/`, `/pos`, `/ofw`, `/pay/success`, `/pay/cancel`. No router. |
| `patches/` | One-line fix to the Noir SDK's event filter. See "SDK patch". |
| `Dockerfile` | The deploy image, Node 24.22.1. Runs through `tsx`, so `pnpm build` builds the web app and only typechecks the server. |
| `scripts/setup.ts` | SDD §3 setup steps 1–6, in one rerunnable command. Also fills `SQLITE_PATH` and `DEMO_PHP_PER_XLM`. |
| `scripts/fund-demo.ts`, `scripts/defund-demo.ts` | `pnpm fund:demo 60` and `pnpm defund:demo 24` set the card's balance by hand. Developer tools, not reachable from the server. |
| `scripts/spike.ts`, `docs/testnet-proof.md` | Phase 0 proof. Each spike run overwrites the proof file. |

**Railway setup:** Dockerfile build, volume at `/data`, target port 8080, region US West, 11 variables (`AGENT_SECRET`, `OFW_SECRET`, `TREASURY_SECRET`, `MERCHANT_SECRETS`, `DEMO_CARD_UID`, `DEMO_PHP_PER_XLM`, `SQLITE_PATH=/data/tamsi.db`, `PUBLIC_URL`, `VELO_API_KEY`, `VELO_WEBHOOK_SECRET`, `KILL_SWITCH_PIN`). Dashboard: https://railway.com/project/53c5e340-7385-4edd-a6a6-a885d79b8d11

**`.env`:** everything is set. Never commit it or paste it in chat.

**Demo card:** per-tap max 10, daily cap 25, ipon floor 20, all in XLM (`packages/shared/demo.ts`). Demo rate ₱50 per XLM. Check `/ofw` for today's balance and spend.

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

**Padala, on the live URL:** a real 5 XLM checkout from a separate wallet went created → funded (https://stellar.expert/explorer/testnet/tx/242115457f117d5994c37b65d23feddc5c0cbddb080f026d879d2763baaa946e). Signed duplicates funded nothing more, and visiting `/pay/success` funded an unpaid top-up nothing.

**Tier 2, on the live URL:** a declined tap in the feed; a 32 XLM claim (https://stellar.expert/explorer/testnet/tx/d68d6c2e38cc853949b7306b2c3649212a45d5bd271278c3765660b5861409d8); an ipon decline that made the agent open a 12 XLM checkout with its formula. Kill switch: wrong PIN refused, revoke (https://stellar.expert/explorer/testnet/tx/90aaf53d991f85ab41537e1d90fff450efd29e2db4da2df1530c0829149937d8) then withdraw (https://stellar.expert/explorer/testnet/tx/0c187bed47cc6ac7e74cabbc7aa6d34ed63c28fae427a327f83c1a1e9e4ac0d4), next tap refused with Noir's `no_agent`.

**Receipts wording:** taps made on another database (a local server, for example) show the plain "Paid X at Y." on the live feed, because the agent's sentence lives in that server's `taps` table.

**Agent pays, on the live URL:** https://stellar.expert/explorer/testnet/tx/c16968ef017896a0d1a94ee6e94da7f5afed13c1a26f24a77fa5de45609a1929

**Not done:** Phase 5 (video, Discord handle, submit). Tier 3 was never in scope for this deadline.

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
