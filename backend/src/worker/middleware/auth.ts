import type { Context, Next } from "hono";
import { createAuth } from "../../auth";
import type { AppEnv } from "../types";

export async function authMiddleware(c: Context<AppEnv>, next: Next) {
  const auth = createAuth(c.env, c.executionCtx, c.req.url);
  const session = await auth.api.getSession({
    headers: c.req.raw.headers,
  });

  if (!session) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  c.set("user", {
    id: session.user.id,
    name: session.user.name,
    email: session.user.email,
    role: typeof session.user.role === "string" ? session.user.role : undefined,
  });
  c.set("session", {
    id: session.session.id,
    userId: session.session.userId,
    token: session.session.token,
  });
  await next();
}
