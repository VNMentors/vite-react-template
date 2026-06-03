import { Hono } from "hono";
import type { AppEnv, Product } from "../types";
import { requireAuth } from "../middleware/auth";
import { normalizeText } from "../lib/crm";

const products = new Hono<AppEnv>();
products.use("*", requireAuth);

async function productNameExists(db: D1Database, name: string, exceptId?: string | number) {
  const rows = await db.prepare("SELECT id, name FROM products")
    .all<{ id: number; name: string }>();
  const key = normalizeText(name);
  return rows.results.some((p) => normalizeText(p.name) === key && String(p.id) !== String(exceptId ?? ""));
}

async function productReferenceCount(db: D1Database, productId: string) {
  let count = 0;
  const customers = await db.prepare("SELECT COUNT(*) AS n FROM customers WHERE product_id = ?")
    .bind(productId).first<{ n: number }>();
  count += customers?.n ?? 0;

  try {
    const deals = await db.prepare("SELECT COUNT(*) AS n FROM deals WHERE product_id = ?")
      .bind(productId).first<{ n: number }>();
    count += deals?.n ?? 0;
  } catch {
    // Older databases may not have deals yet.
  }

  try {
    const subs = await db.prepare("SELECT COUNT(*) AS n FROM subscriptions WHERE product_id = ?")
      .bind(productId).first<{ n: number }>();
    count += subs?.n ?? 0;
  } catch {
    // Older databases may not have subscriptions yet.
  }

  return count;
}

products.get("/", async (c) => {
  try {
    const result = await c.env.DB.prepare(`
      SELECT p.*,
        COALESCE(l.lead_count,0) AS lead_count,
        COALESCE(w.won_count,0) AS won_count,
        COALESCE(w.revenue,0) AS revenue
      FROM products p
      LEFT JOIN (
        SELECT product_id, COUNT(*) AS lead_count
        FROM customers
        GROUP BY product_id
      ) l ON l.product_id = p.id
      LEFT JOIN (
        SELECT product_id, COUNT(DISTINCT customer_id) AS won_count, SUM(amount) AS revenue
        FROM deals
        WHERE status='won'
        GROUP BY product_id
      ) w ON w.product_id = p.id
      GROUP BY p.id
      ORDER BY p.active DESC, lead_count DESC
    `).all<Product & { lead_count: number; won_count: number; revenue: number }>();
    return c.json(result.results);
  } catch {
    const result = await c.env.DB.prepare(`
      SELECT p.*,
        COUNT(c.id) AS lead_count,
        SUM(CASE WHEN g.is_won=1 THEN 1 ELSE 0 END) AS won_count,
        SUM(CASE WHEN g.is_won=1 THEN COALESCE(c.final_price,0) ELSE 0 END) AS revenue
      FROM products p
      LEFT JOIN customers c ON c.product_id = p.id
      LEFT JOIN groups g ON c.group_id = g.id
      GROUP BY p.id
      ORDER BY p.active DESC, lead_count DESC
    `).all<Product & { lead_count: number; won_count: number; revenue: number }>();
    return c.json(result.results);
  }
});

products.post("/", async (c) => {
  const { name, price, description } = await c.req.json<{
    name: string; price: number; description?: string;
  }>();
  if (!name?.trim()) return c.json({ error: "Tên sản phẩm bắt buộc" }, 400);
  if (await productNameExists(c.env.DB, name)) {
    return c.json({ error: "Sản phẩm này đã tồn tại" }, 409);
  }
  const { meta } = await c.env.DB.prepare(
    "INSERT INTO products (name, price, description) VALUES (?, ?, ?)"
  ).bind(name.trim(), Math.max(0, Number(price) || 0), description?.trim() || null).run();
  const product = await c.env.DB.prepare("SELECT * FROM products WHERE id = ?")
    .bind(meta.last_row_id).first<Product>();
  return c.json(product, 201);
});

products.put("/:id", async (c) => {
  const id = c.req.param("id");
  const existing = await c.env.DB.prepare("SELECT * FROM products WHERE id = ?")
    .bind(id).first<Product>();
  if (!existing) return c.json({ error: "Not found" }, 404);
  const body = await c.req.json<Partial<Product>>();
  const nextName = body.name?.trim() || existing.name;
  if (await productNameExists(c.env.DB, nextName, id)) {
    return c.json({ error: "Sản phẩm này đã tồn tại" }, 409);
  }
  await c.env.DB.prepare(
    "UPDATE products SET name=?, price=?, description=?, active=? WHERE id=?"
  ).bind(
    nextName,
    "price" in body ? Math.max(0, Number(body.price) || 0) : existing.price,
    "description" in body ? (body.description?.trim() || null) : existing.description,
    body.active ?? existing.active,
    id
  ).run();
  const product = await c.env.DB.prepare("SELECT * FROM products WHERE id = ?")
    .bind(id).first<Product>();
  return c.json(product);
});

products.delete("/:id", async (c) => {
  const id = c.req.param("id");
  const existing = await c.env.DB.prepare("SELECT id FROM products WHERE id = ?")
    .bind(id).first<{ id: number }>();
  if (!existing) return c.json({ error: "Not found" }, 404);

  const refCount = await productReferenceCount(c.env.DB, id);
  if (refCount > 0) {
    await c.env.DB.prepare("UPDATE products SET active=0 WHERE id = ?").bind(id).run();
    return c.json({ success: true, deactivated: true, references: refCount });
  }

  await c.env.DB.prepare("DELETE FROM products WHERE id = ?").bind(id).run();
  return c.json({ success: true, deleted: true });
});

export default products;
