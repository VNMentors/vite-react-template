import { Hono } from "hono";
import { cors } from "hono/cors";
import type { Bindings } from "../types";

// Route PUBLIC — không cần JWT, dùng API Key
// Dành cho app 990toeic gửi lead vào hệ thống
const publicRoute = new Hono<{ Bindings: Bindings }>();

// Cho phép cross-origin từ app ngoài
publicRoute.use("*", cors({ origin: "*" }));

// Middleware kiểm tra API Key
publicRoute.use("*", async (c, next) => {
  const apiKey = c.req.header("X-API-Key");
  if (!apiKey || apiKey !== c.env.API_KEY) {
    return c.json({ error: "Invalid API key" }, 401);
  }
  await next();
});

// POST /api/public/leads
// Body: { name, phone?, email?, source?, product_name?, note? }
publicRoute.post("/leads", async (c) => {
  const body = await c.req.json<{
    name: string;
    phone?: string;
    email?: string;
    facebook_link?: string;
    source?: string;
    product_name?: string;
    note?: string;
    assigned_to?: string;
  }>();

  if (!body.name?.trim()) {
    return c.json({ error: "name is required" }, 400);
  }

  // Tìm product_id theo tên nếu có
  let productId: number | null = null;
  if (body.product_name) {
    const p = await c.env.DB.prepare(
      "SELECT id FROM products WHERE LOWER(name) = LOWER(?)"
    ).bind(body.product_name.trim()).first<{ id: number }>();
    productId = p?.id ?? null;
  }

  const { meta } = await c.env.DB.prepare(`
    INSERT INTO customers (name, phone, email, facebook_link, source, product_id, assigned_to, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, 'new')
  `).bind(
    body.name.trim(),
    body.phone ?? null,
    body.email ?? null,
    body.facebook_link ?? null,
    body.source ?? "990toeic App",
    productId,
    body.assigned_to ?? null,
  ).run();

  const leadId = meta.last_row_id;

  // Thêm ghi chú nếu có
  if (body.note?.trim() && leadId) {
    await c.env.DB.prepare(
      "INSERT INTO notes (customer_id, content, type) VALUES (?, ?, 'note')"
    ).bind(leadId, body.note.trim()).run();
  }

  return c.json({ id: leadId, success: true }, 201);
});

// GET /api/public/health — kiểm tra kết nối từ app ngoài
publicRoute.get("/health", (c) => c.json({ ok: true }));

export default publicRoute;
