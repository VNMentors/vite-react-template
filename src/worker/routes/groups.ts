import { Hono } from "hono";
import type { AppEnv, Group } from "../types";
import { requireAuth, requireAdmin } from "../middleware/auth";

const groups = new Hono<AppEnv>();
groups.use("*", requireAuth);

// Lấy danh sách nhóm kèm số lượng khách
groups.get("/", async (c) => {
  const result = await c.env.DB.prepare(`
    SELECT g.*, COUNT(c.id) as customer_count
    FROM groups g
    LEFT JOIN customers c ON c.group_id = g.id
    GROUP BY g.id
    ORDER BY g.order_index ASC
  `).all<Group & { customer_count: number }>();
  return c.json(result.results);
});

// Tạo nhóm mới (chỉ admin)
groups.post("/", requireAdmin, async (c) => {
  const { name, description, color, is_won } = await c.req.json<{
    name: string; description?: string; color?: string; is_won?: number;
  }>();
  if (!name?.trim()) return c.json({ error: "Tên nhóm không được để trống" }, 400);

  const maxOrder = await c.env.DB.prepare(
    "SELECT COALESCE(MAX(order_index), -1) as max_order FROM groups"
  ).first<{ max_order: number }>();

  const { meta } = await c.env.DB.prepare(
    "INSERT INTO groups (name, description, color, order_index, is_won) VALUES (?, ?, ?, ?, ?)"
  ).bind(
    name.trim(),
    description ?? null,
    color ?? "#6b7280",
    (maxOrder?.max_order ?? -1) + 1,
    is_won ?? 0,
  ).run();

  const group = await c.env.DB.prepare("SELECT * FROM groups WHERE id = ?")
    .bind(meta.last_row_id).first<Group>();
  return c.json(group, 201);
});

// Cập nhật nhóm (chỉ admin)
groups.put("/:id", requireAdmin, async (c) => {
  const id = c.req.param("id");
  const existing = await c.env.DB.prepare("SELECT * FROM groups WHERE id = ?")
    .bind(id).first<Group>();
  if (!existing) return c.json({ error: "Không tìm thấy nhóm" }, 404);

  const body = await c.req.json<Partial<Group>>();
  await c.env.DB.prepare(
    "UPDATE groups SET name=?, description=?, color=?, is_won=? WHERE id=?"
  ).bind(
    body.name ?? existing.name,
    body.description ?? existing.description,
    body.color ?? existing.color,
    body.is_won ?? existing.is_won,
    id,
  ).run();

  const group = await c.env.DB.prepare("SELECT * FROM groups WHERE id = ?")
    .bind(id).first<Group>();
  return c.json(group);
});

// Đổi thứ tự (swap với nhóm kề)
groups.patch("/:id/reorder", requireAdmin, async (c) => {
  const id = Number(c.req.param("id"));
  const { direction } = await c.req.json<{ direction: "up" | "down" }>();

  const current = await c.env.DB.prepare("SELECT * FROM groups WHERE id = ?")
    .bind(id).first<Group>();
  if (!current) return c.json({ error: "Không tìm thấy nhóm" }, 404);

  const neighbor = await c.env.DB.prepare(
    direction === "up"
      ? "SELECT * FROM groups WHERE order_index < ? ORDER BY order_index DESC LIMIT 1"
      : "SELECT * FROM groups WHERE order_index > ? ORDER BY order_index ASC LIMIT 1"
  ).bind(current.order_index).first<Group>();

  if (!neighbor) return c.json({ error: "Không thể di chuyển" }, 400);

  await c.env.DB.batch([
    c.env.DB.prepare("UPDATE groups SET order_index=? WHERE id=?").bind(neighbor.order_index, current.id),
    c.env.DB.prepare("UPDATE groups SET order_index=? WHERE id=?").bind(current.order_index, neighbor.id),
  ]);

  return c.json({ success: true });
});

// Xóa nhóm (chỉ admin, không được xóa nếu còn khách)
groups.delete("/:id", requireAdmin, async (c) => {
  const id = c.req.param("id");
  const count = await c.env.DB.prepare(
    "SELECT COUNT(*) as count FROM customers WHERE group_id = ?"
  ).bind(id).first<{ count: number }>();

  if ((count?.count ?? 0) > 0) {
    return c.json({
      error: `Nhóm này còn ${count?.count} khách hàng. Chuyển họ sang nhóm khác trước khi xóa.`
    }, 400);
  }

  await c.env.DB.prepare("DELETE FROM groups WHERE id = ?").bind(id).run();
  return c.json({ success: true });
});

export default groups;
