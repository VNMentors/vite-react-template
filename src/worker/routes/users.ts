import { Hono } from "hono";
import type { AppEnv } from "../types";
import { requireAuth, requireAdmin } from "../middleware/auth";

const users = new Hono<AppEnv>();

users.get("/", requireAuth, async (c) => {
  const result = await c.env.DB.prepare(
    "SELECT id, email, name, role, created_at FROM users ORDER BY created_at ASC"
  ).all<{ id: number; email: string; name: string; role: string; created_at: string }>();
  return c.json(result.results);
});

users.patch("/:id/role", requireAdmin, async (c) => {
  const id = c.req.param("id");
  const { role } = await c.req.json<{ role: string }>();
  if (!["admin", "staff"].includes(role)) return c.json({ error: "Invalid role" }, 400);
  if (Number(id) === c.get("userId")) return c.json({ error: "Không thể đổi role của chính mình" }, 400);
  await c.env.DB.prepare("UPDATE users SET role = ? WHERE id = ?").bind(role, id).run();
  return c.json({ success: true });
});

users.delete("/:id", requireAdmin, async (c) => {
  const id = Number(c.req.param("id"));
  if (id === c.get("userId")) return c.json({ error: "Không thể xóa tài khoản của chính mình" }, 400);
  await c.env.DB.prepare("DELETE FROM users WHERE id = ?").bind(id).run();
  return c.json({ success: true });
});

export default users;
