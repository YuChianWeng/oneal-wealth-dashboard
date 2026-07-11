/**
 * Read-only Finance SQLite database singleton.
 *
 * Opens the canonical finance database with better-sqlite3 in
 * read-only mode. Enables WAL and foreign keys for data integrity.
 * This module is server-only — never bundled to the client.
 *
 * The connection path comes from config.financeDbPath (set via
 * FINANCE_DB_PATH environment variable).
 */

import "server-only";

import Database from "better-sqlite3";
import { assertServerOnly } from "@/lib/server-only";
import { config } from "@/lib/config";

assertServerOnly();

// ---------------------------------------------------------------------------
// Module-scoped singleton
// ---------------------------------------------------------------------------

let _db: Database.Database | null = null;

/**
 * Returns the shared read-only better-sqlite3 Database connection.
 *
 * The connection is created once and reused for the lifetime of the
 * Node.js process. It always opens with:
 *   - `readonly: true`     — no INSERT / UPDATE / DELETE / CREATE possible
 *   - `fileMustExist: true` — fail fast if the DB path is missing
 *   - WAL journal mode enabled
 *   - foreign_keys pragma enabled
 *
 * @throws {ConfigError} if the DB file does not exist at the configured path.
 * @throws {SourceError} if the DB cannot be opened for another reason.
 */
export function getDb(): Database.Database {
  if (_db) return _db;

  const dbPath = config.financeDbPath;

  try {
    _db = new Database(dbPath, {
      readonly: true,
      fileMustExist: true,
    });

    // Enable WAL for concurrent read performance
    _db.pragma("journal_mode = WAL");

    // Enforce foreign key constraints during reads (defence-in-depth)
    _db.pragma("foreign_keys = ON");

    return _db;
  } catch (cause) {
    // If the database is already open and we re-throw, keep _db null
    // so a future call can retry.
    _db = null;
    throw cause;
  }
}

/**
 * Close the database connection and reset the singleton.
 * Primarily useful in tests and during graceful shutdown.
 */
export function closeDb(): void {
  if (_db) {
    _db.close();
    _db = null;
  }
}
