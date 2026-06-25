-- Migration: 0013_email_scheduling.sql
ALTER TABLE background_jobs ADD COLUMN scheduled_at TEXT;

CREATE INDEX IF NOT EXISTS idx_jobs_scheduled_at ON background_jobs(status, scheduled_at);
