-- Migration 008: Inventory items table for Wasteland material tracking
-- Date: 2026-02-17
-- Description: Tracks leftover construction materials with photos, source/destination jobs

CREATE TABLE IF NOT EXISTS inventory_items (
  id TEXT PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  description TEXT DEFAULT '',
  quantity INTEGER DEFAULT 1,
  category VARCHAR(50) DEFAULT 'Other',
  source_job_id TEXT REFERENCES jobs(id) ON DELETE SET NULL,
  destination_job_id TEXT REFERENCES jobs(id) ON DELETE SET NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'Available',
  photo_key TEXT,
  photo_name TEXT,
  notes TEXT DEFAULT '',
  added_by VARCHAR(50),
  claimed_by VARCHAR(50),
  claimed_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_inventory_items_status ON inventory_items(status);
CREATE INDEX IF NOT EXISTS idx_inventory_items_category ON inventory_items(category);
CREATE INDEX IF NOT EXISTS idx_inventory_items_source_job ON inventory_items(source_job_id);
CREATE INDEX IF NOT EXISTS idx_inventory_items_destination_job ON inventory_items(destination_job_id);

-- Comments
COMMENT ON TABLE inventory_items IS 'Leftover construction materials tracked in the Wasteland inventory system';
COMMENT ON COLUMN inventory_items.status IS 'Available or Claimed';
COMMENT ON COLUMN inventory_items.category IS 'Tile, Lumber, Hardware, Plumbing, Electrical, Paint, Flooring, Roofing, Insulation, Drywall, Fixtures, Appliances, Other';
COMMENT ON COLUMN inventory_items.photo_key IS 'S3 storage key for item photo';
