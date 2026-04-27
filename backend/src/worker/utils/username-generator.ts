import { nanoid } from "nanoid";
import { eq } from "drizzle-orm";
import type { DrizzleDb } from "../../db";
import { profiles } from "../../db/schema";

export async function generateUniqueUsername(db: DrizzleDb): Promise<string> {
  const MAX_RETRIES = 5;
  for (let i = 0; i < MAX_RETRIES; i++) {
    const username = `user-${nanoid(8)}`;
    const existing = await db
      .select({ id: profiles.id })
      .from(profiles)
      .where(eq(profiles.username, username));
    if (existing.length === 0) return username;
  }
  // Fallback: use longer nanoid to virtually guarantee uniqueness
  return `user-${nanoid(16)}`;
}
