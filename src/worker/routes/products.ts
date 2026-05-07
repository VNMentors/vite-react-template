import { Hono } from "hono";
import type { AppEnv, Product } from "../types";
import { requireAuth } from "../middleware/auth";

const products = new Hono<AppEnv>();
products.use("*", requireAuth);

products.get("/", async (c) => {
  const result = await c.env.DB.prepare(
    "SELECT * FROM products ORDER BY name ASC"
  ).all<Product>();
  return c.json(result.results);
});

products.post("/", async (c) => {
  const { name, price, description } = await c.req.json<{
    name: string; price: number; description?: string;
  }>();
  if (!name) return c.json({ error: "Name is required" }, 400);
  const { meta } = await c.env.DB.prepare(
    "INSERT INTO products (name, price, description) VALUES (?, ?, ?)"
  ).bind(name.trim(), price ?? 0, description ?? null).run();
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
  await c.env.DB.prepare(
    "UPDATE products SET name=?, price=?, description=?, active=? WHERE id=?"
  ).bind(
    body.name ?? existing.name,
    body.price ?? existing.price,
    body.description ?? existing.description,
    body.active ?? existing.active,
    id
  ).run();
  const product = await c.env.DB.prepare("SELECT * FROM products WHERE id = ?")
    .bind(id).first<Product>();
  return c.json(product);
});

products.delete("/:id", async (c) => {
  await c.env.DB.prepare("DELETE FROM products WHERE id = ?").bind(c.req.param("id")).run();
  return c.json({ success: true });
});

export default products;
