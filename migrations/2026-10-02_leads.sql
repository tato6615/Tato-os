-- Leads from /cafe/ (new cafe / small shop owners). Same statements run automatically in shared/schema.js.
CREATE TABLE IF NOT EXISTS leads (id TEXT PRIMARY KEY, name TEXT, phone TEXT, shop_name TEXT, stage TEXT, menu TEXT, machine TEXT, kg_week TEXT, note TEXT, src TEXT, utm_source TEXT, utm_medium TEXT, utm_campaign TEXT, is_test INTEGER NOT NULL DEFAULT 0, status TEXT NOT NULL DEFAULT 'new', consent_at TEXT, consent_version TEXT, ip_hash TEXT, created_at TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS leads_created_idx ON leads(created_at);
