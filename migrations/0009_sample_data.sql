-- ================================================================
-- DỮ LIỆU MẪU — chạy 1 lần để hiểu CRM hoạt động thế nào
-- npx wrangler d1 execute vn-crm --remote --file=migrations/0009_sample_data.sql
-- ================================================================

-- ── 1. Cập nhật giá sản phẩm Pre180 & Pre365 (nếu chưa có) ────
UPDATE products SET price = 790000  WHERE LOWER(name) = 'pre180' AND price = 0;
UPDATE products SET price = 1190000 WHERE LOWER(name) = 'pre365' AND price = 0;
UPDATE products SET price = 2500000 WHERE LOWER(name) = 'lms'    AND price = 0;

-- ── 2. Leads mẫu — trải đều 5 giai đoạn ──────────────────────
-- Lấy group IDs theo order_index (seed từ migration 0005):
-- order 0 = Nhóm 0 (từ chối), 1 = Nhóm 1, 2 = Nhóm 2, 3 = Nhóm 3 (won), 4 = Nhóm 4 (won)

-- Giai đoạn 1: Vừa liên hệ, đang chăm sóc
INSERT INTO customers (name, phone, email, source, product_id, group_id, assigned_to, status, created_at, updated_at)
SELECT 'Nguyễn Minh Tuấn', '0912345678', 'tuan.nm@gmail.com', 'Facebook',
  (SELECT id FROM products WHERE LOWER(name)='pre90' LIMIT 1),
  (SELECT id FROM groups WHERE order_index=1 LIMIT 1),
  'admin', 'new', datetime('now','-5 days'), datetime('now','-5 days')
WHERE NOT EXISTS (SELECT 1 FROM customers WHERE phone='0912345678');

INSERT INTO customers (name, phone, email, source, product_id, group_id, assigned_to, status, created_at, updated_at)
SELECT 'Trần Thị Hương', '0987654321', 'huong.tt@gmail.com', 'Phone Feature',
  (SELECT id FROM products WHERE LOWER(name)='pre180' LIMIT 1),
  (SELECT id FROM groups WHERE order_index=1 LIMIT 1),
  'admin', 'new', datetime('now','-3 days'), datetime('now','-3 days')
WHERE NOT EXISTS (SELECT 1 FROM customers WHERE phone='0987654321');

INSERT INTO customers (name, phone, email, source, product_id, group_id, assigned_to, status, follow_up_at, follow_up_note, created_at, updated_at)
SELECT 'Lê Văn Khoa', '0971111222', 'khoa.lv@gmail.com', 'Truyền miệng',
  (SELECT id FROM products WHERE LOWER(name)='pre90' LIMIT 1),
  (SELECT id FROM groups WHERE order_index=1 LIMIT 1),
  'admin', 'new', date('now','+1 day'), 'Hẹn gọi lại vào chiều mai', datetime('now','-7 days'), datetime('now','-7 days')
WHERE NOT EXISTS (SELECT 1 FROM customers WHERE phone='0971111222');

-- Giai đoạn 2: Đang tư vấn / dùng thử
INSERT INTO customers (name, phone, email, source, product_id, group_id, assigned_to, status, created_at, updated_at)
SELECT 'Phạm Thị Lan', '0963333444', 'lan.pt@gmail.com', 'Facebook',
  (SELECT id FROM products WHERE LOWER(name)='pre365' LIMIT 1),
  (SELECT id FROM groups WHERE order_index=2 LIMIT 1),
  'admin', 'new', datetime('now','-10 days'), datetime('now','-2 days')
WHERE NOT EXISTS (SELECT 1 FROM customers WHERE phone='0963333444');

INSERT INTO customers (name, phone, email, source, product_id, group_id, assigned_to, status, created_at, updated_at)
SELECT 'Hoàng Đức Nam', '0944555666', 'nam.hd@gmail.com', '990toeic App',
  (SELECT id FROM products WHERE LOWER(name)='pre180' LIMIT 1),
  (SELECT id FROM groups WHERE order_index=2 LIMIT 1),
  'admin', 'new', datetime('now','-8 days'), datetime('now','-1 days')
WHERE NOT EXISTS (SELECT 1 FROM customers WHERE phone='0944555666');

