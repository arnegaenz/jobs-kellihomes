-- Migration 007: Tasks table for task management
-- Date: 2026-02-17
-- Description: Adds tasks and task_assignees tables for task management system

CREATE TABLE IF NOT EXISTS tasks (
  id SERIAL PRIMARY KEY,
  title VARCHAR(255) NOT NULL,
  description TEXT DEFAULT '',
  job_id TEXT REFERENCES jobs(id) ON DELETE SET NULL,
  priority VARCHAR(20) NOT NULL DEFAULT 'Medium',
  status VARCHAR(30) NOT NULL DEFAULT 'Not Started',
  start_date DATE,
  end_date DATE,
  created_by VARCHAR(50),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS task_assignees (
  id SERIAL PRIMARY KEY,
  task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  username VARCHAR(50) NOT NULL,
  assigned_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(task_id, username)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_tasks_job_id ON tasks(job_id);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
CREATE INDEX IF NOT EXISTS idx_tasks_priority ON tasks(priority);
CREATE INDEX IF NOT EXISTS idx_task_assignees_task_id ON task_assignees(task_id);
CREATE INDEX IF NOT EXISTS idx_task_assignees_username ON task_assignees(username);

-- Comments
COMMENT ON TABLE tasks IS 'Tasks for project management, optionally linked to jobs';
COMMENT ON TABLE task_assignees IS 'Many-to-many relationship between tasks and users';
COMMENT ON COLUMN tasks.priority IS 'Low, Medium, High, or Urgent';
COMMENT ON COLUMN tasks.status IS 'Not Started, In Progress, Complete, On Hold, or Cancelled';
