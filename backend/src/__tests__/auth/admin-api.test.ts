import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fc from "fast-check";
import Database from "better-sqlite3";
import { betterAuth } from "better-auth";
import { admin } from "better-auth/plugins";

/**
 * Feature: role-based-auth
 *
 * Property 8: Admin user list completeness
 * Property 9: Admin role change persists
 * Property 10: Ban and unban round-trip
 *
 * **Validates: Requirements 10.1, 10.3, 10.4, 10.5**
 */

// SQL to create Better Auth tables (from 0001_better_auth.sql migration)
const BETTER_AUTH_TABLES_SQL = `
CREATE TABLE IF NOT EXISTS "user" (
  "id" TEXT PRIMARY KEY NOT NULL,
  "name" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "emailVerified" INTEGER NOT NULL DEFAULT 0,
  "image" TEXT,
  "role" TEXT DEFAULT 'user',
  "banned" INTEGER DEFAULT 0,
  "banReason" TEXT,
  "banExpires" INTEGER,
  "createdAt" INTEGER NOT NULL,
  "updatedAt" INTEGER NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "user_email_unique" ON "user" ("email");
CREATE TABLE IF NOT EXISTS "session" (
  "id" TEXT PRIMARY KEY NOT NULL,
  "userId" TEXT NOT NULL,
  "token" TEXT NOT NULL,
  "expiresAt" INTEGER NOT NULL,
  "ipAddress" TEXT,
  "userAgent" TEXT,
  "createdAt" INTEGER NOT NULL,
  "updatedAt" INTEGER NOT NULL,
  FOREIGN KEY ("userId") REFERENCES "user"("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "session_token_unique" ON "session" ("token");
CREATE TABLE IF NOT EXISTS "account" (
  "id" TEXT PRIMARY KEY NOT NULL,
  "userId" TEXT NOT NULL,
  "accountId" TEXT NOT NULL,
  "providerId" TEXT NOT NULL,
  "accessToken" TEXT,
  "refreshToken" TEXT,
  "accessTokenExpiresAt" INTEGER,
  "refreshTokenExpiresAt" INTEGER,
  "scope" TEXT,
  "idToken" TEXT,
  "password" TEXT,
  "createdAt" INTEGER NOT NULL,
  "updatedAt" INTEGER NOT NULL,
  FOREIGN KEY ("userId") REFERENCES "user"("id")
);
CREATE TABLE IF NOT EXISTS "verification" (
  "id" TEXT PRIMARY KEY NOT NULL,
  "identifier" TEXT NOT NULL,
  "value" TEXT NOT NULL,
  "expiresAt" INTEGER NOT NULL,
  "createdAt" INTEGER NOT NULL,
  "updatedAt" INTEGER NOT NULL
);
`;

type TestAuth = ReturnType<typeof betterAuth>;

/**
 * Create a Better Auth instance with the admin plugin enabled.
 * Email verification is DISABLED for testing — we focus on admin API behavior.
 */
function createTestAuth(sqlite: InstanceType<typeof Database>): TestAuth {
  return betterAuth({
    database: sqlite,
    baseURL: "http://localhost:3000",
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: false,
    },
    plugins: [
      admin({
        defaultRole: "user",
      }),
    ],
    trustedOrigins: ["http://localhost"],
    user: {
      additionalFields: {
        role: {
          type: "string",
          defaultValue: "user",
          input: false,
        },
      },
    },
  });
}

/**
 * Initialize an in-memory SQLite database with Better Auth tables.
 */
function initDatabase(): InstanceType<typeof Database> {
  const sqlite = new Database(":memory:");
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");

  const statements = BETTER_AUTH_TABLES_SQL.trim()
    .split(";")
    .filter((s) => s.trim());
  for (const stmt of statements) {
    sqlite.exec(stmt);
  }

  return sqlite;
}

/**
 * Register a user via Better Auth's HTTP handler and return the full response.
 */
async function registerUser(
  auth: TestAuth,
  email: string,
  password: string,
  name: string
): Promise<Response> {
  return auth.handler(
    new Request("http://localhost:3000/api/auth/sign-up/email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, name }),
    })
  );
}

/**
 * Login a user via Better Auth's HTTP handler and return the full response.
 */