-- Giai đoạn 3 (Won): Đã chốt
INSERT INTO customers (name, phone, email, source, product_id, group_id, assigned_to, status, list_price, discount_pct, final_price, created_at, updated_at)
SELECT 'Vũ Thị Mai', '0922777888', 'mai.vt@gmail.com', 'Facebook',
  (SELECT id FROM products WHERE LOWER(name)='pre90' LIMIT 1),
  (SELECT id FROM groups WHERE order_index=3 AND is_won=1 LIMIT 1),
  'admin', 'new', 590000, 10, 531000, datetime('now','-15 days'), datetime('now','-13 days')
WHERE NOT EXISTS (SELECT 1 FROM customers WHERE phone='0922777888');

INSERT INTO customers (name, phone, email, source, product_id, group_id, assigned_to, status, list_price, discount_pct, final_price, created_at, updated_at)
SELECT 'Đặng Văn Tú', '0933888999', 'tu.dv@gmail.com', 'Truyền miệng',
  (SELECT id FROM products WHERE LOWER(name)='pre365' LIMIT 1),
  (SELECT id FROM groups WHERE order_index=3 AND is_won=1 LIMIT 1),
  'admin', 'new', 1190000, 0, 1190000, datetime('now','-20 days'), datetime('now','-18 days')
WHERE NOT EXISTS (SELECT 1 FROM customers WHERE phone='0933888999');

-- Đang chờ (chưa có cơ hội)
INSERT INTO customers (name, phone, email, source, product_id, group_id, assigned_to, status, created_at, updated_at)
SELECT 'Bùi Thị Ngọc', '0955000111', 'ngoc.bt@gmail.com', 'Phone Feature',
  NULL, NULL, NULL, 'new', datetime('now','-1 days'), datetime('now','-1 days')
WHERE NOT EXISTS (SELECT 1 FROM customers WHERE phone='0955000111');

-- Lead LMS
INSERT INTO customers (name, phone, email, source, product_id, group_id, assigned_to, status, created_at, updated_at)
SELECT 'Trường Anh Ngữ ABC', '0911222333', 'abc.english@gmail.com', 'Khác',
  (SELECT id FROM products WHERE LOWER(name)='lms' LIMIT 1),
  (SELECT id FROM groups WHERE order_index=2 LIMIT 1),
  'admin', 'new', datetime('now','-4 days'), datetime('now','-4 days')
WHERE NOT EXISTS (SELECT 1 FROM customers WHERE phone='0911222333');

-- ── 3. Ghi chú mẫu cho các leads ─────────────────────────────

-- Ghi chú cho Nguyễn Minh Tuấn
INSERT INTO notes (customer_id, content, type, created_at)
SELECT c.id, 'Gọi điện lần 1. Khách nghe máy, quan tâm Pre90. Hẹn sẽ xem qua app thử.', 'call', datetime('now','-5 days')
FROM customers c WHERE c.phone='0912345678'
AND NOT EXISTS (SELECT 1 FROM notes n WHERE n.customer_id=c.id);

INSERT INTO notes (customer_id, content, type, created_at)
SELECT c.id, 'Khách đã tải app. Hỏi thêm về lộ trình học 90 ngày. Có vẻ quan tâm thật sự.', 'note', datetime('now','-3 days')
FROM customers c WHERE c.phone='0912345678';

-- Ghi chú cho Trần Thị Hương
INSERT INTO notes (customer_id, content, type, created_at)
SELECT c.id, 'Khách hỏi về Pre180 — muốn biết khác gì Pre90. Đã giải thích lộ trình học.', 'call', datetime('now','-3 days')
FROM customers c WHERE c.phone='0987654321'
AND NOT EXISTS (SELECT 1 FROM notes n WHERE n.customer_id=c.id);

-- Ghi chú cho Lê Văn Khoa (có follow-up)
INSERT INTO notes (customer_id, content, type, created_at)
SELECT c.id, 'Gọi lần 1 không nghe máy. Nhắn Zalo.', 'call', datetime('now','-7 days')
FROM customers c WHERE c.phone='0971111222'
AND NOT EXISTS (SELECT 1 FROM notes n WHERE n.customer_id=c.id);

INSERT INTO notes (customer_id, content, type, created_at)
SELECT c.id, 'Khách nhắn lại Zalo — đang bận, hẹn gọi lại chiều mai lúc 4h.', 'note', datetime('now','-6 days')
FROM customers c WHERE c.phone='0971111222';

