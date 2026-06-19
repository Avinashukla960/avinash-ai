// =====================================================================
// db.js — Database setup.
//
// We use "better-sqlite3", which is a synchronous SQLite binding for
// Node.js. That means every database call BLOCKS until it finishes
// (like a normal function call in C++). It is *not* async/callback
// based, which makes the code much easier to read.
//
// SQLite is a file-based database: everything is stored in one file
// (here, `data.db`) on disk. It's perfect for small-to-medium apps
// and has zero configuration.
// =====================================================================

const Database = require('better-sqlite3');
const path = require('path');

// __dirname is the folder this file lives in (the project root).
// We keep the DB file right next to the server code.
const dbPath = path.join(__dirname, 'data.db');
const db = new Database(dbPath);

// Enable "WAL" (Write-Ahead Logging) mode — this makes SQLite faster
// when the app is reading and writing at the same time.
db.pragma('journal_mode = WAL');

// Turn ON foreign-key enforcement. SQLite has it OFF by default for
// historical reasons, but we want our FK constraints to actually work.
db.pragma('foreign_keys = ON');

// -----------------------------------------------------------------
// Create tables if they don't already exist.
// `CREATE TABLE IF NOT EXISTS` is idempotent — safe to run on every
// startup. Think of it like a static initializer in a C++ class:
//   "Before anything else runs, make sure these structures exist."
// -----------------------------------------------------------------
db.exec(`
  -- USERS: one row per registered account.
  -- password_hash is a bcrypt hash, NEVER the raw password.
  CREATE TABLE IF NOT EXISTS users (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    email         TEXT    NOT NULL UNIQUE,
    password_hash TEXT    NOT NULL,
    created_at    TEXT    NOT NULL DEFAULT (datetime('now'))
  );

  -- PROFILES: one row per user, holding their personal data as JSON.
  -- We store the whole profile as a single JSON string so we don't
  -- have to migrate the schema every time we add a new field.
  CREATE TABLE IF NOT EXISTS profiles (
    user_id      INTEGER PRIMARY KEY,
    profile_json TEXT    NOT NULL,
    updated_at   TEXT    NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  -- MESSAGES: the chat history. Every user message and every
  -- assistant reply gets its own row.
  CREATE TABLE IF NOT EXISTS messages (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id    INTEGER NOT NULL,
    role       TEXT    NOT NULL CHECK (role IN ('user', 'assistant')),
    content    TEXT    NOT NULL,
    created_at TEXT    NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  -- An index on (user_id, created_at) makes fetching a single user's
  -- recent messages very fast — like an index in std::map vs. scanning
  -- a vector.
  CREATE INDEX IF NOT EXISTS idx_messages_user_created
    ON messages(user_id, created_at);
`);

// Export the database object so other files can run queries on it.
module.exports = db;
