-- Subscriptions: track hợp đồng/gói sau khi khách mua
-- Dùng cho cả 990toeic (chỉ cần end_date) lẫn LMS (cần user_count)
CREATE TABLE IF NOT EXISTS subscriptions (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  product_id  INTEGER REFERENCES products(id),
  start_date  TEXT NOT NULL,
  end_date    TEXT NOT NULL,
  user_count  INTEGER,          -- chỉ LMS mới dùng
  price_paid  INTEGER,
  note        TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Invoices: lịch sử hóa đơn
CREATE TABLE IF NOT EXISTS invoices (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  amount      INTEGER NOT NULL,
  issued_at   TEXT NOT NULL DEFAULT (date('now')),
  paid_at     TEXT,             -- NULL = chưa thanh toán
  note        TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
