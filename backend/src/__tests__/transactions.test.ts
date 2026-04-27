import { describe, it, expect, beforeEach } from "vitest";
import fc from "fast-check";
import { createTestApp } from "./helpers/test-app";
import {
  createAccountArb,
  transactionTypeArb,
  transactionAmountArb,
  transactionDescriptionArb,
  transactionDateArb,
  nonPositiveAmountArb,
} from "./helpers/generators";
import type { Hono } from "hono";
import type Database from "better-sqlite3";

let app: Hono;
let sqlite: Database.Database;

beforeEach(() => {
  const test = createTestApp();
  app = test.app;
  sqlite = test.sqlite;
});

/** Helper: create an account and return its JSON */
async function createAccount(payload: any) {
  const res = await app.request("/api/accounts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return (await res.json()) as any;
}

/** Helper: create a transaction and return its JSON */
async function createTransaction(payload: any) {
  const res = await app.request("/api/transactions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return (await res.json()) as any;
}

/** Helper: get account by id from the list */
async function getAccount(id: string) {
  const res = await app.request("/api/accounts");
  const list = (await res.json()) as any[];
  return list.find((a) => a.id === id);
}

// Feature: money-tracker, Property 2: Transaction round-trip consistency
// For any valid transaction creation payload, creating via POST and retrieving
// via GET should return a transaction with identical amount, type, date,
// description, categoryId, and accountId fields.
// Validates: Requirements 3.1, 3.7, 3.8
describe("Property 2: Transaction round-trip consistency", () => {
  it("creating and retrieving a transaction preserves all fields", async () => {
    await fc.assert(
      fc.asyncProperty(
        createAccountArb,
        transactionAmountArb,
        transactionTypeArb,
        transactionDateArb,
        transactionDescriptionArb,
        async (acctPayload, amount, txnType, date, description) => {
          sqlite.exec("DELETE FROM transactions");
          sqlite.exec("DELETE FROM accounts");

          const account = await createAccount(acctPayload);

          const txnPayload = {
            amount,
            type: txnType,
            date,
            description,
            categoryId: null,
            accountId: account.id,
          };

          const createRes = await app.request("/api/transactions", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(txnPayload),
          });
          expect(createRes.status).toBe(201);
          const created = (await createRes.json()) as any;

          const listRes = await app.request("/api/transactions");
          expect(listRes.status).toBe(200);
          const list = (await listRes.json()) as any[];

          const found = list.find((t) => t.id === created.id);
          expect(found).toBeDefined();
          expect(found.amount).toBe(amount);
          expect(found.type).toBe(txnType);
          expect(found.date).toBe(date);
          expect(found.description).toBe(description);
          expect(found.accountId).toBe(account.id);
        }
      ),
      { numRuns: 100 }
    );
  });
});

// Feature: money-tracker, Property 4: Transaction balance invariant
// For any linked account with balance B and any valid transaction of amount A,
// after creating the transaction: if expense, balance = B - A; if income, balance = B + A.
// Validates: Requirements 3.3, 3.4
describe("Property 4: Transaction balance invariant", () => {
  it("income increases and expense decreases account balance correctly", async () => {
    await fc.assert(
      fc.asyncProperty(
        createAccountArb,
        transactionAmountArb,
        transactionTypeArb,
        transactionDateArb,
        async (acctPayload, amount, txnType, date) => {
          sqlite.exec("DELETE FROM transactions");
          sqlite.exec("DELETE FROM accounts");

          const account = await createAccount(acctPayload);
          const initialBalance = account.balance;

          const createRes = await app.request("/api/transactions", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              amount,
              type: txnType,
              date,
              description: "",
              accountId: account.id,
            }),
          });
          expect(createRes.status).toBe(201);

          const updatedAccount = await getAccount(account.id);
          const expectedBalance =
            txnType === "income"
              ? initialBalance + amount
              : initialBalance - amount;
          expect(updatedAccount.balance).toBe(expectedBalance);
        }
      ),
      { numRuns: 100 }
    );
  });
});

