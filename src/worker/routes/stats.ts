import { Hono } from "hono";
import type { AppEnv, Customer } from "../types";
import { requireAuth } from "../middleware/auth";

const stats = new Hono<AppEnv>();
stats.use("*", requireAuth);

stats.get("/", async (c) => {
  const role   = c.get("userRole");
  const userId = c.get("userId");
  const rc = role === "staff"
    ? "AND c.assigned_user_id = ?" : "";
  const rp: unknown[] = role === "staff" ? [userId] : [];
  const active = "AND (c.status IS NULL OR c.status NOT IN ('converted_lms','archived'))";

  // LMS revenue (paid invoices) — bảng có thể chưa tồn tại nếu chưa migrate
  let lmsRevenue = 0;
  let dealRevenue: number | null = null;
  try {
    const r = await c.env.DB.prepare(
      "SELECT COALESCE(SUM(amount),0) as total FROM lms_invoices WHERE paid_at IS NOT NULL"
    ).first<{ total: number }>();
    lmsRevenue = r?.total ?? 0;
  } catch { /* migration 0008 chưa chạy */ }
  try {
    const r = await c.env.DB.prepare(`
      SELECT COALESCE(SUM(d.amount),0) as total
      FROM deals d
      JOIN customers c ON c.id = d.customer_id
      WHERE d.status='won' ${rc}
    `).bind(...rp).first<{ total: number }>();
    dealRevenue = r?.total ?? 0;
  } catch { /* migration 0010 chưa chạy */ }

  const [total, monthly, rev990, won, recent, followUps, byGroup, unassigned, myLeads] = await Promise.all([
    c.env.DB.prepare(`SELECT COUNT(*) as count FROM customers c WHERE 1=1 ${active} ${rc}`)
      .bind(...rp).first<{ count: number }>(),

    c.env.DB.prepare(`SELECT COUNT(*) as count FROM customers c WHERE created_at >= datetime('now','-30 days') ${active} ${rc}`)
      .bind(...rp).first<{ count: number }>(),

    c.env.DB.prepare(`
      SELECT COALESCE(SUM(c.final_price),0) as total
      FROM customers c
      JOIN groups g ON c.group_id = g.id
      WHERE g.is_won = 1 ${active} ${rc}
    `).bind(...rp).first<{ total: number }>(),

    c.env.DB.prepare(`
      SELECT COUNT(*) as count FROM customers c
      JOIN groups g ON c.group_id = g.id
      WHERE g.is_won = 1 ${active} ${rc}
    `).bind(...rp).first<{ count: number }>(),

    c.env.DB.prepare(`
      SELECT c.*, p.name AS product_name, g.name AS group_name, g.color AS group_color, g.is_won AS group_is_won
      FROM customers c
      LEFT JOIN products p ON c.product_id = p.id
      LEFT JOIN groups   g ON c.group_id   = g.id
      WHERE 1=1 ${active} ${rc} ORDER BY c.created_at DESC LIMIT 5
    `).bind(...rp).all<Customer & { product_name: string | null; group_name: string | null; group_color: string | null }>(),

    c.env.DB.prepare(`
      SELECT c.*, p.name AS product_name, g.name AS group_name, g.color AS group_color, g.is_won AS group_is_won
      FROM customers c
      LEFT JOIN products p ON c.product_id = p.id
      LEFT JOIN groups   g ON c.group_id   = g.id
      WHERE DATE(c.follow_up_at) <= DATE('now') AND c.follow_up_at IS NOT NULL
        AND (g.is_won IS NULL OR g.is_won = 0) ${active} ${rc}
      ORDER BY c.follow_up_at ASC LIMIT 10
    `).bind(...rp).all<Customer>(),

    // Đếm theo nhóm
    c.env.DB.prepare(`
      SELECT g.id, g.name, g.color, g.order_index, g.is_won,
             COUNT(c.id) as count
      FROM groups g
      LEFT JOIN customers c ON c.group_id = g.id ${active} ${rc.replace("AND", "AND c.id IS NOT NULL AND")}
      GROUP BY g.id
      ORDER BY g.order_index ASC
    `).bind(...rp).all<{
      id: number; name: string; color: string;
      order_index: number; is_won: number; count: number;
    }>(),

    // Leads chưa được nhận (chưa assigned) — dùng cho thông báo inbox
    c.env.DB.prepare(
      `SELECT COUNT(*) as count FROM customers c WHERE c.assigned_user_id IS NULL ${active}`
    ).first<{ count: number }>(),

    // Leads của chính nhân viên đang đăng nhập
    role === "staff"
      ? c.env.DB.prepare(
          `SELECT COUNT(*) as count FROM customers c WHERE c.assigned_user_id = ? ${active}`
        ).bind(userId).first<{ count: number }>()
      : Promise.resolve(null),
  ]);

  return c.json({
    total:   total?.count   ?? 0,
    monthly: monthly?.count ?? 0,
    revenue: (dealRevenue ?? rev990?.total ?? 0) + lmsRevenue,
    won:     won?.count     ?? 0,
    unassigned: role === "admin" ? (unassigned?.count ?? 0) : 0,
    myLeads: myLeads?.count ?? null,
    recentCustomers: recent.results,
    followUps: followUps.results,
    byGroup: byGroup.results,
  });
});

export default stats;
