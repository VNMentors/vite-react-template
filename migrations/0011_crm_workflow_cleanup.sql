-- CRM workflow cleanup
-- - Link LMS clients back to the lead/opportunity that created them.
-- - Keep converted LMS leads out of the active sales pipeline.

ALTER TABLE lms_clients ADD COLUMN source_customer_id INTEGER REFERENCES customers(id);

CREATE INDEX IF NOT EXISTS idx_lms_clients_source_customer
  ON lms_clients(source_customer_id);

CREATE INDEX IF NOT EXISTS idx_customers_assigned_user
  ON customers(assigned_user_id);

CREATE INDEX IF NOT EXISTS idx_customers_status
  ON customers(status);
