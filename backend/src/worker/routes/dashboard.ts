import { Hono } from "hono";
import { and, eq, gte, lte, sql } from "drizzle-orm";
import { createDb } from "../../db";
import { accounts, transactions } from "../../db/schema";
import { normalizeTransactionDateQuery } from "../utils/transaction-date";
import type { AppEnv } from "../types";

const dashboardRoutes = new Hono<AppEnv>();

// GET /api/dashboard/balances - Balances grouped by currency (current user only)
dashboardRoutes.get("/balances", async (c) => {
  const userId = c.get("user").id;
  const db = createDb(c.env.DB);
  const userAccounts = await db.select().from(accounts).where(eq(accounts.userId, userId));

  const grouped: Record<
    string,
    {
      currency: string;
      totalBalance: number;
      accounts: Array<{ id: string; name: string; balance: number }>;
    }
  > = {};

  for (const acct of userAccounts) {
    if (!grouped[acct.currency]) {
      grouped[acct.currency] = {
        currency: acct.currency,
        totalBalance: 0,
        accounts: [],
      };
    }
    grouped[acct.currency].totalBalance += acct.balance;
    grouped[acct.currency].accounts.push({
      id: acct.id,
      name: acct.name,
      balance: acct.balance,
    });
  }

  return c.json(Object.values(grouped));
});

// GET /api/dashboard/chart - Income/expense aggregation by month (current user only)
dashboardRoutes.get("/chart", async (c) => {
  const userId = c.get("user").id;
  const rawFrom = c.req.query("from");
  const rawTo = c.req.query("to");
  const from = normalizeTransactionDateQuery(rawFrom);
  const to = normalizeTransactionDateQuery(rawTo);
  const accountId = c.req.query("accountId");

  if (!rawFrom || !rawTo) {
    return c.json({ error: "Missing 'from' and 'to' query parameters" }, 400);
  }

  if (!from || !to) {
    return c.json(
      { error: "Invalid date range. Expected YYYY-MM-DD values for 'from' and 'to'." },
      400,
    );
  }

  if (from > to) {
    return c.json({ error: "'from' date must be less than or equal to 'to' date." }, 400);
  }

  const db = createDb(c.env.DB);

  const conditions = [
    eq(transactions.userId, userId),
    gte(sql<string>`substr(${transactions.date}, 1, 10)`, from),
    lte(sql<string>`substr(${transactions.date}, 1, 10)`, to),
  ];
  if (accountId) {
    conditions.push(eq(transactions.accountId, accountId));
  }

  const rows = await db
    .select({
      month: sql<string>`substr(${transactions.date}, 1, 7)`.as("month"),
      type: transactions.type,
      total: sql<number>`sum(${transactions.amount})`.as("total"),
    })
    .from(transactions)
    .where(and(...conditions))
    .groupBy(sql`substr(${transactions.date}, 1, 7)`, transactions.type);

  // Pivot rows into { month, income, expense } format
  const chartMap: Record<string, { month: string; income: number; expense: number }> = {};

  for (const row of rows) {
    if (!chartMap[row.month]) {
      chartMap[row.month] = { month: row.month, income: 0, expense: 0 };
    }
    if (row.type === "income") {
      chartMap[row.month].income = row.total;
    } else {
      chartMap[row.month].expense = row.total;
    }
  }

  const chartData = Object.values(chartMap).sort((a, b) =>
    a.month.localeCompare(b.month)
  );

  return c.json(chartData);
});

export { dashboardRoutes };
