# Tamsi — Session Handoff

**Date:** 2026-11-06, about 01:20 Philippine time (first session: Phase 0)
**Branch:** `main`, local only. No GitHub remote exists yet, so nothing is pushed.
**Deadline:** submissions close **Sat Nov 7, 12:00 PM**, about 34 hours after this was written. Aim to submit by 11:00 AM.
**Tests:** no unit tests yet. `pnpm exec tsc --noEmit -p .` passes, and `pnpm spike` passed on Testnet.

> **Next session: start with section 0 (To do), then work from one SDD section at a time.** Read `agents.md` first; its hard rules can disqualify the project.

---

## 0. To do

### Next (code work): Phase 1
1. Express hello-world, deployed to Railway with Node 24.22.1, before any feature code. This also confirms the SDK on a supported Node version (see section 2).
2. `packages/shared`: reason codes (`reasons.ts`), categories, shared types.
3. `packages/agent`: the decision pipeline in SDD §3, with unit tests for the cap race, savings floor and allowlist.
4. SQLite schema (SDD §4), `/api/taps`, `/pos` page.
5. Extend `scripts/setup.ts` with SDD §3 setup steps 2–6. It only does step 1 today: it does **not** register the demo card or seed the database.

Phase 1 is done when a tap on the live URL pays through Noir or declines with a reason.

### Needs the user (cannot be done from here)
- **Velo project:** create a Testnet project at velo-build.dev using the treasury wallet, `GBRFIH6D4FOG333NO43DRQ74AZLEQQCEI4KJ4H7EAKQ3ACRCUITNCU45`. Import `TREASURY_SECRET` from `.env` into a browser wallet to do it. Put `VELO_API_KEY` and `VELO_WEBHOOK_SECRET` in `.env`, never in chat. Blocks Phase 2, not Phase 1.
- **Railway:** an account you can log in to. Blocks the first Phase 1 step.
- **Public GitHub repo:** required for submission. `gh` isn't installed here, so use GitHub Desktop or the website.
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
| `scripts/setup.ts` | Creates and funds the Testnet keys and writes them to `.env`. Rerunnable: keeps existing keys and leaves `.env` alone. |
| `scripts/spike.ts` | Runs the whole chain flow on a new card each run. Each run spends 20 XLM of treasury money into that card (18.5 stays in its escrow). |
| `docs/testnet-proof.md` | Tx links from the spike. Each spike run overwrites it. |
| `apps/*`, `packages/*` | Empty folders so far. |
| `.env` | Gitignored. All keys set; Velo keys, `SQLITE_PATH`, `PUBLIC_URL` and `DEMO_PHP_PER_XLM` still empty. |

**Proved on Testnet:** a treasury that doesn't own a card can fund it, so the custodial fallback in BUILD-PLAN §4 isn't needed. The agent paid 1.5 XLM within a 5 XLM per-tap max, the merchant claimed it, and `checkPayment` returned `over_limit` above the max.

**Not started:** all of Phases 1–5. No PRD box is checked yet.

---

## 2. Things that will trip you up

- **Local Node is outside the SDK's range.** This PC has Node 25.9.0 and no version manager; the SDK wants `^22.23.4 || ^24.22.1 || >=26.12.1`. Everything so far ran on 25.9 and worked, but that isn't proof for the deployed version. `.nvmrc` says 24.22.1.
- **`engines` is `>=24.22.1` on purpose**, as `agents.md` says. An upper limit such as `<25` would exclude this PC's Node 25.9, and pnpm may then refuse to run here (not tested).
- **Don't add `devEngines.runtime`.** pnpm's Node download timed out twice on this connection and made every later pnpm command fail. The other packages installed fine.
- **pnpm 11 stops on unapproved build scripts.** `pnpm-workspace.yaml` has `allowBuilds` with `esbuild: true`. New native dependencies (a SQLite driver, for example) will need their own entry, or pnpm fails with `ERR_PNPM_IGNORED_BUILDS`.
- **Friendbot errors:** its "already funded" message didn't match the wording the script first looked for and crashed a rerun, so `setup.ts` now asks Horizon whether the account exists. Friendbot also tops up accounts that fall below its starting balance, so a rerun may report some as `funded`.
- **Git identity is set in this repo only** (`jersy26`), because there's no global one.

---

## 3. Noir SDK facts confirmed from `@noirx402/agent-sdk` 0.3.0

- The card is registered with `execute(owner, { kind: 'registerDevice', deviceHash, agent })`.
- `keypairSigner(secret)` makes a server signer. `toStroops` and `fromStroops` come from the SDK.
- `authorizePayment` defaults its nonce to milliseconds since epoch. The nonce must increase per device and agent, and the per-card queue keeps that true.
- `noir.watch` takes one `deviceHash` or `merchant` filter, plus `fromLedger` and `types`. It has no list of devices. `pastEvents(fromLedger)` covers the backfill; RPC keeps about 7 days.
- The kill switch in SDD §3 still works as written. The SDK also has `unlinkDevice`, which revokes the device as well as the agent. The kill switch doesn't need that, so keep the SDD's order.
