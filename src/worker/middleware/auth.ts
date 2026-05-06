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
    await next();
  } catch {
    return c.json({ error: "Invalid token" }, 401);
  }
};
