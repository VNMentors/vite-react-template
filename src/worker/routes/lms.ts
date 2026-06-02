import { Hono } from "hono";
import type { AppEnv } from "../types";
import { requireAuth } from "../middleware/auth";

type LmsClient = {
  id: number;
  name: string;
  phone: string | null;
  email: string | null;
  domain: string;           // key trong KV: "tenant:{domain}"
  contract_start: string;
  contract_end: string;
  user_count: number;
  price: number | null;
  status: string;           // active | suspended | expired
  note: string | null;
  source_customer_id: number | null;
  created_at: string;
  updated_at: string;
};

type LmsInvoice = {
  id: number; client_id: number; amount: number;
  issued_at: string; paid_at: string | null; note: string | null; created_at: string;
};

// Cấu trúc lưu trong KV — LMS Worker đọc cái này để serve đúng tenant
type KvTenantConfig = {
  client_id: number;
  name: string;
  user_count: number;
  expires_at: string;   // ISO date string
  status: "active" | "suspended" | "expired";
};

function kvKey(domain: string) {
  return `tenant:${domain}`;
}

async function canAccessCustomer(db: D1Database, customerId: number, role: string, userId: number) {
  if (role === "admin") {
    const row = await db.prepare("SELECT id FROM customers WHERE id=?")
      .bind(customerId).first<{ id: number }>();
    return !!row;
  }
  const row = await db.prepare("SELECT id FROM customers WHERE id=? AND assigned_user_id=?")
    .bind(customerId, userId).first<{ id: number }>();
  return !!row;
}

async function syncKv(kv: KVNamespace, client: LmsClient) {
  const config: KvTenantConfig = {
    client_id: client.id,
    name: client.name,
    user_count: client.user_count,
    expires_at: client.contract_end,
    status: client.status as KvTenantConfig["status"],
  };
  // TTL tự hết sau ngày contract_end + 7 ngày buffer
  const expiresMs = new Date(client.contract_end).getTime() + 7 * 86400 * 1000;
  const ttlSeconds = Math.max(60, Math.floor((expiresMs - Date.now()) / 1000));
  await kv.put(kvKey(client.domain), JSON.stringify(config), { expirationTtl: ttlSeconds });
}

const router = new Hono<AppEnv>();
router.use("*", requireAuth);

// ── List clients ──────────────────────────────────────────
router.get("/", async (c) => {
  const rows = await c.env.DB.prepare(
    "SELECT * FROM lms_clients ORDER BY contract_end ASC"
  ).all<LmsClient>();
  return c.json(rows.results);
});

