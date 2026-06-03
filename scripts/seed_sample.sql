-- ================================================================
-- DATA MẪU THỰC TẾ — dựa trên products + users thật trong DB
-- Chạy: npx wrangler d1 execute vn-crm --remote --file=scripts/seed_sample.sql
-- ================================================================

-- ── 1. Cập nhật tên giai đoạn cho rõ nghĩa CRM ───────────────
UPDATE groups SET
  name = 'Đang tiếp cận',
  description = 'Đã KB Zalo/gọi điện, đang bắt đầu tư vấn'
WHERE order_index = 1;

UPDATE groups SET
  name = 'Đang tư vấn',
  description = 'Khách đang xem xét, dùng thử hoặc đang thương lượng giá'
WHERE order_index = 2;

UPDATE groups SET
  name = 'Đã chốt',
  description = 'Khách đã thanh toán, hoàn tất giao dịch',
  is_won = 1
WHERE order_index = 3;

UPDATE groups SET
  name = 'Giới thiệu KH mới',
  description = 'Khách hài lòng và đã giới thiệu người khác',
  is_won = 1
WHERE order_index = 4;

-- ── 2. LEADS MẪU ─────────────────────────────────────────────
-- Mỗi lead minh hoạ 1 giai đoạn khác nhau trong pipeline

-- [A] Lead mới - chưa phân giai đoạn
INSERT INTO customers (name, phone, email, source, product_id, group_id, assigned_to, assigned_user_id, status, created_at, updated_at)
VALUES (
  'Nguyễn Thị Thu Hà', '0912000001', 'thu.ha@gmail.com', 'Phone Feature',
  (SELECT id FROM products WHERE name='990TOEIC'),
  NULL, NULL, NULL, 'lead', datetime('now','-1 day'), datetime('now','-1 day')
);

-- [B] Lead mới - chưa phân giai đoạn
INSERT INTO customers (name, phone, email, source, product_id, group_id, assigned_to, assigned_user_id, status, created_at, updated_at)
VALUES (
  'Trần Văn Bình', '0912000002', 'binh.tv@gmail.com', 'Facebook',
  (SELECT id FROM products WHERE name='TOEIC LR - Offline'),
  NULL, NULL, NULL, 'lead', datetime('now','-2 hours'), datetime('now','-2 hours')
);

-- [C] Đang tiếp cận - đã KB Zalo, Khánh Vy phụ trách
INSERT INTO customers (name, phone, email, source, product_id, group_id, assigned_to, assigned_user_id, status, follow_up_at, follow_up_note, created_at, updated_at)
VALUES (
  'Lê Thị Cẩm Nhung', '0912000003', 'nhung.ltc@gmail.com', 'Facebook',
  (SELECT id FROM products WHERE name='990TOEIC'),
  (SELECT id FROM groups WHERE order_index=1),
  'Khánh Vy', 2, 'lead',
  date('now', '+1 day'), 'Hẹn gọi lại 3h chiều mai',
  datetime('now','-3 days'), datetime('now','-3 days')
);

-- [D] Đang tiếp cận - đang tư vấn TOEIC 4 kỹ năng
INSERT INTO customers (name, phone, email, source, product_id, group_id, assigned_to, assigned_user_id, status, created_at, updated_at)
VALUES (
  'Phạm Quốc Đạt', '0912000004', 'dat.pq@gmail.com', 'Truyền miệng',
  (SELECT id FROM products WHERE name='TOEIC 4 kỹ năng - Offline'),
  (SELECT id FROM groups WHERE order_index=1),
  'Admin', 1, 'lead',
  datetime('now','-5 days'), datetime('now','-5 days')
);

-- [E] Đang tư vấn - đã gửi thông tin, đang cân nhắc
INSERT INTO customers (name, phone, email, source, product_id, group_id, assigned_to, assigned_user_id, status, created_at, updated_at)
VALUES (
  'Võ Thị Lan Anh', '0912000005', 'lan.anh@gmail.com', '990toeic App',
  (SELECT id FROM products WHERE name='990TOEIC'),
  (SELECT id FROM groups WHERE order_index=2),
  'Khánh Vy', 2, 'lead',
  datetime('now','-8 days'), datetime('now','-8 days')
);

-- [F] Đang tư vấn - Lead LMS từ một trường học
INSERT INTO customers (name, phone, email, company, source, product_id, group_id, assigned_to, assigned_user_id, status, created_at, updated_at)
VALUES (
  'Nguyễn Văn Hùng', '0912000006', 'hung.nv@truongabc.edu.vn',
  'Trường Anh ngữ ABC', 'Khác',
  (SELECT id FROM products WHERE name='Hệ thống LMS'),
  (SELECT id FROM groups WHERE order_index=2),
  'Admin', 1, 'lead',
  datetime('now','-6 days'), datetime('now','-6 days')
);

