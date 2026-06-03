import { Hono } from "hono";
import type { AppEnv, Customer, Note } from "../types";
import { requireAuth } from "../middleware/auth";
import { cleanEmail, cleanPhone } from "../lib/crm";

const customers = new Hono<AppEnv>();
customers.use("*", requireAuth);

const ARCHIVED_LEAD_STATUSES = ["converted_lms", "archived"];

const SELECT_CUSTOMER = `
  SELECT c.*,
    p.name  AS product_name,
    g.name  AS group_name,
    g.color AS group_color,
    g.is_won AS group_is_won,
    n.last_note_at,
    n.last_note_type
  FROM customers c
  LEFT JOIN products p ON c.product_id = p.id
  LEFT JOIN groups   g ON c.group_id   = g.id
  LEFT JOIN (
    SELECT n.customer_id, n.created_at AS last_note_at, n.type AS last_note_type
    FROM notes n
    INNER JOIN (
      SELECT customer_id, MAX(created_at) AS max_at FROM notes GROUP BY customer_id
    ) m ON n.customer_id = m.customer_id AND n.created_at = m.max_at
  ) n ON n.customer_id = c.id
`;

function staffWhere(role: string, userId: number) {
  if (role === "admin") return { clause: "", params: [] as unknown[] };
  // Staff chỉ thấy lead được phân công cho mình. Lead chưa phân là trách nhiệm của admin.
  return {
    clause: "AND c.assigned_user_id = ?",
    params: [userId] as unknown[],
  };
}

function activeLeadClause(alias = "c") {
  const placeholders = ARCHIVED_LEAD_STATUSES.map(() => "?").join(",");
  return `AND (${alias}.status IS NULL OR ${alias}.status NOT IN (${placeholders}))`;
}

async function findUserById(db: D1Database, id: number | null | undefined) {
  if (!id) return null;
  return db.prepare("SELECT id, name FROM users WHERE id = ?")
    .bind(id).first<{ id: number; name: string }>();
}

async function findUserByNameOrEmail(db: D1Database, value: string | null | undefined) {
  const v = value?.trim();
  if (!v) return null;
  return db.prepare("SELECT id, name FROM users WHERE LOWER(name)=LOWER(?) OR LOWER(email)=LOWER(?)")
    .bind(v, v).first<{ id: number; name: string }>();
}

async function productExists(db: D1Database, id: number | null | undefined) {
  if (!id) return true;
  const row = await db.prepare("SELECT id FROM products WHERE id = ?")
    .bind(id).first<{ id: number }>();
  return !!row;
}

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

