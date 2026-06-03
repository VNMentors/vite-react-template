import { Hono } from "hono";
import type { AppEnv } from "../types";
import { requireAuth } from "../middleware/auth";

type Subscription = {
  id: number;
  customer_id: number;
  product_id: number | null;
  product_name: string | null;
  start_date: string;
  end_date: string;
  user_count: number | null;
  price_paid: number | null;
  note: string | null;
  created_at: string;
};

type Invoice = {
  id: number;
  customer_id: number;
  amount: number;
  issued_at: string;
  paid_at: string | null;
  note: string | null;
  created_at: string;
};

const router = new Hono<AppEnv>();
router.use("*", requireAuth);

async function canAccessCustomer(db: D1Database, customerId: string, role: string, userId: number) {
  if (role === "admin") {
    const row = await db.prepare("SELECT id FROM customers WHERE id = ?")
      .bind(customerId).first<{ id: number }>();
    return !!row;
  }
  const row = await db.prepare("SELECT id FROM customers WHERE id = ? AND assigned_user_id = ?")
    .bind(customerId, userId).first<{ id: number }>();
  return !!row;
}

// ── Subscriptions ──────────────────────────────────────────
router.get("/customers/:id/subscriptions", async (c) => {
  const ok = await canAccessCustomer(c.env.DB, c.req.param("id"), c.get("userRole"), c.get("userId"));
  if (!ok) return c.json({ error: "Not found" }, 404);
  const rows = await c.env.DB.prepare(`
    SELECT s.*, p.name AS product_name
    FROM subscriptions s
    LEFT JOIN products p ON s.product_id = p.id
    WHERE s.customer_id = ?
    ORDER BY s.end_date DESC
  `).bind(c.req.param("id")).all<Subscription>();
  return c.json(rows.results);
});

router.post("/customers/:id/subscriptions", async (c) => {
  const customerId = c.req.param("id");
  const ok = await canAccessCustomer(c.env.DB, customerId, c.get("userRole"), c.get("userId"));
  if (!ok) return c.json({ error: "Not found" }, 404);
  const body = await c.req.json<Partial<Subscription>>();
  if (!body.start_date || !body.end_date)
    return c.json({ error: "start_date và end_date bắt buộc" }, 400);

  const { meta } = await c.env.DB.prepare(`
    INSERT INTO subscriptions (customer_id, product_id, start_date, end_date, user_count, price_paid, note)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).bind(
    customerId,
    body.product_id ?? null,
    body.start_date,
    body.end_date,
    body.user_count ?? null,
    body.price_paid ?? null,
    body.note ?? null,
  ).run();

  const sub = await c.env.DB.prepare(`
    SELECT s.*, p.name AS product_name FROM subscriptions s
    LEFT JOIN products p ON s.product_id = p.id WHERE s.id = ?
  `).bind(meta.last_row_id).first<Subscription>();
  return c.json(sub, 201);
});

router.delete("/customers/:id/subscriptions/:subId", async (c) => {
  const ok = await canAccessCustomer(c.env.DB, c.req.param("id"), c.get("userRole"), c.get("userId"));
  if (!ok) return c.json({ error: "Not found" }, 404);
  await c.env.DB.prepare(
    "DELETE FROM subscriptions WHERE id = ? AND customer_id = ?"
  ).bind(c.req.param("subId"), c.req.param("id")).run();
  return c.json({ success: true });
});

// ── Invoices ──────────────────────────────────────────────
router.get("/customers/:id/invoices", async (c) => {
  const ok = await canAccessCustomer(c.env.DB, c.req.param("id"), c.get("userRole"), c.get("userId"));
  if (!ok) return c.json({ error: "Not found" }, 404);
  const rows = await c.env.DB.prepare(`
    SELECT * FROM invoices WHERE customer_id = ? ORDER BY issued_at DESC
  `).bind(c.req.param("id")).all<Invoice>();
  return c.json(rows.results);
});

router.post("/customers/:id/invoices", async (c) => {
  const customerId = c.req.param("id");
  const ok = await canAccessCustomer(c.env.DB, customerId, c.get("userRole"), c.get("userId"));
  if (!ok) return c.json({ error: "Not found" }, 404);
  const body = await c.req.json<Partial<Invoice>>();
  if (!body.amount) return c.json({ error: "amount bắt buộc" }, 400);

  const { meta } = await c.env.DB.prepare(`
    INSERT INTO invoices (customer_id, amount, issued_at, paid_at, note)
    VALUES (?, ?, ?, ?, ?)
  `).bind(
    customerId,
    body.amount,
    body.issued_at ?? new Date().toISOString().slice(0, 10),
    body.paid_at ?? null,
    body.note ?? null,
  ).run();

  const inv = await c.env.DB.prepare("SELECT * FROM invoices WHERE id = ?")
    .bind(meta.last_row_id).first<Invoice>();
  return c.json(inv, 201);
});

router.patch("/customers/:id/invoices/:invId/pay", async (c) => {
  const ok = await canAccessCustomer(c.env.DB, c.req.param("id"), c.get("userRole"), c.get("userId"));
  if (!ok) return c.json({ error: "Not found" }, 404);
  await c.env.DB.prepare(
    "UPDATE invoices SET paid_at = date('now') WHERE id = ? AND customer_id = ?"
  ).bind(c.req.param("invId"), c.req.param("id")).run();
  return c.json({ success: true });
});

router.delete("/customers/:id/invoices/:invId", async (c) => {
  const ok = await canAccessCustomer(c.env.DB, c.req.param("id"), c.get("userRole"), c.get("userId"));
  if (!ok) return c.json({ error: "Not found" }, 404);
  await c.env.DB.prepare(
    "DELETE FROM invoices WHERE id = ? AND customer_id = ?"
  ).bind(c.req.param("invId"), c.req.param("id")).run();
  return c.json({ success: true });
});

export default router;