async function loginUser(
  auth: TestAuth,
  email: string,
  password: string
): Promise<Response> {
  return auth.handler(
    new Request("http://localhost:3000/api/auth/sign-in/email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    })
  );
}

/**
 * Register a user and promote them to admin by directly updating the database.
 * Returns the session cookie for the admin user.
 */
async function createAdminUser(
  auth: TestAuth,
  sqlite: InstanceType<typeof Database>,
  email: string,
  password: string,
  name: string
): Promise<string> {
  const response = await registerUser(auth, email, password, name);
  if (response.status !== 200) {
    throw new Error(`Admin registration failed with status ${response.status}`);
  }

  // Promote to admin directly in the database
  sqlite.prepare('UPDATE "user" SET role = ? WHERE email = ?').run("admin", email);

  const setCookie = response.headers.get("set-cookie");
  if (!setCookie) {
    throw new Error("No set-cookie header in admin registration response");
  }

  return setCookie;
}

// --- fast-check generators ---

/**
 * Generates valid user names: alphabetic start, 1-30 alphanumeric chars.
 */
const validNameArb = fc
  .stringMatching(/^[a-zA-Z][a-zA-Z0-9 ]{0,29}$/)
  .filter((s) => s.trim().length > 0);

/**
 * Generates valid passwords: 8-40 characters with at least one letter and one digit.
 * Better Auth requires a minimum password length of 8.
 */
const validPasswordArb = fc
  .tuple(
    fc.stringMatching(/^[a-zA-Z]{2,15}$/),
    fc.stringMatching(/^[0-9]{2,5}$/),
    fc.stringMatching(/^[a-zA-Z0-9]{0,15}$/)
  )
  .map(([letters, digits, extra]) => letters + digits + extra)
  .filter((p) => p.length >= 8 && p.length <= 40);

/**
 * Generates a valid role: either "admin" or "user".
 */
const validRoleArb = fc.constantFrom("admin", "user");

// --- Test suites ---

/**
 * Feature: role-based-auth, Property 8: Admin user list completeness
 *
 * For any set of registered users, the admin list users API SHALL return all
 * registered users, and each user record SHALL include name, email, role,
 * and banned status.
 *
 * **Validates: Requirements 10.1**
 */
describe("Feature: role-based-auth, Property 8: Admin user list completeness", () => {
  let sqlite: InstanceType<typeof Database>;
  let auth: TestAuth;
  let adminCookie: string;

  beforeAll(async () => {
    sqlite = initDatabase();
    auth = createTestAuth(sqlite);

    // Create an admin user for making admin API calls
    adminCookie = await createAdminUser(
      auth,
      sqlite,
      "admin@test.com",
      "AdminPass123",
      "Admin User"
    );
  });

  afterAll(() => {
    sqlite.close();
  });

  it(
    "for any set of registered users, the admin list users API SHALL return all registered users with name, email, role, and banned status",
    async () => {
      let emailCounter = 0;

      await fc.assert(
        fc.asyncProperty(
          fc.array(fc.tuple(validNameArb, validPasswordArb), { minLength: 1, maxLength: 5 }),
          async (userInputs) => {
            // Register N users with unique emails
            const registeredEmails: string[] = [];
            for (const [name, password] of userInputs) {
              const email = `prop8user${emailCounter++}@test.com`;
              const response = await registerUser(auth, email, password, name);
              expect(response.status).toBe(200);
              registeredEmails.push(email);
            }

            // Call listUsers via the admin API (requires query params)
            const listResponse = await auth.api.listUsers({
              query: { limit: 1000 },
              headers: new Headers({ Cookie: adminCookie }),
            });

            // listUsers returns an object with a `users` array
            const users = listResponse.users;
            expect(Array.isArray(users)).toBe(true);

            // Verify all registered emails (including admin) are present
            const allExpectedEmails = ["admin@test.com", ...registeredEmails];
            for (const expectedEmail of allExpectedEmails) {
              const found = users.find((u: any) => u.email === expectedEmail);
              expect(found).toBeDefined();

              // Verify each user record includes name, email, role, and banned status
              expect(typeof found.name).toBe("string");
              expect(found.name.length).toBeGreaterThan(0);
              expect(typeof found.email).toBe("string");
              expect(found.email).toBe(expectedEmail);
              expect(typeof found.role).toBe("string");
              expect(["admin", "user"]).toContain(found.role);
              expect(typeof found.banned).toBe("boolean");
            }
          }
        ),
        { numRuns: 100 }
      );
    },
    120_000
  );
});

/**
 * Feature: role-based-auth, Property 9: Admin role change persists
 *
 * For any user and any valid role value ("admin" or "user"), when an admin
 * changes that user's role via the admin API, subsequently fetching that user
 * SHALL show the updated role.
 *
 * **Validates: Requirements 10.3**
 */
describe("Feature: role-based-auth, Property 9: Admin role change persists", () => {
  let sqlite: InstanceType<typeof Database>;
  let auth: TestAuth;
  let adminCookie: string;

  beforeAll(async () => {
    sqlite = initDatabase();
    auth = createTestAuth(sqlite);

    // Create an admin user for making admin API calls
    adminCookie = await createAdminUser(
      auth,
      sqlite,
      "admin@test.com",
      "AdminPass123",
      "Admin User"
    );
  });

  afterAll(() => {
    sqlite.close();
  });

  it(
    "for any user and any valid role, when an admin changes that user's role, subsequently fetching that user SHALL show the updated role",
    async () => {
      let emailCounter = 0;

      await fc.assert(
        fc.asyncProperty(
          validNameArb,
          validPasswordArb,
          validRoleArb,
          async (name, password, newRole) => {
            const email = `prop9role${emailCounter++}@test.com`;

            // Register a user
            const regResponse = await registerUser(auth, email, password, name);
            expect(regResponse.status).toBe(200);
            const regBody = (await regResponse.json()) as any;
            const userId = regBody.user.id;

            // Change the user's role via admin API
            await auth.api.setRole({
              body: { userId, role: newRole },
              headers: new Headers({ Cookie: adminCookie }),
            });

            // Fetch the user list and verify the role was updated
            const listResponse = await auth.api.listUsers({
              query: { limit: 1000 },
              headers: new Headers({ Cookie: adminCookie }),
            });

            const updatedUser = listResponse.users.find((u: any) => u.id === userId);
            expect(updatedUser).toBeDefined();
            expect(updatedUser.role).toBe(newRole);

            // Also verify directly in the database
            const dbUser = sqlite
              .prepare('SELECT role FROM "user" WHERE id = ?')
              .get(userId) as { role: string } | undefined;
            expect(dbUser).toBeDefined();
            expect(dbUser!.role).toBe(newRole);
          }
        ),
        { numRuns: 100 }
      );
    },
    120_000
  );
});

/**
 * Feature: role-based-auth, Property 10: Ban and unban round-trip
 *
 * For any user, banning the user via the admin API and then unbanning the user
 * SHALL restore the user's banned status to false, and the user SHALL be able
 * to authenticate again.
 *
 * **Validates: Requirements 10.4, 10.5**
 */
describe("Feature: role-based-auth, Property 10: Ban and unban round-trip", () => {
  let sqlite: InstanceType<typeof Database>;
  let auth: TestAuth;
  let adminCookie: string;

  beforeAll(async () => {
    sqlite = initDatabase();
    auth = createTestAuth(sqlite);

    // Create an admin user for making admin API calls
    adminCookie = await createAdminUser(
      auth,
      sqlite,
      "admin@test.com",
      "AdminPass123",
      "Admin User"
    );
  });

  afterAll(() => {
    sqlite.close();
  });

  it(
    "for any user, banning and then unbanning SHALL restore banned status to false and the user SHALL be able to authenticate again",
    async () => {
      let emailCounter = 0;

      await fc.assert(
        fc.asyncProperty(validNameArb, validPasswordArb, async (name, password) => {
          const email = `prop10ban${emailCounter++}@test.com`;

          // Register a user
          const regResponse = await registerUser(auth, email, password, name);
          expect(regResponse.status).toBe(200);
          const regBody = (await regResponse.json()) as any;
          const userId = regBody.user.id;

          // Ban the user via admin API
          await auth.api.banUser({
            body: { userId },
            headers: new Headers({ Cookie: adminCookie }),
          });

          // Verify the user is banned in the database
          const bannedUser = sqlite
            .prepare('SELECT banned FROM "user" WHERE id = ?')
            .get(userId) as { banned: number } | undefined;
          expect(bannedUser).toBeDefined();
          expect(bannedUser!.banned).toBeTruthy();

          // Verify the banned user cannot login
          const bannedLoginResponse = await loginUser(auth, email, password);
          expect(bannedLoginResponse.status).not.toBe(200);

          // Unban the user via admin API
          await auth.api.unbanUser({
            body: { userId },
            headers: new Headers({ Cookie: adminCookie }),
          });

          // Verify the user is no longer banned in the database
          const unbannedUser = sqlite
            .prepare('SELECT banned FROM "user" WHERE id = ?')
            .get(userId) as { banned: number } | undefined;
          expect(unbannedUser).toBeDefined();
          expect(unbannedUser!.banned).toBeFalsy();

          // Verify the user can login again after being unbanned
          const unbannedLoginResponse = await loginUser(auth, email, password);
          expect(unbannedLoginResponse.status).toBe(200);

          const loginBody = (await unbannedLoginResponse.json()) as any;
          expect(loginBody.user).toBeDefined();
          expect(loginBody.user.email).toBe(email);
        }),
        { numRuns: 100 }
      );
    },
    120_000
  );
});
