import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fc from "fast-check";
import { Hono } from "hono";
import Database from "better-sqlite3";
import { betterAuth } from "better-auth";

/**
 * Feature: role-based-auth, Property 6: Auth middleware enforces session validation
 *
 * For any request to a protected API route, if the request includes a valid
 * session token then the request SHALL succeed (non-401 response), and if the
 * request includes an invalid or missing session token then the response SHALL
 * be 401 Unauthorized.
 *
 * **Validates: Requirements 4.1, 4.2, 4.3**
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
 * Email verification is disabled — we only care about session validation.
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
  });
}

/**
 * Build a test Hono app that mirrors the production auth middleware pattern.
 * The middleware validates the session via auth.api.getSession() — identical
 * logic to backend/src/worker/middleware/auth.ts — and returns 401 if
 * invalid/missing, or passes through attaching user/session to context.
 */
function createTestApp(auth: TestAuth) {
  const app = new Hono();

  // Auth middleware — same logic as production (backend/src/worker/middleware/auth.ts)
  const testAuthMiddleware = async (c: any, next: any) => {
    const session = await auth.api.getSession({
      headers: c.req.raw.headers,
    });

    if (!session) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    c.set("user", session.user);
    c.set("session", session.session);
    await next();
  };

  // Protected route (mirrors /api/accounts/*, /api/categories/*, etc.)
  app.use("/api/protected/*", testAuthMiddleware);
  app.get("/api/protected/data", (c) => {
    return c.json({ message: "protected data", user: c.get("user") });
  });

  return app;
}

/**
 * Register a user via Better Auth's HTTP handler and return the set-cookie
 * header value containing the session token. This mirrors how the real app
 * obtains session cookies through the /api/auth/sign-up/email endpoint.
 */
async function registerAndGetSessionCookie(
  auth: TestAuth,
  email: string,
  password: string,
  name: string
): Promise<string> {
  const response = await auth.handler(
    new Request("http://localhost:3000/api/auth/sign-up/email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, name }),
    })
  );

  if (response.status !== 200) {
    throw new Error(`Sign-up failed with status ${response.status}`);
  }

  const setCookie = response.headers.get("set-cookie");
  if (!setCookie) {
    throw new Error("No set-cookie header in sign-up response");
  }

  return setCookie;
}

// --- fast-check generators ---

/**
 * Generates random strings that serve as invalid session tokens.
 * These should never match a real Better Auth session token (which is
 * a specific format: <token>.<signature>).
 */
const invalidTokenArb = fc.oneof(
  // Random alphanumeric strings of varying lengths
  fc.string({ minLength: 1, maxLength: 200 }),
  // UUID-like strings
  fc.uuid(),
  // Base64-like strings
  fc.base64String({ minLength: 1, maxLength: 100 }),
  // Edge-case strings
  fc.constantFrom("", " ", "null", "undefined", "false", "0"),
  // Strings with special characters
  fc.stringMatching(/^[a-zA-Z0-9._\-~!@#$%^&*()]{1,100}$/)
);

/** Generates random Authorization header values */
const invalidAuthHeaderArb = fc.oneof(
  fc.tuple(fc.constantFrom("Bearer", "Token", "Basic"), invalidTokenArb).map(
    ([scheme, token]) => `${scheme} ${token}`
  ),
  invalidTokenArb
);

// --- Test suite ---

describe("Property 6: Auth middleware enforces session validation", () => {
  let sqlite: InstanceType<typeof Database>;
  let auth: TestAuth;
  let app: Hono;
  let validSessionCookie: string;

  beforeAll(async () => {
    // Create in-memory SQLite database with Better Auth tables
    sqlite = new Database(":memory:");
    sqlite.pragma("journal_mode = WAL");
    sqlite.pragma("foreign_keys = ON");

    const statements = BETTER_AUTH_TABLES_SQL.trim()
      .split(";")
      .filter((s) => s.trim());
    for (const stmt of statements) {
      sqlite.exec(stmt);
    }

    auth = createTestAuth(sqlite);
    app = createTestApp(auth);

    // Register a test user via the HTTP handler to get a proper session cookie
    validSessionCookie = await registerAndGetSessionCookie(
      auth,
      "testuser@example.com",
      "SecurePassword123!",
      "Test User"
    );
  });

  afterAll(() => {
    sqlite.close();
  });

  it("requests with invalid or missing session tokens receive 401 Unauthorized, and requests with valid session tokens succeed", async () => {
    await fc.assert(
      fc.asyncProperty(
        invalidTokenArb,
        invalidAuthHeaderArb,
        async (randomToken, randomAuthHeader) => {
          // --- Part A: Invalid/missing tokens → 401 ---

          // No auth headers at all → 401
          const noAuthRes = await app.request("/api/protected/data");
          expect(noAuthRes.status).toBe(401);
          const noAuthBody = (await noAuthRes.json()) as any;
          expect(noAuthBody.error).toBe("Unauthorized");

          // Random cookie token → 401
          const randomCookieRes = await app.request("/api/protected/data", {
            headers: {
              Cookie: `better-auth.session_token=${randomToken}`,
            },
          });
          expect(randomCookieRes.status).toBe(401);

          // Random Authorization header → 401
          const randomAuthRes = await app.request("/api/protected/data", {
            headers: {
              Authorization: randomAuthHeader,
            },
          });
          expect(randomAuthRes.status).toBe(401);

          // --- Part B: Valid session token → non-401 (success) ---
          const validRes = await app.request("/api/protected/data", {
            headers: {
              Cookie: validSessionCookie,
            },
          });
          expect(validRes.status).not.toBe(401);
          expect(validRes.status).toBe(200);
          const validBody = (await validRes.json()) as any;
          expect(validBody.message).toBe("protected data");
          expect(validBody.user).toBeDefined();
          expect(validBody.user.email).toBe("testuser@example.com");
        }
      ),
      { numRuns: 100 }
    );
  });
});
