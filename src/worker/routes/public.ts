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
  const apiKey = c.req.header("X-API-Key") || c.req.query("apiKey") || c.req.query("api_key");
  if (!apiKey || apiKey !== c.env.API_KEY) {
    return c.json({ error: "Invalid API key" }, 401);
  }
  await next();
});

// POST /api/public/leads
// Body: JSON hoặc Form URL-encoded / Multipart
publicRoute.post("/leads", async (c) => {
  let name = "";
  let phone = "";
  let email = "";
  let facebook_link = "";
  let source = "";
  let product_name = "";
  let note = "";
  let assigned_to = "";

  const contentType = c.req.header("Content-Type") || "";
  if (contentType.includes("application/json")) {
    try {
      const body = await c.req.json<any>();
      name = body.name || "";
      phone = body.phone || "";
      email = body.email || "";
      facebook_link = body.facebook_link || body.fb || "";
      source = body.source || "";
      product_name = body.product_name || body.product || "";
      note = body.note || "";
      assigned_to = body.assigned_to || "";
    } catch {}
  } else {
    // Form data hoặc URL-encoded
    try {
      const body = await c.req.parseBody();
      name = String(body.name || "");
      phone = String(body.phone || "");
      email = String(body.email || "");
      facebook_link = String(body.facebook_link || body.fb || "");
      source = String(body.source || "");
      product_name = String(body.product_name || body.product || "");
      note = String(body.note || "");
      assigned_to = String(body.assigned_to || "");
    } catch {}
  }

  // Fallback sang query params trên URL nếu body bị thiếu trường
  name = name || c.req.query("name") || "";
  phone = phone || c.req.query("phone") || "";
  email = email || c.req.query("email") || "";
  facebook_link = facebook_link || c.req.query("facebook_link") || c.req.query("fb") || "";
  source = source || c.req.query("source") || "";
  product_name = product_name || c.req.query("product_name") || c.req.query("product") || "";
  note = note || c.req.query("note") || "";
  assigned_to = assigned_to || c.req.query("assigned_to") || "";

  if (!name.trim()) {
    return c.json({ error: "name is required" }, 400);
  }

  // Tìm product_id theo tên nếu có
  let productId: number | null = null;
  if (product_name) {
    const p = await c.env.DB.prepare(
      "SELECT id FROM products WHERE LOWER(name) = LOWER(?)"
    ).bind(product_name.trim()).first<{ id: number }>();
    productId = p?.id ?? null;
  }

  const { meta } = await c.env.DB.prepare(`
    INSERT INTO customers (name, phone, email, facebook_link, source, product_id, assigned_to, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, 'new')
  `).bind(
    name.trim(),
    phone || null,
    email || null,
    facebook_link || null,
    source || "Webhook / API",
    productId,
    assigned_to || null,
  ).run();

  const leadId = meta.last_row_id;

  // Thêm ghi chú nếu có
  if (note.trim() && leadId) {
    await c.env.DB.prepare(
      "INSERT INTO notes (customer_id, content, type) VALUES (?, ?, 'note')"
    ).bind(leadId, note.trim()).run();
  }

  return c.json({ id: leadId, success: true }, 201);
});

// GET /api/public/health — kiểm tra kết nối từ app ngoài
publicRoute.get("/health", (c) => c.json({ ok: true }));

export default publicRoute;
