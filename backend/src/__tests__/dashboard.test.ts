import { describe, it, expect, beforeEach } from "vitest";
import fc from "fast-check";
import { createTestApp } from "./helpers/test-app";
import {
  createAccountArb,
  currencyArb,
  transactionAmountArb,
  transactionTypeArb,
  updateProfileArb,
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

async function createAccount(payload: any) {
  const res = await app.request("/api/accounts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return (await res.json()) as any;
}

async function createTransaction(payload: any) {
  const res = await app.request("/api/transactions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return (await res.json()) as any;
}

// Feature: money-tracker, Property 10: Dashboard balances grouped by currency
// For any set of linked accounts across multiple currencies, the dashboard
// balances endpoint should return one group per currency present, and each
// group should contain the individual account balances that sum to the group total.
// No cross-currency total should exist.
// Validates: Requirements 4.1, 4.2
describe("Property 10: Dashboard balances grouped by currency", () => {
  it("balances are grouped by currency with correct per-group totals", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(createAccountArb, { minLength: 1, maxLength: 5 }),
        async (accountPayloads) => {
          sqlite.exec("DELETE FROM transactions");
          sqlite.exec("DELETE FROM accounts");

          // Create all accounts
          const created: any[] = [];
          for (const payload of accountPayloads) {
            created.push(await createAccount(payload));
          }

          // Fetch dashboard balances
          const res = await app.request("/api/dashboard/balances");
          expect(res.status).toBe(200);
          const groups = (await res.json()) as any[];

          // Build expected grouping from inputs
          const expected: Record<
            string,
            { total: number; accountIds: Set<string> }
          > = {};
          for (const acct of created) {
            if (!expected[acct.currency]) {
              expected[acct.currency] = { total: 0, accountIds: new Set() };
            }
            expected[acct.currency].total += acct.balance;
            expected[acct.currency].accountIds.add(acct.id);
          }

          // One group per currency present
          expect(groups.length).toBe(Object.keys(expected).length);

          for (const group of groups) {
            const exp = expected[group.currency];
            expect(exp).toBeDefined();

            // Total balance matches sum of individual accounts
            expect(group.totalBalance).toBe(exp.total);

            // Individual accounts are present
            const groupAccountIds = new Set(
              group.accounts.map((a: any) => a.id)
            );
            expect(groupAccountIds).toEqual(exp.accountIds);

            // Each account balance in the group matches
            for (const ga of group.accounts) {
              const original = created.find((c) => c.id === ga.id);
              expect(ga.balance).toBe(original.balance);
            }
          }

          // No cross-currency total field exists on the response
          // (response is an array of groups, not an object with a total)
          expect(Array.isArray(groups)).toBe(true);
        }
      ),
      { numRuns: 100 }
    );
  });
});

