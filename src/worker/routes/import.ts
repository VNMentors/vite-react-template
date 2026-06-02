import { Hono } from "hono";
import type { AppEnv } from "../types";
import { requireAuth } from "../middleware/auth";

type ImportRow = {
  name: string;
  phone?: string | null;
  email?: string | null;
  facebook_link?: string | null;
  source?: string | null;
  product_id?: number | null;
  assigned_to?: string | null;
  status?: string;
  list_price?: number | null;
  discount_pct?: number | null;
  final_price?: number | null;
  note?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

const importRoute = new Hono<AppEnv>();
importRoute.use("*", requireAuth);

importRoute.post("/customers", async (c) => {
  const { rows } = await c.req.json<{ rows: ImportRow[] }>();
  if (!Array.isArray(rows) || rows.length === 0)
    return c.json({ error: "No data" }, 400);

  let imported = 0;
  const errors: string[] = [];

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

      // Thêm ghi chú nếu có
      if (row.note?.trim() && meta.last_row_id) {
        await c.env.DB.prepare(
          "INSERT INTO notes (customer_id, content, type) VALUES (?, ?, 'note')"
        ).bind(meta.last_row_id, row.note.trim()).run();
      }

      imported++;
    } catch (err) {
      errors.push(`Lỗi khi import "${row.name}": ${String(err)}`);
    }
  }

  return c.json({ imported, errors });
});

export default importRoute;
