import { Hono } from "hono";
import { and, eq, sql } from "drizzle-orm";
import { createDb } from "../../db";
import { accounts, categories, monthlyBudgets, transactions } from "../../db/schema";
import {
  createMonthlyBudgetSchema,
  monthSchema,
  updateMonthlyBudgetSchema,
} from "../validators";
import type { AppEnv } from "../types";

const budgetRoutes = new Hono<AppEnv>();

function getCurrentMonth(): string {
  return new Date().toISOString().slice(0, 7);
}

budgetRoutes.get("/", async (c) => {
  const userId = c.get("user").id;
  const queryMonth = c.req.query("month");
  const month = queryMonth ? monthSchema.parse(queryMonth) : getCurrentMonth();
  const db = createDb(c.env.DB);

  const budgets = await db
    .select({
      id: monthlyBudgets.id,
      month: monthlyBudgets.month,
      limit: monthlyBudgets.amountLimit,
      categoryId: monthlyBudgets.categoryId,
      accountId: monthlyBudgets.accountId,
      createdAt: monthlyBudgets.createdAt,
      updatedAt: monthlyBudgets.updatedAt,
      categoryTitle: categories.title,
      categoryColor: categories.color,
      categoryIcon: categories.icon,
      accountName: accounts.name,
      accountCurrency: accounts.currency,
    })
    .from(monthlyBudgets)
    .innerJoin(categories, eq(monthlyBudgets.categoryId, categories.id))
    .innerJoin(accounts, eq(monthlyBudgets.accountId, accounts.id))
    .where(and(eq(monthlyBudgets.userId, userId), eq(monthlyBudgets.month, month)));

  const spendRows = await db
    .select({
      categoryId: transactions.categoryId,
      accountId: transactions.accountId,
      spent: sql<number>`sum(${transactions.amount})`.as("spent"),
    })
    .from(transactions)
    .where(
      and(
        eq(transactions.userId, userId),
        eq(transactions.type, "expense"),
        eq(sql<string>`substr(${transactions.date}, 1, 7)`, month),
        sql`${transactions.categoryId} is not null`,
      ),
    )
    .groupBy(transactions.categoryId, transactions.accountId);

  const spentByAccountCategory = new Map<string, number>();
  for (const row of spendRows) {
    if (!row.categoryId) continue;
    spentByAccountCategory.set(`${row.accountId}:${row.categoryId}`, row.spent ?? 0);
  }

  const items = budgets.map((budget) => {
    const spent = spentByAccountCategory.get(`${budget.accountId}:${budget.categoryId}`) ?? 0;
    const remaining = budget.limit - spent;
    const progressPercent =
      budget.limit > 0
        ? Math.round((spent / budget.limit) * 100)
        : spent > 0
          ? 100
          : 0;

    return {
      ...budget,
      spent,
      remaining,
      progressPercent,
    };
  });

  const accountGroups = new Map<string, typeof items>();
  for (const item of items) {
    const group = accountGroups.get(item.accountId) ?? [];
    group.push(item);
    accountGroups.set(item.accountId, group);
  }

  const accountSummaries = Array.from(accountGroups.entries())
    .map(([accountId, accountItems]) => {
      const firstItem = accountItems[0];
      const accountName = firstItem.accountName;
      const accountCurrency = firstItem.accountCurrency;
      const totalLimit = accountItems.reduce((sum, item) => sum + item.limit, 0);
      const totalSpent = accountItems.reduce((sum, item) => sum + item.spent, 0);
      const totalRemaining = totalLimit - totalSpent;
      const progressPercent =
        totalLimit > 0
          ? Math.round((totalSpent / totalLimit) * 100)
          : totalSpent > 0
            ? 100
            : 0;

      return {
        accountId,
        accountName,
        accountCurrency,
        totalLimit,
        totalSpent,
        totalRemaining,
        progressPercent,
        items: accountItems,
      };
    })
    .sort((a, b) => a.accountName.localeCompare(b.accountName));

  return c.json({
    month,
    accountSummaries,
    items,
  });
});

budgetRoutes.post("/", async (c) => {
  const userId = c.get("user").id;
  const body = await c.req.json();
  const parsed = createMonthlyBudgetSchema.parse(body);
  const db = createDb(c.env.DB);

  const [category] = await db
    .select({ id: categories.id })
    .from(categories)
    .where(and(eq(categories.id, parsed.categoryId), eq(categories.userId, userId)));

  if (!category) {
    return c.json({ error: "Category not found" }, 404);
  }

  const [account] = await db
    .select({ id: accounts.id })
    .from(accounts)
    .where(and(eq(accounts.id, parsed.accountId), eq(accounts.userId, userId)));

  if (!account) {
    return c.json({ error: "Account not found" }, 404);
  }

  const [existing] = await db
    .select({ id: monthlyBudgets.id })
    .from(monthlyBudgets)
    .where(
      and(
        eq(monthlyBudgets.userId, userId),
        eq(monthlyBudgets.month, parsed.month),
        eq(monthlyBudgets.categoryId, parsed.categoryId),
        eq(monthlyBudgets.accountId, parsed.accountId),
      ),
    );

  if (existing) {
    return c.json(
      { error: "Budget already exists for this category, month, and account" },
      409,
    );
  }

  const [budget] = await db
    .insert(monthlyBudgets)
    .values({
      userId,
      month: parsed.month,
      categoryId: parsed.categoryId,
      accountId: parsed.accountId,
      amountLimit: parsed.limit,
    })
    .returning();

  const { amountLimit, ...budgetRest } = budget;
  return c.json(
    {
      ...budgetRest,
      limit: amountLimit,
    },
    201,
  );
});

budgetRoutes.put("/:id", async (c) => {
  const userId = c.get("user").id;
  const id = c.req.param("id");
  const body = await c.req.json();
  const parsed = updateMonthlyBudgetSchema.parse(body);
  const db = createDb(c.env.DB);

  const result = await db
    .update(monthlyBudgets)
    .set({ amountLimit: parsed.limit, updatedAt: new Date().toISOString() })
    .where(and(eq(monthlyBudgets.id, id), eq(monthlyBudgets.userId, userId)))
    .returning();

  if (result.length === 0) {
    return c.json({ error: "Budget not found" }, 404);
  }

  const { amountLimit, ...resultRest } = result[0];
  return c.json({
    ...resultRest,
    limit: amountLimit,
  });
});

budgetRoutes.delete("/:id", async (c) => {
  const userId = c.get("user").id;
  const id = c.req.param("id");
  const db = createDb(c.env.DB);

  const result = await db
    .delete(monthlyBudgets)
    .where(and(eq(monthlyBudgets.id, id), eq(monthlyBudgets.userId, userId)))
    .returning();

  if (result.length === 0) {
    return c.json({ error: "Budget not found" }, 404);
  }

  return c.json({ success: true });
});

export { budgetRoutes };
