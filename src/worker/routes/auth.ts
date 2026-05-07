import { Hono } from "hono";
import { sign, verify } from "hono/jwt";
import type { AppEnv } from "../types";
import { hashPassword, randomSalt } from "../lib/hash";
import { requireAuth } from "../middleware/auth";

const auth = new Hono<AppEnv>();

auth.get("/check-setup", async (c) => {
  const r = await c.env.DB.prepare("SELECT COUNT(*) as count FROM users").first<{ count: number }>();
  return c.json({ needsSetup: (r?.count ?? 0) === 0 });
});

auth.post("/register", async (c) => {
  const r = await c.env.DB.prepare("SELECT COUNT(*) as count FROM users").first<{ count: number }>();
  if ((r?.count ?? 0) > 0) {
    const authHeader = c.req.header("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return c.json({ error: "Unauthorized" }, 401);
    try {
      await verify(authHeader.slice(7), c.env.JWT_SECRET);
    } catch {
      return c.json({ error: "Invalid token" }, 401);
    }
  }
  const { email, password, name, role } = await c.req.json<{
    email: string; password: string; name: string; role?: string;
  }>();
  if (!email || !password || !name) return c.json({ error: "Missing required fields" }, 400);
  const existing = await c.env.DB.prepare("SELECT id FROM users WHERE email = ?").bind(email).first();
  if (existing) return c.json({ error: "Email đã được sử dụng" }, 409);
  const salt = randomSalt();
  const hash = await hashPassword(password, salt);
  const userRole = role === "admin" ? "admin" : "staff";
  const { meta } = await c.env.DB.prepare(
    "INSERT INTO users (email, name, password_hash, salt, role) VALUES (?, ?, ?, ?, ?)"
  ).bind(email, name, hash, salt, userRole).run();
  return c.json({ id: meta.last_row_id, email, name, role: userRole }, 201);
});

auth.post("/login", async (c) => {
  const { email, password } = await c.req.json<{ email: string; password: string }>();
  if (!email || !password) return c.json({ error: "Missing credentials" }, 400);
  const user = await c.env.DB.prepare("SELECT * FROM users WHERE email = ?").bind(email).first<{
    id: number; email: string; name: string; password_hash: string; salt: string; role: string;
  }>();
  if (!user) return c.json({ error: "Invalid credentials" }, 401);
  const hash = await hashPassword(password, user.salt);
  if (hash !== user.password_hash) return c.json({ error: "Invalid credentials" }, 401);
  const token = await sign(
    {
      userId: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 7,
    },
    c.env.JWT_SECRET
  );
  return c.json({
    token,
    user: { id: user.id, email: user.email, name: user.name, role: user.role },
  });
});

auth.get("/me", requireAuth, async (c) => {
  const user = await c.env.DB.prepare(
    "SELECT id, email, name, role FROM users WHERE id = ?"
  ).bind(c.get("userId")).first();
  if (!user) return c.json({ error: "Not found" }, 404);
  return c.json({ user });
});

export default auth;
