import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fc from "fast-check";
import Database from "better-sqlite3";
import { betterAuth } from "better-auth";

/**
 * Feature: role-based-auth
 *
 * Property 4: Login with valid credentials creates a session
 * Property 5: Login with invalid credentials fails
 * Property 11: Unverified email blocks login
 *
 * **Validates: Requirements 6.1, 6.2, 12.2, 12.8**
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
 * Create a Better Auth instance with email verification DISABLED.
 * Used for Properties 4 and 5 where we need login to work without email verification.
 */
function createTestAuth(sqlite: InstanceType<typeof Database>): TestAuth {
  return betterAuth({
    database: sqlite,
    baseURL: "http://localhost:3000",
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: false,
    },
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
 * Create a Better Auth instance with email verification ENABLED.
 * Used for Property 11 to test that unverified emails are blocked from login.
 */
function createTestAuthWithEmailVerification(
  sqlite: InstanceType<typeof Database>
): TestAuth {
  return betterAuth({
    database: sqlite,
    baseURL: "http://localhost:3000",
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: true,
    },
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
 * Generates a wrong password that is guaranteed to differ from the original.
 * Appends "WRONG" to ensure it's always different.
 */
function wrongPasswordArb(originalPassword: string) {
  return validPasswordArb
    .map((p) => (p === originalPassword ? p + "WRONG" : p))
    .filter((p) => p !== originalPassword && p.length >= 8);
}

// --- Test suites ---

/**
 * Feature: role-based-auth, Property 4: Login with valid credentials creates a session
 *
 * For any registered user, submitting the correct email and password to the
 * login endpoint SHALL return a valid session token that can be used for
 * authenticated requests.
 *
 * **Validates: Requirements 6.1**
 */
describe("Feature: role-based-auth, Property 4: Login with valid credentials creates a session", () => {
  let sqlite: InstanceType<typeof Database>;
  let auth: TestAuth;

  beforeAll(() => {
    sqlite = initDatabase();
    auth = createTestAuth(sqlite);
  });

  afterAll(() => {
    sqlite.close();
  });

  it(
    "for any registered user, submitting the correct email and password SHALL return a valid session token",
    async () => {
      let emailCounter = 0;

      await fc.assert(
        fc.asyncProperty(validNameArb, validPasswordArb, async (name, password) => {
          const email = `prop4login${emailCounter++}@test.com`;

          // Register the user first
          const regResponse = await registerUser(auth, email, password, name);
          expect(regResponse.status).toBe(200);

          // Login with the correct credentials
          const loginResponse = await loginUser(auth, email, password);
          expect(loginResponse.status).toBe(200);

          // Verify a session cookie is returned
          const setCookie = loginResponse.headers.get("set-cookie");
          expect(setCookie).toBeTruthy();
          expect(setCookie).toContain("better-auth.session_token");

          // Verify the session token is valid by calling get-session
          const sessionResponse = await auth.handler(
            new Request("http://localhost:3000/api/auth/get-session", {
              method: "GET",
              headers: {
                Cookie: setCookie!,
              },
            })
          );

          expect(sessionResponse.status).toBe(200);
          const sessionBody = (await sessionResponse.json()) as any;
          expect(sessionBody.user).toBeDefined();
          expect(sessionBody.user.email).toBe(email);
          expect(sessionBody.session).toBeDefined();
          expect(sessionBody.session.token).toBeTruthy();
        }),
        { numRuns: 100 }
      );
    },
    120_000
  );
});

/**
 * Feature: role-based-auth, Property 5: Login with invalid credentials fails
 *
 * For any login attempt where the password does not match the registered user's
 * password, or the email does not correspond to any registered user, the
 * Auth_Server SHALL return an authentication error and SHALL NOT create a session.
 *
 * **Validates: Requirements 6.2**
 */
describe("Feature: role-based-auth, Property 5: Login with invalid credentials fails", () => {
  let sqlite: InstanceType<typeof Database>;
  let auth: TestAuth;

  beforeAll(() => {
    sqlite = initDatabase();
    auth = createTestAuth(sqlite);
  });

  afterAll(() => {
    sqlite.close();
  });

  it(
    "for any login attempt with wrong password or non-existent email, the Auth_Server SHALL return an error and SHALL NOT create a session",
    async () => {
      let emailCounter = 0;

      await fc.assert(
        fc.asyncProperty(
          validNameArb,
          validPasswordArb,
          validPasswordArb,
          async (name, correctPassword, randomPassword) => {
            const email = `prop5login${emailCounter++}@test.com`;
            // Ensure the wrong password is actually different from the correct one
            const wrongPassword =
              randomPassword === correctPassword
                ? correctPassword + "WRONG"
                : randomPassword;

            // Register the user first
            const regResponse = await registerUser(auth, email, correctPassword, name);
            expect(regResponse.status).toBe(200);

            // Count sessions before login attempts
            const sessionCountBefore = sqlite
              .prepare(
                'SELECT COUNT(*) as count FROM "session" WHERE userId = (SELECT id FROM "user" WHERE email = ?)'
              )
              .get(email) as { count: number };

            // --- Case 1: Wrong password for existing user ---
            const wrongPwdResponse = await loginUser(auth, email, wrongPassword);
            expect(wrongPwdResponse.status).not.toBe(200);

            // Verify no new session was created for the wrong password attempt
            const sessionCountAfterWrongPwd = sqlite
              .prepare(
                'SELECT COUNT(*) as count FROM "session" WHERE userId = (SELECT id FROM "user" WHERE email = ?)'
              )
              .get(email) as { count: number };
            expect(sessionCountAfterWrongPwd.count).toBe(sessionCountBefore.count);

            // --- Case 2: Non-existent email ---
            const nonExistentEmail = `nonexistent${emailCounter}@nowhere.com`;
            const nonExistentResponse = await loginUser(
              auth,
              nonExistentEmail,
              correctPassword
            );
            expect(nonExistentResponse.status).not.toBe(200);

            // Verify no user or session was created for the non-existent email
            const nonExistentUser = sqlite
              .prepare('SELECT COUNT(*) as count FROM "user" WHERE email = ?')
              .get(nonExistentEmail) as { count: number };
            expect(nonExistentUser.count).toBe(0);
          }
        ),
        { numRuns: 100 }
      );
    },
    120_000
  );
});

/**
 * Feature: role-based-auth, Property 11: Unverified email blocks login
 *
 * For any newly registered user who has not verified their email, attempting
 * to log in SHALL return an error indicating the email is not verified, and
 * SHALL NOT create a session.
 *
 * **Validates: Requirements 12.2, 12.8**
 */
describe("Feature: role-based-auth, Property 11: Unverified email blocks login", () => {
  let sqlite: InstanceType<typeof Database>;
  let auth: TestAuth;

  beforeAll(() => {
    sqlite = initDatabase();
    auth = createTestAuthWithEmailVerification(sqlite);
  });

  afterAll(() => {
    sqlite.close();
  });

  it(
    "for any newly registered user who has not verified their email, login SHALL return an error and SHALL NOT create a session",
    async () => {
      let emailCounter = 0;

      await fc.assert(
        fc.asyncProperty(validNameArb, validPasswordArb, async (name, password) => {
          const email = `prop11unverified${emailCounter++}@test.com`;

          // Register the user (with requireEmailVerification: true)
          const regResponse = await registerUser(auth, email, password, name);
          expect(regResponse.status).toBe(200);

          // Verify the user's email is NOT verified in the database
          const dbUser = sqlite
            .prepare('SELECT "emailVerified" FROM "user" WHERE email = ?')
            .get(email) as { emailVerified: number } | undefined;
          expect(dbUser).toBeDefined();
          expect(dbUser!.emailVerified).toBeFalsy();

          // Count sessions before login attempt
          const sessionCountBefore = sqlite
            .prepare(
              'SELECT COUNT(*) as count FROM "session" WHERE userId = (SELECT id FROM "user" WHERE email = ?)'
            )
            .get(email) as { count: number };

          // Attempt to login — should fail because email is not verified
          const loginResponse = await loginUser(auth, email, password);
          expect(loginResponse.status).not.toBe(200);

          // Verify no NEW session was created after the failed login attempt
          const sessionCountAfter = sqlite
            .prepare(
              'SELECT COUNT(*) as count FROM "session" WHERE userId = (SELECT id FROM "user" WHERE email = ?)'
            )
            .get(email) as { count: number };
          expect(sessionCountAfter.count).toBe(sessionCountBefore.count);
        }),
        { numRuns: 100 }
      );
    },
    120_000
  );
});
