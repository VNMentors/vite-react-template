# VN Mentors CRM

Hệ thống CRM đơn giản để quản lý khách hàng và chăm sóc sau bán hàng.

---

## Kiến trúc tổng quan

```
Browser
  │
  ▼
Cloudflare Worker (1 file duy nhất chạy trên edge)
  ├── /api/*  →  Hono (backend API)
  │                └── Cloudflare D1 (SQLite database)
  └── /*      →  React app (static files)
```

**Chỉ có 1 deployment duy nhất** — Cloudflare Worker vừa chạy API vừa serve giao diện React. Không cần server riêng, không cần hosting riêng cho frontend.

### Các thành phần

| Thành phần | Công nghệ | Vai trò |
|---|---|---|
| Frontend | React 19 + Vite | Giao diện người dùng |
| Backend | Hono (chạy trong Worker) | API xử lý logic |
| Database | Cloudflare D1 (SQLite) | Lưu trữ dữ liệu |
| Hosting | Cloudflare Workers | Chạy toàn bộ hệ thống |
| Auth | JWT (7 ngày) | Xác thực đăng nhập |

---

## Cấu trúc thư mục

```
├── src/
│   ├── worker/
│   │   └── index.ts          # Toàn bộ backend API (Hono)
│   └── react-app/
│       ├── pages/
│       │   ├── Login.tsx     # Trang đăng nhập
│       │   ├── Dashboard.tsx # Trang tổng quan
│       │   ├── Customers.tsx # Danh sách khách hàng
│       │   ├── CustomerDetail.tsx  # Chi tiết + ghi chú
│       │   └── Users.tsx     # Quản lý nhân viên
│       ├── components/
│       │   ├── Layout.tsx    # Sidebar + layout chung
│       │   └── StatusBadge.tsx
│       ├── hooks/
│       │   └── useAuth.tsx   # Context xác thực
│       └── lib/
│           ├── api.ts        # Hàm gọi API
│           └── types.ts      # TypeScript types
├── migrations/
│   ├── 0001_init.sql         # Tạo bảng users, customers, notes
│   └── 0002_seed_admin.sql   # Tạo tài khoản admin mặc định
└── wrangler.json             # Config Cloudflare (D1, JWT_SECRET...)
```

---

## Chạy local (Development)

### Lần đầu setup

```bash
npm install
```

### Tạo database local (chỉ cần làm 1 lần)

```bash
# Tạo bảng
npx wrangler d1 execute vn-crm --local --file=migrations/0001_init.sql

# Tạo tài khoản admin
npx wrangler d1 execute vn-crm --local --file=migrations/0002_seed_admin.sql
```

### Chạy

```bash
npm run dev
```

Mở trình duyệt tại `http://localhost:5173`

### Đăng nhập local

| | |
|---|---|
| Email | `admin@vnmentors.com` |
| Mật khẩu | `Vnmentors2@24` |

### Cách local hoạt động

```
Browser (localhost:5173)
  │
  ▼
Vite Dev Server
  ├── Giao diện React → phục vụ trực tiếp (có Hot Reload)
  └── /api/* → Wrangler giả lập Worker locally
                  └── D1 local (file tại .wrangler/state/v3/d1/)
```

> **Lưu ý quan trọng:** Database local và database production **hoàn toàn tách biệt**. Dữ liệu thêm vào khi chạy local sẽ **không** xuất hiện trên production và ngược lại.

---

## Deploy lên Production

### Build và deploy

```bash
npm run deploy
```

Lệnh này tự động:
1. TypeScript compile
2. Vite build React app → `dist/client/`
3. `wrangler deploy` → upload Worker + static files lên Cloudflare

### Cách production hoạt động

```
Browser
  │
  ▼
Cloudflare Edge (phân tán toàn cầu, server gần nhất)
  │
  ▼
Cloudflare Worker
  ├── /api/* → Hono xử lý → D1 database (Singapore)
  └── /*     → Trả về React app từ dist/client/
```

Sau khi deploy xong, Cloudflare sẽ in ra URL dạng:
```
https://vite-react-template.<your-subdomain>.workers.dev
```

---

## Database

### Schema

```sql
users       -- Tài khoản đăng nhập (nhân viên, admin)
customers   -- Khách hàng (tên, email, SĐT, công ty, trạng thái, nguồn)
notes       -- Lịch sử tương tác (ghi chú, cuộc gọi, email, gặp mặt)
```

### Thêm migration mới

Khi cần thay đổi schema (thêm cột, thêm bảng...):

```bash
# 1. Tạo file migration
# migrations/0003_ten_migration.sql

# 2. Chạy local
npx wrangler d1 execute vn-crm --local --file=migrations/0003_ten_migration.sql

# 3. Chạy production
npx wrangler d1 execute vn-crm --remote --file=migrations/0003_ten_migration.sql
```

### Xem dữ liệu thủ công

```bash
# Xem users trong production
npx wrangler d1 execute vn-crm --remote --command="SELECT * FROM users"

# Xem khách hàng
npx wrangler d1 execute vn-crm --remote --command="SELECT * FROM customers LIMIT 10"
```

---

## API Routes

Tất cả API đều bắt đầu bằng `/api/`. Routes có `🔒` yêu cầu đăng nhập (Bearer token).

```
POST   /api/auth/login              Đăng nhập → trả về JWT token
POST   /api/auth/register           Tạo user (lần đầu: không cần auth, sau: 🔒)
GET    /api/auth/me            🔒   Lấy thông tin user hiện tại

GET    /api/stats              🔒   Thống kê dashboard
GET    /api/users              🔒   Danh sách nhân viên
DELETE /api/users/:id          🔒   Xóa nhân viên

GET    /api/customers          🔒   Danh sách khách hàng (search, filter, paging)
POST   /api/customers          🔒   Tạo khách hàng mới
GET    /api/customers/:id      🔒   Chi tiết khách hàng
PUT    /api/customers/:id      🔒   Cập nhật khách hàng
DELETE /api/customers/:id      🔒   Xóa khách hàng

GET    /api/customers/:id/notes         🔒   Lấy ghi chú
POST   /api/customers/:id/notes         🔒   Thêm ghi chú
DELETE /api/customers/:id/notes/:noteId 🔒   Xóa ghi chú
```

---

## Xác thực (Auth)

- Sau khi đăng nhập, server trả về **JWT token** có hiệu lực **7 ngày**
- Token lưu trong `localStorage` của trình duyệt
- Mọi request API đều gửi kèm header: `Authorization: Bearer <token>`
- Khi token hết hạn → tự động redirect về trang login

---

## Các lệnh hay dùng

```bash
# Chạy local
npm run dev

# Deploy production
npm run deploy

# Xem log production realtime
npx wrangler tail

# Regenerate TypeScript types (sau khi thay đổi wrangler.json)
npm run cf-typegen

# Kiểm tra TypeScript
npx tsc -b

# Xem dữ liệu D1 production
npx wrangler d1 execute vn-crm --remote --command="SELECT COUNT(*) FROM customers"
```

---

## Tài khoản admin mặc định

| | |
|---|---|
| Email | `admin@vnmentors.com` |
| Mật khẩu | `Vnmentors2@24` |

Để thêm nhân viên: Đăng nhập → sidebar **Nhân viên** → **Thêm nhân viên**.
