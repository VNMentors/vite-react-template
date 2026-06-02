import { Hono } from "hono";
import type { AppEnv, Customer, Note } from "../types";
import { requireAuth } from "../middleware/auth";

const customers = new Hono<AppEnv>();
customers.use("*", requireAuth);

const SELECT_CUSTOMER = `
  SELECT c.*,
    p.name  AS product_name,
    g.name  AS group_name,
    g.color AS group_color,
    g.is_won AS group_is_won
  FROM customers c
  LEFT JOIN products p ON c.product_id = p.id
  LEFT JOIN groups   g ON c.group_id   = g.id
`;

function staffWhere(role: string, userId: number) {
  if (role === "admin") return { clause: "", params: [] as unknown[] };
  return {
    clause: "AND (c.assigned_user_id = ? OR c.assigned_user_id IS NULL)",
    params: [userId] as unknown[],
  };
}

customers.get("/", async (c) => {
  const q = c.req.query("q") ?? "";
  const groupId = c.req.query("group_id") ?? "";
  const productId = c.req.query("product_id") ?? "";
  const assignedTo = c.req.query("assigned_to") ?? "";
  const followUpToday = c.req.query("follow_up_today") === "1";
  const page = Math.max(1, parseInt(c.req.query("page") ?? "1"));
  const limit = 20;
  const offset = (page - 1) * limit;

  const role = c.get("userRole");
  const userId = c.get("userId");
  const { clause: roleClause, params: roleParams } = staffWhere(role, userId);

  const conds: string[] = [];
  const params: unknown[] = [];

  if (q) {
    conds.push("(c.name LIKE ? OR c.email LIKE ? OR c.phone LIKE ?)");
    const like = `%${q}%`;
    params.push(like, like, like);
  }
  if (groupId) { conds.push("c.group_id = ?"); params.push(groupId); }
  if (productId) { conds.push("c.product_id = ?"); params.push(productId); }
  if (assignedTo) { conds.push("c.assigned_to = ?"); params.push(assignedTo); }
  if (followUpToday) {
    conds.push("DATE(c.follow_up_at) <= DATE('now') AND c.follow_up_at IS NOT NULL AND c.group_id NOT IN (SELECT id FROM groups WHERE is_won=1)");
  }

  const where = (conds.length > 0 ? conds.join(" AND ") : "1=1") + " " + roleClause;

  const listP = [...params, ...roleParams, limit, offset];
  const countP = [...params, ...roleParams];

  const [rows, countRow] = await Promise.all([
    c.env.DB.prepare(
      `${SELECT_CUSTOMER} WHERE ${where} ORDER BY c.follow_up_at ASC NULLS LAST, c.created_at DESC LIMIT ? OFFSET ?`
    ).bind(...listP).all<Customer>(),
    c.env.DB.prepare(
      `SELECT COUNT(*) as count FROM customers c WHERE ${where}`
    ).bind(...countP).first<{ count: number }>(),
  ]);

  return c.json({
    customers: rows.results,
    total: countRow?.count ?? 0,
    page,
    totalPages: Math.ceil((countRow?.count ?? 0) / limit),
  });
});

customers.post("/", async (c) => {
  const body = await c.req.json<Partial<Customer>>();
  if (!body.name?.trim()) return c.json({ error: "Name is required" }, 400);

  const role = c.get("userRole");
  const userId = c.get("userId");
  const assignedUserId = role === "staff" ? userId : (body.assigned_user_id ?? null);

  const { meta } = await c.env.DB.prepare(`
    INSERT INTO customers
      (name, email, phone, facebook_link, company,
       product_id, group_id, assigned_to, assigned_user_id,
       status, source, list_price, discount_pct, final_price,
       follow_up_at, follow_up_note)
    VALUES (?,?,?,?,?, ?,?,?,?, ?,?,?,?,?, ?,?)
  `).bind(
    body.name.trim(),
    body.email ?? null, body.phone ?? null,
    body.facebook_link ?? null, body.company ?? null,
    body.product_id ?? null, body.group_id ?? null,
    body.assigned_to ?? null, assignedUserId,
    body.status ?? "new", body.source ?? null,
    body.list_price ?? null, body.discount_pct ?? 0,
    body.final_price ?? null,
    body.follow_up_at ?? null, body.follow_up_note ?? null,
  ).run();

  const customer = await c.env.DB.prepare(`${SELECT_CUSTOMER} WHERE c.id = ?`)
    .bind(meta.last_row_id).first<Customer>();
  return c.json(customer, 201);
});