// Feature: money-tracker, Property 11: Dashboard chart income/expense aggregation
// For any set of transactions in a given month, the chart data endpoint should
// return income and expense totals that equal the sum of all income transaction
// amounts and the sum of all expense transaction amounts for that month.
// Validates: Requirements 4.3
describe("Property 11: Dashboard chart income/expense aggregation", () => {
  it("chart data aggregates income and expense correctly per month", async () => {
    await fc.assert(
      fc.asyncProperty(
        createAccountArb,
        fc.array(
          fc.record({
            amount: transactionAmountArb,
            type: transactionTypeArb,
            // Generate dates within 2024 for a controlled range
            month: fc.integer({ min: 1, max: 12 }),
            day: fc.integer({ min: 1, max: 28 }),
          }),
          { minLength: 1, maxLength: 5 }
        ),
        async (acctPayload, txnSpecs) => {
          sqlite.exec("DELETE FROM transactions");
          sqlite.exec("DELETE FROM accounts");

          const account = await createAccount(acctPayload);

          // Create transactions with dates in 2024
          for (const spec of txnSpecs) {
            const month = String(spec.month).padStart(2, "0");
            const day = String(spec.day).padStart(2, "0");
            const date = `2024-${month}-${day}`;
            await createTransaction({
              amount: spec.amount,
              type: spec.type,
              date,
              description: "",
              accountId: account.id,
            });
          }

          // Query chart for full year 2024
          const res = await app.request(
            "/api/dashboard/chart?from=2024-01-01&to=2024-12-31"
          );
          expect(res.status).toBe(200);
          const chartData = (await res.json()) as any[];

          // Build expected aggregation
          const expectedByMonth: Record<
            string,
            { income: number; expense: number }
          > = {};
          for (const spec of txnSpecs) {
            const monthKey = `2024-${String(spec.month).padStart(2, "0")}`;
            if (!expectedByMonth[monthKey]) {
              expectedByMonth[monthKey] = { income: 0, expense: 0 };
            }
            expectedByMonth[monthKey][spec.type] += spec.amount;
          }

          // Verify chart data matches expected
          expect(chartData.length).toBe(Object.keys(expectedByMonth).length);

          for (const entry of chartData) {
            const exp = expectedByMonth[entry.month];
            expect(exp).toBeDefined();
            expect(entry.income).toBe(exp.income);
            expect(entry.expense).toBe(exp.expense);
          }
        }
      ),
      { numRuns: 100 }
    );
  });
});

