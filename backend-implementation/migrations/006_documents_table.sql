-- Migration 006: Ensure documents table has all required columns
-- The table may already exist, so we use ALTER TABLE to add missing columns

-- Add uploaded_by column if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'documents' AND column_name = 'uploaded_by'
  ) THEN
    ALTER TABLE documents ADD COLUMN uploaded_by VARCHAR(50);
    RAISE NOTICE 'Added uploaded_by column to documents table';
  END IF;
END $$;

-- Create indexes if they don't exist
CREATE INDEX IF NOT EXISTS idx_documents_job_id ON documents(job_id);
CREATE INDEX IF NOT EXISTS idx_documents_document_type ON documents(document_type);
CREATE INDEX IF NOT EXISTS idx_documents_deleted_at ON documents(deleted_at);

-- Add comments
COMMENT ON TABLE documents IS 'Documents attached to specific jobs';
COMMENT ON COLUMN documents.uploaded_by IS 'Username who uploaded the document';
