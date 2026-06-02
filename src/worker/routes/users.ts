import { Hono } from "hono";
import type { AppEnv } from "../types";
import { requireAuth, requireAdmin } from "../middleware/auth";
import { hashPassword, randomSalt } from "../lib/hash";

const users = new Hono<AppEnv>();

users.get("/", requireAuth, async (c) => {
  const result = await c.env.DB.prepare(
    "SELECT id, email, name, role, created_at FROM users ORDER BY created_at ASC"
  ).all<{ id: number; email: string; name: string; role: string; created_at: string }>();
  return c.json(result.results);
});

// Cập nhật thông tin nhân viên (admin only)
users.put("/:id", requireAdmin, async (c) => {
  const id = c.req.param("id");
  const { name, email, password, role } = await c.req.json<{
    name?: string; email?: string; password?: string; role?: string;
  }>();

  const existing = await c.env.DB.prepare(
    "SELECT * FROM users WHERE id = ?"
  ).bind(id).first<{ id: number; name: string; email: string; salt: string }>();
  if (!existing) return c.json({ error: "Không tìm thấy" }, 404);

  if (email && email !== existing.email) {
    const dup = await c.env.DB.prepare("SELECT id FROM users WHERE email = ? AND id != ?")
      .bind(email, id).first();
    if (dup) return c.json({ error: "Email đã được dùng bởi người khác" }, 409);
  }

  let passwordHash: string | undefined;
  let newSalt: string | undefined;
  if (password?.trim()) {
    newSalt = randomSalt();
    passwordHash = await hashPassword(password.trim(), newSalt);
  }

  const updates: string[] = [];
  const vals: unknown[] = [];
  if (name)          { updates.push("name = ?");          vals.push(name.trim()); }
  if (email)         { updates.push("email = ?");         vals.push(email.trim()); }
  if (role && ["admin","staff"].includes(role)) { updates.push("role = ?"); vals.push(role); }
  if (passwordHash)  { updates.push("password_hash = ?"); vals.push(passwordHash); }
  if (newSalt)       { updates.push("salt = ?");          vals.push(newSalt); }

  if (!updates.length) return c.json({ error: "Không có thay đổi" }, 400);

  await c.env.DB.prepare(
    `UPDATE users SET ${updates.join(", ")} WHERE id = ?`
  ).bind(...vals, id).run();

  const updated = await c.env.DB.prepare(
    "SELECT id, email, name, role, created_at FROM users WHERE id = ?"
  ).bind(id).first();
  return c.json(updated);
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