async function syncPrimaryDeal(db: D1Database, customerId: string | number) {
  try {
    const customer = await db.prepare(`
      SELECT c.id, c.product_id, c.final_price, c.updated_at, g.is_won AS group_is_won
      FROM customers c
      LEFT JOIN groups g ON c.group_id = g.id
      WHERE c.id = ?
    `).bind(customerId).first<{
      id: number; product_id: number | null; final_price: number | null;
      updated_at: string; group_is_won: number | null;
    }>();
    if (!customer) return;

    const existing = await db.prepare(
      "SELECT id FROM deals WHERE customer_id = ? ORDER BY id ASC LIMIT 1"
    ).bind(customer.id).first<{ id: number }>();

    const amount = customer.final_price ?? 0;
    const isWon = customer.group_is_won === 1;
    if (isWon && amount > 0) {
      if (existing) {
        await db.prepare(`
          UPDATE deals
          SET product_id=?, amount=?, status='won', closed_at=COALESCE(closed_at, date('now')),
              note=COALESCE(note, 'CRM primary deal')
          WHERE id=?
        `).bind(customer.product_id, amount, existing.id).run();
      } else {
        await db.prepare(`
          INSERT INTO deals (customer_id, product_id, amount, status, closed_at, note)
          VALUES (?, ?, ?, 'won', date('now'), 'CRM primary deal')
        `).bind(customer.id, customer.product_id, amount).run();
      }
    } else if (existing && !isWon) {
      await db.prepare(
        "UPDATE deals SET status='open', closed_at=NULL WHERE id=? AND note IN ('CRM primary deal', 'Migrated từ final_price cũ')"
      ).bind(existing.id).run();
    }
  } catch {
    // Migration 0010 may not have been applied yet; keep lead updates working.
  }
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
  conds.push(`(${activeLeadClause("c").replace(/^AND /, "")})`);
  params.push(...ARCHIVED_LEAD_STATUSES);

  if (q) {
    conds.push("(c.name LIKE ? OR c.email LIKE ? OR c.phone LIKE ?)");
    const like = `%${q}%`;
    params.push(like, like, like);
  }
  if (groupId === "none") {
    conds.push("c.group_id IS NULL");
  } else if (groupId) {
    conds.push("c.group_id = ?");
    params.push(groupId);
  }
  if (productId) { conds.push("c.product_id = ?");  params.push(productId); }
  if (assignedTo){ conds.push("c.assigned_to = ?"); params.push(assignedTo); }
  if (followUpToday) {
    conds.push("DATE(c.follow_up_at) <= DATE('now') AND c.follow_up_at IS NOT NULL AND (c.group_id IS NULL OR c.group_id NOT IN (SELECT id FROM groups WHERE is_won=1))");
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
  if (!(await productExists(c.env.DB, body.product_id ?? null))) {
    return c.json({ error: "Sản phẩm không tồn tại" }, 400);
  }

  const role = c.get("userRole");
  const userId = c.get("userId");
  const userName = c.get("userName");
  const assignedUser = role === "staff"
    ? { id: userId, name: userName }
    : await findUserById(c.env.DB, body.assigned_user_id ?? null);
  const assignedUserId = role === "staff" ? userId : (assignedUser?.id ?? null);
  const assignedTo = role === "staff"
    ? userName
    : (assignedUser?.name ?? body.assigned_to ?? null);

  const { meta } = await c.env.DB.prepare(`
    INSERT INTO customers
      (name, email, phone, facebook_link, company,
       product_id, group_id, assigned_to, assigned_user_id,
       status, source, list_price, discount_pct, final_price,
       follow_up_at, follow_up_note)
    VALUES (?,?,?,?,?, ?,?,?,?, ?,?,?,?,?, ?,?)
  `).bind(
    body.name.trim(),
    cleanEmail(body.email) ?? null, cleanPhone(body.phone) ?? null,
    body.facebook_link ?? null, body.company       ?? null,
    body.product_id   ?? null, body.group_id      ?? null,
    assignedTo, assignedUserId,
    body.status       ?? "new", body.source        ?? null,
    body.list_price   ?? null, body.discount_pct  ?? 0,
    body.final_price  ?? null,
    body.follow_up_at ?? null, body.follow_up_note ?? null,
  ).run();

  const customer = await c.env.DB.prepare(`${SELECT_CUSTOMER} WHERE c.id = ?`)
    .bind(meta.last_row_id).first<Customer>();
  await syncPrimaryDeal(c.env.DB, meta.last_row_id);
  return c.json(customer, 201);
});

