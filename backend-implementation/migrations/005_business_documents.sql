-- Migration 005: Business Documents Table
-- Creates a table for company-level documents (permits, licenses, insurance, etc.)
-- that aren't tied to specific jobs

CREATE TABLE IF NOT EXISTS business_documents (
  id SERIAL PRIMARY KEY,
  s3_key VARCHAR(500) NOT NULL,
  file_name VARCHAR(255) NOT NULL,
  file_type VARCHAR(100),
  file_size INTEGER,
  type VARCHAR(50) NOT NULL, -- Business License, Insurance, Permit, Tax Document, Other
  description TEXT,
  uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  uploaded_by VARCHAR(50),
  deleted_at TIMESTAMP NULL
);

-- Index for faster queries filtering by type
CREATE INDEX IF NOT EXISTS idx_business_documents_type ON business_documents(type);

-- Index for soft deletes
CREATE INDEX IF NOT EXISTS idx_business_documents_deleted_at ON business_documents(deleted_at);

-- Add comment to table
COMMENT ON TABLE business_documents IS 'Company-level documents not tied to specific jobs';
COMMENT ON COLUMN business_documents.type IS 'Document category: Business License, Insurance, Permit, Tax Document, Other';
COMMENT ON COLUMN business_documents.deleted_at IS 'Soft delete timestamp - NULL means active';
