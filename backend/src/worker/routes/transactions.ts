import { Hono } from "hono";
import { and, desc, eq, gte, lte, sql } from "drizzle-orm";
import { createDb } from "../../db";
import { accounts, categories, transactions } from "../../db/schema";
import { createTransactionSchema } from "../validators";
import {
  extractDateOnly,
  normalizeTransactionDateInput,
  normalizeTransactionDateQuery,
} from "../utils/transaction-date";
import type { AppEnv } from "../types";

const transactionRoutes = new Hono<AppEnv>();

// GET /api/transactions - List current user's transactions with account context
transactionRoutes.get("/", async (c) => {
  const userId = c.get("user").id;
  const rawFrom = c.req.query("from");
  const rawTo = c.req.query("to");
  const from = normalizeTransactionDateQuery(rawFrom);
  const to = normalizeTransactionDateQuery(rawTo);

  if (rawFrom !== undefined && !from) {
    return c.json({ error: "Invalid 'from' date. Expected YYYY-MM-DD." }, 400);
  }

  if (rawTo !== undefined && !to) {
    return c.json({ error: "Invalid 'to' date. Expected YYYY-MM-DD." }, 400);
  }

  if (from && to && from > to) {
    return c.json({ error: "'from' date must be less than or equal to 'to' date." }, 400);
  }

  const db = createDb(c.env.DB);

  const conditions = [eq(transactions.userId, userId)];
  if (from) {
    conditions.push(gte(sql<string>`substr(${transactions.date}, 1, 10)`, from));
  }
  if (to) {
    conditions.push(lte(sql<string>`substr(${transactions.date}, 1, 10)`, to));
  }

  const rows = await db
    .select({
      id: transactions.id,
      amount: transactions.amount,
      type: transactions.type,
      date: transactions.date,
      description: transactions.description,
      categoryId: transactions.categoryId,
      accountId: transactions.accountId,
      createdAt: transactions.createdAt,
      accountName: accounts.name,
      accountCurrency: accounts.currency,
    })
    .from(transactions)
    .leftJoin(accounts, eq(transactions.accountId, accounts.id))
    .where(and(...conditions))
    .orderBy(desc(transactions.date), desc(transactions.createdAt));

  const normalizedRows = rows.map((row) => ({
    ...row,
    date: extractDateOnly(row.date) ?? row.date,
  }));

  return c.json(normalizedRows);
});

// POST /api/transactions - Create transaction + update account balance
transactionRoutes.post("/", async (c) => {
  const userId = c.get("user").id;
  const body = await c.req.json();
  const parsed = createTransactionSchema.parse(body);
  let normalizedDate: string;
  try {
    normalizedDate = normalizeTransactionDateInput(parsed.date);
  } catch {
    return c.json({ error: "Invalid 'date'. Expected YYYY-MM-DD." }, 400);
  }
  const db = createDb(c.env.DB);

  // Verify account exists AND belongs to current user
  const [account] = await db
    .select()
    .from(accounts)
    .where(and(eq(accounts.id, parsed.accountId), eq(accounts.userId, userId)));

  if (!account) {
    return c.json({ error: "Account not found" }, 404);
  }

  if (parsed.categoryId) {
    const [category] = await db
      .select({ id: categories.id })
      .from(categories)
      .where(and(eq(categories.id, parsed.categoryId), eq(categories.userId, userId)));

    if (!category) {
      return c.json({ error: "Category not found" }, 404);
    }
  }

  const [txn] = await db
    .insert(transactions)
    .values({ ...parsed, date: normalizedDate, categoryId: parsed.categoryId ?? null, userId })
    .returning();

  const balanceDelta = parsed.type === "income" ? parsed.amount : -parsed.amount;
  await db
    .update(accounts)
    .set({
      balance: sql`${accounts.balance} + ${balanceDelta}`,
      updatedAt: new Date().toISOString(),
    })
    .where(and(eq(accounts.id, parsed.accountId), eq(accounts.userId, userId)));

  return c.json(
    {
      ...txn,
      date: extractDateOnly(txn.date) ?? txn.date,
    },
    201,
  );
});


// DELETE /api/transactions/:id - Delete transaction + reverse balance (only if owned)
transactionRoutes.delete("/:id", async (c) => {
  const userId = c.get("user").id;
  const id = c.req.param("id");
  const db = createDb(c.env.DB);

  const [txn] = await db
    .select()
    .from(transactions)
    .where(and(eq(transactions.id, id), eq(transactions.userId, userId)));

  if (!txn) {
    return c.json({ error: "Transaction not found" }, 404);
  }

  await db
    .delete(transactions)
    .where(and(eq(transactions.id, id), eq(transactions.userId, userId)));

  const reverseDelta = txn.type === "income" ? -txn.amount : txn.amount;
  await db
    .update(accounts)
    .set({
      balance: sql`${accounts.balance} + ${reverseDelta}`,
      updatedAt: new Date().toISOString(),
    })
    .where(and(eq(accounts.id, txn.accountId), eq(accounts.userId, userId)));

  return c.json({ success: true });
});

export { transactionRoutes };
