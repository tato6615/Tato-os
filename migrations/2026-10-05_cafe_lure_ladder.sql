-- Café lure ladder: calculator -> checklist -> sample -> first order -> reorder.
-- Same columns are added automatically by shared/schema.js (addMissing). Run manually only if you want them now.
ALTER TABLE leads ADD COLUMN kind TEXT DEFAULT 'contact';
ALTER TABLE leads ADD COLUMN sample_requested INTEGER NOT NULL DEFAULT 0;
ALTER TABLE leads ADD COLUMN sample_grams INTEGER;
ALTER TABLE leads ADD COLUMN sample_address TEXT;
ALTER TABLE leads ADD COLUMN sample_postal TEXT;
ALTER TABLE leads ADD COLUMN sample_status TEXT;
ALTER TABLE leads ADD COLUMN calc_json TEXT;