// ── Create + provision KV ─────────────────────────────────
router.post("/", async (c) => {
  const b = await c.req.json<Partial<LmsClient> & { domain: string }>();
  if (!b.name?.trim())        return c.json({ error: "name bắt buộc" }, 400);
  if (!b.domain?.trim())      return c.json({ error: "domain bắt buộc" }, 400);
  if (!b.contract_start)      return c.json({ error: "contract_start bắt buộc" }, 400);
  if (!b.contract_end)        return c.json({ error: "contract_end bắt buộc" }, 400);
  if ((b.user_count ?? 0) < 1) return c.json({ error: "user_count phải >= 1" }, 400);

  // Normalize domain: bỏ https://, trailing slash
  const domain = b.domain.trim().replace(/^https?:\/\//, "").replace(/\/$/, "").toLowerCase();
  const sourceCustomerId = b.source_customer_id ?? null;
  if (sourceCustomerId) {
    const ok = await canAccessCustomer(c.env.DB, sourceCustomerId, c.get("userRole"), c.get("userId"));
    if (!ok) return c.json({ error: "Không tìm thấy lead nguồn" }, 404);
  }

  try {
    const { meta } = await c.env.DB.prepare(`
      INSERT INTO lms_clients (name, phone, email, domain, contract_start, contract_end, user_count, price, note, source_customer_id)
      VALUES (?,?,?,?,?,?,?,?,?,?)
    `).bind(
      b.name.trim(), b.phone ?? null, b.email ?? null, domain,
      b.contract_start, b.contract_end, b.user_count ?? 1,
      b.price ?? null, b.note ?? null, sourceCustomerId,
    ).run();

    const client = await c.env.DB.prepare("SELECT * FROM lms_clients WHERE id=?")
      .bind(meta.last_row_id).first<LmsClient>();

    if (client) await syncKv(c.env.LMS_KV, client);
    if (client?.source_customer_id) {
      const wonGroup = await c.env.DB.prepare(
        "SELECT id FROM groups WHERE is_won=1 ORDER BY order_index ASC LIMIT 1"
      ).first<{ id: number }>();
      await c.env.DB.prepare(`
        UPDATE customers
        SET status='converted_lms',
            group_id=COALESCE(?, group_id),
            follow_up_at=NULL,
            follow_up_note=NULL,
            updated_at=datetime('now')
        WHERE id=?
      `).bind(wonGroup?.id ?? null, client.source_customer_id).run();
      await c.env.DB.prepare(
        "INSERT INTO notes (customer_id, content, type) VALUES (?, ?, 'note')"
      ).bind(
        client.source_customer_id,
        `Đã ký hợp đồng LMS và tạo client ${client.domain}.`,
      ).run();
    }

    return c.json(client, 201);
  } catch (e: unknown) {
    if (e instanceof Error && e.message.includes("UNIQUE")) {
      return c.json({ error: `Domain "${domain}" đã tồn tại` }, 409);
    }
    throw e;
  }
});

// ── Update + sync KV ──────────────────────────────────────
router.put("/:id", async (c) => {
  const id = c.req.param("id");
  const b = await c.req.json<Partial<LmsClient>>();
  const existing = await c.env.DB.prepare("SELECT * FROM lms_clients WHERE id=?")
    .bind(id).first<LmsClient>();
  if (!existing) return c.json({ error: "Not found" }, 404);

  await c.env.DB.prepare(`
    UPDATE lms_clients SET
      name=?, phone=?, email=?, contract_start=?, contract_end=?,
      user_count=?, price=?, note=?, updated_at=datetime('now')
    WHERE id=?
  `).bind(
    b.name ?? existing.name, b.phone ?? existing.phone, b.email ?? existing.email,
    b.contract_start ?? existing.contract_start, b.contract_end ?? existing.contract_end,
    b.user_count ?? existing.user_count, b.price ?? existing.price,
    b.note ?? existing.note, id,
  ).run();

  const updated = await c.env.DB.prepare("SELECT * FROM lms_clients WHERE id=?")
    .bind(id).first<LmsClient>();
  if (updated) await syncKv(c.env.LMS_KV, updated);

  return c.json(updated);
});

// ── Suspend / Reactivate ──────────────────────────────────
router.patch("/:id/status", async (c) => {
  const id = c.req.param("id");
  const { status } = await c.req.json<{ status: string }>();
  if (!["active", "suspended", "expired"].includes(status))
    return c.json({ error: "status không hợp lệ" }, 400);

  const existing = await c.env.DB.prepare("SELECT * FROM lms_clients WHERE id=?")
    .bind(id).first<LmsClient>();
  if (!existing) return c.json({ error: "Not found" }, 404);

  await c.env.DB.prepare(
    "UPDATE lms_clients SET status=?, updated_at=datetime('now') WHERE id=?"
  ).bind(status, id).run();

  const updated = { ...existing, status };
  await syncKv(c.env.LMS_KV, updated);

  return c.json({ success: true, status });
});

// ── Re-provision KV (sync lại nếu KV bị mất) ─────────────
router.post("/:id/provision", async (c) => {
  const client = await c.env.DB.prepare("SELECT * FROM lms_clients WHERE id=?")
    .bind(c.req.param("id")).first<LmsClient>();
  if (!client) return c.json({ error: "Not found" }, 404);

  await syncKv(c.env.LMS_KV, client);
  return c.json({ success: true, kv_key: kvKey(client.domain) });
});

// ── Delete + remove from KV ───────────────────────────────
router.delete("/:id", async (c) => {
  const client = await c.env.DB.prepare("SELECT * FROM lms_clients WHERE id=?")
    .bind(c.req.param("id")).first<LmsClient>();
  if (!client) return c.json({ error: "Not found" }, 404);

  await c.env.DB.prepare("DELETE FROM lms_clients WHERE id=?").bind(client.id).run();
  await c.env.LMS_KV.delete(kvKey(client.domain));

  return c.json({ success: true });
});

// ── Invoices ──────────────────────────────────────────────
router.get("/:id/invoices", async (c) => {
  const rows = await c.env.DB.prepare(
    "SELECT * FROM lms_invoices WHERE client_id=? ORDER BY issued_at DESC"
  ).bind(c.req.param("id")).all<LmsInvoice>();
  return c.json(rows.results);
});

router.post("/:id/invoices", async (c) => {
  const clientId = c.req.param("id");
  const b = await c.req.json<Partial<LmsInvoice>>();
  if (!b.amount) return c.json({ error: "amount bắt buộc" }, 400);

  const { meta } = await c.env.DB.prepare(
    "INSERT INTO lms_invoices (client_id, amount, issued_at, paid_at, note) VALUES (?,?,?,?,?)"
  ).bind(clientId, b.amount, b.issued_at ?? new Date().toISOString().slice(0, 10), null, b.note ?? null).run();

  return c.json(await c.env.DB.prepare("SELECT * FROM lms_invoices WHERE id=?")
    .bind(meta.last_row_id).first<LmsInvoice>(), 201);
});

router.patch("/:id/invoices/:invId/pay", async (c) => {
  await c.env.DB.prepare(
    "UPDATE lms_invoices SET paid_at=date('now') WHERE id=? AND client_id=?"
  ).bind(c.req.param("invId"), c.req.param("id")).run();
  return c.json({ success: true });
});

router.delete("/:id/invoices/:invId", async (c) => {
  await c.env.DB.prepare(
    "DELETE FROM lms_invoices WHERE id=? AND client_id=?"
  ).bind(c.req.param("invId"), c.req.param("id")).run();
  return c.json({ success: true });
});

export default router;
