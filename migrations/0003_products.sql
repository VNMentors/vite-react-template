CREATE TABLE IF NOT EXISTS products (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  price INTEGER NOT NULL DEFAULT 0,
  description TEXT,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

ALTER TABLE customers ADD COLUMN product_id INTEGER REFERENCES products(id);
ALTER TABLE customers ADD COLUMN assigned_to TEXT;
ALTER TABLE customers ADD COLUMN facebook_link TEXT;
ALTER TABLE customers ADD COLUMN list_price INTEGER;
ALTER TABLE customers ADD COLUMN discount_pct REAL DEFAULT 0;
ALTER TABLE customers ADD COLUMN final_price INTEGER;

-- Seed sản phẩm từ Excel
INSERT INTO products (name, price) VALUES ('Pre90', 590000);
INSERT INTO products (name, price) VALUES ('30 Ngày', 490000);
INSERT INTO products (name, price) VALUES ('LMS', 0);
