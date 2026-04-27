import { describe, it, expect, beforeEach } from "vitest";
import fc from "fast-check";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { eq } from "drizzle-orm";
import * as schema from "../db/schema";
import { profiles, user } from "../db/schema";
import { nanoid } from "nanoid";

/**
 * Feature: user-profile-settings, Property 5: Admin user detail retrieval
 *
 * **Validates: Requirements 7.1, 8.1**
 *
 * For any user in the system, an admin requesting that user's detail should
 * receive both the auth record (name, email, role, ban status) and the profile
 * record with all fields.
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

// --- Arbitraries ---

// Valid user name: non-empty string
const userNameArb = fc
  .string({ minLength: 1, maxLength: 100 })
  .filter((s) => s.trim().length > 0);

// Unique email address
const userEmailArb = fc
  .tuple(
    fc.stringMatching(/^[a-z][a-z0-9]{1,10}$/),
    fc.constantFrom("example.com", "test.org", "mail.io")
  )
  .map(([local, domain]) => `${local}@${domain}`);

// Role: user or admin
const roleArb = fc.constantFrom("user", "admin");

// Ban status
const bannedArb = fc.boolean();
const banReasonArb = fc.oneof(
  fc.string({ minLength: 1, maxLength: 100 }),
  fc.constant(null)
);

// Image URL or null
const imageArb = fc.oneof(
  fc
    .tuple(
      fc.constantFrom("https"),
      fc.stringMatching(/^[a-z][a-z0-9]{1,10}$/),
      fc.constantFrom(".com", ".org"),
      fc.constantFrom("/avatar.png", "/img/photo.jpg")
    )
    .map(([proto, domain, tld, path]) => `${proto}://${domain}${tld}${path}`),
  fc.constant(null)
);

// Valid username: 1-30 chars of [a-z0-9_-]
const VALID_USERNAME_CHARS = "abcdefghijklmnopqrstuvwxyz0123456789_-";
const validUsernameArb = fc.string({
  unit: fc.constantFrom(...VALID_USERNAME_CHARS.split("")),
  minLength: 1,
  maxLength: 30,
});

// Profile fields
const validAboutArb = fc.oneof(
  fc.string({ minLength: 0, maxLength: 100 }),
  fc.constant(null)
);
const validLocationArb = fc.oneof(
  fc.string({ minLength: 0, maxLength: 100 }),
  fc.constant(null)
);
const validGenderArb = fc.oneof(
  fc.string({ minLength: 0, maxLength: 50 }),
  fc.constant(null)
);
const validWebsiteArb = fc.oneof(
  fc
    .tuple(
      fc.constantFrom("http", "https"),
      fc.stringMatching(/^[a-z][a-z0-9]{1,15}$/),
      fc.constantFrom(".com", ".org", ".net")
    )
    .map(([proto, domain, tld]) => `${proto}://${domain}${tld}`),
  fc.constant(null)
);
const validWorkFieldArb = fc.oneof(
  fc.string({ minLength: 0, maxLength: 100 }),
  fc.constant(null)
);
const validWorkDescArb = fc.oneof(
  fc.string({ minLength: 0, maxLength: 500 }),
  fc.constant(null)
);
const validEducationGraduatedArb = fc.oneof(fc.boolean(), fc.constant(null));

// Composite: full user auth data
const userAuthDataArb = fc.record({
  name: userNameArb,
  email: userEmailArb,
  role: roleArb,
  banned: bannedArb,
  banReason: banReasonArb,
  image: imageArb,
});

// Composite: full profile data
const profileDataArb = fc.record({
  name: userNameArb,
  username: validUsernameArb,
  about: validAboutArb,
  location: validLocationArb,
  gender: validGenderArb,
  website: validWebsiteArb,
  workCompany: validWorkFieldArb,
  workPosition: validWorkFieldArb,
  workDescription: validWorkDescArb,
  educationSchool: validWorkFieldArb,
  educationDegree: validWorkFieldArb,
  educationGraduated: validEducationGraduatedArb,
});

/**
 * Simulates the admin GET /api/admin/users/:userId route logic.
 * This mirrors the implementation in admin-users.ts.
 */
