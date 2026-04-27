import { describe, it, expect, beforeEach } from "vitest";
import fc from "fast-check";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { eq } from "drizzle-orm";
import * as schema from "../db/schema";
import { profiles, user } from "../db/schema";
import { updateProfileSchema } from "../worker/validators";
import { nanoid } from "nanoid";

/**
 * Feature: user-profile-settings, Property 6: Admin profile update round-trip
 *
 * **Validates: Requirements 7.2, 8.2**
 *
 * For any valid profile data, an admin updating a user's profile and then
 * retrieving that user's detail should see the updated values reflected
 * in the profile.
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

// --- Arbitraries for generating valid profile update data ---

// Valid username: 1-30 chars of [a-z0-9_-]
const VALID_USERNAME_CHARS = "abcdefghijklmnopqrstuvwxyz0123456789_-";
const validUsernameArb = fc.string({
  unit: fc.constantFrom(...VALID_USERNAME_CHARS.split("")),
  minLength: 1,
  maxLength: 30,
});

// Valid name: non-empty string up to 100 chars
const validNameArb = fc
  .string({ minLength: 1, maxLength: 100 })
  .filter((s) => s.trim().length > 0);

// Valid about: up to 100 chars or null
const validAboutArb = fc.oneof(
  fc.string({ minLength: 0, maxLength: 100 }),
  fc.constant(null)
);

// Valid location: up to 100 chars or null
const validLocationArb = fc.oneof(
  fc.string({ minLength: 0, maxLength: 100 }),
  fc.constant(null)
);

// Valid gender: up to 50 chars or null
const validGenderArb = fc.oneof(
  fc.string({ minLength: 0, maxLength: 50 }),
  fc.constant(null)
);

// Valid website: valid URL or null
const validWebsiteArb = fc.oneof(
  fc
    .tuple(
      fc.constantFrom("http", "https"),
      fc.stringMatching(/^[a-z][a-z0-9]{1,15}$/),
      fc.constantFrom(".com", ".org", ".net", ".io"),
      fc.constantFrom("", "/path", "/page/1")
    )
    .map(([protocol, domain, tld, path]) => `${protocol}://${domain}${tld}${path}`),
  fc.constant(null)
);

// Valid work fields
const validWorkCompanyArb = fc.oneof(
  fc.string({ minLength: 0, maxLength: 100 }),
  fc.constant(null)
);
const validWorkPositionArb = fc.oneof(
  fc.string({ minLength: 0, maxLength: 100 }),
  fc.constant(null)
);
const validWorkDescriptionArb = fc.oneof(
  fc.string({ minLength: 0, maxLength: 500 }),
  fc.constant(null)
);

// Valid education fields
const validEducationSchoolArb = fc.oneof(
  fc.string({ minLength: 0, maxLength: 100 }),
  fc.constant(null)
);
const validEducationDegreeArb = fc.oneof(
  fc.string({ minLength: 0, maxLength: 100 }),
  fc.constant(null)
);
const validEducationGraduatedArb = fc.oneof(
  fc.boolean(),
  fc.constant(null)
);

// Composite arbitrary for a full valid profile update object
const validProfileDataArb = fc.record({
  name: validNameArb,
  username: validUsernameArb,
  about: validAboutArb,
  location: validLocationArb,
  gender: validGenderArb,
  website: validWebsiteArb,
  workCompany: validWorkCompanyArb,
  workPosition: validWorkPositionArb,
  workDescription: validWorkDescriptionArb,
  educationSchool: validEducationSchoolArb,
  educationDegree: validEducationDegreeArb,
  educationGraduated: validEducationGraduatedArb,
});

/**
 * Helper: creates a user and an initial profile in the database.
 * Returns the userId and profileId.
 */
async function createUserWithProfile(testDb: typeof db) {
  const userId = nanoid();
  const profileId = nanoid();
  const now = Math.floor(Date.now() / 1000);

  await (testDb as any).insert(user).values({
    id: userId,
    name: "Initial Name",
    email: `${nanoid(8)}@test.com`,
    emailVerified: false,
    createdAt: new Date(now * 1000),
    updatedAt: new Date(now * 1000),
  });

  await (testDb as any).insert(profiles).values({
    id: profileId,
    name: "Initial Name",
    username: `user-${nanoid(8)}`,
    userId,
  });

  return { userId, profileId };
}

/**
 * Simulates the admin PUT /api/admin/users/:userId/profile route logic.
 * This mirrors the update path in admin-users.ts for an existing profile.
 */
async function adminUpdateProfile(
  testDb: typeof db,
  userId: string,
  profileData: Record<string, unknown>
) {
  // Find existing profile for this user
  const existing = await (testDb as any)
    .select()
    .from(profiles)
    .where(eq(profiles.userId, userId));

  if (existing.length === 0) {
    throw new Error("Profile not found for user");
  }

  // Update existing profile
  const [updated] = await (testDb as any)
    .update(profiles)
    .set(profileData)
    .where(eq(profiles.id, existing[0].id))
    .returning();

  return updated;
}

/**
 * Simulates the admin GET /api/admin/users/:userId route logic.
 * This mirrors the retrieval path in admin-users.ts.
 */
async function adminGetUserDetail(testDb: typeof db, userId: string) {
  const userResult = await (testDb as any)
    .select()
    .from(user)
    .where(eq(user.id, userId));

  if (userResult.length === 0) {
    return null;
  }

  const userData = userResult[0];

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

describe("Property 6: Admin profile update round-trip", () => {
  it("should preserve all profile fields through an admin PUT then GET cycle", async () => {
    await fc.assert(
      fc.asyncProperty(validProfileDataArb, async (profileData) => {
        // Validate the generated data against the schema (sanity check)
        const parseResult = updateProfileSchema.safeParse(profileData);
        expect(parseResult.success).toBe(true);

        // Step 1: Create a user with an initial profile
        const { userId } = await createUserWithProfile(db);

        // Step 2: Admin updates the profile with generated data (simulating admin PUT route logic)
        await adminUpdateProfile(db, userId, profileData);

        // Step 3: Admin retrieves the user detail (simulating admin GET route logic)
        const result = await adminGetUserDetail(db, userId);

        // Step 4: Assert the result is valid and profile is present
        expect(result).not.toBeNull();
        expect(result!.profile).not.toBeNull();

        // Step 5: Assert all updated profile fields match the submitted values
        const retrievedProfile = result!.profile;
        expect(retrievedProfile.name).toBe(profileData.name);
        expect(retrievedProfile.username).toBe(profileData.username);
        expect(retrievedProfile.about).toBe(profileData.about);
        expect(retrievedProfile.location).toBe(profileData.location);
        expect(retrievedProfile.gender).toBe(profileData.gender);
        expect(retrievedProfile.website).toBe(profileData.website);
        expect(retrievedProfile.workCompany).toBe(profileData.workCompany);
        expect(retrievedProfile.workPosition).toBe(profileData.workPosition);
        expect(retrievedProfile.workDescription).toBe(profileData.workDescription);
        expect(retrievedProfile.educationSchool).toBe(profileData.educationSchool);
        expect(retrievedProfile.educationDegree).toBe(profileData.educationDegree);
        expect(retrievedProfile.educationGraduated).toBe(profileData.educationGraduated);

        // Verify the profile is still linked to the correct user
        expect(retrievedProfile.userId).toBe(userId);

        // Clean up for next iteration
        sqlite.exec(`DELETE FROM profiles WHERE user_id = '${userId}'`);
        sqlite.exec(`DELETE FROM user WHERE id = '${userId}'`);
      }),
      { numRuns: 100 }
    );
  });
});
