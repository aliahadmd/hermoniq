import { Hono } from "hono";
import { and, eq } from "drizzle-orm";
import { createDb } from "../../db";
import { categories, transactions } from "../../db/schema";
import { createCategorySchema, updateCategorySchema } from "../validators";
import type { AppEnv } from "../types";

const categoryRoutes = new Hono<AppEnv>();

// GET /api/categories - List current user's categories
categoryRoutes.get("/", async (c) => {
  const userId = c.get("user").id;
  const db = createDb(c.env.DB);
  const result = await db.select().from(categories).where(eq(categories.userId, userId));
  return c.json(result);
});

// POST /api/categories - Create a new category for current user
categoryRoutes.post("/", async (c) => {
  const userId = c.get("user").id;
  const body = await c.req.json();
  const parsed = createCategorySchema.parse(body);
  const db = createDb(c.env.DB);

  const result = await db.insert(categories).values({ ...parsed, userId }).returning();
  return c.json(result[0], 201);
});

// PUT /api/categories/:id - Update a category (only if owned by current user)
categoryRoutes.put("/:id", async (c) => {
  const userId = c.get("user").id;
  const id = c.req.param("id");
  const body = await c.req.json();
  const parsed = updateCategorySchema.parse(body);
  const db = createDb(c.env.DB);

  const result = await db
    .update(categories)
    .set(parsed)
    .where(and(eq(categories.id, id), eq(categories.userId, userId)))
    .returning();

  if (result.length === 0) {
    return c.json({ error: "Category not found" }, 404);
  }

  return c.json(result[0]);
});

// DELETE /api/categories/:id - Delete category and uncategorize transactions (only if owned)
categoryRoutes.delete("/:id", async (c) => {
  const userId = c.get("user").id;
  const id = c.req.param("id");
  const db = createDb(c.env.DB);

  // Set categoryId to null on associated transactions owned by this user
  await db
    .update(transactions)
    .set({ categoryId: null })
    .where(and(eq(transactions.categoryId, id), eq(transactions.userId, userId)));

  const result = await db
    .delete(categories)
    .where(and(eq(categories.id, id), eq(categories.userId, userId)))
    .returning();

  if (result.length === 0) {
    return c.json({ error: "Category not found" }, 404);
  }

  return c.json({ success: true });
});

export { categoryRoutes };
