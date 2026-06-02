import { Hono } from "hono";
import { cors } from "hono/cors";
import type { Bindings } from "../types";
import {
  cleanEmail,
  cleanPhone,
  parseDateString,
  parseMoney,
  parsePercent,
  resolveGroupId,
  resolveProductId,
  resolveUser,
  statusFromLabel,
  syncPrimaryDeal,
  type LookupGroup,
  type LookupProduct,
  type LookupUser,
} from "../lib/crm";

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
// Body: { name, phone?, email?, facebook_link?, source?, product_name?,
//         status?, group_name?, received_at?, note?, assigned_to? }
publicRoute.post("/leads", async (c) => {
  const body = await c.req.json<{
    name: string;
    phone?: string | number;
    email?: string;
    facebook_link?: string;
    company?: string;
    source?: string;
    product_id?: number | null;
    product_name?: string;
    group_id?: number | null;
    group_name?: string;
    status?: string;
    received_at?: string | number; // yyyy-mm-dd, dd/mm/yyyy, ISO, hoặc Excel serial
    list_price?: string | number | null;
    discount_pct?: string | number | null;
    final_price?: string | number | null;
    note?: string;
    assigned_to?: string;
    duplicate_mode?: "update" | "skip" | "create";
  }>();

  if (!body.name?.trim()) {
    return c.json({ error: "name is required" }, 400);
  }

  const [products, groups, users] = await Promise.all([
    c.env.DB.prepare("SELECT id, name, active FROM products WHERE active=1 ORDER BY id")
      .all<LookupProduct>(),
    c.env.DB.prepare("SELECT id, name, order_index, is_won FROM groups ORDER BY order_index")
      .all<LookupGroup>(),
    c.env.DB.prepare("SELECT id, name, email, role FROM users ORDER BY id")
      .all<LookupUser>(),
  ]);

  const phone = cleanPhone(body.phone);
  const email = cleanEmail(body.email);
  const productId = resolveProductId(products.results, body.product_id, body.product_name);
  const groupId = resolveGroupId(groups.results, body.group_id, body.group_name, body.status);
  const assignedUser = resolveUser(users.results, body.assigned_to);
  const status = body.status ? statusFromLabel(body.status) : null;
  const receivedDate = parseDateString(body.received_at);
  const createdAt = receivedDate
    ? `${receivedDate} 07:00:00`
    : new Date().toISOString().replace("T", " ").slice(0, 19);
  const listPrice = parseMoney(body.list_price);
  const discountPct = parsePercent(body.discount_pct) ?? 0;
  const finalPrice = parseMoney(body.final_price);
  const duplicateMode = body.duplicate_mode ?? "update";

  const existing = duplicateMode !== "create" && (phone || email)
    ? await c.env.DB.prepare(`
        SELECT id FROM customers
        WHERE (? IS NOT NULL AND phone = ?)
           OR (? IS NOT NULL AND LOWER(email) = LOWER(?))
        ORDER BY id ASC LIMIT 1
      `).bind(phone, phone, email, email).first<{ id: number }>()
    : null;

  if (existing && duplicateMode === "skip") {
    return c.json({ id: existing.id, success: true, skipped: true });
  }

  let leadId: number;
  let statusCode: 200 | 201 = 201;
  if (existing) {
    await c.env.DB.prepare(`
      UPDATE customers SET
        name=?,
        phone=COALESCE(?, phone),
        email=COALESCE(?, email),
        facebook_link=COALESCE(?, facebook_link),
        company=COALESCE(?, company),
        source=COALESCE(?, source),
        product_id=COALESCE(?, product_id),
        group_id=COALESCE(?, group_id),
        assigned_to=COALESCE(?, assigned_to),
        assigned_user_id=COALESCE(?, assigned_user_id),
        status=COALESCE(?, status),
        list_price=COALESCE(?, list_price),
        discount_pct=COALESCE(?, discount_pct),
        final_price=COALESCE(?, final_price),
        updated_at=datetime('now')
      WHERE id=?
    `).bind(
      body.name.trim(),
      phone,
      email,
      body.facebook_link?.trim() || null,
      body.company?.trim() || null,
      body.source?.trim() || null,
      productId,
      groupId,
      assignedUser?.name ?? body.assigned_to?.trim() ?? null,
      assignedUser?.id ?? null,
      status,
      listPrice,
      discountPct,
      finalPrice,
      existing.id,
    ).run();
    leadId = existing.id;
    statusCode = 200;
  } else {
    const { meta } = await c.env.DB.prepare(`
      INSERT INTO customers
        (name, phone, email, facebook_link, company, source, product_id, group_id,
         assigned_to, assigned_user_id, status, list_price, discount_pct, final_price,
         created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      body.name.trim(),
      phone,
      email,
      body.facebook_link?.trim() || null,
      body.company?.trim() || null,
      body.source?.trim() || null,
      productId,
      groupId,
      assignedUser?.name ?? body.assigned_to?.trim() ?? null,
      assignedUser?.id ?? null,
      status ?? "new",
      listPrice,
      discountPct,
      finalPrice,
      createdAt,
      createdAt,
    ).run();
    leadId = Number(meta.last_row_id);
  }

  if (body.note?.trim() && leadId) {
    await c.env.DB.prepare(
      "INSERT INTO notes (customer_id, content, type) VALUES (?, ?, 'note')"
    ).bind(leadId, body.note.trim()).run();
  }

  await syncPrimaryDeal(c.env.DB, leadId);

  return c.json({
    id: leadId,
    success: true,
    created: !existing,
    updated: !!existing,
  }, statusCode);
});

// GET /api/public/health — kiểm tra kết nối từ app ngoài
publicRoute.get("/health", (c) => c.json({ ok: true }));

export default publicRoute;
