-- Role cho nhân viên: admin | staff
ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'staff';
UPDATE users SET role = 'admin' WHERE email = 'admin@vnmentors.com';

-- Follow-up reminder
ALTER TABLE customers ADD COLUMN follow_up_at TEXT;
ALTER TABLE customers ADD COLUMN follow_up_note TEXT;

-- Liên kết lead với user_id (để phân quyền staff chỉ xem lead của mình)
ALTER TABLE customers ADD COLUMN assigned_user_id INTEGER REFERENCES users(id);