async function adminGetUserDetail(testDb: typeof db, userId: string) {
  // Fetch user auth record
  const userResult = await (testDb as any)
    .select()
    .from(user)
    .where(eq(user.id, userId));

  if (userResult.length === 0) {
    return null;
  }

  const userData = userResult[0];

  // Fetch profile for this user
  const profileResult = await (testDb as any)
    .select()
    .from(profiles)
    .where(eq(profiles.userId, userId));

  const profile = profileResult.length > 0 ? profileResult[0] : null;

  return {
    user: {
      id: userData.id,
      name: userData.name,
      email: userData.email,
      role: userData.role,
      banned: userData.banned,
      banReason: userData.banReason,
      image: userData.image,
      createdAt:
        userData.createdAt instanceof Date
          ? userData.createdAt.toISOString()
          : String(userData.createdAt),
      updatedAt:
        userData.updatedAt instanceof Date
          ? userData.updatedAt.toISOString()
          : String(userData.updatedAt),
    },
    profile,
  };
}

describe("Property 5: Admin user detail retrieval", () => {
  it("should return both auth record and profile data for any user with a profile", async () => {
    await fc.assert(
      fc.asyncProperty(
        userAuthDataArb,
        profileDataArb,
        async (authData, profData) => {
          const userId = nanoid();
          const profileId = nanoid();
          const now = Math.floor(Date.now() / 1000);

          // Create user auth record
          await (db as any).insert(user).values({
            id: userId,
            name: authData.name,
            email: authData.email,
            emailVerified: false,
            image: authData.image,
            role: authData.role,
            banned: authData.banned,
            banReason: authData.banReason,
            createdAt: new Date(now * 1000),
            updatedAt: new Date(now * 1000),
          });

          // Create profile record
          await (db as any).insert(profiles).values({
            id: profileId,
            name: profData.name,
            username: profData.username,
            about: profData.about,
            location: profData.location,
            gender: profData.gender,
            website: profData.website,
            workCompany: profData.workCompany,
            workPosition: profData.workPosition,
            workDescription: profData.workDescription,
            educationSchool: profData.educationSchool,
            educationDegree: profData.educationDegree,
            educationGraduated: profData.educationGraduated,
            userId,
          });

          // Simulate admin detail retrieval
          const result = await adminGetUserDetail(db, userId);

          // Result must not be null
          expect(result).not.toBeNull();

          // --- Verify auth record fields ---
          expect(result!.user).toBeDefined();
          expect(result!.user.id).toBe(userId);
          expect(result!.user.name).toBe(authData.name);
          expect(result!.user.email).toBe(authData.email);
          expect(result!.user.role).toBe(authData.role);
          expect(result!.user.banned).toBe(authData.banned);
          expect(result!.user.banReason).toBe(authData.banReason);
          expect(result!.user.image).toBe(authData.image);
          // createdAt and updatedAt should be present as strings
          expect(typeof result!.user.createdAt).toBe("string");
          expect(typeof result!.user.updatedAt).toBe("string");

          // --- Verify profile record fields ---
          expect(result!.profile).not.toBeNull();
          expect(result!.profile.id).toBe(profileId);
          expect(result!.profile.name).toBe(profData.name);
          expect(result!.profile.username).toBe(profData.username);
          expect(result!.profile.about).toBe(profData.about);
          expect(result!.profile.location).toBe(profData.location);
          expect(result!.profile.gender).toBe(profData.gender);
          expect(result!.profile.website).toBe(profData.website);
          expect(result!.profile.workCompany).toBe(profData.workCompany);
          expect(result!.profile.workPosition).toBe(profData.workPosition);
          expect(result!.profile.workDescription).toBe(profData.workDescription);
          expect(result!.profile.educationSchool).toBe(profData.educationSchool);
          expect(result!.profile.educationDegree).toBe(profData.educationDegree);
          expect(result!.profile.educationGraduated).toBe(
            profData.educationGraduated
          );
          expect(result!.profile.userId).toBe(userId);

          // Clean up for next iteration
          sqlite.exec(`DELETE FROM profiles WHERE id = '${profileId}'`);
          sqlite.exec(`DELETE FROM user WHERE id = '${userId}'`);
        }
      ),
      { numRuns: 100 }
    );
  });

  it("should return profile as null for a user without a profile", async () => {
    await fc.assert(
      fc.asyncProperty(userAuthDataArb, async (authData) => {
        const userId = nanoid();
        const now = Math.floor(Date.now() / 1000);

        // Create user auth record only (no profile)
        await (db as any).insert(user).values({
          id: userId,
          name: authData.name,
          email: authData.email,
          emailVerified: false,
          image: authData.image,
          role: authData.role,
          banned: authData.banned,
          banReason: authData.banReason,
          createdAt: new Date(now * 1000),
          updatedAt: new Date(now * 1000),
        });

        // Simulate admin detail retrieval
        const result = await adminGetUserDetail(db, userId);

        // Result must not be null (user exists)
        expect(result).not.toBeNull();

        // Auth record should still be fully present
        expect(result!.user).toBeDefined();
        expect(result!.user.id).toBe(userId);
        expect(result!.user.name).toBe(authData.name);
        expect(result!.user.email).toBe(authData.email);
        expect(result!.user.role).toBe(authData.role);
        expect(result!.user.banned).toBe(authData.banned);
        expect(result!.user.banReason).toBe(authData.banReason);
        expect(result!.user.image).toBe(authData.image);
        expect(typeof result!.user.createdAt).toBe("string");
        expect(typeof result!.user.updatedAt).toBe("string");

        // Profile should be null
        expect(result!.profile).toBeNull();

        // Clean up
        sqlite.exec(`DELETE FROM user WHERE id = '${userId}'`);
      }),
      { numRuns: 100 }
    );
  });

  it("should return null for a non-existent user ID", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 10, maxLength: 30 }),
        async (fakeUserId) => {
          const result = await adminGetUserDetail(db, fakeUserId);
          expect(result).toBeNull();
        }
      ),
      { numRuns: 100 }
    );
  });

  it("should include all expected keys in the AdminUserDetail response shape", async () => {
    await fc.assert(
      fc.asyncProperty(
        userAuthDataArb,
        profileDataArb,
        async (authData, profData) => {
          const userId = nanoid();
          const profileId = nanoid();
          const now = Math.floor(Date.now() / 1000);

          await (db as any).insert(user).values({
            id: userId,
            name: authData.name,
            email: authData.email,
            emailVerified: false,
            image: authData.image,
            role: authData.role,
            banned: authData.banned,
            banReason: authData.banReason,
            createdAt: new Date(now * 1000),
            updatedAt: new Date(now * 1000),
          });

          await (db as any).insert(profiles).values({
            id: profileId,
            name: profData.name,
            username: profData.username,
            about: profData.about,
            location: profData.location,
            gender: profData.gender,
            website: profData.website,
            workCompany: profData.workCompany,
            workPosition: profData.workPosition,
            workDescription: profData.workDescription,
            educationSchool: profData.educationSchool,
            educationDegree: profData.educationDegree,
            educationGraduated: profData.educationGraduated,
            userId,
          });

          const result = await adminGetUserDetail(db, userId);
          expect(result).not.toBeNull();

          // Verify the user object has exactly the expected keys
          const expectedUserKeys = [
            "id",
            "name",
            "email",
            "role",
            "banned",
            "banReason",
            "image",
            "createdAt",
            "updatedAt",
          ];
          expect(Object.keys(result!.user).sort()).toEqual(
            expectedUserKeys.sort()
          );

          // Verify the profile object has all expected profile keys
          const expectedProfileKeys = [
            "id",
            "name",
            "photoUrl",
            "username",
            "about",
            "location",
            "gender",
            "website",
            "workCompany",
            "workPosition",
            "workDescription",
            "educationSchool",
            "educationDegree",
            "educationGraduated",
            "userId",
          ];
          expect(Object.keys(result!.profile).sort()).toEqual(
            expectedProfileKeys.sort()
          );

          // Clean up
          sqlite.exec(`DELETE FROM profiles WHERE id = '${profileId}'`);
          sqlite.exec(`DELETE FROM user WHERE id = '${userId}'`);
        }
      ),
      { numRuns: 100 }
    );
  });
});
