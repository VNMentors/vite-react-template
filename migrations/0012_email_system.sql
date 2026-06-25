-- Migration: 0012_email_system.sql
CREATE TABLE IF NOT EXISTS background_jobs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'PENDING',
  payload TEXT,
  progress INTEGER NOT NULL DEFAULT 0,
  total INTEGER NOT NULL DEFAULT 0,
  error_message TEXT,
  locked_until TEXT,
  created_by INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
);

CREATE INDEX IF NOT EXISTS idx_jobs_status ON background_jobs(status);
CREATE INDEX IF NOT EXISTS idx_jobs_type ON background_jobs(type);

CREATE TABLE IF NOT EXISTS email_queue (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  job_id INTEGER NOT NULL REFERENCES background_jobs(id) ON DELETE CASCADE,
  to_email TEXT NOT NULL,
  to_name TEXT,
  customer_id INTEGER REFERENCES customers(id),
  status TEXT NOT NULL DEFAULT 'PENDING',
  error_message TEXT,
  retry_count INTEGER NOT NULL DEFAULT 0,
  sent_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
);

CREATE INDEX IF NOT EXISTS idx_eq_job_status ON email_queue(job_id, status);