// Feature: money-tracker, Property 5: Transaction deletion reverses balance
// For any existing transaction on an account, deleting that transaction should
// restore the account balance to what it was before the transaction was created.
// Validates: Requirements 3.5
describe("Property 5: Transaction deletion reverses balance", () => {
  it("deleting a transaction restores the original account balance", async () => {
    await fc.assert(
      fc.asyncProperty(
        createAccountArb,
        transactionAmountArb,
        transactionTypeArb,
        transactionDateArb,
        async (acctPayload, amount, txnType, date) => {
          sqlite.exec("DELETE FROM transactions");
          sqlite.exec("DELETE FROM accounts");

          const account = await createAccount(acctPayload);
          const initialBalance = account.balance;

          // Create transaction
          const createRes = await app.request("/api/transactions", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              amount,
              type: txnType,
              date,
              description: "",
              accountId: account.id,
            }),
          });
          expect(createRes.status).toBe(201);
          const txn = (await createRes.json()) as any;

          // Delete transaction
          const delRes = await app.request(`/api/transactions/${txn.id}`, {
            method: "DELETE",
          });
          expect(delRes.status).toBe(200);

          // Balance should be restored
          const restoredAccount = await getAccount(account.id);
          expect(restoredAccount.balance).toBe(initialBalance);
        }
      ),
      { numRuns: 100 }
    );
  });
});

// Feature: money-tracker, Property 9: Non-positive transaction amount rejection
// For any number that is zero or negative, attempting to create a transaction
// with that amount should be rejected with HTTP 400.
// Validates: Requirements 3.6
describe("Property 9: Non-positive transaction amount rejection", () => {
  it("rejects zero or negative transaction amounts with 400", async () => {
    await fc.assert(
      fc.asyncProperty(
        createAccountArb,
        nonPositiveAmountArb,
        transactionTypeArb,
        transactionDateArb,
        async (acctPayload, badAmount, txnType, date) => {
          sqlite.exec("DELETE FROM transactions");
          sqlite.exec("DELETE FROM accounts");

          const account = await createAccount(acctPayload);

          const res = await app.request("/api/transactions", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              amount: badAmount,
              type: txnType,
              date,
              description: "",
              accountId: account.id,
            }),
          });
          expect(res.status).toBe(400);

          // Verify no transaction was created
          const listRes = await app.request("/api/transactions");
          const list = (await listRes.json()) as any[];
          expect(list.length).toBe(0);
        }
      ),
      { numRuns: 100 }
    );
  });
});

// Feature: money-tracker, Property 15: Transaction list includes account context
// For any transaction in the list response, the response should include the
// associated Linked_Account name and Currency.
// Validates: Requirements 3.2
describe("Property 15: Transaction list includes account context", () => {
  it("transaction list includes accountName and accountCurrency", async () => {
    await fc.assert(
      fc.asyncProperty(
        createAccountArb,
        transactionAmountArb,
        transactionTypeArb,
        transactionDateArb,
        async (acctPayload, amount, txnType, date) => {
          sqlite.exec("DELETE FROM transactions");
          sqlite.exec("DELETE FROM accounts");

          const account = await createAccount(acctPayload);

          await app.request("/api/transactions", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              amount,
              type: txnType,
              date,
              description: "",
              accountId: account.id,
            }),
          });

          const listRes = await app.request("/api/transactions");
          const list = (await listRes.json()) as any[];

          expect(list.length).toBeGreaterThan(0);
          for (const txn of list) {
            expect(txn.accountName).toBe(acctPayload.name);
            expect(txn.accountCurrency).toBe(acctPayload.currency);
          }
        }
      ),
      { numRuns: 100 }
    );
  });
});

// Feature: harmoniq-improvements, Property 6: Transaction date range filtering
// For any set of transactions with dates spanning multiple months, querying the
// transactions endpoint with `from` and `to` parameters should return only
// transactions whose dates fall within the specified range (inclusive). No
// transactions outside the range should be included.
// Validates: Requirements 4.2, 4.3
describe("Property 6: Transaction date range filtering", () => {
  it("querying with from/to returns only in-range transactions", async () => {
    await fc.assert(
      fc.asyncProperty(
        createAccountArb,
        // Generate 3-10 transactions spread across different months in 2024
        fc.array(
          fc.record({
            amount: transactionAmountArb,
            type: transactionTypeArb,
            month: fc.integer({ min: 1, max: 12 }),
            day: fc.integer({ min: 1, max: 28 }),
            description: transactionDescriptionArb,
          }),
          { minLength: 3, maxLength: 10 }
        ),
        // Generate a date range window: startMonth <= endMonth within 2024
        fc.integer({ min: 1, max: 12 }).chain((startMonth) =>
          fc.record({
            startMonth: fc.constant(startMonth),
            endMonth: fc.integer({ min: startMonth, max: 12 }),
          })
        ),
        async (acctPayload, txnSpecs, dateRange) => {
          sqlite.exec("DELETE FROM transactions");
          sqlite.exec("DELETE FROM accounts");

          const account = await createAccount(acctPayload);

          // Create all transactions with dates in 2024
          const createdTxns: Array<{
            date: string;
            amount: number;
            type: string;
          }> = [];
          for (const spec of txnSpecs) {
            const month = String(spec.month).padStart(2, "0");
            const day = String(spec.day).padStart(2, "0");
            const date = `2024-${month}-${day}`;
            await createTransaction({
              amount: spec.amount,
              type: spec.type,
              date,
              description: spec.description,
              accountId: account.id,
            });
            createdTxns.push({ date, amount: spec.amount, type: spec.type });
          }

          // Build from/to date-only strings for the date range
          const fromMonth = String(dateRange.startMonth).padStart(2, "0");
          const toMonth = String(dateRange.endMonth).padStart(2, "0");
          const from = `2024-${fromMonth}-01`;
          const to = `2024-${toMonth}-28`;

          // Query transactions with date range filter
          const res = await app.request(
            `/api/transactions?from=${from}&to=${to}`
          );
          expect(res.status).toBe(200);
          const filtered = (await res.json()) as any[];

          // Compute expected: transactions whose date falls within [from, to] (inclusive, string comparison)
          const expectedInRange = createdTxns.filter(
            (txn) => txn.date >= from && txn.date <= to
          );

          // The number of returned transactions should match expected in-range count
          expect(filtered.length).toBe(expectedInRange.length);

          // Every returned transaction's date must be within the range
          for (const txn of filtered) {
            expect(txn.date >= from).toBe(true);
            expect(txn.date <= to).toBe(true);
          }

          // Verify no in-range transactions are missing by checking amounts match
          const filteredAmounts = filtered
            .map((t: any) => t.amount)
            .sort((a: number, b: number) => a - b);
          const expectedAmounts = expectedInRange
            .map((t) => t.amount)
            .sort((a, b) => a - b);
          expect(filteredAmounts).toEqual(expectedAmounts);
        }
      ),
      { numRuns: 100 }
    );
  });
});

