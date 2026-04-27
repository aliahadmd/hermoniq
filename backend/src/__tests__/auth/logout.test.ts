import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fc from "fast-check";
import Database from "better-sqlite3";
import { betterAuth } from "better-auth";

/**
 * Feature: role-based-auth
 *
 * Property 7: Logout invalidates session
 *
 * **Validates: Requirements 7.5**
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
 * Create a Better Auth instance backed by an in-memory SQLite database.
 * Email verification is DISABLED for testing — we focus on logout behavior.
 * The user.additionalFields config mirrors production to ensure role defaults.
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

// --- Test suite ---

/**
 * Feature: role-based-auth, Property 7: Logout invalidates session
 *
 * For any authenticated user, after calling the logout endpoint, the previously
 * valid session token SHALL no longer be accepted by the Auth_Middleware
 * (subsequent requests with that token SHALL return 401).
 *
 * **Validates: Requirements 7.5**
 */
describe("Feature: role-based-auth, Property 7: Logout invalidates session", () => {
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
    "for any authenticated user, after logout the previously valid session token SHALL no longer be accepted",
    async () => {
      let emailCounter = 0;

      await fc.assert(
        fc.asyncProperty(validNameArb, validPasswordArb, async (name, password) => {
          const email = `prop7logout${emailCounter++}@test.com`;

          // Step 1: Register a user with random name/password
          const regResponse = await registerUser(auth, email, password, name);
          expect(regResponse.status).toBe(200);

          // Step 2: Extract the session cookie from the registration response
          const setCookie = regResponse.headers.get("set-cookie");
          expect(setCookie).toBeTruthy();
          expect(setCookie).toContain("better-auth.session_token");

          // Step 3: Verify the session is valid (call get-session, expect 200)
          const preLogoutSessionResponse = await auth.handler(
            new Request("http://localhost:3000/api/auth/get-session", {
              method: "GET",
              headers: {
                Cookie: setCookie!,
              },
            })
          );
          expect(preLogoutSessionResponse.status).toBe(200);

          const preLogoutBody = (await preLogoutSessionResponse.json()) as Record<string, unknown>;
          expect(preLogoutBody.user).toBeDefined();
          expect(preLogoutBody.session).toBeDefined();

          // Step 4: Call the logout endpoint (POST to /api/auth/sign-out) with the session cookie
          const logoutResponse = await auth.handler(
            new Request("http://localhost:3000/api/auth/sign-out", {
              method: "POST",
              headers: {
                Cookie: setCookie!,
              },
            })
          );
          expect(logoutResponse.status).toBe(200);

          // Step 5: Verify the session is now invalid (call get-session again with the same cookie)
          const postLogoutSessionResponse = await auth.handler(
            new Request("http://localhost:3000/api/auth/get-session", {
              method: "GET",
              headers: {
                Cookie: setCookie!,
              },
            })
          );

          // After logout, the session should be invalidated:
          // Either the response is non-200, or the body is null/contains a null session
          const postLogoutStatus = postLogoutSessionResponse.status;
          if (postLogoutStatus === 200) {
            const postLogoutBody = await postLogoutSessionResponse.json();
            // If 200 is returned, the body or session should be null
            const isInvalidated =
              postLogoutBody === null ||
              postLogoutBody === undefined ||
              (typeof postLogoutBody === "object" && (postLogoutBody as Record<string, unknown>).session == null);
            expect(isInvalidated).toBe(true);
          } else {
            // Non-200 status means the session was rejected (e.g. 401)
            expect(postLogoutStatus).not.toBe(200);
          }
        }),
        { numRuns: 100 }
      );
    },
    120_000
  );
});
