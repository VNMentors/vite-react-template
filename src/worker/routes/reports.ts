import { Hono } from "hono";
import type { AppEnv } from "../types";
import { requireAuth } from "../middleware/auth";

const reports = new Hono<AppEnv>();
reports.use("*", requireAuth);

reports.get("/", async (c) => {
  const [summary, byGroup, byProduct, bySource, byStaff, monthlyTrend] = await Promise.all([

    c.env.DB.prepare(`
      SELECT
        COUNT(*)                                                             AS total_leads,
        SUM(CASE WHEN g.is_won=1 THEN 1 ELSE 0 END)                        AS total_won,
        SUM(CASE WHEN g.is_won=1 THEN COALESCE(c.final_price,0) ELSE 0 END) AS total_revenue
      FROM customers c
      LEFT JOIN groups g ON c.group_id = g.id
    `).first<{ total_leads: number; total_won: number; total_revenue: number }>(),

    // Theo nhóm — đầy đủ thông tin nhóm
    c.env.DB.prepare(`
      SELECT g.id, g.name, g.color, g.order_index, g.is_won,
             COUNT(c.id)                                                             AS leads,
             SUM(CASE WHEN g.is_won=1 THEN COALESCE(c.final_price,0) ELSE 0 END)    AS revenue
      FROM groups g
      LEFT JOIN customers c ON c.group_id = g.id
      GROUP BY g.id
      ORDER BY g.order_index ASC
    `).all<{ id:number; name:string; color:string; order_index:number; is_won:number; leads:number; revenue:number }>(),

    // Theo sản phẩm
    c.env.DB.prepare(`
      SELECT COALESCE(p.name,'Chưa chọn SP') AS product_name,
             COUNT(c.id)                                                             AS leads,
             SUM(CASE WHEN g.is_won=1 THEN 1 ELSE 0 END)                           AS won,
             SUM(CASE WHEN g.is_won=1 THEN COALESCE(c.final_price,0) ELSE 0 END)    AS revenue
      FROM customers c
      LEFT JOIN products p ON c.product_id = p.id
      LEFT JOIN groups   g ON c.group_id   = g.id
      GROUP BY c.product_id, p.name
      ORDER BY leads DESC
    `).all<{ product_name:string; leads:number; won:number; revenue:number }>(),

    // Theo nguồn
    c.env.DB.prepare(`
      SELECT COALESCE(source,'Không rõ') AS source,
             COUNT(*)                                                              AS leads,
             SUM(CASE WHEN g.is_won=1 THEN 1 ELSE 0 END)                         AS won
      FROM customers c
      LEFT JOIN groups g ON c.group_id = g.id
      GROUP BY source ORDER BY leads DESC
    `).all<{ source:string; leads:number; won:number }>(),

    // Theo nhân viên
    c.env.DB.prepare(`
      SELECT COALESCE(assigned_to,'Chưa phân') AS staff,
             COUNT(*)                                                              AS leads,
             SUM(CASE WHEN g.is_won=1 THEN 1 ELSE 0 END)                         AS won,
             SUM(CASE WHEN g.is_won=1 THEN COALESCE(c.final_price,0) ELSE 0 END)  AS revenue
      FROM customers c
      LEFT JOIN groups g ON c.group_id = g.id
      GROUP BY assigned_to ORDER BY leads DESC
    `).all<{ staff:string; leads:number; won:number; revenue:number }>(),

    // Xu hướng 6 tháng
    c.env.DB.prepare(`
      SELECT strftime('%Y-%m', c.created_at)                                      AS month,
             COUNT(*)                                                              AS leads,
             SUM(CASE WHEN g.is_won=1 THEN 1 ELSE 0 END)                         AS won,
             SUM(CASE WHEN g.is_won=1 THEN COALESCE(c.final_price,0) ELSE 0 END)  AS revenue
      FROM customers c
      LEFT JOIN groups g ON c.group_id = g.id
      GROUP BY month ORDER BY month DESC LIMIT 6
    `).all<{ month:string; leads:number; won:number; revenue:number }>(),
  ]);

  const total = summary?.total_leads ?? 0;
  const totalWon = summary?.total_won ?? 0;

  return c.json({
    summary: {
      total_leads:    total,
      total_won:      totalWon,
      total_revenue:  summary?.total_revenue ?? 0,
      conversion_rate: total > 0 ? Math.round((totalWon / total) * 100) : 0,
    },
    byGroup:      byGroup.results,
    byProduct:    byProduct.results,
    bySource:     bySource.results,
    byStaff:      byStaff.results,
    monthlyTrend: monthlyTrend.results.reverse(),
  });
});

export default reports;
