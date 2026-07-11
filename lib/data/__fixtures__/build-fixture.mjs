/**
 * Build script for the sanitized test fixture database.
 *
 * Creates a small SQLite database at lib/data/__fixtures__/finance.db
 * with the same schema as the canonical finance database but populated
 * with FAKE data only. Contains zero real personal data.
 *
 * Run: node lib/data/__fixtures__/build-fixture.mjs
 */

import Database from "better-sqlite3";
import { existsSync, unlinkSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DB_PATH = resolve(__dirname, "finance.db");

// Remove old fixture if present
if (existsSync(DB_PATH)) {
  unlinkSync(DB_PATH);
}

const db = new Database(DB_PATH);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

// ---------------------------------------------------------------------------
// Schema — mirrors the canonical DB exactly
// ---------------------------------------------------------------------------

db.exec(`
  CREATE TABLE accounts (
    account_key TEXT PRIMARY KEY,
    display_name TEXT NOT NULL,
    currency TEXT NOT NULL DEFAULT 'TWD',
    account_type TEXT NOT NULL,
    is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
    is_debt INTEGER NOT NULL DEFAULT 0 CHECK (is_debt IN (0, 1)),
    default_transaction_side TEXT,
    obsidian_link TEXT,
    notes TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    bucket TEXT NOT NULL DEFAULT 'living' CHECK (bucket IN ('living', 'investment', 'liability', 'bridge', 'unknown')),
    CHECK (account_type IN ('cash', 'debt', 'credit_card', 'investment', 'receivable', 'payable', 'other'))
  );

  CREATE TABLE categories (
    category_key TEXT PRIMARY KEY,
    display_name TEXT NOT NULL,
    parent_category TEXT REFERENCES categories(category_key) ON UPDATE CASCADE ON DELETE SET NULL,
    is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
    budget_monthly REAL,
    typical_use TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE account_aliases (
    alias TEXT PRIMARY KEY,
    account_key TEXT NOT NULL REFERENCES accounts(account_key) ON UPDATE CASCADE ON DELETE RESTRICT,
    created_at TEXT NOT NULL
  );

  CREATE TABLE balance_snapshots (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    snapshot_date TEXT NOT NULL,
    snapshot_time TEXT NOT NULL,
    account_key TEXT NOT NULL REFERENCES accounts(account_key) ON UPDATE CASCADE ON DELETE RESTRICT,
    balance REAL NOT NULL,
    currency TEXT NOT NULL DEFAULT 'TWD',
    source TEXT NOT NULL,
    note TEXT,
    raw_event_id INTEGER,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    UNIQUE(snapshot_date, account_key)
  );

  CREATE TABLE loans (
    loan_key TEXT PRIMARY KEY,
    display_name TEXT NOT NULL,
    lender TEXT,
    linked_account_key TEXT NOT NULL REFERENCES accounts(account_key) ON UPDATE CASCADE ON DELETE RESTRICT,
    principal_original REAL NOT NULL,
    principal_current REAL NOT NULL,
    annual_interest_rate REAL NOT NULL,
    repayment_type TEXT NOT NULL DEFAULT 'interest_only_flexible',
    currency TEXT NOT NULL DEFAULT 'TWD',
    status TEXT NOT NULL DEFAULT 'active',
    note TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE loan_payments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    loan_key TEXT NOT NULL REFERENCES loans(loan_key) ON UPDATE CASCADE ON DELETE RESTRICT,
    transaction_id INTEGER,
    payment_date TEXT NOT NULL,
    payment_account_key TEXT NOT NULL REFERENCES accounts(account_key) ON UPDATE CASCADE ON DELETE RESTRICT,
    total_payment REAL NOT NULL,
    interest_component REAL NOT NULL DEFAULT 0,
    principal_component REAL NOT NULL DEFAULT 0,
    principal_remaining_after REAL NOT NULL,
    note TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE raw_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    received_at TEXT NOT NULL,
    source TEXT NOT NULL,
    event_type TEXT NOT NULL,
    idempotency_key TEXT,
    payload_json TEXT NOT NULL,
    status TEXT NOT NULL,
    error TEXT,
    created_at TEXT NOT NULL
  );

  CREATE TABLE meta (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    idempotency_key TEXT NOT NULL UNIQUE,
    timestamp TEXT NOT NULL,
    date TEXT NOT NULL,
    time TEXT NOT NULL,
    transaction_type TEXT NOT NULL CHECK (transaction_type IN ('expense', 'income', 'transfer', 'credit_card_payment', 'investment_settlement', 'adjustment', 'loan_interest_payment', 'loan_principal_repayment')),
    account_key TEXT NOT NULL REFERENCES accounts(account_key) ON UPDATE CASCADE ON DELETE RESTRICT,
    amount REAL NOT NULL,
    signed_amount REAL NOT NULL,
    currency TEXT NOT NULL DEFAULT 'TWD',
    category_key TEXT REFERENCES categories(category_key) ON UPDATE CASCADE ON DELETE SET NULL,
    merchant TEXT,
    note TEXT,
    client TEXT,
    source TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'confirmed',
    data_quality TEXT NOT NULL DEFAULT 'user_entered',
    raw_event_id INTEGER,
    legacy_md_path TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE INDEX idx_transactions_date ON transactions(date);
  CREATE INDEX idx_transactions_account ON transactions(account_key);
  CREATE INDEX idx_transactions_category ON transactions(category_key);
  CREATE INDEX idx_balance_snapshots_account ON balance_snapshots(account_key);
  CREATE INDEX idx_balance_snapshots_date ON balance_snapshots(snapshot_date);
  CREATE INDEX idx_loan_payments_date ON loan_payments(payment_date);
  CREATE INDEX idx_loan_payments_loan ON loan_payments(loan_key);
`);

// ---------------------------------------------------------------------------
// FAKE test data — zero personal data
// ---------------------------------------------------------------------------

const NOW = "2026-07-01T00:00:00+08:00";
const ts = (date) => `${date}T12:00:00+08:00`;

// -- Accounts --
const insertAccount = db.prepare(`
  INSERT INTO accounts (account_key, display_name, currency, account_type, is_active, is_debt, bucket, created_at, updated_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

const accounts = [
  ["CHK001", "Test Checking", "TWD", "cash", 1, 0, "living", NOW, NOW],
  ["SAV001", "Test Savings", "TWD", "cash", 1, 0, "living", NOW, NOW],
  ["CC001", "Test Credit Card", "TWD", "credit_card", 1, 1, "living", NOW, NOW],
  [
    "INV001",
    "Test Brokerage",
    "TWD",
    "investment",
    1,
    0,
    "investment",
    NOW,
    NOW,
  ],
  ["INV002", "Test Crypto", "USDT", "investment", 1, 0, "investment", NOW, NOW],
  [
    "LOAN001",
    "Test Loan Account",
    "TWD",
    "payable",
    1,
    1,
    "liability",
    NOW,
    NOW,
  ],
  ["INACTIVE", "Inactive Account", "TWD", "cash", 0, 0, "living", NOW, NOW],
];

for (const a of accounts) {
  insertAccount.run(...a);
}

// -- Categories --
const insertCat = db.prepare(`
  INSERT INTO categories (category_key, display_name, is_active, created_at, updated_at)
  VALUES (?, ?, ?, ?, ?)
`);

const categories = [
  ["food", "Food & Dining", 1, NOW, NOW],
  ["transport", "Transportation", 1, NOW, NOW],
  ["shopping", "Shopping", 1, NOW, NOW],
  ["entertainment", "Entertainment", 1, NOW, NOW],
  ["subscription", "Subscriptions", 1, NOW, NOW],
  ["income", "Income", 1, NOW, NOW],
  ["investment", "Investments", 1, NOW, NOW],
  ["loan_interest", "Loan Interest", 1, NOW, NOW],
];

for (const c of categories) {
  insertCat.run(...c);
}

// -- Account Aliases --
const insertAlias = db.prepare(`
  INSERT INTO account_aliases (alias, account_key, created_at)
  VALUES (?, ?, ?)
`);

insertAlias.run("checking", "CHK001", NOW);
insertAlias.run("Test Checking", "CHK001", NOW);

// -- Balance Snapshots --
const insertSnapshot = db.prepare(`
  INSERT INTO balance_snapshots (snapshot_date, snapshot_time, account_key, balance, currency, source, created_at, updated_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?)
`);

// CHK001 snapshots for time-series test
const snapshots = [
  ["2026-06-01", "12:00", "CHK001", 50000, "TWD", "test", NOW, NOW],
  ["2026-06-15", "12:00", "CHK001", 48500, "TWD", "test", NOW, NOW],
  ["2026-07-01", "12:00", "CHK001", 52300, "TWD", "test", NOW, NOW],
  ["2026-06-01", "12:00", "SAV001", 100000, "TWD", "test", NOW, NOW],
  ["2026-06-01", "12:00", "LOAN001", -200000, "TWD", "test", NOW, NOW],
];

for (const s of snapshots) {
  insertSnapshot.run(...s);
}

// -- Loans --
const insertLoan = db.prepare(`
  INSERT INTO loans (loan_key, display_name, lender, linked_account_key, principal_original, principal_current, annual_interest_rate, repayment_type, currency, status, note, created_at, updated_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

insertLoan.run(
  "LOAN_001",
  "Test Personal Loan",
  "Test Bank",
  "LOAN001",
  200000,
  200000,
  0.0375,
  "interest_only_flexible",
  "TWD",
  "active",
  "Fake test loan data",
  NOW,
  NOW,
);

// -- Transactions --
const insertTxn = db.prepare(`
  INSERT INTO transactions (idempotency_key, timestamp, date, time, transaction_type, account_key, amount, signed_amount, currency, category_key, merchant, note, client, source, status, data_quality, created_at, updated_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

// June 2026 transactions (mixed income/expense for monthlySummary)
const txns = [
  // June expenses
  [
    "IK001",
    ts("2026-06-01"),
    "2026-06-01",
    "08:30",
    "expense",
    "CHK001",
    150,
    -150,
    "TWD",
    "food",
    "Test Cafe",
    null,
    "test",
    "fixture",
    "confirmed",
    "user_entered",
    NOW,
    NOW,
  ],
  [
    "IK002",
    ts("2026-06-01"),
    "2026-06-01",
    "12:00",
    "expense",
    "CHK001",
    300,
    -300,
    "TWD",
    "shopping",
    "Test Store",
    "groceries",
    "test",
    "fixture",
    "confirmed",
    "user_entered",
    NOW,
    NOW,
  ],
  [
    "IK003",
    ts("2026-06-02"),
    "2026-06-02",
    "09:00",
    "expense",
    "CC001",
    80,
    -80,
    "TWD",
    "transport",
    "Test Transit",
    null,
    "test",
    "fixture",
    "confirmed",
    "user_entered",
    NOW,
    NOW,
  ],
  [
    "IK004",
    ts("2026-06-03"),
    "2026-06-03",
    "19:00",
    "expense",
    "CHK001",
    450,
    -450,
    "TWD",
    "entertainment",
    "Test Cinema",
    null,
    "test",
    "fixture",
    "confirmed",
    "user_entered",
    NOW,
    NOW,
  ],
  [
    "IK005",
    ts("2026-06-05"),
    "2026-06-05",
    "10:00",
    "expense",
    "CHK001",
    200,
    -200,
    "TWD",
    "food",
    "Test Restaurant",
    "lunch with friends",
    "test",
    "fixture",
    "confirmed",
    "user_entered",
    NOW,
    NOW,
  ],
  [
    "IK006",
    ts("2026-06-10"),
    "2026-06-10",
    "00:00",
    "expense",
    "CC001",
    299,
    -299,
    "TWD",
    "subscription",
    "Test Streaming",
    null,
    "test",
    "fixture",
    "confirmed",
    "user_entered",
    NOW,
    NOW,
  ],
  [
    "IK007",
    ts("2026-06-15"),
    "2026-06-15",
    "14:00",
    "expense",
    "CHK001",
    1200,
    -1200,
    "TWD",
    "shopping",
    "Test Electronics",
    null,
    "test",
    "fixture",
    "confirmed",
    "user_entered",
    NOW,
    NOW,
  ],
  [
    "IK008",
    ts("2026-06-18"),
    "2026-06-18",
    "08:00",
    "expense",
    "CHK001",
    95,
    -95,
    "TWD",
    "transport",
    "Test Gas",
    null,
    "test",
    "fixture",
    "confirmed",
    "user_entered",
    NOW,
    NOW,
  ],
  [
    "IK009",
    ts("2026-06-20"),
    "2026-06-20",
    "13:00",
    "expense",
    "CHK001",
    350,
    -350,
    "TWD",
    "food",
    "Test Market",
    "weekly groceries",
    "test",
    "fixture",
    "confirmed",
    "user_entered",
    NOW,
    NOW,
  ],
  // June income
  [
    "IK010",
    ts("2026-06-01"),
    "2026-06-01",
    "09:00",
    "income",
    "CHK001",
    50000,
    50000,
    "TWD",
    "income",
    null,
    "salary",
    "test",
    "fixture",
    "confirmed",
    "user_entered",
    NOW,
    NOW,
  ],
  [
    "IK011",
    ts("2026-06-15"),
    "2026-06-15",
    "09:00",
    "income",
    "CHK001",
    5000,
    5000,
    "TWD",
    "income",
    null,
    "freelance",
    "test",
    "fixture",
    "confirmed",
    "user_entered",
    NOW,
    NOW,
  ],
  // Investment settlement (should be excluded from consumption queries)
  [
    "IK012",
    ts("2026-06-05"),
    "2026-06-05",
    "10:00",
    "investment_settlement",
    "INV001",
    10000,
    -10000,
    "TWD",
    "investment",
    null,
    "TEST-STOCK 100@100",
    "test",
    "fixture",
    "confirmed",
    "user_entered",
    NOW,
    NOW,
  ],
  // July 2026 transactions (for pagination test)
  [
    "IK013",
    ts("2026-07-01"),
    "2026-07-01",
    "10:00",
    "expense",
    "CHK001",
    100,
    -100,
    "TWD",
    "food",
    "July Cafe",
    null,
    "test",
    "fixture",
    "confirmed",
    "user_entered",
    NOW,
    NOW,
  ],
  [
    "IK014",
    ts("2026-07-02"),
    "2026-07-02",
    "10:00",
    "expense",
    "CHK001",
    200,
    -200,
    "TWD",
    "food",
    "July Bakery",
    null,
    "test",
    "fixture",
    "confirmed",
    "user_entered",
    NOW,
    NOW,
  ],
  [
    "IK015",
    ts("2026-07-03"),
    "2026-07-03",
    "10:00",
    "expense",
    "CHK001",
    300,
    -300,
    "TWD",
    "food",
    "July Diner",
    null,
    "test",
    "fixture",
    "confirmed",
    "user_entered",
    NOW,
    NOW,
  ],
];

for (const t of txns) {
  insertTxn.run(...t);
}

// -- Meta --
db.prepare(`INSERT INTO meta (key, value, updated_at) VALUES (?, ?, ?)`).run(
  "schema_version",
  "1",
  NOW,
);
db.prepare(`INSERT INTO meta (key, value, updated_at) VALUES (?, ?, ?)`).run(
  "test_fixture",
  "true",
  NOW,
);

db.close();

console.log(`Fixture database created at ${DB_PATH}`);
console.log(
  "Tables: accounts, categories, account_aliases, balance_snapshots, loans, loan_payments, raw_events, meta, transactions",
);
