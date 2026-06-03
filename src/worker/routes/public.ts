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
  const apiKey = c.req.header("X-API-Key") || c.req.query("apiKey") || c.req.query("api_key");
  if (!apiKey || apiKey !== c.env.API_KEY) {
    return c.json({ error: "Invalid API key" }, 401);
  }
  await next();
});

// POST /api/public/leads
// Body: { name, phone?, email?, facebook_link?, source?, product_name?,
//         status?, group_name?, received_at?, note?, assigned_to? }
publicRoute.post("/leads", async (c) => {
  let input: any = {};
  const contentType = c.req.header("Content-Type") || "";
  if (contentType.includes("application/json")) {
    try {
      input = await c.req.json();
    } catch {}
  } else {
    try {
      input = await c.req.parseBody();
    } catch {}
  }
  if (!input) input = {};

  const name = (input.name || c.req.query("name") || "").trim();
  const rawPhone = input.phone || c.req.query("phone") || "";
  const rawEmail = input.email || c.req.query("email") || "";
  const facebook_link = input.facebook_link || input.fb || c.req.query("facebook_link") || c.req.query("fb") || "";
  const company = input.company || c.req.query("company") || "";
  let source = input.source || c.req.query("source") || "";
  const product_id = input.product_id ? Number(input.product_id) : (c.req.query("product_id") ? Number(c.req.query("product_id")) : null);
  const product_name = input.product_name || input.product || c.req.query("product_name") || c.req.query("product") || "";
  const group_id = input.group_id ? Number(input.group_id) : (c.req.query("group_id") ? Number(c.req.query("group_id")) : null);
  const group_name = input.group_name || c.req.query("group_name") || "";
  const status = input.status || c.req.query("status") || "";
  const received_at = input.received_at || c.req.query("received_at") || "";
  const list_price = input.list_price || c.req.query("list_price") || null;
  const discount_pct = input.discount_pct || c.req.query("discount_pct") || null;
  const final_price = input.final_price || c.req.query("final_price") || null;
  const note = input.note || c.req.query("note") || "";
  const assigned_to = input.assigned_to || c.req.query("assigned_to") || "";
  const duplicate_mode = input.duplicate_mode || c.req.query("duplicate_mode") || "update";

  if (!name) {
    return c.json({ error: "name is required" }, 400);
  }

  // Nếu source là phone feature thì gán mặc định thành 990toeic App
  if (source.toLowerCase() === "phone feature") {
    source = "990toeic App";
  }

  const [products, groups, users] = await Promise.all([
    c.env.DB.prepare("SELECT id, name, active FROM products WHERE active=1 ORDER BY id")
      .all<LookupProduct>(),
    c.env.DB.prepare("SELECT id, name, order_index, is_won FROM groups ORDER BY order_index")
      .all<LookupGroup>(),
    c.env.DB.prepare("SELECT id, name, email, role FROM users ORDER BY id")
      .all<LookupUser>(),
  ]);

  const phone = cleanPhone(rawPhone);
  const email = cleanEmail(rawEmail);
  const productId = resolveProductId(products.results, product_id, product_name);
  const groupId = resolveGroupId(groups.results, group_id, group_name, status);
  const assignedUser = resolveUser(users.results, assigned_to);
  const statusVal = status ? statusFromLabel(status) : null;
  const receivedDate = parseDateString(received_at);
  const createdAt = receivedDate
    ? `${receivedDate} 07:00:00`
    : new Date().toISOString().replace("T", " ").slice(0, 19);
  const listPrice = parseMoney(list_price);
  const discountPct = parsePercent(discount_pct) ?? 0;
  const finalPrice = parseMoney(final_price);

  const existing = duplicate_mode !== "create" && (phone || email)
    ? await c.env.DB.prepare(`
        SELECT id FROM customers
        WHERE (? IS NOT NULL AND phone = ?)
           OR (? IS NOT NULL AND LOWER(email) = LOWER(?))
        ORDER BY id ASC LIMIT 1
      `).bind(phone, phone, email, email).first<{ id: number }>()
    : null;

  if (existing && duplicate_mode === "skip") {
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
      name,
      phone,
      email,
      facebook_link.trim() || null,
      company.trim() || null,
      source.trim() || null,
      productId,
      groupId,
      assignedUser?.name ?? assigned_to.trim() ?? null,
      assignedUser?.id ?? null,
      statusVal,
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
      name,
      phone,
      email,
      facebook_link.trim() || null,
      company.trim() || null,
      source.trim() || null,
      productId,
      groupId,
      assignedUser?.name ?? assigned_to.trim() ?? null,
      assignedUser?.id ?? null,
      statusVal ?? "new",
      listPrice,
      discountPct,
      finalPrice,
      createdAt,
      createdAt,
    ).run();
    leadId = Number(meta.last_row_id);
  }

  if (note.trim() && leadId) {
    await c.env.DB.prepare(
      "INSERT INTO notes (customer_id, content, type) VALUES (?, ?, 'note')"
    ).bind(leadId, note.trim()).run();
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
