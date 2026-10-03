-- Ad spend per day/channel for the marketing brain (/api/ad-spend). Same statements run automatically in shared/schema.js.
CREATE TABLE IF NOT EXISTS ad_spend (id TEXT PRIMARY KEY, spend_date TEXT NOT NULL, channel TEXT NOT NULL, campaign TEXT, amount REAL NOT NULL, note TEXT, created_at TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS ad_spend_date_idx ON ad_spend(spend_date);
