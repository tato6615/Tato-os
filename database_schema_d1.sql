-- TATO HQ V1 — Cloudflare D1 / SQLite schema
-- Safe to run in D1 Console.
-- This is the D1 version of the original PostgreSQL schema.

PRAGMA foreign_keys = ON;

-- Customers
CREATE TABLE IF NOT EXISTS customers (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  name TEXT,
  business_name TEXT,
  email TEXT,
  phone TEXT,
  segment TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  intent_score INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Products
CREATE TABLE IF NOT EXISTS products (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  name TEXT NOT NULL,
  origin TEXT,
  roast_level TEXT,
  cost_price REAL,
  sale_price REAL,
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Orders
CREATE TABLE IF NOT EXISTS orders (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  customer_id TEXT,
  total_amount REAL NOT NULL DEFAULT 0,
  total_kg REAL NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE SET NULL
);

-- First-party behavior events
CREATE TABLE IF NOT EXISTS behavior_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  customer_id TEXT,
  anonymous_id TEXT,
  event_name TEXT NOT NULL,
  page TEXT,
  object_type TEXT,
  object_id TEXT,
  metadata TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE SET NULL
);

-- External / manual market signals
CREATE TABLE IF NOT EXISTS market_signals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source TEXT,
  category TEXT,
  title TEXT NOT NULL,
  confidence REAL,
  metadata TEXT NOT NULL DEFAULT '{}',
  detected_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- AI execution log
CREATE TABLE IF NOT EXISTS ai_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  agent_name TEXT NOT NULL,
  input_ref TEXT NOT NULL DEFAULT '{}',
  output TEXT NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'completed',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- AI recommendations / insights
CREATE TABLE IF NOT EXISTS ai_insights (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  agent_name TEXT NOT NULL,
  title TEXT NOT NULL,
  insight TEXT NOT NULL,
  evidence TEXT NOT NULL DEFAULT '{}',
  confidence REAL,
  requires_approval INTEGER NOT NULL DEFAULT 1 CHECK (requires_approval IN (0, 1)),
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Automation workflows
CREATE TABLE IF NOT EXISTS workflows (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  trigger_type TEXT,
  action_type TEXT,
  enabled INTEGER NOT NULL DEFAULT 0 CHECK (enabled IN (0, 1)),
  config TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Indexes for the HQ's first queries
CREATE INDEX IF NOT EXISTS behavior_events_event_idx
  ON behavior_events(event_name);

CREATE INDEX IF NOT EXISTS behavior_events_created_idx
  ON behavior_events(created_at);

CREATE INDEX IF NOT EXISTS behavior_events_customer_idx
  ON behavior_events(customer_id);

CREATE INDEX IF NOT EXISTS behavior_events_anonymous_idx
  ON behavior_events(anonymous_id);

CREATE INDEX IF NOT EXISTS orders_customer_idx
  ON orders(customer_id);

CREATE INDEX IF NOT EXISTS orders_created_idx
  ON orders(created_at);

CREATE INDEX IF NOT EXISTS market_signals_detected_idx
  ON market_signals(detected_at);

CREATE INDEX IF NOT EXISTS ai_insights_status_idx
  ON ai_insights(status);

CREATE INDEX IF NOT EXISTS workflows_enabled_idx
  ON workflows(enabled);
