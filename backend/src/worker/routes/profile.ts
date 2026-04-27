import { Hono } from "hono";
import { and, eq, ne } from "drizzle-orm";
import { ZodError } from "zod";
import { createDb } from "../../db";
import { profiles } from "../../db/schema";
import { updateProfileSchema } from "../validators";
import type { AppEnv } from "../types";

const profileRoutes = new Hono<AppEnv>();

// GET /api/profile - Get current user's profile
profileRoutes.get("/", async (c) => {
  const userId = c.get("user").id;
  const db = createDb(c.env.DB);
  const result = await db.select().from(profiles).where(eq(profiles.userId, userId));

  if (result.length === 0) {
    return c.json({ error: "Profile not found" }, 404);
  }

  return c.json(result[0]);
});

// PUT /api/profile - Update current user's profile (upsert)
profileRoutes.put("/", async (c) => {
  const userId = c.get("user").id;
  const body = await c.req.json();

  // Validate input with Zod - return field-level errors on failure
  let parsed;
  try {
    parsed = updateProfileSchema.parse(body);
  } catch (err) {
    if (err instanceof ZodError) {
      const firstIssue = err.issues[0];
      const field = firstIssue.path.join(".");
      const message = firstIssue.message;
      return c.json({ error: `${field}: ${message}` }, 400);
    }
    throw err;
  }

  const db = createDb(c.env.DB);

  // Check username uniqueness if username is provided
  if (parsed.username) {
    const existingWithUsername = await db
      .select({ id: profiles.id })
      .from(profiles)
      .where(
        and(
          eq(profiles.username, parsed.username),
          ne(profiles.userId, userId)
        )
      );

    if (existingWithUsername.length > 0) {
      return c.json({ error: "Username is already taken" }, 409);
    }
  }

  const existing = await db.select().from(profiles).where(eq(profiles.userId, userId));

  if (existing.length === 0) {
    // Create profile for this user — username is required for new profiles
    if (!parsed.username) {
      return c.json({ error: "username: Username is required when creating a profile" }, 400);
    }
    const [created] = await db
      .insert(profiles)
      .values({ ...parsed, username: parsed.username, userId })
      .returning();
    return c.json(created, 201);
  }

  // Update existing profile
  const [updated] = await db
    .update(profiles)
    .set(parsed)
    .where(eq(profiles.id, existing[0].id))
    .returning();

  return c.json(updated);
});

export { profileRoutes };
