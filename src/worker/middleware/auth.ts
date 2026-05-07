import type { MiddlewareHandler } from "hono";
import { verify } from "hono/jwt";
import type { AppEnv } from "../types";

export const requireAuth: MiddlewareHandler<AppEnv> = async (c, next) => {
  const auth = c.req.header("Authorization");
  if (!auth?.startsWith("Bearer ")) {
    return c.json({ error: "Unauthorized" }, 401);
  }
  try {
    const payload = await verify(auth.slice(7), c.env.JWT_SECRET);
    c.set("userId", payload["userId"] as number);
    c.set("userRole", payload["role"] as string ?? "staff");
    c.set("userName", payload["name"] as string ?? "");
    await next();
  } catch {
    return c.json({ error: "Invalid token" }, 401);
  }
};

export const requireAdmin: MiddlewareHandler<AppEnv> = async (c, next) => {
  const auth = c.req.header("Authorization");
  if (!auth?.startsWith("Bearer ")) return c.json({ error: "Unauthorized" }, 401);
  try {
    const payload = await verify(auth.slice(7), c.env.JWT_SECRET);
    if (payload["role"] !== "admin") return c.json({ error: "Forbidden" }, 403);
    c.set("userId", payload["userId"] as number);
    c.set("userRole", "admin");
    c.set("userName", payload["name"] as string ?? "");
    await next();
  } catch {
    return c.json({ error: "Invalid token" }, 401);
  }
};
