import { Hono } from "hono";
import { and, eq, ne } from "drizzle-orm";
import { ZodError } from "zod";
import { createDb } from "../../db";
import { profiles, user } from "../../db/schema";
import { updateProfileSchema } from "../validators";
import type { AppEnv } from "../types";

const adminUserRoutes = new Hono<AppEnv>();

// GET /api/admin/users/:userId — Get user auth record + profile (admin only)
adminUserRoutes.get("/:userId", async (c) => {
  const userId = c.req.param("userId");
  const db = createDb(c.env.DB);

  // Fetch user auth record
  const userResult = await db
    .select()
    .from(user)
    .where(eq(user.id, userId));

  if (userResult.length === 0) {
    return c.json({ error: "User not found" }, 404);
  }

  const userData = userResult[0];

  // Fetch profile for this user
  const profileResult = await db
    .select()
    .from(profiles)
    .where(eq(profiles.userId, userId));

  const profile = profileResult.length > 0 ? profileResult[0] : null;

  return c.json({
    user: {
      id: userData.id,
      name: userData.name,
      email: userData.email,
      role: userData.role,
      banned: userData.banned,
      banReason: userData.banReason,
      image: userData.image,
      createdAt: userData.createdAt instanceof Date
        ? userData.createdAt.toISOString()
        : String(userData.createdAt),
      updatedAt: userData.updatedAt instanceof Date
        ? userData.updatedAt.toISOString()
        : String(userData.updatedAt),
    },
    profile,
  });
});

// PUT /api/admin/users/:userId/profile — Update a user's profile (admin only)
adminUserRoutes.put("/:userId/profile", async (c) => {
  const userId = c.req.param("userId");
  const db = createDb(c.env.DB);

  // Verify the target user exists
  const userResult = await db
    .select({ id: user.id })
    .from(user)
    .where(eq(user.id, userId));

  if (userResult.length === 0) {
    return c.json({ error: "User not found" }, 404);
  }

  const body = await c.req.json();

  // Validate input with Zod
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

  // Upsert: check if profile exists for this user
  const existing = await db
    .select()
    .from(profiles)
    .where(eq(profiles.userId, userId));

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

export { adminUserRoutes };
