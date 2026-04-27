import { describe, it, expect, beforeEach } from "vitest";
import fc from "fast-check";
import { createTestApp, type TestDb } from "./helpers/test-app";
import type { Hono } from "hono";
import type Database from "better-sqlite3";

let app: Hono;
let db: TestDb;
let sqlite: Database.Database;

beforeEach(() => {
  const test = createTestApp();
  app = test.app;
  db = test.db;
  sqlite = test.sqlite;
});

// Generates random non-existent UUIDs
const nonExistentIdArb = fc.uuid();

// Feature: money-tracker, Property 16: Error responses for failed operations
// For any request referencing a non-existent resource ID (account, transaction, category),
// the Backend should return an appropriate HTTP error status code (404) and a descriptive
// error message in the response body.
// Validates: Requirements 8.5
describe("Property 16: Error responses for failed operations", () => {
  it("PUT /api/accounts/:id returns 404 for non-existent account", async () => {
    await fc.assert(
      fc.asyncProperty(nonExistentIdArb, async (fakeId) => {
        const res = await app.request(`/api/accounts/${fakeId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: "test" }),
        });
        expect(res.status).toBe(404);
        const body = (await res.json()) as any;
        expect(body.error).toBeDefined();
        expect(typeof body.error).toBe("string");
        expect(body.error.length).toBeGreaterThan(0);
      }),
      { numRuns: 100 }
    );
  });

  it("DELETE /api/accounts/:id returns 404 for non-existent account", async () => {
    await fc.assert(
      fc.asyncProperty(nonExistentIdArb, async (fakeId) => {
        const res = await app.request(`/api/accounts/${fakeId}`, {
          method: "DELETE",
        });
        expect(res.status).toBe(404);
        const body = (await res.json()) as any;
        expect(body.error).toBeDefined();
        expect(typeof body.error).toBe("string");
        expect(body.error.length).toBeGreaterThan(0);
      }),
      { numRuns: 100 }
    );
  });

  it("DELETE /api/transactions/:id returns 404 for non-existent transaction", async () => {
    await fc.assert(
      fc.asyncProperty(nonExistentIdArb, async (fakeId) => {
        const res = await app.request(`/api/transactions/${fakeId}`, {
          method: "DELETE",
        });
        expect(res.status).toBe(404);
        const body = (await res.json()) as any;
        expect(body.error).toBeDefined();
        expect(typeof body.error).toBe("string");
        expect(body.error.length).toBeGreaterThan(0);
      }),
      { numRuns: 100 }
    );
  });

  it("PUT /api/categories/:id returns 404 for non-existent category", async () => {
    await fc.assert(
      fc.asyncProperty(nonExistentIdArb, async (fakeId) => {
        const res = await app.request(`/api/categories/${fakeId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title: "test" }),
        });
        expect(res.status).toBe(404);
        const body = (await res.json()) as any;
        expect(body.error).toBeDefined();
        expect(typeof body.error).toBe("string");
        expect(body.error.length).toBeGreaterThan(0);
      }),
      { numRuns: 100 }
    );
  });

  it("DELETE /api/categories/:id returns 404 for non-existent category", async () => {
    await fc.assert(
      fc.asyncProperty(nonExistentIdArb, async (fakeId) => {
        const res = await app.request(`/api/categories/${fakeId}`, {
          method: "DELETE",
        });
        expect(res.status).toBe(404);
        const body = (await res.json()) as any;
        expect(body.error).toBeDefined();
        expect(typeof body.error).toBe("string");
        expect(body.error.length).toBeGreaterThan(0);
      }),
      { numRuns: 100 }
    );
  });

  it("POST /api/transactions returns 404 when referencing non-existent account", async () => {
    await fc.assert(
      fc.asyncProperty(nonExistentIdArb, async (fakeAccountId) => {
        const res = await app.request("/api/transactions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            amount: 1000,
            type: "expense",
            date: new Date().toISOString(),
            description: "test",
            categoryId: null,
            accountId: fakeAccountId,
          }),
        });
        expect(res.status).toBe(404);
        const body = (await res.json()) as any;
        expect(body.error).toBeDefined();
        expect(typeof body.error).toBe("string");
        expect(body.error.length).toBeGreaterThan(0);
      }),
      { numRuns: 100 }
    );
  });
});
