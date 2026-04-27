import { describe, it, expect, beforeEach } from "vitest";
import fc from "fast-check";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { eq } from "drizzle-orm";
import * as schema from "../db/schema";
import { profiles, user } from "../db/schema";
import { generateUniqueUsername } from "../worker/utils/username-generator";
import { nanoid } from "nanoid";

/**
 * Feature: user-profile-settings, Property 4: Auto-profile creation on registration
 *
 * **Validates: Requirements 2.1, 2.2**
 *
 * For any newly registered user, the system should create a profile record
 * where the username matches the pattern /^user-[a-zA-Z0-9_-]+$/ and the
 * profile name matches the user's registration name.
 */

let sqlite: InstanceType<typeof Database>;
let db: ReturnType<typeof drizzle>;

const MIGRATION_SQL = `
CREATE TABLE IF NOT EXISTS user (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  emailVerified INTEGER NOT NULL DEFAULT 0,
  image TEXT,
  role TEXT DEFAULT 'user',
  banned INTEGER DEFAULT 0,
  banReason TEXT,
  banExpires INTEGER,
  createdAt INTEGER NOT NULL,
  updatedAt INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS profiles (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  photo_url TEXT,
  username TEXT NOT NULL UNIQUE,
  about TEXT,
  location TEXT,
  gender TEXT,
  website TEXT,
  work_company TEXT,
  work_position TEXT,
  work_description TEXT,
  education_school TEXT,
  education_degree TEXT,
  education_graduated INTEGER,
  user_id TEXT UNIQUE REFERENCES user(id) ON DELETE CASCADE
);
`;

beforeEach(() => {
  sqlite = new Database(":memory:");
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");

  const statements = MIGRATION_SQL.trim().split(";").filter((s) => s.trim());
  for (const stmt of statements) {
    sqlite.exec(stmt);
  }

  db = drizzle(sqlite, { schema });
});

// Generator for user registration names: non-empty strings that simulate real names
const userNameArb = fc
  .string({ minLength: 1, maxLength: 100 })
  .filter((s) => s.trim().length > 0);

// Generator for unique email addresses
const userEmailArb = fc
  .tuple(
    fc.stringMatching(/^[a-z][a-z0-9]{1,10}$/),
    fc.constantFrom("example.com", "test.org", "mail.io")
  )
  .map(([local, domain]) => `${local}@${domain}`);

describe("Property 4: Auto-profile creation on registration", () => {
  it("should create a profile with valid username pattern and matching name for any registered user", async () => {
    await fc.assert(
      fc.asyncProperty(userNameArb, userEmailArb, async (name, email) => {
        // Simulate user registration: create a user record
        const userId = nanoid();
        const now = Math.floor(Date.now() / 1000);

        await (db as any).insert(user).values({
          id: userId,
          name,
          email,
          emailVerified: false,
          createdAt: new Date(now * 1000),
          updatedAt: new Date(now * 1000),
        });

        // Simulate the databaseHooks.user.create.after behavior:
        // Generate a unique username and create a profile
        const username = await generateUniqueUsername(db as any);
        await (db as any).insert(profiles).values({
          id: nanoid(),
          name,
          username,
          userId,
        });

        // Verify: profile exists for this user
        const [profile] = await (db as any)
          .select()
          .from(profiles)
          .where(eq(profiles.userId, userId));

        // Property assertions:
        // 1. Profile must exist
        expect(profile).toBeDefined();

        // 2. Username must match the pattern user-{nanoid chars}
        //    nanoid uses URL-safe characters: [a-zA-Z0-9_-]
        expect(profile.username).toMatch(/^user-[a-zA-Z0-9_-]+$/);

        // 3. Username must start with "user-"
        expect(profile.username.startsWith("user-")).toBe(true);

        // 4. Profile name must match the user's registration name
        expect(profile.name).toBe(name);

        // 5. Profile must be linked to the correct user
        expect(profile.userId).toBe(userId);

        // Clean up for next iteration (in-memory DB is shared within the test)
        sqlite.exec(`DELETE FROM profiles WHERE user_id = '${userId}'`);
        sqlite.exec(`DELETE FROM user WHERE id = '${userId}'`);
      }),
      { numRuns: 100 }
    );
  });

  it("should generate usernames of expected length (user- prefix + 8 nanoid chars)", async () => {
    await fc.assert(
      fc.asyncProperty(userNameArb, userEmailArb, async (name, email) => {
        const userId = nanoid();
        const now = Math.floor(Date.now() / 1000);

        await (db as any).insert(user).values({
          id: userId,
          name,
          email,
          emailVerified: false,
          createdAt: new Date(now * 1000),
          updatedAt: new Date(now * 1000),
        });

        const username = await generateUniqueUsername(db as any);
        await (db as any).insert(profiles).values({
          id: nanoid(),
          name,
          username,
          userId,
        });

        const [profile] = await (db as any)
          .select()
          .from(profiles)
          .where(eq(profiles.userId, userId));

        // On an empty/low-collision DB, username should be "user-" (5) + nanoid(8) = 13 chars
        expect(profile.username.length).toBe(13);

        sqlite.exec(`DELETE FROM profiles WHERE user_id = '${userId}'`);
        sqlite.exec(`DELETE FROM user WHERE id = '${userId}'`);
      }),
      { numRuns: 100 }
    );
  });

  it("should create unique usernames across multiple registrations", async () => {
    const usernames = new Set<string>();
    const numUsers = 50;

    for (let i = 0; i < numUsers; i++) {
      const userId = nanoid();
      const now = Math.floor(Date.now() / 1000);

      await (db as any).insert(user).values({
        id: userId,
        name: `User ${i}`,
        email: `user${i}@test.com`,
        emailVerified: false,
        createdAt: new Date(now * 1000),
        updatedAt: new Date(now * 1000),
      });

      const username = await generateUniqueUsername(db as any);
      await (db as any).insert(profiles).values({
        id: nanoid(),
        name: `User ${i}`,
        username,
        userId,
      });

      // Each username should be unique
      expect(usernames.has(username)).toBe(false);
      usernames.add(username);
    }

    // All usernames should be unique
    expect(usernames.size).toBe(numUsers);
  });
});
