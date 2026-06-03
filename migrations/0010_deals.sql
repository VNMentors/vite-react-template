-- ================================================================
-- DEALS — đơn hàng/giao dịch
-- 1 customer = N deals (mua nhiều lần, gia hạn, upsell)
-- Doanh thu = SUM(deals.amount WHERE status='won')
-- ================================================================

CREATE TABLE IF NOT EXISTS deals (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  product_id  INTEGER REFERENCES products(id),
  amount      INTEGER NOT NULL,
  status      TEXT NOT NULL DEFAULT 'won',  -- open | won | lost
  closed_at   TEXT,                         -- ngày chốt
  note        TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_deals_customer ON deals(customer_id);
CREATE INDEX IF NOT EXISTS idx_deals_closed   ON deals(closed_at);
CREATE INDEX IF NOT EXISTS idx_deals_status   ON deals(status);

-- Migrate data cũ: customers đã chốt (group is_won=1) + có final_price → tạo deal
INSERT INTO deals (customer_id, product_id, amount, status, closed_at, note, created_at)
SELECT
  c.id, c.product_id, c.final_price,
  'won',
  date(c.updated_at),
  'Migrated từ final_price cũ',
  c.updated_at
FROM customers c
JOIN groups g ON c.group_id = g.id
WHERE g.is_won = 1
  AND c.final_price IS NOT NULL
  AND c.final_price > 0
  AND NOT EXISTS (SELECT 1 FROM deals d WHERE d.customer_id = c.id);
