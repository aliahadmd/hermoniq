import { describe, it, expect, beforeEach } from "vitest";
import fc from "fast-check";
import { createTestApp, type TestDb } from "./helpers/test-app";
import {
  createAccountArb,
  updateAccountArb,
  invalidCurrencyArb,
  invalidAccountTypeArb,
  accountNameArb,
  balanceArb,
  transactionAmountArb,
  transactionTypeArb,
  transactionDateArb,
  transactionDescriptionArb,
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

// Feature: money-tracker, Property 1: Account round-trip consistency
// For any valid account creation payload, creating via POST and retrieving via GET
// should return an account with identical name, type, currency, and balance fields.
// Validates: Requirements 2.1, 2.2, 2.7, 2.8
describe("Property 1: Account round-trip consistency", () => {
  it("creating and retrieving an account preserves all fields", async () => {
    await fc.assert(
      fc.asyncProperty(createAccountArb, async (payload) => {
        // Clear accounts between iterations
        sqlite.exec("DELETE FROM accounts");

        // Create
        const createRes = await app.request("/api/accounts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        expect(createRes.status).toBe(201);
        const created = await createRes.json();

        // Retrieve
        const listRes = await app.request("/api/accounts");
        expect(listRes.status).toBe(200);
        const list = await listRes.json();

        const found = (list as any[]).find((a: any) => a.id === created.id);
        expect(found).toBeDefined();
        expect(found.name).toBe(payload.name);
        expect(found.type).toBe(payload.type);
        expect(found.currency).toBe(payload.currency);
        expect(found.balance).toBe(payload.balance);
      }),
      { numRuns: 100 }
    );
  });
});

// Feature: money-tracker, Property 8: Invalid enum rejection
// For any string not in the valid enum sets, the backend should reject with 400.
// Validates: Requirements 2.5, 2.6
describe("Property 8: Invalid enum rejection", () => {
  it("rejects invalid currency values with 400", async () => {
    await fc.assert(
      fc.asyncProperty(
        accountNameArb,
        invalidCurrencyArb,
        balanceArb,
        async (name, badCurrency, balance) => {
          const res = await app.request("/api/accounts", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              name,
              type: "cash",
              currency: badCurrency,
              balance,
            }),
          });
          expect(res.status).toBe(400);
          const body = await res.json();
          expect((body as any).error).toBe("Validation error");
        }
      ),
      { numRuns: 100 }
    );
  });

  it("rejects invalid account type values with 400", async () => {
    await fc.assert(
      fc.asyncProperty(
        accountNameArb,
        invalidAccountTypeArb,
        balanceArb,
        async (name, badType, balance) => {
          const res = await app.request("/api/accounts", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              name,
              type: badType,
              currency: "BDT",
              balance,
            }),
          });
          expect(res.status).toBe(400);
          const body = await res.json();
          expect((body as any).error).toBe("Validation error");
        }
      ),
      { numRuns: 100 }
    );
  });
});


// Feature: money-tracker, Property 6: Account deletion cascades to transactions
// For any linked account with one or more associated transactions, deleting the
// account should result in both the account and all its associated transactions
// being absent from subsequent list queries.
// Validates: Requirements 2.4
describe("Property 6: Account deletion cascades to transactions", () => {
  it("deleting an account removes the account and all its transactions", async () => {
    await fc.assert(
      fc.asyncProperty(
        createAccountArb,
        fc.array(
          fc.record({
            amount: transactionAmountArb,
            type: transactionTypeArb,
            date: transactionDateArb,
            description: transactionDescriptionArb,
          }),
          { minLength: 1, maxLength: 5 }
        ),
        async (acctPayload, txnPayloads) => {
          sqlite.exec("DELETE FROM transactions");
          sqlite.exec("DELETE FROM accounts");

          // Create account
          const createRes = await app.request("/api/accounts", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(acctPayload),
          });
          expect(createRes.status).toBe(201);
          const account = (await createRes.json()) as any;

          // Create transactions on that account
          const txnIds: string[] = [];
          for (const txn of txnPayloads) {
            const txnRes = await app.request("/api/transactions", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                ...txn,
                categoryId: null,
                accountId: account.id,
              }),
            });
            expect(txnRes.status).toBe(201);
            const created = (await txnRes.json()) as any;
            txnIds.push(created.id);
          }

          // Delete the account
          const delRes = await app.request(`/api/accounts/${account.id}`, {
            method: "DELETE",
          });
          expect(delRes.status).toBe(200);

          // Verify account is gone
          const acctListRes = await app.request("/api/accounts");
          const acctList = (await acctListRes.json()) as any[];
          expect(acctList.find((a: any) => a.id === account.id)).toBeUndefined();

          // Verify all transactions are gone
          const txnListRes = await app.request("/api/transactions");
          const txnList = (await txnListRes.json()) as any[];
          for (const txnId of txnIds) {
            expect(txnList.find((t: any) => t.id === txnId)).toBeUndefined();
          }
        }
      ),
      { numRuns: 100 }
    );
  });
});

// Feature: money-tracker, Property 12: Account update persistence
// For any existing account and any valid partial update payload,
// after updating via PUT, retrieving should reflect updated fields
// while preserving unchanged fields.
// Validates: Requirements 2.3
describe("Property 12: Account update persistence", () => {
  it("partial updates persist correctly and preserve unchanged fields", async () => {
    await fc.assert(
      fc.asyncProperty(
        createAccountArb,
        updateAccountArb,
        async (createPayload, updatePayload) => {
          // Clear accounts between iterations
          sqlite.exec("DELETE FROM accounts");

          // Create the account
          const createRes = await app.request("/api/accounts", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(createPayload),
          });
          expect(createRes.status).toBe(201);
          const created = (await createRes.json()) as any;

          // Update the account
          const updateRes = await app.request(
            `/api/accounts/${created.id}`,
            {
              method: "PUT",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(updatePayload),
            }
          );
          expect(updateRes.status).toBe(200);
          const updated = (await updateRes.json()) as any;

          // Verify updated fields reflect new values
          if (updatePayload.name !== undefined) {
            expect(updated.name).toBe(updatePayload.name);
          } else {
            expect(updated.name).toBe(createPayload.name);
          }

          if (updatePayload.type !== undefined) {
            expect(updated.type).toBe(updatePayload.type);
          } else {
            expect(updated.type).toBe(createPayload.type);
          }

          if (updatePayload.balance !== undefined) {
            expect(updated.balance).toBe(updatePayload.balance);
          } else {
            expect(updated.balance).toBe(createPayload.balance);
          }

          // Currency should never change (not in update schema)
          expect(updated.currency).toBe(createPayload.currency);

          // Verify persistence via GET
          const listRes = await app.request("/api/accounts");
          const list = (await listRes.json()) as any[];
          const found = list.find((a) => a.id === created.id);
          expect(found).toBeDefined();
          expect(found.name).toBe(updated.name);
          expect(found.type).toBe(updated.type);
          expect(found.balance).toBe(updated.balance);
        }
      ),
      { numRuns: 100 }
    );
  });
});
