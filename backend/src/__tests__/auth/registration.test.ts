import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fc from "fast-check";
import Database from "better-sqlite3";
import { betterAuth } from "better-auth";

/**
 * Feature: role-based-auth
 *
 * Property 1: Registration assigns default role
 * Property 2: Duplicate email registration is rejected
 * Property 3: Registration creates a valid session
 *
 * **Validates: Requirements 1.4, 5.1, 5.2, 5.3**
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
 * Email verification is DISABLED for testing — we focus on registration behavior.
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

// --- Test suites ---

/**
 * Feature: role-based-auth, Property 1: Registration assigns default role
 *
 * For any valid registration input (name, email, password), when a new user
 * is created via the Auth_Server, the resulting user record SHALL have the
 * role "user".
 *
 * **Validates: Requirements 1.4, 5.1**
 */
describe("Feature: role-based-auth, Property 1: Registration assigns default role", () => {
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
    "for any valid registration input, the resulting user record SHALL have the role 'user'",
    async () => {
      let emailCounter = 0;

      await fc.assert(
        fc.asyncProperty(validNameArb, validPasswordArb, async (name, password) => {
          // Use a unique email per iteration to avoid duplicate conflicts
          const email = `prop1user${emailCounter++}@test.com`;

          const response = await registerUser(auth, email, password, name);
          expect(response.status).toBe(200);

          const body = (await response.json()) as any;
          expect(body.user).toBeDefined();
          expect(body.user.role).toBe("user");

          // Also verify directly in the database
          const dbUser = sqlite
            .prepare('SELECT role FROM "user" WHERE email = ?')
            .get(email) as { role: string } | undefined;
          expect(dbUser).toBeDefined();
          expect(dbUser!.role).toBe("user");
        }),
        { numRuns: 100 }
      );
    },
    120_000
  );
});

/**
 * Feature: role-based-auth, Property 2: Duplicate email registration is rejected
 *
 * For any email address that is already registered, attempting to register a
 * new user with that same email SHALL return an error and SHALL NOT create a
 * duplicate user record.
 *
 * **Validates: Requirements 5.2**
 */
describe("Feature: role-based-auth, Property 2: Duplicate email registration is rejected", () => {
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
    "for any email already registered, attempting to register again SHALL return an error and SHALL NOT create a duplicate",
    async () => {
      let emailCounter = 0;

      await fc.assert(
        fc.asyncProperty(
          validNameArb,
          validPasswordArb,
          validNameArb,
          validPasswordArb,
          async (name1, password1, name2, password2) => {
            const email = `prop2dup${emailCounter++}@test.com`;

            // First registration should succeed
            const firstResponse = await registerUser(auth, email, password1, name1);
            expect(firstResponse.status).toBe(200);

            // Second registration with the same email should fail
            const secondResponse = await registerUser(auth, email, password2, name2);
            expect(secondResponse.status).not.toBe(200);

            // Verify only one user record exists with this email
            const userCount = sqlite
              .prepare('SELECT COUNT(*) as count FROM "user" WHERE email = ?')
              .get(email) as { count: number };
            expect(userCount.count).toBe(1);
          }
        ),
        { numRuns: 100 }
      );
    },
    120_000
  );
});

/**
 * Feature: role-based-auth, Property 3: Registration creates a valid session
 *
 * For any successful registration, the Auth_Server SHALL return a session token,
 * and that token SHALL be valid for subsequent authenticated requests.
 *
 * **Validates: Requirements 5.3**
 */
describe("Feature: role-based-auth, Property 3: Registration creates a valid session", () => {
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
    "for any successful registration, the Auth_Server SHALL return a session token that is valid for authenticated requests",
    async () => {
      let emailCounter = 0;

      await fc.assert(
        fc.asyncProperty(validNameArb, validPasswordArb, async (name, password) => {
          const email = `prop3sess${emailCounter++}@test.com`;

          // Register the user
          const response = await registerUser(auth, email, password, name);
          expect(response.status).toBe(200);

          // Extract the session cookie from the response
          const setCookie = response.headers.get("set-cookie");
          expect(setCookie).toBeTruthy();
          expect(setCookie).toContain("better-auth.session_token");

          // Use the session cookie to make an authenticated request (getSession)
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