-- [G] ĐÃ CHỐT - 990TOEIC, giảm giá 15%
INSERT INTO customers (name, phone, email, source, product_id, group_id, assigned_to, assigned_user_id, status, list_price, discount_pct, final_price, created_at, updated_at)
VALUES (
  'Hoàng Thị Diễm My', '0912000007', 'my.htd@gmail.com', 'Facebook',
  (SELECT id FROM products WHERE name='990TOEIC'),
  (SELECT id FROM groups WHERE order_index=3 AND is_won=1),
  'Khánh Vy', 2, 'lead',
  590000, 15, 501500,
  datetime('now','-12 days'), datetime('now','-10 days')
);

-- [H] ĐÃ CHỐT - TOEIC LR Offline, full price
INSERT INTO customers (name, phone, email, source, product_id, group_id, assigned_to, assigned_user_id, status, list_price, discount_pct, final_price, created_at, updated_at)
VALUES (
  'Trần Minh Khoa', '0912000008', 'khoa.tm@gmail.com', 'Truyền miệng',
  (SELECT id FROM products WHERE name='TOEIC LR - Offline'),
  (SELECT id FROM groups WHERE order_index=3 AND is_won=1),
  'Admin', 1, 'lead',
  5000000, 0, 5000000,
  datetime('now','-18 days'), datetime('now','-15 days')
);

-- [I] ĐÃ CHỐT - TOEIC 4 kỹ năng, đã giới thiệu thêm người
INSERT INTO customers (name, phone, email, source, product_id, group_id, assigned_to, assigned_user_id, status, list_price, discount_pct, final_price, created_at, updated_at)
VALUES (
  'Bùi Ngọc Linh', '0912000009', 'linh.bn@gmail.com', 'Truyền miệng',
  (SELECT id FROM products WHERE name='TOEIC 4 kỹ năng - Offline'),
  (SELECT id FROM groups WHERE order_index=4 AND is_won=1),
  'Admin', 1, 'lead',
  6500000, 10, 5850000,
  datetime('now','-25 days'), datetime('now','-20 days')
);

-- ── 3. GHI CHÚ CHĂM SÓC — minh hoạ lịch sử tư vấn ──────────

-- [C] Lê Thị Cẩm Nhung - đang tiếp cận
INSERT INTO notes (customer_id, content, type, created_at) VALUES (
  (SELECT id FROM customers WHERE phone='0912000003'),
  'Gọi lần 1 - Khách nghe máy. Quan tâm 990TOEIC, hỏi giá và lộ trình học. Đã giải thích app học mọi lúc mọi nơi.',
  'call', datetime('now','-3 days')
);
INSERT INTO notes (customer_id, content, type, created_at) VALUES (
  (SELECT id FROM customers WHERE phone='0912000003'),
  'Nhắn Zalo gửi link giới thiệu app 990TOEIC. Khách hứa sẽ xem qua.',
  'note', datetime('now','-2 days')
);

-- [D] Phạm Quốc Đạt - đang tư vấn offline
INSERT INTO notes (customer_id, content, type, created_at) VALUES (
  (SELECT id FROM customers WHERE phone='0912000004'),
  'Khách hỏi về khóa TOEIC 4 kỹ năng. Mục tiêu 700+. Đã tư vấn lộ trình 3 tháng và lịch học cuối tuần.',
  'call', datetime('now','-5 days')
);
INSERT INTO notes (customer_id, content, type, created_at) VALUES (
  (SELECT id FROM customers WHERE phone='0912000004'),
  'Gửi brochure khóa học qua email. Khách nói sẽ bàn với gia đình.',
  'email', datetime('now','-4 days')
);

-- [E] Võ Thị Lan Anh - đang cân nhắc
INSERT INTO notes (customer_id, content, type, created_at) VALUES (
  (SELECT id FROM customers WHERE phone='0912000005'),
  'Gọi lần đầu. Khách đang dùng app 990TOEIC bản miễn phí, hỏi về gói trả phí và sự khác biệt.',
  'call', datetime('now','-8 days')
);
INSERT INTO notes (customer_id, content, type, created_at) VALUES (
  (SELECT id FROM customers WHERE phone='0912000005'),
  'Gặp qua Zalo video call 15 phút. Demo tính năng premium. Khách khá ấn tượng nhưng nói cần thêm 1 tuần suy nghĩ.',
  'meeting', datetime('now','-6 days')
);
INSERT INTO notes (customer_id, content, type, created_at) VALUES (
  (SELECT id FROM customers WHERE phone='0912000005'),
  'Follow up — Khách vẫn đang cân nhắc, hỏi có thể thanh toán 2 lần không. Đang xem xét phương án.',
  'call', datetime('now','-3 days')
);

