import { Hono, type MiddlewareHandler } from "hono";
import { sign, verify } from "hono/jwt";

type Bindings = {
  DB: D1Database;
  JWT_SECRET: string;
};

type Variables = {
  userId: number;
};

type AppEnv = { Bindings: Bindings; Variables: Variables };

type Customer = {
  id: number;
  name: string;
  email: string | null;
  phone: string | null;
  company: string | null;
  status: string;
  source: string | null;
  created_at: string;
  updated_at: string;
};

type Note = {
  id: number;
  customer_id: number;
  content: string;
  type: string;
  created_at: string;
};

const app = new Hono<AppEnv>();

async function hashPassword(password: string, salt: string): Promise<string> {
  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    encoder.encode(password),
    "PBKDF2",
    false,
    ["deriveBits"]
  );
  const buf = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      salt: encoder.encode(salt),
      iterations: 100000,
      hash: "SHA-256",
    },
    keyMaterial,
    256
  );
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function randomSalt(): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(16)))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

const requireAuth: MiddlewareHandler<AppEnv> = async (c, next) => {
  const auth = c.req.header("Authorization");
  if (!auth?.startsWith("Bearer ")) {
    return c.json({ error: "Unauthorized" }, 401);
  }
  try {
    const payload = await verify(auth.slice(7), c.env.JWT_SECRET);
    c.set("userId", payload["userId"] as number);
    await next();
  } catch {
    return c.json({ error: "Invalid token" }, 401);
  }
};

// Auth
app.get("/api/auth/check-setup", async (c) => {
  const result = await c.env.DB.prepare(
    "SELECT COUNT(*) as count FROM users"
  ).first<{ count: number }>();
  return c.json({ needsSetup: (result?.count ?? 0) === 0 });
});

app.post("/api/auth/register", async (c) => {
  const countResult = await c.env.DB.prepare(
    "SELECT COUNT(*) as count FROM users"
  ).first<{ count: number }>();
  const count = countResult?.count ?? 0;

  if (count > 0) {
    const auth = c.req.header("Authorization");
    if (!auth?.startsWith("Bearer "))
      return c.json({ error: "Unauthorized" }, 401);
    try {
      await verify(auth.slice(7), c.env.JWT_SECRET);
    } catch {
      return c.json({ error: "Invalid token" }, 401);
    }
  }

  const { email, password, name } = await c.req.json<{
    email: string;
    password: string;
    name: string;
  }>();
  if (!email || !password || !name)
    return c.json({ error: "Missing required fields" }, 400);

  const existing = await c.env.DB.prepare(
    "SELECT id FROM users WHERE email = ?"
  )
    .bind(email)
    .first();
  if (existing) return c.json({ error: "Email đã được sử dụng" }, 409);

  const salt = randomSalt();
  const hash = await hashPassword(password, salt);

  const { meta } = await c.env.DB.prepare(
    "INSERT INTO users (email, name, password_hash, salt) VALUES (?, ?, ?, ?)"
  )
    .bind(email, name, hash, salt)
    .run();

  return c.json({ id: meta.last_row_id, email, name }, 201);
});

app.post("/api/auth/login", async (c) => {
  const { email, password } = await c.req.json<{
    email: string;
    password: string;
  }>();
  if (!email || !password)
    return c.json({ error: "Missing credentials" }, 400);

  const user = await c.env.DB.prepare(
    "SELECT * FROM users WHERE email = ?"
  ).bind(email).first<{
    id: number;
    email: string;
    name: string;
    password_hash: string;
    salt: string;
  }>();
  if (!user) return c.json({ error: "Invalid credentials" }, 401);

  const hash = await hashPassword(password, user.salt);
  if (hash !== user.password_hash)
    return c.json({ error: "Invalid credentials" }, 401);

  const token = await sign(
    {
      userId: user.id,
      email: user.email,
      exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 7,
    },
    c.env.JWT_SECRET
  );
  return c.json({ token, user: { id: user.id, email: user.email, name: user.name } });
});

