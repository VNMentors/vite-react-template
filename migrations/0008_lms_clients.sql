-- LMS Clients: khách hàng đã ký hợp đồng LMS white-label
-- Hoàn toàn tách biệt với lead 990toeic
CREATE TABLE IF NOT EXISTS lms_clients (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  name           TEXT NOT NULL,          -- tên người/tổ chức
  phone          TEXT,
  email          TEXT,
  domain         TEXT NOT NULL UNIQUE,   -- subdomain hoặc custom domain (dùng làm KV key)
  contract_start TEXT NOT NULL,
  contract_end   TEXT NOT NULL,
  user_count     INTEGER NOT NULL DEFAULT 0,
  price          INTEGER,               -- giá hợp đồng (VNĐ)
  status         TEXT NOT NULL DEFAULT 'active', -- active | suspended | expired
  note           TEXT,
  created_at     TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at     TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Hóa đơn của LMS clients
CREATE TABLE IF NOT EXISTS lms_invoices (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  client_id   INTEGER NOT NULL REFERENCES lms_clients(id) ON DELETE CASCADE,
  amount      INTEGER NOT NULL,
  issued_at   TEXT NOT NULL DEFAULT (date('now')),
  paid_at     TEXT,
  note        TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