// Feature: money-tracker, Property 14: Profile update round-trip
// For any valid profile update payload (name and optional photoUrl),
// updating the profile and then retrieving it should return the
// updated name and photoUrl.
// Validates: Requirements 6.1
describe("Property 14: Profile update round-trip", () => {
  it("updating and retrieving a profile preserves name and photoUrl", async () => {
    await fc.assert(
      fc.asyncProperty(updateProfileArb, async (payload) => {
        sqlite.exec("DELETE FROM profiles");

        // Update (upsert - creates if not exists)
        const updateRes = await app.request("/api/profile", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        expect([200, 201]).toContain(updateRes.status);

        // Retrieve
        const getRes = await app.request("/api/profile");
        expect(getRes.status).toBe(200);
        const profile = (await getRes.json()) as any;

        expect(profile.name).toBe(payload.name);
        if (payload.photoUrl === null) {
          expect(profile.photoUrl).toBeNull();
        } else if (payload.photoUrl !== undefined) {
          expect(profile.photoUrl).toBe(payload.photoUrl);
        }
      }),
      { numRuns: 100 }
    );
  });

  it("successive updates overwrite previous values", async () => {
    await fc.assert(
      fc.asyncProperty(
        updateProfileArb,
        updateProfileArb,
        async (first, second) => {
          sqlite.exec("DELETE FROM profiles");

          // First update (creates)
          await app.request("/api/profile", {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(first),
          });

          // Second update (overwrites)
          const updateRes = await app.request("/api/profile", {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(second),
          });
          expect(updateRes.status).toBe(200);

          // Retrieve should reflect second update
          const getRes = await app.request("/api/profile");
          const profile = (await getRes.json()) as any;

          expect(profile.name).toBe(second.name);
          if (second.photoUrl === null) {
            expect(profile.photoUrl).toBeNull();
          } else if (second.photoUrl !== undefined) {
            expect(profile.photoUrl).toBe(second.photoUrl);
          }
        }
      ),
      { numRuns: 100 }
    );
  });
});

// Feature: harmoniq-improvements, Property 4: Account-filtered chart aggregation
// For any set of transactions across multiple accounts, querying the chart endpoint
// with a specific accountId should return income and expense totals that equal the
// sum of only that account's income and expense transactions per month. No
// transactions from other accounts should be included.
// Validates: Requirements 3.2, 3.4, 3.5
describe("Property 4: Account-filtered chart aggregation", () => {
  it("chart filtered by accountId returns only that account's data", async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate 2-4 accounts with distinct payloads
        fc.array(createAccountArb, { minLength: 2, maxLength: 4 }),
        // Generate 2-8 transaction specs
        fc.array(
          fc.record({
            amount: transactionAmountArb,
            type: transactionTypeArb,
            month: fc.integer({ min: 1, max: 12 }),
            day: fc.integer({ min: 1, max: 28 }),
            // Index into the accounts array to assign transactions
            accountIndex: fc.nat(),
          }),
          { minLength: 2, maxLength: 8 }
        ),
        async (accountPayloads, txnSpecs) => {
          sqlite.exec("DELETE FROM transactions");
          sqlite.exec("DELETE FROM accounts");

          // Create all accounts
          const createdAccounts: any[] = [];
          for (const payload of accountPayloads) {
            createdAccounts.push(await createAccount(payload));
          }

          // Create transactions distributed across accounts
          const createdTxns: Array<{
            amount: number;
            type: string;
            month: number;
            accountId: string;
          }> = [];
          for (const spec of txnSpecs) {
            const accountIdx = spec.accountIndex % createdAccounts.length;
            const account = createdAccounts[accountIdx];
            const month = String(spec.month).padStart(2, "0");
            const day = String(spec.day).padStart(2, "0");
            const date = `2024-${month}-${day}`;
            await createTransaction({
              amount: spec.amount,
              type: spec.type,
              date,
              description: "",
              accountId: account.id,
            });
            createdTxns.push({
              amount: spec.amount,
              type: spec.type,
              month: spec.month,
              accountId: account.id,
            });
          }

          // Pick one account to filter by
          const targetAccount = createdAccounts[0];

          // Query chart with accountId filter
          const res = await app.request(
            `/api/dashboard/chart?from=2024-01-01&to=2024-12-31&accountId=${targetAccount.id}`
          );
          expect(res.status).toBe(200);
          const chartData = (await res.json()) as Array<{
            month: string;
            income: number;
            expense: number;
          }>;

          // Build expected aggregation from only the target account's transactions
          const expectedByMonth: Record<
            string,
            { income: number; expense: number }
          > = {};
          for (const txn of createdTxns) {
            if (txn.accountId !== targetAccount.id) continue;
            const monthKey = `2024-${String(txn.month).padStart(2, "0")}`;
            if (!expectedByMonth[monthKey]) {
              expectedByMonth[monthKey] = { income: 0, expense: 0 };
            }
            expectedByMonth[monthKey][txn.type as "income" | "expense"] +=
              txn.amount;
          }

          // Number of months in chart should match expected
          expect(chartData.length).toBe(Object.keys(expectedByMonth).length);

          // Each chart entry should match the expected totals
          for (const entry of chartData) {
            const exp = expectedByMonth[entry.month];
            expect(exp).toBeDefined();
            expect(entry.income).toBe(exp!.income);
            expect(entry.expense).toBe(exp!.expense);
          }

          // Also verify no data from other accounts leaked in:
          // Sum all chart income/expense and compare to target account totals
          const chartTotalIncome = chartData.reduce(
            (sum, e) => sum + e.income,
            0
          );
          const chartTotalExpense = chartData.reduce(
            (sum, e) => sum + e.expense,
            0
          );
          const expectedTotalIncome = createdTxns
            .filter(
              (t) => t.accountId === targetAccount.id && t.type === "income"
            )
            .reduce((sum, t) => sum + t.amount, 0);
          const expectedTotalExpense = createdTxns
            .filter(
              (t) => t.accountId === targetAccount.id && t.type === "expense"
            )
            .reduce((sum, t) => sum + t.amount, 0);

          expect(chartTotalIncome).toBe(expectedTotalIncome);
          expect(chartTotalExpense).toBe(expectedTotalExpense);
        }
      ),
      { numRuns: 100 }
    );
  });
});

describe("Dashboard chart date validation", () => {
  it("rejects a chart range where from is after to", async () => {
    const res = await app.request("/api/dashboard/chart?from=2026-02-10&to=2026-02-01");
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error?: string };
    expect(body.error).toBe("'from' date must be less than or equal to 'to' date.");
  });
});
