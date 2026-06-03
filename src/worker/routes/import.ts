import { Hono } from "hono";
import type { AppEnv } from "../types";
import { requireAuth } from "../middleware/auth";
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

type ImportRow = {
  name: string;
  phone?: string | number | null;
  email?: string | null;
  facebook_link?: string | null;
  company?: string | null;
  source?: string | null;
  product_id?: number | null;
  product_name?: string | null;
  group_id?: number | null;
  group_name?: string | null;
  assigned_to?: string | null;
  status?: string;
  received_at?: string | number | null;
  list_price?: string | number | null;
  discount_pct?: string | number | null;
  final_price?: string | number | null;
  note?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

const importRoute = new Hono<AppEnv>();
importRoute.use("*", requireAuth);

importRoute.post("/customers", async (c) => {
  const { rows, duplicate_mode } = await c.req.json<{
    rows: ImportRow[];
    duplicate_mode?: "update" | "skip" | "create";
  }>();
  if (!Array.isArray(rows) || rows.length === 0)
    return c.json({ error: "No data" }, 400);

  let imported = 0;
  let updated = 0;
  let skipped = 0;
  const errors: string[] = [];
  const warnings: string[] = [];

  const [products, groups, users] = await Promise.all([
    c.env.DB.prepare("SELECT id, name, active FROM products WHERE active=1 ORDER BY id")
      .all<LookupProduct>(),
    c.env.DB.prepare("SELECT id, name, order_index, is_won FROM groups ORDER BY order_index")
      .all<LookupGroup>(),
    c.env.DB.prepare("SELECT id, name, email, role FROM users ORDER BY id")
      .all<LookupUser>(),
  ]);

  const existingStmt = c.env.DB.prepare(`
    SELECT id FROM customers
    WHERE (? IS NOT NULL AND phone = ?)
       OR (? IS NOT NULL AND LOWER(email) = LOWER(?))
    ORDER BY id ASC LIMIT 1
  `);
  const duplicateMode = duplicate_mode ?? "update";

  for (const row of rows) {
    if (!row.name?.trim()) { errors.push(`Bỏ qua dòng thiếu tên`); continue; }
    try {
      const { meta } = await c.env.DB.prepare(`
        INSERT INTO customers
          (name, phone, email, facebook_link, source, product_id, assigned_to,
           status, list_price, discount_pct, final_price, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, COALESCE(?, datetime('now')), COALESCE(?, datetime('now')))
      `).bind(
        row.name.trim(),
        row.phone ?? null,
        row.email ?? null,
        row.facebook_link ?? null,
        row.source ?? null,
        row.product_id ?? null,
        row.assigned_to ?? null,
        row.status ?? "new",
        row.list_price ?? null,
        row.discount_pct ?? 0,
        row.final_price ?? null,
        row.created_at ?? null,
        row.updated_at ?? null,
      ).run();
      const phone = cleanPhone(row.phone);
      const email = cleanEmail(row.email);
      const productId = resolveProductId(products.results, row.product_id, row.product_name);
      const groupId = resolveGroupId(groups.results, row.group_id, row.group_name, row.status);
      const assignedUser = resolveUser(users.results, row.assigned_to);
      const status = row.status ? statusFromLabel(row.status) : null;
      const receivedDate = parseDateString(row.received_at);
      const dateValue = receivedDate ? `${receivedDate} 07:00:00` : null;
      const listPrice = parseMoney(row.list_price);
      const discountPct = parsePercent(row.discount_pct) ?? 0;
      const finalPrice = parseMoney(row.final_price);

      if (row.product_name && !productId) warnings.push(`Không map được sản phẩm "${row.product_name}" cho "${row.name}"`);
      if (row.assigned_to && !assignedUser) warnings.push(`Không map được sale "${row.assigned_to}" cho "${row.name}"`);

      const existing = duplicateMode !== "create" && (phone || email)
        ? await existingStmt.bind(phone, phone, email, email).first<{ id: number }>()
        : null;

      if (existing && duplicateMode === "skip") {
        skipped++;
        continue;
      }

      let customerId: number;
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
          row.name.trim(),
          phone,
          email,
          row.facebook_link?.trim() || null,
          row.company?.trim() || null,
          row.source?.trim() || null,
          productId,
          groupId,
          assignedUser?.name ?? row.assigned_to?.trim() ?? null,
          assignedUser?.id ?? null,
          status,
          listPrice,
          discountPct,
          finalPrice,
          existing.id,
        ).run();
        customerId = existing.id;
        updated++;
      } else {
        const createdAt = dateValue ?? new Date().toISOString().replace("T", " ").slice(0, 19);
        const { meta } = await c.env.DB.prepare(`
        INSERT INTO customers
          (name, phone, email, facebook_link, company, source, product_id, group_id,
           assigned_to, assigned_user_id, status, list_price, discount_pct, final_price,
           created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).bind(
          row.name.trim(),
          phone,
          email,
          row.facebook_link?.trim() || null,
          row.company?.trim() || null,
          row.source?.trim() || null,
          productId,
          groupId,
          assignedUser?.name ?? row.assigned_to?.trim() ?? null,
          assignedUser?.id ?? null,
          status ?? "new",
          listPrice,
          discountPct,
          finalPrice,
          createdAt,
          createdAt,
        ).run();
        customerId = Number(meta.last_row_id);
        imported++;
      }

      // Thêm ghi chú nếu có
      if (row.note?.trim() && customerId) {
        await c.env.DB.prepare(
          "INSERT INTO notes (customer_id, content, type) VALUES (?, ?, 'note')"
        ).bind(customerId, row.note.trim()).run();
      }

      await syncPrimaryDeal(c.env.DB, customerId);
    } catch (err) {
      errors.push(`Lỗi khi import "${row.name}": ${String(err)}`);
    }
  }

  return c.json({
    imported,
    updated,
    skipped,
    errors,
    warnings: warnings.slice(0, 50),
  });
});

export default importRoute;
