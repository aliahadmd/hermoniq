import { describe, it, expect, beforeEach } from "vitest";
import fc from "fast-check";
import { createTestApp, type TestDb } from "./helpers/test-app";
import {
  createCategoryArb,
  updateCategoryArb,
  createAccountArb,
} from "./helpers/generators";
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

// Feature: money-tracker, Property 3: Category round-trip consistency
// For any valid category creation payload, creating via POST and retrieving via GET
// should return a category with identical title, details, color, and icon fields.
// Validates: Requirements 5.1, 5.2, 5.5, 5.6
describe("Property 3: Category round-trip consistency", () => {
  it("creating and retrieving a category preserves all fields", async () => {
    await fc.assert(
      fc.asyncProperty(createCategoryArb, async (payload) => {
        sqlite.exec("DELETE FROM categories");

        const createRes = await app.request("/api/categories", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        expect(createRes.status).toBe(201);
        const created = (await createRes.json()) as any;

        const listRes = await app.request("/api/categories");
        expect(listRes.status).toBe(200);
        const list = (await listRes.json()) as any[];

        const found = list.find((c) => c.id === created.id);
        expect(found).toBeDefined();
        expect(found.title).toBe(payload.title);
        expect(found.details).toBe(payload.details);
        expect(found.color).toBe(payload.color);
        expect(found.icon).toBe(payload.icon);
      }),
      { numRuns: 100 }
    );
  });
});


// Feature: money-tracker, Property 7: Category deletion uncategorizes transactions
// For any category with associated transactions, deleting the category should
// set those transactions' categoryId to null while keeping the transactions.
// Validates: Requirements 5.4
describe("Property 7: Category deletion uncategorizes transactions", () => {
  it("deleting a category sets associated transactions categoryId to null", async () => {
    await fc.assert(
      fc.asyncProperty(
        createCategoryArb,
        createAccountArb,
        fc.integer({ min: 1, max: 1_000_000 }),
        fc.constantFrom("income", "expense"),
        async (catPayload, acctPayload, amount, txnType) => {
          sqlite.exec("DELETE FROM transactions");
          sqlite.exec("DELETE FROM categories");
          sqlite.exec("DELETE FROM accounts");

          // Create account
          const acctRes = await app.request("/api/accounts", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(acctPayload),
          });
          const account = (await acctRes.json()) as any;

          // Create category
          const catRes = await app.request("/api/categories", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(catPayload),
          });
          const category = (await catRes.json()) as any;

          // Create transaction linked to both
          const txnRes = await app.request("/api/transactions", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              amount,
              type: txnType,
              date: new Date().toISOString(),
              description: "test",
              categoryId: category.id,
              accountId: account.id,
            }),
          });
          expect(txnRes.status).toBe(201);
          const txn = (await txnRes.json()) as any;

          // Delete the category
          const delRes = await app.request(
            `/api/categories/${category.id}`,
            { method: "DELETE" }
          );
          expect(delRes.status).toBe(200);

          // Verify transaction still exists but categoryId is null
          const txnListRes = await app.request("/api/transactions");
          const txnList = (await txnListRes.json()) as any[];
          const found = txnList.find((t) => t.id === txn.id);
          expect(found).toBeDefined();
          expect(found.categoryId).toBeNull();

          // Verify category is gone
          const catListRes = await app.request("/api/categories");
          const catList = (await catListRes.json()) as any[];
          expect(catList.find((c) => c.id === category.id)).toBeUndefined();
        }
      ),
      { numRuns: 100 }
    );
  });
});

// Feature: money-tracker, Property 13: Category update persistence
// For any existing category and any valid partial update payload,
// after updating via PUT, retrieving should reflect updated fields
// while preserving unchanged fields.
// Validates: Requirements 5.3
describe("Property 13: Category update persistence", () => {
  it("partial updates persist correctly and preserve unchanged fields", async () => {
    await fc.assert(
      fc.asyncProperty(
        createCategoryArb,
        updateCategoryArb,
        async (createPayload, updatePayload) => {
          sqlite.exec("DELETE FROM categories");

          // Create
          const createRes = await app.request("/api/categories", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(createPayload),
          });
          expect(createRes.status).toBe(201);
          const created = (await createRes.json()) as any;

          // Update
          const updateRes = await app.request(
            `/api/categories/${created.id}`,
            {
              method: "PUT",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(updatePayload),
            }
          );
          expect(updateRes.status).toBe(200);
          const updated = (await updateRes.json()) as any;

          // Verify each field
          expect(updated.title).toBe(
            updatePayload.title ?? createPayload.title
          );
          expect(updated.details).toBe(
            updatePayload.details ?? createPayload.details
          );
          expect(updated.color).toBe(
            updatePayload.color ?? createPayload.color
          );
          expect(updated.icon).toBe(
            updatePayload.icon ?? createPayload.icon
          );

          // Verify persistence via GET
          const listRes = await app.request("/api/categories");
          const list = (await listRes.json()) as any[];
          const found = list.find((c) => c.id === created.id);
          expect(found).toBeDefined();
          expect(found.title).toBe(updated.title);
          expect(found.details).toBe(updated.details);
          expect(found.color).toBe(updated.color);
          expect(found.icon).toBe(updated.icon);
        }
      ),
      { numRuns: 100 }
    );
  });
});