// GET /api/customers/pipeline — trả về toàn bộ leads (max 2000) cho Kanban, không phân trang
customers.get("/pipeline", async (c) => {
  const role   = c.get("userRole");
  const userId = c.get("userId");
  const { clause: roleClause, params: roleParams } = staffWhere(role, userId);

  const rows = await c.env.DB.prepare(`
    ${SELECT_CUSTOMER}
    WHERE 1=1 ${activeLeadClause("c")} ${roleClause}
    ORDER BY c.follow_up_at ASC NULLS LAST, c.created_at DESC
    LIMIT 2000
  `).bind(...ARCHIVED_LEAD_STATUSES, ...roleParams).all<Customer & { last_note_type: string | null; last_note_at: string | null }>();

  return c.json(rows.results);
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
  if ("product_id" in body && !(await productExists(c.env.DB, body.product_id ?? null))) {
    return c.json({ error: "Sản phẩm không tồn tại" }, 400);
  }
  const nextGroupId = "group_id" in body ? (body.group_id ?? null) : existing.group_id;
  const nextGroup = nextGroupId
    ? await c.env.DB.prepare("SELECT is_won FROM groups WHERE id = ?")
      .bind(nextGroupId).first<{ is_won: number }>()
    : null;

  let assignedUserId = existing.assigned_user_id;
  let assignedTo = existing.assigned_to;
  if (role === "admin") {
    if ("assigned_user_id" in body) {
      const assignedUser = await findUserById(c.env.DB, body.assigned_user_id ?? null);
      assignedUserId = assignedUser?.id ?? null;
      assignedTo = assignedUser?.name ?? null;
    } else if ("assigned_to" in body) {
      const assignedUser = await findUserByNameOrEmail(c.env.DB, body.assigned_to ?? null);
      assignedUserId = assignedUser?.id ?? null;
      assignedTo = assignedUser?.name ?? body.assigned_to ?? null;
    }
  }

  let nextStatus = body.status ?? existing.status;
  if (!("status" in body) && nextGroup?.is_won === 1 && !ARCHIVED_LEAD_STATUSES.includes(nextStatus)) {
    nextStatus = "closed";
  }

  await c.env.DB.prepare(`
    UPDATE customers SET
      name=?, email=?, phone=?, facebook_link=?, company=?,
      product_id=?, group_id=?, assigned_to=?, assigned_user_id=?,
      status=?, source=?, list_price=?, discount_pct=?, final_price=?,
      follow_up_at=?, follow_up_note=?, updated_at=datetime('now')
    WHERE id=?
  `).bind(
    body.name          ?? existing.name,
    "email" in body ? (cleanEmail(body.email) ?? null) : existing.email,
    "phone" in body ? (cleanPhone(body.phone) ?? null) : existing.phone,
    body.facebook_link ?? existing.facebook_link,
    body.company       ?? existing.company,
    "product_id" in body ? (body.product_id ?? null) : existing.product_id,
    nextGroupId,
    assignedTo,
    assignedUserId,
    nextStatus,
    body.source        ?? existing.source,
    body.list_price    ?? existing.list_price,
    body.discount_pct  ?? existing.discount_pct,
    body.final_price   ?? existing.final_price,
    "follow_up_at"   in body ? (body.follow_up_at   ?? null) : existing.follow_up_at,
    "follow_up_note" in body ? (body.follow_up_note ?? null) : existing.follow_up_note,
    id,
  ).run();

  await syncPrimaryDeal(c.env.DB, id);

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

// Bulk operations (admin only)
customers.patch("/bulk", requireAuth, async (c) => {
  const role = c.get("userRole");
  if (role !== "admin") return c.json({ error: "Chỉ admin được phép thực hiện" }, 403);

  const body = await c.req.json<{
    ids: number[];
    action: "assign" | "group" | "auto_distribute";
    user_id?: number | null;
    user_name?: string | null;
    group_id?: number | null;
    user_ids?: number[];       // cho auto_distribute
    user_names?: string[];
  }>();

  if (!body.ids?.length) return c.json({ error: "Không có leads nào được chọn" }, 400);

  const placeholders = body.ids.map(() => "?").join(",");

  if (body.action === "assign") {
    const assignedUser = await findUserById(c.env.DB, body.user_id ?? null);
    await c.env.DB.prepare(
      `UPDATE customers SET assigned_user_id=?, assigned_to=?, updated_at=datetime('now')
       WHERE id IN (${placeholders})`
    ).bind(assignedUser?.id ?? null, assignedUser?.name ?? null, ...body.ids).run();

  } else if (body.action === "group") {
    const group = body.group_id
      ? await c.env.DB.prepare("SELECT is_won FROM groups WHERE id=?")
        .bind(body.group_id).first<{ is_won: number }>()
      : null;
    const statusSql = group?.is_won === 1 ? ", status='closed'" : "";
    await c.env.DB.prepare(
      `UPDATE customers SET group_id=?, updated_at=datetime('now')${statusSql} WHERE id IN (${placeholders})`
    ).bind(body.group_id ?? null, ...body.ids).run();
    await Promise.all(body.ids.map(id => syncPrimaryDeal(c.env.DB, id)));

  } else if (body.action === "auto_distribute") {
    // Phân phối đều theo round-robin
    const userIds   = body.user_ids   ?? [];
    if (!userIds.length) return c.json({ error: "Cần ít nhất 1 nhân viên" }, 400);

    const users = await Promise.all(userIds.map(id => findUserById(c.env.DB, id)));
    const validUsers = users.filter((u): u is { id: number; name: string } => !!u);
    if (!validUsers.length) return c.json({ error: "Không tìm thấy nhân viên hợp lệ" }, 400);

    const stmts = body.ids.map((id, i) => {
      const ui = i % validUsers.length;
      return c.env.DB.prepare(
        "UPDATE customers SET assigned_user_id=?, assigned_to=?, updated_at=datetime('now') WHERE id=?"
      ).bind(validUsers[ui].id, validUsers[ui].name, id);
    });
    await c.env.DB.batch(stmts);
  }

  return c.json({ success: true, updated: body.ids.length });
});

// Notes
customers.get("/:id/notes", async (c) => {
  const ok = await canAccessCustomer(c.env.DB, c.req.param("id"), c.get("userRole"), c.get("userId"));
  if (!ok) return c.json({ error: "Not found" }, 404);
  const notes = await c.env.DB.prepare(
    "SELECT * FROM notes WHERE customer_id = ? ORDER BY created_at DESC"
  ).bind(c.req.param("id")).all<Note>();
  return c.json(notes.results);
});

customers.post("/:id/notes", async (c) => {
  const customerId = c.req.param("id");
  const ok = await canAccessCustomer(c.env.DB, customerId, c.get("userRole"), c.get("userId"));
  if (!ok) return c.json({ error: "Not found" }, 404);
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
  const ok = await canAccessCustomer(c.env.DB, c.req.param("id"), c.get("userRole"), c.get("userId"));
  if (!ok) return c.json({ error: "Not found" }, 404);
  await c.env.DB.prepare("DELETE FROM notes WHERE id = ? AND customer_id = ?")
    .bind(c.req.param("noteId"), c.req.param("id")).run();
  return c.json({ success: true });
});

export default customers;
