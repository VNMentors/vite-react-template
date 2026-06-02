# Hướng dẫn vận hành & Deploy

## 1. Hai môi trường

| | Local | Production |
|---|---|---|
| Chạy lệnh | `npm run dev` | `npm run build && npm run deploy` |
| URL | `localhost:5173` | `https://admin-vnmentors.hulumap.workers.dev` |
| Database | Local (`.wrangler/state/v3/d1/`) | Cloudflare D1 `vn-crm` |
| Data | Riêng, không ảnh hưởng nhau | Thật, người dùng thật |

---

## 2. Chạy local

```bash
npm run dev
```

- Sửa code → tự reload, không cần restart
- Data local riêng, test thoải mái không lo ảnh hưởng production

---

## 3. Secrets / Keys

Có 2 secret cần thiết để app chạy:

| Secret | Dùng để |
|---|---|
| `JWT_SECRET` | Ký token đăng nhập |
| `API_KEY` | Bảo vệ API nhận lead từ app 990toeic |

---

### Bước 1 — Tạo key (chỉ làm 1 lần khi setup mới)

Chạy lệnh này để sinh ra 2 key ngẫu nhiên:

```bash
# Tạo JWT_SECRET
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# Tạo API_KEY
node -e "console.log(require('crypto').randomBytes(24).toString('hex'))"
```

Copy 2 giá trị đó ra, dùng ở bước 2 và 3.

> Key của dự án này đã tạo sẵn, lưu trong `.dev.vars`. Chỉ cần tạo lại nếu setup project mới hoặc muốn đổi key.

---

### Bước 2 — Lưu vào local (`.dev.vars`)

File `.dev.vars` nằm ở thư mục gốc project (đã có, không cần tạo lại):

```
JWT_SECRET=<giá trị từ bước 1>
API_KEY=<giá trị từ bước 1>
```

File này trong `.gitignore` — **không bị push lên GitHub**, an toàn.

---

### Bước 3 — Set lên Cloudflare production (1 lần duy nhất)

```bash
echo "<JWT_SECRET>" | npx wrangler secret put JWT_SECRET
echo "<API_KEY>"    | npx wrangler secret put API_KEY
```

Ví dụ thực tế của project này:
```bash
echo "882fe41ca689c28079044af1ce0f66713ef297cac23e5d72acd90398bd20582f" | npx wrangler secret put JWT_SECRET
echo "c6b8b8bebfff4cd2db16ef667eb3b6afbb32d021d54d36cb" | npx wrangler secret put API_KEY
```

> ⚠️ Chỉ cần set **1 lần**. Deploy bao nhiêu lần cũng không cần set lại.
> Phải set lại nếu: **đổi tên worker** hoặc muốn thay giá trị key.

---

## 4. Deploy — 2 cách

### Cách 1: Deploy thẳng từ máy (đang dùng)

```bash
npm run build && npm run deploy
```

- Không cần GitHub
- Chạy lệnh này trên máy là lên production luôn
- Cần đăng nhập Cloudflare trước: `npx wrangler login`

**Điều kiện để deploy được:**
- Đã đăng nhập Cloudflare (`npx wrangler whoami` để kiểm tra)
- `wrangler.json` đúng tên worker và database_id
- Secrets đã set trên Cloudflare

---

### Cách 2: Tự động qua GitHub Actions

Mỗi lần push code lên GitHub → tự động deploy lên Cloudflare.

**Setup 1 lần:**

1. **Tạo Cloudflare API Token:**
   - Vào [dash.cloudflare.com](https://dash.cloudflare.com)
   - Click avatar góc trên phải → **My Profile**
   - Tab **API Tokens** → **Create Token**
   - Chọn template **"Edit Cloudflare Workers"** → Continue to summary → Create Token
   - **Copy token ngay** (chỉ hiện 1 lần, mất là phải tạo lại)

2. Thêm token vào GitHub repo:
   - GitHub repo → Settings → Secrets → Actions
   - Tạo secret tên `CLOUDFLARE_API_TOKEN` → paste token vào

3. Tạo file `.github/workflows/deploy.yml`:

```yaml
name: Deploy
on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - run: npm install
      - run: npm run build && npm run deploy
        env:
          CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}
```

Sau đó mỗi lần `git push` → tự deploy, không cần làm gì thêm.

---

## 5. Tài khoản admin mặc định

| | |
|---|---|
| Email | `admin@vnmentors.com` |
| Mật khẩu | `Vnmentors2@24` |

---

## 6. Lệnh hay dùng

```bash
npm run dev          # chạy local
npm run build        # build production
npm run deploy       # deploy lên Cloudflare (cần build trước)
npx wrangler login   # đăng nhập Cloudflare (làm 1 lần)
npx wrangler whoami  # kiểm tra đang đăng nhập tài khoản nào
npx wrangler tail    # xem log production realtime
```