-- Ghi chú cho Phạm Thị Lan (đang dùng thử)
INSERT INTO notes (customer_id, content, type, created_at)
SELECT c.id, 'Đã kết nạp Zalo. Gửi link dùng thử Pre365 7 ngày.', 'note', datetime('now','-9 days')
FROM customers c WHERE c.phone='0963333444'
AND NOT EXISTS (SELECT 1 FROM notes n WHERE n.customer_id=c.id);

INSERT INTO notes (customer_id, content, type, created_at)
SELECT c.id, 'Check-in sau 7 ngày dùng thử. Khách nói app ổn, đang cân nhắc mua. Hỏi có giảm giá không.', 'call', datetime('now','-2 days')
FROM customers c WHERE c.phone='0963333444';

-- Ghi chú cho Vũ Thị Mai (đã chốt)
INSERT INTO notes (customer_id, content, type, created_at)
SELECT c.id, 'Tư vấn lần 1. Khách quan tâm Pre90, hỏi giá.', 'call', datetime('now','-15 days')
FROM customers c WHERE c.phone='0922777888'
AND NOT EXISTS (SELECT 1 FROM notes n WHERE n.customer_id=c.id);

INSERT INTO notes (customer_id, content, type, created_at)
SELECT c.id, 'Chốt! Khách đồng ý mua Pre90, giảm 10% còn 531,000đ. Đã thanh toán qua chuyển khoản.', 'note', datetime('now','-13 days')
FROM customers c WHERE c.phone='0922777888';

-- Ghi chú cho Đặng Văn Tú (đã chốt)
INSERT INTO notes (customer_id, content, type, created_at)
SELECT c.id, 'Khách được bạn giới thiệu, đã biết sản phẩm. Chốt ngay Pre365 không cần tư vấn nhiều.', 'call', datetime('now','-18 days')
FROM customers c WHERE c.phone='0933888999'
AND NOT EXISTS (SELECT 1 FROM notes n WHERE n.customer_id=c.id);

-- Ghi chú cho lead LMS
INSERT INTO notes (customer_id, content, type, created_at)
SELECT c.id, 'Gặp trực tiếp tại trường. Hiệu trưởng quan tâm giải pháp LMS white-label cho ~200 học viên.', 'meeting', datetime('now','-4 days')
FROM customers c WHERE c.phone='0911222333'
AND NOT EXISTS (SELECT 1 FROM notes n WHERE n.customer_id=c.id);

INSERT INTO notes (customer_id, content, type, created_at)
SELECT c.id, 'Gửi demo link. Trường đang chờ họp ban giám hiệu để quyết định.', 'email', datetime('now','-2 days')
FROM customers c WHERE c.phone='0911222333';

-- ── 4. LMS Client mẫu (đã ký hợp đồng) ──────────────────────
INSERT INTO lms_clients (name, phone, email, domain, contract_start, contract_end, user_count, price, note, status)
SELECT 'Trung tâm Anh ngữ XYZ', '0901234567', 'contact@xyz-english.edu.vn',
  'xyz.lms.vnmentors.com', '2026-01-01', '2026-12-31', 150, 18000000,
  'Khách hàng đầu tiên của LMS. Ký hợp đồng 1 năm.', 'active'
WHERE NOT EXISTS (SELECT 1 FROM lms_clients WHERE domain='xyz.lms.vnmentors.com');

-- Hóa đơn LMS Q1/2026
INSERT INTO lms_invoices (client_id, amount, issued_at, paid_at, note)
SELECT lc.id, 4500000, '2026-01-05', '2026-01-07', 'Thanh toán quý 1/2026'
FROM lms_clients lc WHERE lc.domain='xyz.lms.vnmentors.com'
AND NOT EXISTS (SELECT 1 FROM lms_invoices li WHERE li.client_id=lc.id AND li.note='Thanh toán quý 1/2026');

-- Hóa đơn Q2 chưa thanh toán
INSERT INTO lms_invoices (client_id, amount, issued_at, paid_at, note)
SELECT lc.id, 4500000, '2026-04-05', NULL, 'Thanh toán quý 2/2026'
FROM lms_clients lc WHERE lc.domain='xyz.lms.vnmentors.com'
AND NOT EXISTS (SELECT 1 FROM lms_invoices li WHERE li.client_id=lc.id AND li.note='Thanh toán quý 2/2026');