customers.get("/:id", async (c) => {
  const role = c.get("userRole");
  const userId = c.get("userId");
  const { clause, params } = staffWhere(role, userId);
  const customer = await c.env.DB.prepare(
    `${SELECT_CUSTOMER} WHERE c.id = ? ${clause}`
  ).bind(c.req.param("id"), ...params).first<Customer>();
  if (!customer) return c.json({ error: "Not found" }, 404);
  return c.json(customer);
});

customers.put("/:id", async (c) => {
  const id = c.req.param("id");
  const role = c.get("userRole");
  const userId = c.get("userId");
  const { clause, params: rp } = staffWhere(role, userId);

  const existing = await c.env.DB.prepare(
    `SELECT * FROM customers c WHERE c.id = ? ${clause}`
  ).bind(id, ...rp).first<Customer>();
  if (!existing) return c.json({ error: "Not found" }, 404);

  const body = await c.req.json<Partial<Customer>>();
  await c.env.DB.prepare(`
    UPDATE customers SET
      name=?, email=?, phone=?, facebook_link=?, company=?,
      product_id=?, group_id=?, assigned_to=?, assigned_user_id=?,
      status=?, source=?, list_price=?, discount_pct=?, final_price=?,
      follow_up_at=?, follow_up_note=?, updated_at=datetime('now')
    WHERE id=?
  `).bind(
    body.name ?? existing.name,
    body.email ?? existing.email,
    body.phone ?? existing.phone,
    body.facebook_link ?? existing.facebook_link,
    body.company ?? existing.company,
    body.product_id ?? existing.product_id,
    "group_id" in body ? (body.group_id ?? null) : existing.group_id,
    body.assigned_to ?? existing.assigned_to,
    body.assigned_user_id ?? existing.assigned_user_id,
    body.status ?? existing.status,
    body.source ?? existing.source,
    body.list_price ?? existing.list_price,
    body.discount_pct ?? existing.discount_pct,
    body.final_price ?? existing.final_price,
    "follow_up_at" in body ? (body.follow_up_at ?? null) : existing.follow_up_at,
    "follow_up_note" in body ? (body.follow_up_note ?? null) : existing.follow_up_note,
    id,
  ).run();

  const customer = await c.env.DB.prepare(`${SELECT_CUSTOMER} WHERE c.id = ?`)
    .bind(id).first<Customer>();
  return c.json(customer);
});

customers.delete("/:id", async (c) => {
  const id = c.req.param("id");
  const role = c.get("userRole");
  const userId = c.get("userId");
  const { clause, params: rp } = staffWhere(role, userId);
  const existing = await c.env.DB.prepare(
    `SELECT id FROM customers c WHERE c.id = ? ${clause}`
  ).bind(id, ...rp).first();
  if (!existing) return c.json({ error: "Not found" }, 404);
  await c.env.DB.prepare("DELETE FROM customers WHERE id = ?").bind(id).run();
  return c.json({ success: true });
});

// Notes
customers.get("/:id/notes", async (c) => {
  const notes = await c.env.DB.prepare(
    "SELECT * FROM notes WHERE customer_id = ? ORDER BY created_at DESC"
  ).bind(c.req.param("id")).all<Note>();
  return c.json(notes.results);
});

customers.post("/:id/notes", async (c) => {
  const customerId = c.req.param("id");
  const { content, type } = await c.req.json<{ content: string; type?: string }>();
  if (!content?.trim()) return c.json({ error: "Content is required" }, 400);
  const { meta } = await c.env.DB.prepare(
    "INSERT INTO notes (customer_id, content, type) VALUES (?, ?, ?)"
  ).bind(customerId, content.trim(), type ?? "note").run();
  const note = await c.env.DB.prepare("SELECT * FROM notes WHERE id = ?")
    .bind(meta.last_row_id).first<Note>();
  return c.json(note, 201);
});

customers.delete("/:id/notes/:noteId", async (c) => {
  await c.env.DB.prepare("DELETE FROM notes WHERE id = ? AND customer_id = ?")
    .bind(c.req.param("noteId"), c.req.param("id")).run();
  return c.json({ success: true });
});

export default customers;
