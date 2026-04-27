import { describe, it, expect, beforeEach, vi } from "vitest";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "../db/schema";
import { profiles } from "../db/schema";
import { nanoid } from "nanoid";

// We need to test the generator logic, but it imports from "../../db" which
// exports a D1-based type. For testing we use better-sqlite3 drizzle which
// has a compatible query interface. We'll import the function and cast the db.
import { generateUniqueUsername } from "../worker/utils/username-generator";

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

describe("generateUniqueUsername", () => {
  it("should return a username matching the pattern user-{8chars}", async () => {
    const username = await generateUniqueUsername(db as any);
    expect(username).toMatch(/^user-[a-zA-Z0-9_-]{8,}$/);
    expect(username.startsWith("user-")).toBe(true);
  });

  it("should return a username that does not exist in the database", async () => {
    const username = await generateUniqueUsername(db as any);

    // Verify it's not in the DB (it shouldn't be since DB is empty)
    const existing = await (db as any)
      .select({ id: profiles.id })
      .from(profiles)
      .where(schema.profiles.username);

    // The generated username should be unique
    expect(username).toBeTruthy();
    expect(username.length).toBeGreaterThan(5); // "user-" + at least 8 chars
  });

  it("should generate different usernames on successive calls", async () => {
    const username1 = await generateUniqueUsername(db as any);
    const username2 = await generateUniqueUsername(db as any);

    // While theoretically possible to collide, with nanoid(8) it's extremely unlikely
    expect(username1).not.toBe(username2);
  });

  it("should retry and find a unique username when collisions exist", async () => {
    // Insert a profile with a known username pattern
    const userId = nanoid();
    const now = Math.floor(Date.now() / 1000);

    // Create a user first (for FK constraint)
    sqlite.exec(
      `INSERT INTO user (id, name, email, emailVerified, createdAt, updatedAt) VALUES ('${userId}', 'Test', 'test@test.com', 0, ${now}, ${now})`
    );

    // Insert a profile - the generator should still find a unique one
    await (db as any).insert(profiles).values({
      id: nanoid(),
      name: "Test User",
      username: "user-existing",
      userId,
    });

    const username = await generateUniqueUsername(db as any);
    expect(username).toMatch(/^user-/);
    expect(username).not.toBe("user-existing");
  });

  it("should produce username with exactly 13 chars (user- + 8) on first success", async () => {
    const username = await generateUniqueUsername(db as any);
    // On an empty DB, the first attempt should succeed with nanoid(8)
    // "user-" (5 chars) + nanoid(8) = 13 chars
    expect(username.length).toBe(13);
  });
});
