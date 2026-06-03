import { Hono } from "hono";
import type { AppEnv } from "../types";
import { requireAuth } from "../middleware/auth";

const reports = new Hono<AppEnv>();
reports.use("*", requireAuth);

reports.get("/", async (c) => {
  const from = c.req.query("from") ?? null; // "2026-01-01"
  const to   = c.req.query("to")   ?? null; // "2026-01-31"

  // Điều kiện lọc ngày cho customers
  const dateParts: string[] = [];
  const dateVals: unknown[]  = [];
  if (from) { dateParts.push("c.created_at >= ?"); dateVals.push(from + " 00:00:00"); }
  if (to)   { dateParts.push("c.created_at <= ?"); dateVals.push(to   + " 23:59:59"); }
  const dateWhere = dateParts.length ? "AND " + dateParts.join(" AND ") : "";

  // Điều kiện lọc ngày chốt deal 990toeic/app/course.
  const dealParts: string[] = ["d.status='won'"];
  const dealVals: unknown[] = [];
  if (from) { dealParts.push("d.closed_at >= ?"); dealVals.push(from); }
  if (to)   { dealParts.push("d.closed_at <= ?");   dealVals.push(to);   }
  const dealWhere = "WHERE " + dealParts.join(" AND ");

  let dealSummary: { total_won: number; total_revenue: number } | null = null;
  try {
    dealSummary = await c.env.DB.prepare(`
      SELECT
        COUNT(DISTINCT d.customer_id) AS total_won,
        COALESCE(SUM(d.amount),0) AS total_revenue
      FROM deals d
      JOIN customers c ON c.id = d.customer_id
      ${dealWhere}
    `).bind(...dealVals).first<{ total_won: number; total_revenue: number }>();
  } catch { /* migration 0010 chưa chạy */ }

  // LMS revenue (graceful fallback nếu chưa migrate)
  let lmsRevenue = 0;
  let lmsClientCount = 0;
  try {
    const lmsParts: string[] = [];
    const lmsVals: unknown[]  = [];
    if (from) { lmsParts.push("paid_at >= ?"); lmsVals.push(from); }
    if (to)   { lmsParts.push("paid_at <= ?"); lmsVals.push(to);   }
    const lmsWhere = lmsParts.length ? "WHERE paid_at IS NOT NULL AND " + lmsParts.join(" AND ") : "WHERE paid_at IS NOT NULL";

    const [lr, lc] = await Promise.all([
      c.env.DB.prepare(`SELECT COALESCE(SUM(amount),0) AS total FROM lms_invoices ${lmsWhere}`)
        .bind(...lmsVals).first<{ total: number }>(),
      c.env.DB.prepare("SELECT COUNT(*) AS count FROM lms_clients WHERE status='active'")
        .first<{ count: number }>(),
    ]);
    lmsRevenue = lr?.total ?? 0;
    lmsClientCount = lc?.count ?? 0;
  } catch { /* migration 0008 chưa chạy */ }

  // Filter notes theo kỳ (hoạt động chăm sóc trong kỳ)
  const noteParts: string[] = [];
  const noteVals: unknown[]  = [];
  if (from) { noteParts.push("n.created_at >= ?"); noteVals.push(from + " 00:00:00"); }
  if (to)   { noteParts.push("n.created_at <= ?"); noteVals.push(to   + " 23:59:59"); }
  const noteWhere = noteParts.length ? "AND " + noteParts.join(" AND ") : "";

  const [summary, byGroup, byProduct, bySource, byStaff, monthlyTrend, staffActivity] = await Promise.all([

    c.env.DB.prepare(`
      SELECT
        COUNT(*)                                                              AS total_leads,
        SUM(CASE WHEN g.is_won=1 THEN 1 ELSE 0 END)                         AS total_won,
        SUM(CASE WHEN g.is_won=1 THEN COALESCE(c.final_price,0) ELSE 0 END) AS total_revenue
      FROM customers c
      LEFT JOIN groups g ON c.group_id = g.id
      WHERE 1=1 ${dateWhere}
    `).bind(...dateVals).first<{ total_leads: number; total_won: number; total_revenue: number }>(),

    c.env.DB.prepare(`
      SELECT g.id, g.name, g.color, g.order_index, g.is_won,
             COUNT(c.id)                                                             AS leads,
             SUM(CASE WHEN g.is_won=1 THEN COALESCE(c.final_price,0) ELSE 0 END)    AS revenue
      FROM groups g
      LEFT JOIN customers c ON c.group_id = g.id ${dateWhere.replace("c.", "c.").replace("AND c.", "AND c.")}
      GROUP BY g.id
      ORDER BY g.order_index ASC
    `).bind(...dateVals).all<{ id:number; name:string; color:string; order_index:number; is_won:number; leads:number; revenue:number }>(),

    c.env.DB.prepare(`
      SELECT COALESCE(p.name,'Chưa chọn SP') AS product_name,
             COUNT(c.id)                                                             AS leads,
             SUM(CASE WHEN g.is_won=1 THEN 1 ELSE 0 END)                           AS won,
             SUM(CASE WHEN g.is_won=1 THEN COALESCE(c.final_price,0) ELSE 0 END)    AS revenue
      FROM customers c
      LEFT JOIN products p ON c.product_id = p.id
      LEFT JOIN groups   g ON c.group_id   = g.id
      WHERE 1=1 ${dateWhere}
      GROUP BY c.product_id, p.name
      ORDER BY leads DESC
    `).bind(...dateVals).all<{ product_name:string; leads:number; won:number; revenue:number }>(),

    c.env.DB.prepare(`
      SELECT COALESCE(source,'Không rõ') AS source,
             COUNT(*)                                                              AS leads,
             SUM(CASE WHEN g.is_won=1 THEN 1 ELSE 0 END)                         AS won
      FROM customers c
      LEFT JOIN groups g ON c.group_id = g.id
      WHERE 1=1 ${dateWhere}
      GROUP BY source ORDER BY leads DESC
    `).bind(...dateVals).all<{ source:string; leads:number; won:number }>(),

    c.env.DB.prepare(`
      SELECT COALESCE(assigned_to,'Chưa phân') AS staff,
             COUNT(*)                                                              AS leads,
             SUM(CASE WHEN g.is_won=1 THEN 1 ELSE 0 END)                         AS won,
             SUM(CASE WHEN g.is_won=1 THEN COALESCE(c.final_price,0) ELSE 0 END)  AS revenue
      FROM customers c
      LEFT JOIN groups g ON c.group_id = g.id
      WHERE 1=1 ${dateWhere}
      GROUP BY assigned_to ORDER BY revenue DESC
    `).bind(...dateVals).all<{ staff:string; leads:number; won:number; revenue:number }>(),

    // Trend theo tháng
    c.env.DB.prepare(`
      SELECT strftime('%Y-%m', c.created_at)                                      AS month,
             COUNT(*)                                                              AS leads,
             SUM(CASE WHEN g.is_won=1 THEN 1 ELSE 0 END)                         AS won,
             SUM(CASE WHEN g.is_won=1 THEN COALESCE(c.final_price,0) ELSE 0 END)  AS revenue
      FROM customers c
      LEFT JOIN groups g ON c.group_id = g.id
      WHERE 1=1 ${dateWhere}
      GROUP BY month ORDER BY month DESC
      ${!from && !to ? "LIMIT 6" : ""}
    `).bind(...dateVals).all<{ month:string; leads:number; won:number; revenue:number }>(),

    // Hoạt động chăm sóc của từng nhân viên trong kỳ
    c.env.DB.prepare(`
      SELECT
        COALESCE(c.assigned_to, 'Chưa phân') AS staff,
        COUNT(n.id)                            AS total_activities,
        SUM(CASE WHEN n.type='call'    THEN 1 ELSE 0 END) AS calls,
        SUM(CASE WHEN n.type='meeting' THEN 1 ELSE 0 END) AS meetings,
        SUM(CASE WHEN n.type='email'   THEN 1 ELSE 0 END) AS emails,
        COUNT(DISTINCT c.id)                   AS leads_worked
      FROM notes n
      JOIN customers c ON c.id = n.customer_id
      WHERE c.assigned_to IS NOT NULL ${noteWhere}
      GROUP BY c.assigned_to
      ORDER BY total_activities DESC
    `).bind(...noteVals).all<{
      staff: string; total_activities: number; calls: number;
      meetings: number; emails: number; leads_worked: number;
    }>(),
  ]);

  const total    = summary?.total_leads ?? 0;
  const totalWon = dealSummary?.total_won ?? summary?.total_won ?? 0;
  const revenue990 = dealSummary?.total_revenue ?? summary?.total_revenue ?? 0;

  return c.json({
    summary: {
      total_leads:      total,
      total_won:        totalWon,
      total_revenue:    revenue990 + lmsRevenue,
      revenue_990:      revenue990,
      revenue_lms:      lmsRevenue,
      lms_client_count: lmsClientCount,
      conversion_rate:  total > 0 ? Math.round((totalWon / total) * 100) : 0,
    },
    byGroup:        byGroup.results,
    byProduct:      byProduct.results,
    bySource:       bySource.results,
    byStaff:        byStaff.results,
    monthlyTrend:   monthlyTrend.results.reverse(),
    staffActivity:  staffActivity.results,
  });
});

export default reports;