app.get("/api/auth/me", requireAuth, async (c) => {
  const userId = c.get("userId");
  const user = await c.env.DB.prepare(
    "SELECT id, email, name FROM users WHERE id = ?"
  )
    .bind(userId)
    .first();
  if (!user) return c.json({ error: "User not found" }, 404);
  return c.json({ user });
});

// Stats
app.get("/api/stats", requireAuth, async (c) => {
  const [total, byStatus, monthly, recent] = await Promise.all([
    c.env.DB.prepare("SELECT COUNT(*) as count FROM customers").first<{
      count: number;
    }>(),
    c.env.DB.prepare(
      "SELECT status, COUNT(*) as count FROM customers GROUP BY status"
    ).all<{ status: string; count: number }>(),
    c.env.DB.prepare(
      "SELECT COUNT(*) as count FROM customers WHERE created_at >= datetime('now', '-30 days')"
    ).first<{ count: number }>(),
    c.env.DB.prepare(
      "SELECT * FROM customers ORDER BY created_at DESC LIMIT 5"
    ).all<Customer>(),
  ]);

  const statusMap: Record<string, number> = {};
  byStatus.results.forEach((r) => {
    statusMap[r.status] = r.count;
  });

  return c.json({
    total: total?.count ?? 0,
    monthly: monthly?.count ?? 0,
    lead: statusMap["lead"] ?? 0,
    prospect: statusMap["prospect"] ?? 0,
    active: statusMap["active"] ?? 0,
    inactive: statusMap["inactive"] ?? 0,
    recentCustomers: recent.results,
  });
});

// Customers
app.get("/api/customers", requireAuth, async (c) => {
  const q = c.req.query("q") ?? "";
  const status = c.req.query("status") ?? "";
  const page = Math.max(1, parseInt(c.req.query("page") ?? "1"));
  const limit = 20;
  const offset = (page - 1) * limit;

  const conditions: string[] = [];
  const params: unknown[] = [];

  if (q) {
    conditions.push(
      "(name LIKE ? OR email LIKE ? OR phone LIKE ? OR company LIKE ?)"
    );
    const like = `%${q}%`;
    params.push(like, like, like, like);
  }
  if (status) {
    conditions.push("status = ?");
    params.push(status);
  }

  const where =
    conditions.length > 0 ? conditions.join(" AND ") : "1=1";

  const listParams: unknown[] = [...params, limit, offset];
  const countParams: unknown[] = [...params];

  const [rows, countRow] = await Promise.all([
    c.env.DB.prepare(
      `SELECT * FROM customers WHERE ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`
    )
      .bind(...listParams)
      .all<Customer>(),
    c.env.DB.prepare(
      `SELECT COUNT(*) as count FROM customers WHERE ${where}`
    )
      .bind(...countParams)
      .first<{ count: number }>(),
  ]);

  return c.json({
    customers: rows.results,
    total: countRow?.count ?? 0,
    page,
    totalPages: Math.ceil((countRow?.count ?? 0) / limit),
  });
});

app.post("/api/customers", requireAuth, async (c) => {
  const body = await c.req.json<{
    name: string;
    email?: string;
    phone?: string;
    company?: string;
    status?: string;
    source?: string;
  }>();
  if (!body.name?.trim()) return c.json({ error: "Name is required" }, 400);

  const { meta } = await c.env.DB.prepare(
    "INSERT INTO customers (name, email, phone, company, status, source) VALUES (?, ?, ?, ?, ?, ?)"
  )
    .bind(
      body.name.trim(),
      body.email ?? null,
      body.phone ?? null,
      body.company ?? null,
      body.status ?? "lead",
      body.source ?? null
    )
    .run();

  const customer = await c.env.DB.prepare(
    "SELECT * FROM customers WHERE id = ?"
  )
    .bind(meta.last_row_id)
    .first<Customer>();
  return c.json(customer, 201);
});

