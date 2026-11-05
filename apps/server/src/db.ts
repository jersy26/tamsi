// SQLite through Node's built-in driver, so there is no native build step to fail on
// Railway. Amounts are stroops stored as TEXT and read back with BigInt (SDD §4).
import { randomUUID } from 'node:crypto'
import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { toStroops, type NoirAgentPolicy } from '@noirx402/agent-sdk'
import { DEMO_CARD, DEMO_MERCHANTS, DEMO_RULES, type CardStatus, type CardSummary, type Category, type MerchantSummary } from '@tamsi/shared'
import type { AgentCard, AgentMerchant, TapStore } from '@tamsi/agent'

const SCHEMA = `
CREATE TABLE IF NOT EXISTS cards (
  device_hash TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  holder_name TEXT NOT NULL,
  owner_wallet TEXT NOT NULL,
  agent_pubkey TEXT NOT NULL,
  max_per_tap TEXT NOT NULL,
  expires_at TEXT,
  status TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS rules (
  device_hash TEXT PRIMARY KEY REFERENCES cards(device_hash),
  daily_cap TEXT NOT NULL,
  ipon_floor TEXT NOT NULL,
  allowed_categories TEXT NOT NULL,
  next_payday TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS merchants (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  stellar_address TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS taps (
  id TEXT PRIMARY KEY,
  device_hash TEXT NOT NULL,
  merchant_id TEXT NOT NULL,
  amount TEXT NOT NULL,
  decision TEXT NOT NULL,
  reason_code TEXT NOT NULL,
  reason_text TEXT NOT NULL,
  nonce TEXT,
  tx_hash TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS taps_by_card_time ON taps (device_hash, created_at);
CREATE TABLE IF NOT EXISTS topups (
  id TEXT PRIMARY KEY,
  device_hash TEXT NOT NULL,
  payment_intent_id TEXT UNIQUE,
  amount TEXT NOT NULL,
  requested_by TEXT NOT NULL,
  status TEXT NOT NULL,
  checkout_url TEXT,
  fund_tx_hash TEXT
);
CREATE TABLE IF NOT EXISTS noir_events (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  payload TEXT NOT NULL,
  ledger INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS velo_deliveries (
  delivery_id TEXT PRIMARY KEY
);
`

export function openDb(path: string): DatabaseSync {
  mkdirSync(dirname(path), { recursive: true })
  const db = new DatabaseSync(path)
  db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;')
  db.exec(SCHEMA)
  return db
}

export interface SeedInput {
  deviceHash: string
  ownerWallet: string
  agentPubkey: string
  merchantAddresses: Record<string, string>
  // The card's on-chain policy; undefined when the chain couldn't be read.
  policy: NoirAgentPolicy | null | undefined
}

// Safe on every boot and every setup run. A card with no on-chain policy can't pay, so
// it reads as revoked; the OFW's edits to rules (Tier 3) are left alone.
export function seedDemo(db: DatabaseSync, input: SeedInput): void {
  const { deviceHash, policy } = input
  const status: CardStatus | null = policy === undefined ? null : policy ? 'active' : 'revoked'
  db.prepare(
    `INSERT INTO cards (device_hash, label, holder_name, owner_wallet, agent_pubkey, max_per_tap, expires_at, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT (device_hash) DO UPDATE SET
       owner_wallet = excluded.owner_wallet,
       agent_pubkey = excluded.agent_pubkey,
       max_per_tap = excluded.max_per_tap,
       expires_at = COALESCE(excluded.expires_at, cards.expires_at),
       status = COALESCE(?, cards.status)`,
  ).run(
    deviceHash,
    DEMO_CARD.label,
    DEMO_CARD.holderName,
    input.ownerWallet,
    input.agentPubkey,
    (policy?.maxAmount ?? toStroops(DEMO_CARD.maxPerTapXlm)).toString(),
    policy?.expiresAt?.toISOString() ?? null,
    status ?? 'active',
    status,
  )

  const nextPayday = new Date(Date.now() + DEMO_RULES.nextPaydayDays * 24 * 60 * 60 * 1000)
  db.prepare(
    `INSERT OR IGNORE INTO rules (device_hash, daily_cap, ipon_floor, allowed_categories, next_payday)
     VALUES (?, ?, ?, ?, ?)`,
  ).run(
    deviceHash,
    toStroops(DEMO_RULES.dailyCapXlm).toString(),
    toStroops(DEMO_RULES.iponFloorXlm).toString(),
    JSON.stringify(DEMO_RULES.allowedCategories),
    nextPayday.toISOString(),
  )

  const merchant = db.prepare(
    `INSERT INTO merchants (id, name, category, stellar_address) VALUES (?, ?, ?, ?)
     ON CONFLICT (id) DO UPDATE SET
       name = excluded.name, category = excluded.category, stellar_address = excluded.stellar_address`,
  )
  for (const { id, name, category } of DEMO_MERCHANTS) {
    const address = input.merchantAddresses[id]
    if (!address) throw new Error(`MERCHANT_SECRETS has no key for merchant "${id}"`)
    merchant.run(id, name, category, address)
  }
}

