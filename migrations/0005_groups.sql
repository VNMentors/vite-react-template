CREATE TABLE IF NOT EXISTS groups (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  description TEXT,
  color TEXT NOT NULL DEFAULT '#6b7280',
  order_index INTEGER NOT NULL DEFAULT 0,
  is_won INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Seed nhóm theo quy trình của bạn
INSERT INTO groups (name, description, color, order_index, is_won) VALUES
  ('Nhóm 0', 'Khách không bắt máy, cúp máy hoặc không có nhu cầu', '#ef4444', 0, 0),
  ('Nhóm 1', 'Chấp nhận KB Zalo để nhận tư vấn', '#3b82f6', 1, 0),
  ('Nhóm 2', 'Đồng ý nâng cấp tài khoản 990toeic', '#f59e0b', 2, 0),
  ('Nhóm 3', 'Đăng ký khóa học online và chuyển cọc', '#10b981', 3, 1),
  ('Nhóm 4', 'Giới thiệu học viên khác', '#8b5cf6', 4, 1);

-- Thêm group_id vào customers
ALTER TABLE customers ADD COLUMN group_id INTEGER REFERENCES groups(id);