app.get("/api/customers/:id", requireAuth, async (c) => {
  const customer = await c.env.DB.prepare(
    "SELECT * FROM customers WHERE id = ?"
  )
    .bind(c.req.param("id"))
    .first<Customer>();
  if (!customer) return c.json({ error: "Customer not found" }, 404);
  return c.json(customer);
});

app.put("/api/customers/:id", requireAuth, async (c) => {
  const id = c.req.param("id");
  const existing = await c.env.DB.prepare(
    "SELECT * FROM customers WHERE id = ?"
  )
    .bind(id)
    .first<Customer>();
  if (!existing) return c.json({ error: "Customer not found" }, 404);

  const body = await c.req.json<Partial<Customer>>();

  await c.env.DB.prepare(
    "UPDATE customers SET name=?, email=?, phone=?, company=?, status=?, source=?, updated_at=datetime('now') WHERE id=?"
  )
    .bind(
      body.name ?? existing.name,
      body.email ?? existing.email,
      body.phone ?? existing.phone,
      body.company ?? existing.company,
      body.status ?? existing.status,
      body.source ?? existing.source,
      id
    )
    .run();

  const customer = await c.env.DB.prepare(
    "SELECT * FROM customers WHERE id = ?"
  )
    .bind(id)
    .first<Customer>();
  return c.json(customer);
});

app.delete("/api/customers/:id", requireAuth, async (c) => {
  const id = c.req.param("id");
  const existing = await c.env.DB.prepare(
    "SELECT id FROM customers WHERE id = ?"
  )
    .bind(id)
    .first();
  if (!existing) return c.json({ error: "Customer not found" }, 404);
  await c.env.DB.prepare("DELETE FROM customers WHERE id = ?").bind(id).run();
  return c.json({ success: true });
});

// User management
app.get("/api/users", requireAuth, async (c) => {
  const users = await c.env.DB.prepare(
    "SELECT id, email, name, created_at FROM users ORDER BY created_at ASC"
  ).all<{ id: number; email: string; name: string; created_at: string }>();
  return c.json(users.results);
});

app.delete("/api/users/:id", requireAuth, async (c) => {
  const id = Number(c.req.param("id"));
  const currentUserId = c.get("userId");
  if (id === currentUserId)
    return c.json({ error: "Không thể xóa tài khoản của chính mình" }, 400);
  await c.env.DB.prepare("DELETE FROM users WHERE id = ?").bind(id).run();
  return c.json({ success: true });
});

// Notes
app.get("/api/customers/:id/notes", requireAuth, async (c) => {
  const notes = await c.env.DB.prepare(
    "SELECT * FROM notes WHERE customer_id = ? ORDER BY created_at DESC"
  )
    .bind(c.req.param("id"))
    .all<Note>();
  return c.json(notes.results);
});

app.post("/api/customers/:id/notes", requireAuth, async (c) => {
  const customerId = c.req.param("id");
  const { content, type } = await c.req.json<{
    content: string;
    type?: string;
  }>();
  if (!content?.trim()) return c.json({ error: "Content is required" }, 400);

  const { meta } = await c.env.DB.prepare(
    "INSERT INTO notes (customer_id, content, type) VALUES (?, ?, ?)"
  )
    .bind(customerId, content.trim(), type ?? "note")
    .run();

  const note = await c.env.DB.prepare("SELECT * FROM notes WHERE id = ?")
    .bind(meta.last_row_id)
    .first<Note>();
  return c.json(note, 201);
});

app.delete(
  "/api/customers/:customerId/notes/:noteId",
  requireAuth,
  async (c) => {
    await c.env.DB.prepare(
      "DELETE FROM notes WHERE id = ? AND customer_id = ?"
    )
      .bind(c.req.param("noteId"), c.req.param("customerId"))
      .run();
    return c.json({ success: true });
  }
);

export default app;