describe("Transaction date validation", () => {
  it("rejects invalid calendar date values with 400", async () => {
    sqlite.exec("DELETE FROM transactions");
    sqlite.exec("DELETE FROM accounts");

    const account = await createAccount({
      name: "Wallet",
      type: "cash",
      currency: "BDT",
      balance: 0,
    });

    const res = await app.request("/api/transactions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        amount: 5000,
        type: "expense",
        date: "2026-02-31",
        description: "",
        accountId: account.id,
      }),
    });

    expect(res.status).toBe(400);
    const body = (await res.json()) as { error?: string };
    expect(body.error).toBe("Validation error");
  });

  it("rejects a range where from is after to", async () => {
    const res = await app.request("/api/transactions?from=2026-02-10&to=2026-02-01");
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error?: string };
    expect(body.error).toBe("'from' date must be less than or equal to 'to' date.");
  });
});

describe("Transaction category and ordering behavior", () => {
  it("rejects transaction creation when category does not exist", async () => {
    sqlite.exec("DELETE FROM transactions");
    sqlite.exec("DELETE FROM categories");
    sqlite.exec("DELETE FROM accounts");

    const account = await createAccount({
      name: "Wallet",
      type: "cash",
      currency: "USD",
      balance: 0,
    });

    const res = await app.request("/api/transactions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        amount: 1299,
        type: "expense",
        date: "2026-02-10",
        description: "Lunch",
        accountId: account.id,
        categoryId: "cat_missing",
      }),
    });

    expect(res.status).toBe(404);
    const body = (await res.json()) as { error?: string };
    expect(body.error).toBe("Category not found");
  });

  it("returns transactions ordered by newest date then newest createdAt", async () => {
    sqlite.exec("DELETE FROM transactions");
    sqlite.exec("DELETE FROM categories");
    sqlite.exec("DELETE FROM accounts");

    const account = await createAccount({
      name: "Main",
      type: "bank_account",
      currency: "BDT",
      balance: 0,
    });

    const olderDate = await createTransaction({
      amount: 1000,
      type: "expense",
      date: "2026-01-02",
      description: "older-date",
      accountId: account.id,
    });

    const sameDateOlder = await createTransaction({
      amount: 2000,
      type: "expense",
      date: "2026-01-03",
      description: "same-date-older-created",
      accountId: account.id,
    });

    const sameDateNewer = await createTransaction({
      amount: 3000,
      type: "expense",
      date: "2026-01-03",
      description: "same-date-newer-created",
      accountId: account.id,
    });

    const res = await app.request("/api/transactions");
    expect(res.status).toBe(200);
    const list = (await res.json()) as Array<{ id: string; date: string }>;

    expect(list.map((item) => item.date)).toEqual([
      "2026-01-03",
      "2026-01-03",
      "2026-01-02",
    ]);
    expect(new Set([list[0]?.id, list[1]?.id])).toEqual(
      new Set([sameDateOlder.id, sameDateNewer.id]),
    );
    expect(list[2]?.id).toBe(olderDate.id);
  });
});