interface CardRow {
  device_hash: string
  status: CardStatus
  daily_cap: string
  ipon_floor: string
  allowed_categories: string
}

interface MerchantRow {
  id: string
  name: string
  category: Category
  stellar_address: string
}

export function createStore(db: DatabaseSync) {
  const cardQuery = db.prepare(
    `SELECT c.device_hash, c.status, r.daily_cap, r.ipon_floor, r.allowed_categories
     FROM cards c JOIN rules r ON r.device_hash = c.device_hash WHERE c.device_hash = ?`,
  )
  const merchantQuery = db.prepare('SELECT id, name, category, stellar_address FROM merchants WHERE id = ?')
  const spentQuery = db.prepare(
    `SELECT amount FROM taps WHERE device_hash = ? AND decision = 'approved' AND created_at >= ?`,
  )
  const tapInsert = db.prepare(
    `INSERT INTO taps (id, device_hash, merchant_id, amount, decision, reason_code, reason_text, nonce, tx_hash, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )

  const store = {
    getCard(deviceHash: string): AgentCard | null {
      const row = cardQuery.get(deviceHash) as unknown as CardRow | undefined
      if (!row) return null
      return {
        deviceHash: row.device_hash,
        status: row.status,
        dailyCap: BigInt(row.daily_cap),
        iponFloor: BigInt(row.ipon_floor),
        allowedCategories: JSON.parse(row.allowed_categories) as Category[],
      }
    },
    getMerchant(id: string): AgentMerchant | null {
      const row = merchantQuery.get(id) as unknown as MerchantRow | undefined
      if (!row) return null
      return { id: row.id, name: row.name, category: row.category, stellarAddress: row.stellar_address }
    },
    spentSince(deviceHash: string, since: Date): bigint {
      const rows = spentQuery.all(deviceHash, since.toISOString()) as unknown as { amount: string }[]
      return rows.reduce((sum, row) => sum + BigInt(row.amount), 0n)
    },
    saveTap(tap, decision): string {
      const id = randomUUID()
      tapInsert.run(
        id,
        tap.deviceHash,
        tap.merchantId,
        tap.amount.toString(),
        decision.decision,
        decision.reasonCode,
        decision.reasonText,
        decision.nonce?.toString() ?? null,
        decision.txHash,
        new Date().toISOString(),
      )
      return id
    },
    listMerchants(): MerchantSummary[] {
      return db.prepare('SELECT id, name, category FROM merchants ORDER BY rowid').all() as unknown as MerchantSummary[]
    },
    listCards(): CardSummary[] {
      return db
        .prepare('SELECT device_hash AS deviceHash, label, holder_name AS holderName FROM cards ORDER BY rowid')
        .all() as unknown as CardSummary[]
    },
  } satisfies TapStore & Record<string, unknown>

  return store
}

export type Store = ReturnType<typeof createStore>
