import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { Hono } from "hono";
import { adminMiddleware } from "../worker/middleware/admin";
import type { AppEnv } from "../worker/types";

/**
 * Feature: user-profile-settings, Property 7: Admin endpoint authorization
 *
 * **Validates: Requirements 8.3**
 *
 * For any non-admin authenticated user, requests to admin user endpoints
 * should return a 403 forbidden status.
 */

// Generator for non-admin role strings — any string that is NOT "admin"
const nonAdminRoleArb = fc
  .string({ minLength: 0, maxLength: 50 })
  .filter((s) => s !== "admin");

// Build a minimal Hono app that uses the admin middleware
function createTestApp() {
  const app = new Hono<AppEnv>();

  // Simulate auth middleware by setting user from header
  app.use("*", async (c, next) => {
    const role = c.req.header("x-test-role") ?? "user";
    c.set("user", {
      id: "test-user-id",
      name: "Test User",
      email: "test@example.com",
      role,
    });
    await next();
  });

  // Apply admin middleware
  app.use("*", adminMiddleware);

  // Protected endpoint
  app.get("/api/admin/users", (c) => c.json({ ok: true }));
  app.get("/api/admin/users/:userId", (c) => c.json({ ok: true }));
  app.put("/api/admin/users/:userId/profile", (c) => c.json({ ok: true }));

  return app;
}

describe("Property 7: Admin endpoint authorization", () => {
  const app = createTestApp();

  it("should return 403 for any non-admin role accessing admin endpoints", () => {
    fc.assert(
      fc.asyncProperty(nonAdminRoleArb, async (role) => {
        const res = await app.request("/api/admin/users", {
          headers: { "x-test-role": role },
        });
        expect(res.status).toBe(403);

        const body = await res.json();
        expect(body).toEqual({ error: "Forbidden" });
      }),
      { numRuns: 100 },
    );
  });

  it("should return 403 for non-admin roles on user detail endpoint", () => {
    fc.assert(
      fc.asyncProperty(nonAdminRoleArb, async (role) => {
        const res = await app.request("/api/admin/users/some-user-id", {
          headers: { "x-test-role": role },
        });
        expect(res.status).toBe(403);

        const body = await res.json();
        expect(body).toEqual({ error: "Forbidden" });
      }),
      { numRuns: 100 },
    );
  });

  it("should return 403 for non-admin roles on profile update endpoint", () => {
    fc.assert(
      fc.asyncProperty(nonAdminRoleArb, async (role) => {
        const res = await app.request("/api/admin/users/some-user-id/profile", {
          method: "PUT",
          headers: {
            "x-test-role": role,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ name: "Test" }),
        });
        expect(res.status).toBe(403);

        const body = await res.json();
        expect(body).toEqual({ error: "Forbidden" });
      }),
      { numRuns: 100 },
    );
  });

  it("should allow admin role to pass through the middleware", () => {
    fc.assert(
      fc.asyncProperty(
        fc.constantFrom(
          "/api/admin/users",
          "/api/admin/users/some-user-id",
        ),
        async (path) => {
          const res = await app.request(path, {
            headers: { "x-test-role": "admin" },
          });
          expect(res.status).toBe(200);

          const body = await res.json();
          expect(body).toEqual({ ok: true });
        },
      ),
      { numRuns: 100 },
    );
  });
});
