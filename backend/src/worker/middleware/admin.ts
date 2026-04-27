import type { Context, Next } from "hono";
import type { AppEnv } from "../types";

/**
 * Admin middleware — must be used after authMiddleware.
 * Checks that the authenticated user has the "admin" role.
 * Returns 403 Forbidden if the user is not an admin.
 */
export async function adminMiddleware(c: Context<AppEnv>, next: Next) {
  const user = c.get("user");

  if (user.role !== "admin") {
    return c.json({ error: "Forbidden" }, 403);
  }

  await next();
}
