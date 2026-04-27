import { Hono } from "hono";
import { and, eq } from "drizzle-orm";
import { createDb } from "../../db";
import { accounts } from "../../db/schema";
import { createAccountSchema, updateAccountSchema } from "../validators";
import type { AppEnv } from "../types";

const accountRoutes = new Hono<AppEnv>();

// GET /api/accounts - List current user's accounts
accountRoutes.get("/", async (c) => {
  const userId = c.get("user").id;
  const db = createDb(c.env.DB);
  const result = await db.select().from(accounts).where(eq(accounts.userId, userId));
  return c.json(result);
});

// POST /api/accounts - Create a new account for current user
accountRoutes.post("/", async (c) => {
  const userId = c.get("user").id;
  const body = await c.req.json();
  const parsed = createAccountSchema.parse(body);
  const db = createDb(c.env.DB);

  const result = await db.insert(accounts).values({ ...parsed, userId }).returning();
  return c.json(result[0], 201);
});

// PUT /api/accounts/:id - Update an account (only if owned by current user)
accountRoutes.put("/:id", async (c) => {
  const userId = c.get("user").id;
  const id = c.req.param("id");
  const body = await c.req.json();
  const parsed = updateAccountSchema.parse(body);
  const db = createDb(c.env.DB);

  const result = await db
    .update(accounts)
    .set({ ...parsed, updatedAt: new Date().toISOString() })
    .where(and(eq(accounts.id, id), eq(accounts.userId, userId)))
    .returning();

  if (result.length === 0) {
    return c.json({ error: "Account not found" }, 404);
  }

  return c.json(result[0]);
});

// DELETE /api/accounts/:id - Delete account (only if owned by current user)
accountRoutes.delete("/:id", async (c) => {
  const userId = c.get("user").id;
  const id = c.req.param("id");
  const db = createDb(c.env.DB);

  const result = await db
    .delete(accounts)
    .where(and(eq(accounts.id, id), eq(accounts.userId, userId)))
    .returning();

  if (result.length === 0) {
    return c.json({ error: "Account not found" }, 404);
  }

  return c.json({ success: true });
});

export { accountRoutes };