-- [F] Lead LMS - Trường học
INSERT INTO notes (customer_id, content, type, created_at) VALUES (
  (SELECT id FROM customers WHERE phone='0912000006'),
  'Gặp tại trường. Trường có 300 học viên, đang tìm giải pháp LMS để quản lý học trực tuyến. Hỏi về tính năng và giá.',
  'meeting', datetime('now','-6 days')
);
INSERT INTO notes (customer_id, content, type, created_at) VALUES (
  (SELECT id FROM customers WHERE phone='0912000006'),
  'Gửi email proposal chi tiết: gói LMS 150 user - 3tr/tháng, setup fee miễn phí. Đính kèm demo link.',
  'email', datetime('now','-4 days')
);
INSERT INTO notes (customer_id, content, type, created_at) VALUES (
  (SELECT id FROM customers WHERE phone='0912000006'),
  'Trường đang họp ban giám hiệu. Dự kiến có quyết định trong tuần tới.',
  'call', datetime('now','-1 day')
);

-- [G] Hoàng Thị Diễm My - Đã chốt
INSERT INTO notes (customer_id, content, type, created_at) VALUES (
  (SELECT id FROM customers WHERE phone='0912000007'),
  'Tư vấn lần 1 qua Zalo. Khách muốn thi TOEIC để nộp hồ sơ xin việc. Deadline 2 tháng nữa.',
  'note', datetime('now','-12 days')
);
INSERT INTO notes (customer_id, content, type, created_at) VALUES (
  (SELECT id FROM customers WHERE phone='0912000007'),
  'Khách hỏi có giảm giá không. Đã offer giảm 15% còn 501,500đ (ưu đãi sinh viên).',
  'call', datetime('now','-11 days')
);
INSERT INTO notes (customer_id, content, type, created_at) VALUES (
  (SELECT id FROM customers WHERE phone='0912000007'),
  '✅ ĐÃ CHỐT. Khách chuyển khoản 501,500đ. Đã kích hoạt tài khoản premium. Hẹn check-in sau 2 tuần.',
  'note', datetime('now','-10 days')
);

-- [H] Trần Minh Khoa - Đã chốt TOEIC Offline
INSERT INTO notes (customer_id, content, type, created_at) VALUES (
  (SELECT id FROM customers WHERE phone='0912000008'),
  'Khách tự tìm đến qua website. Muốn học TOEIC cấp tốc, cần 650+ trong 2 tháng.',
  'call', datetime('now','-18 days')
);
INSERT INTO notes (customer_id, content, type, created_at) VALUES (
  (SELECT id FROM customers WHERE phone='0912000008'),
  'Tư vấn trực tiếp tại văn phòng. Đăng ký khóa TOEIC LR - Offline. Thanh toán đủ 5,000,000đ tiền mặt.',
  'meeting', datetime('now','-15 days')
);

-- [I] Bùi Ngọc Linh - Đã chốt + Giới thiệu
INSERT INTO notes (customer_id, content, type, created_at) VALUES (
  (SELECT id FROM customers WHERE phone='0912000009'),
  '✅ Đã chốt TOEIC 4 kỹ năng. Thanh toán 5,850,000đ (giảm 10%). Bắt đầu học từ tuần sau.',
  'note', datetime('now','-20 days')
);
INSERT INTO notes (customer_id, content, type, created_at) VALUES (
  (SELECT id FROM customers WHERE phone='0912000009'),
  'Khách hài lòng với khóa học. Đã giới thiệu 2 người bạn — Nguyễn Thu Hà và 1 người khác. Tặng voucher 200K cho khách.',
  'call', datetime('now','-5 days')
);

-- ── 4. LMS CLIENT đã ký hợp đồng ────────────────────────────
INSERT INTO lms_clients (name, phone, email, domain, contract_start, contract_end, user_count, price, note, status)
VALUES (
  'Trường Anh ngữ Việt Mỹ', '0901111222', 'vietmy@english.edu.vn',
  'vietmy.lms.vnmentors.com',
  '2026-03-01', '2027-02-28',
  120, 36000000,
  'Khách hàng LMS đầu tiên. Hợp đồng 12 tháng, thanh toán theo quý.', 'active'
);

-- Hóa đơn Q1/2026 - đã thanh toán
INSERT INTO lms_invoices (client_id, amount, issued_at, paid_at, note)
SELECT id, 9000000, '2026-03-01', '2026-03-05', 'Quý 1/2026 (tháng 3 - tháng 5)'
FROM lms_clients WHERE domain='vietmy.lms.vnmentors.com';

-- Hóa đơn Q2/2026 - chưa thanh toán
INSERT INTO lms_invoices (client_id, amount, issued_at, paid_at, note)
SELECT id, 9000000, '2026-06-01', NULL, 'Quý 2/2026 (tháng 6 - tháng 8)'
FROM lms_clients WHERE domain='vietmy.lms.vnmentors.com';
