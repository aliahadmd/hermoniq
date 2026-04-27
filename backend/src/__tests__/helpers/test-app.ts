import Database from "better-sqlite3";
import { drizzle, BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { and, asc, desc, eq, gte, isNull, lte, sql } from "drizzle-orm";
import { Hono } from "hono";
import * as schema from "../../db/schema";
import { accounts, categories, noteCategories, notes, profiles, transactions } from "../../db/schema";
import {
  createAccountSchema,
  updateAccountSchema,
  createCategorySchema,
  updateCategorySchema,
  createNoteCategorySchema,
  createNoteSchema,
  noteListQuerySchema,
  createTransactionSchema,
  updateNoteCategorySchema,
  updateNoteSchema,
  updateProfileSchema,
} from "../../worker/validators";
import {
  extractDateOnly,
  normalizeTransactionDateInput,
  normalizeTransactionDateQuery,
} from "../../worker/utils/transaction-date";

const MIGRATION_SQL = `
CREATE TABLE IF NOT EXISTS user (
  id text PRIMARY KEY NOT NULL,
  name text NOT NULL,
  email text NOT NULL,
  emailVerified integer NOT NULL DEFAULT 0,
  image text,
  role text DEFAULT 'user',
  banned integer DEFAULT 0,
  banReason text,
  banExpires integer,
  createdAt integer NOT NULL,
  updatedAt integer NOT NULL
);
CREATE TABLE IF NOT EXISTS accounts (
  id text PRIMARY KEY NOT NULL,
  name text NOT NULL,
  type text NOT NULL,
  currency text NOT NULL,
  balance integer DEFAULT 0 NOT NULL,
  user_id text REFERENCES user(id) ON DELETE CASCADE,
  created_at text NOT NULL,
  updated_at text NOT NULL
);
CREATE TABLE IF NOT EXISTS categories (
  id text PRIMARY KEY NOT NULL,
  title text NOT NULL,
  details text DEFAULT '' NOT NULL,
  color text NOT NULL,
  icon text NOT NULL,
  user_id text REFERENCES user(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS profiles (
  id text PRIMARY KEY NOT NULL,
  name text NOT NULL,
  photo_url text,
  username text NOT NULL DEFAULT '',
  about text,
  location text,
  gender text,
  website text,
  work_company text,
  work_position text,
  work_description text,
  education_school text,
  education_degree text,
  education_graduated integer,
  user_id text UNIQUE REFERENCES user(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS transactions (
  id text PRIMARY KEY NOT NULL,
  amount integer NOT NULL,
  type text NOT NULL,
  date text NOT NULL,
  description text DEFAULT '' NOT NULL,
  category_id text,
  account_id text NOT NULL,
  user_id text REFERENCES user(id) ON DELETE CASCADE,
  created_at text NOT NULL,
  FOREIGN KEY (category_id) REFERENCES categories(id) ON UPDATE NO ACTION ON DELETE SET NULL,
  FOREIGN KEY (account_id) REFERENCES accounts(id) ON UPDATE NO ACTION ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS monthly_budgets (
  id text PRIMARY KEY NOT NULL,
  month text NOT NULL,
  amount_limit integer NOT NULL,
  category_id text NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  account_id text NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  user_id text NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  created_at text NOT NULL,
  updated_at text NOT NULL
);
CREATE TABLE IF NOT EXISTS habits (
  id text PRIMARY KEY NOT NULL,
  user_id text NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  name text NOT NULL,
  question text NOT NULL,
  type text NOT NULL,
  color text NOT NULL,
  unit text,
  daily_target integer,
  frequency_type text NOT NULL,
  frequency_days text NOT NULL DEFAULT '[]',
  reminder_enabled integer NOT NULL DEFAULT 0,
  reminder_time text,
  notes text NOT NULL DEFAULT '',
  start_date text NOT NULL,
  archived_at text,
  created_at text NOT NULL,
  updated_at text NOT NULL
);
CREATE TABLE IF NOT EXISTS habit_logs (
  id text PRIMARY KEY NOT NULL,
  habit_id text NOT NULL REFERENCES habits(id) ON DELETE CASCADE,
  user_id text NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  log_date text NOT NULL,
  completed integer NOT NULL DEFAULT 0,
  value integer,
  note text NOT NULL DEFAULT '',
  created_at text NOT NULL,
  updated_at text NOT NULL
);
CREATE TABLE IF NOT EXISTS habit_preferences (
  user_id text PRIMARY KEY NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  week_start text NOT NULL DEFAULT 'device',
  default_filter text NOT NULL DEFAULT 'all',
  timeline_days integer NOT NULL DEFAULT 30,
  show_archived_by_default integer NOT NULL DEFAULT 0,
  require_note_for_completion integer NOT NULL DEFAULT 0,
  reminder_master_enabled integer NOT NULL DEFAULT 1,
  default_reminder_enabled integer NOT NULL DEFAULT 0,
  default_reminder_time text,
  created_at text NOT NULL,
  updated_at text NOT NULL
);
CREATE TABLE IF NOT EXISTS note_categories (
  id text PRIMARY KEY NOT NULL,
  user_id text NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  name text NOT NULL,
  created_at text NOT NULL,
  updated_at text NOT NULL
);
CREATE TABLE IF NOT EXISTS notes (
  id text PRIMARY KEY NOT NULL,
  user_id text NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  title text NOT NULL,
  content text NOT NULL DEFAULT '',
  is_pinned integer NOT NULL DEFAULT 0,
  archived_at text,
  category_id text REFERENCES note_categories(id) ON DELETE SET NULL,
  created_at text NOT NULL,
  updated_at text NOT NULL
);
CREATE TABLE IF NOT EXISTS events (
  id text PRIMARY KEY NOT NULL,
  user_id text NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text NOT NULL DEFAULT '',
  location text NOT NULL DEFAULT '',
  timezone text NOT NULL,
  is_all_day integer NOT NULL DEFAULT 0,
  start_at text NOT NULL,
  end_at text NOT NULL,
  reminder_minutes integer,
  source text NOT NULL DEFAULT 'manual',
  external_uid text,
  created_at text NOT NULL,
  updated_at text NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS user_email_unique ON user(email);
CREATE UNIQUE INDEX IF NOT EXISTS profiles_username_unique ON profiles(username);
CREATE UNIQUE INDEX IF NOT EXISTS monthly_budgets_user_month_account_category_unique ON monthly_budgets(user_id, month, account_id, category_id);
CREATE UNIQUE INDEX IF NOT EXISTS habit_logs_habit_date_unique ON habit_logs(habit_id, log_date);
CREATE UNIQUE INDEX IF NOT EXISTS note_categories_user_name_unique ON note_categories(user_id, name);
CREATE INDEX IF NOT EXISTS habits_user_archived_idx ON habits(user_id, archived_at);
CREATE INDEX IF NOT EXISTS habit_logs_habit_date_idx ON habit_logs(habit_id, log_date);
CREATE INDEX IF NOT EXISTS notes_user_updated_idx ON notes(user_id, updated_at);
CREATE INDEX IF NOT EXISTS notes_user_category_idx ON notes(user_id, category_id);
CREATE INDEX IF NOT EXISTS notes_user_archived_updated_idx ON notes(user_id, archived_at, updated_at);
CREATE INDEX IF NOT EXISTS notes_user_pinned_updated_idx ON notes(user_id, is_pinned, updated_at);
CREATE INDEX IF NOT EXISTS events_user_start_idx ON events(user_id, start_at);
CREATE INDEX IF NOT EXISTS events_user_end_idx ON events(user_id, end_at);
CREATE UNIQUE INDEX IF NOT EXISTS events_user_external_uid_start_unique ON events(user_id, external_uid, start_at);
`;
const TEST_USER_ID = "test-user";

export type TestDb = BetterSQLite3Database<typeof schema>;

export function createTestApp() {
  const sqlite = new Database(":memory:");
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");

  const statements = MIGRATION_SQL.trim().split(";").filter((s) => s.trim());
  for (const stmt of statements) {
    sqlite.exec(stmt);
  }

  const now = Date.now();
  sqlite
    .prepare(
      `INSERT INTO user (id, name, email, emailVerified, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .run(TEST_USER_ID, "Test User", "test@example.com", 1, now, now);

  const db = drizzle(sqlite, { schema });
  const app = buildTestHonoApp(db);

  return { app, db, sqlite };
}

function buildTestHonoApp(db: TestDb) {
  const app = new Hono();

  // Global error handler using Hono's onError
  app.onError((err, c) => {
    if (err && "issues" in err && Array.isArray((err as any).issues)) {
      return c.json(
        { error: "Validation error", details: (err as any).issues },
        400
      );
    }
    if (err instanceof SyntaxError) {
      return c.json({ error: "Invalid request body" }, 400);
    }
    return c.json({ error: "Internal server error" }, 500);
  });

  // GET /api/accounts
  app.get("/api/accounts", async (c) => {
    const allAccounts = await db
      .select()
      .from(accounts)
      .where(eq(accounts.userId, TEST_USER_ID));
    return c.json(allAccounts);
  });

  // POST /api/accounts
  app.post("/api/accounts", async (c) => {
    const body = await c.req.json();
    const parsed = createAccountSchema.parse(body);
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    const values = { ...parsed, id, userId: TEST_USER_ID, createdAt: now, updatedAt: now };
    await db.insert(accounts).values(values);
    const result = await db
      .select()
      .from(accounts)
      .where(and(eq(accounts.id, id), eq(accounts.userId, TEST_USER_ID)));
    return c.json(result[0], 201);
  });

  // PUT /api/accounts/:id
  app.put("/api/accounts/:id", async (c) => {
    const id = c.req.param("id");
    const body = await c.req.json();
    const parsed = updateAccountSchema.parse(body);
    const result = await db
      .update(accounts)
      .set({ ...parsed, updatedAt: new Date().toISOString() })
      .where(and(eq(accounts.id, id), eq(accounts.userId, TEST_USER_ID)))
      .returning();
    if (result.length === 0) {
      return c.json({ error: "Account not found" }, 404);
    }
    return c.json(result[0]);
  });

  // DELETE /api/accounts/:id
  app.delete("/api/accounts/:id", async (c) => {
    const id = c.req.param("id");
    const result = await db
      .delete(accounts)
      .where(and(eq(accounts.id, id), eq(accounts.userId, TEST_USER_ID)))
      .returning();
    if (result.length === 0) {
      return c.json({ error: "Account not found" }, 404);
    }
    return c.json({ success: true });
  });

  // --- Category routes ---

  // GET /api/categories
  app.get("/api/categories", async (c) => {
    const allCategories = await db
      .select()
      .from(categories)
      .where(eq(categories.userId, TEST_USER_ID));
    return c.json(allCategories);
  });

  // POST /api/categories
  app.post("/api/categories", async (c) => {
    const body = await c.req.json();
    const parsed = createCategorySchema.parse(body);
    const id = crypto.randomUUID();
    const values = { ...parsed, id, userId: TEST_USER_ID };
    await db.insert(categories).values(values);
    const result = await db
      .select()
      .from(categories)
      .where(and(eq(categories.id, id), eq(categories.userId, TEST_USER_ID)));
    return c.json(result[0], 201);
  });

  // PUT /api/categories/:id
  app.put("/api/categories/:id", async (c) => {
    const id = c.req.param("id");
    const body = await c.req.json();
    const parsed = updateCategorySchema.parse(body);
    const result = await db
      .update(categories)
      .set(parsed)
      .where(and(eq(categories.id, id), eq(categories.userId, TEST_USER_ID)))
      .returning();
    if (result.length === 0) {
      return c.json({ error: "Category not found" }, 404);
    }
    return c.json(result[0]);
  });

  // DELETE /api/categories/:id
  app.delete("/api/categories/:id", async (c) => {
    const id = c.req.param("id");
    // Uncategorize associated transactions
    await db
      .update(transactions)
      .set({ categoryId: null })
      .where(and(eq(transactions.categoryId, id), eq(transactions.userId, TEST_USER_ID)));
    const result = await db
      .delete(categories)
      .where(and(eq(categories.id, id), eq(categories.userId, TEST_USER_ID)))
      .returning();
    if (result.length === 0) {
      return c.json({ error: "Category not found" }, 404);
    }
    return c.json({ success: true });
  });

  // --- Note routes ---
  const DEFAULT_NOTE_CATEGORIES = ["Personal", "Work", "Ideas"] as const;

  const ensureDefaultNoteCategories = async () => {
    const existing = await db
      .select({ id: noteCategories.id })
      .from(noteCategories)
      .where(eq(noteCategories.userId, TEST_USER_ID))
      .limit(1);

    if (existing.length > 0) return;

    const now = new Date().toISOString();
    await db.insert(noteCategories).values(
      DEFAULT_NOTE_CATEGORIES.map((name) => ({
        userId: TEST_USER_ID,
        name,
        createdAt: now,
        updatedAt: now,
      })),
    );
  };

  // GET /api/notes/categories
  app.get("/api/notes/categories", async (c) => {
    await ensureDefaultNoteCategories();
    const allCategories = await db
      .select()
      .from(noteCategories)
      .where(eq(noteCategories.userId, TEST_USER_ID))
      .orderBy(noteCategories.name);
    return c.json(allCategories);
  });

  // POST /api/notes/categories
  app.post("/api/notes/categories", async (c) => {
    const body = await c.req.json();
    const parsed = createNoteCategorySchema.parse(body);
    const name = parsed.name.trim();
    if (name.length === 0) {
      return c.json({ error: "Category name is required" }, 400);
    }

    const [duplicate] = await db
      .select({ id: noteCategories.id })
      .from(noteCategories)
      .where(and(eq(noteCategories.userId, TEST_USER_ID), eq(noteCategories.name, name)));

    if (duplicate) {
      return c.json({ error: "Category already exists" }, 409);
    }

    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    const values = { id, userId: TEST_USER_ID, name, createdAt: now, updatedAt: now };
    await db.insert(noteCategories).values(values);
    const [created] = await db
      .select()
      .from(noteCategories)
      .where(eq(noteCategories.id, id));
    return c.json(created, 201);
  });

  // PUT /api/notes/categories/:id
  app.put("/api/notes/categories/:id", async (c) => {
    const id = c.req.param("id");
    const body = await c.req.json();
    const parsed = updateNoteCategorySchema.parse(body);
    const name = parsed.name.trim();
    if (name.length === 0) {
      return c.json({ error: "Category name is required" }, 400);
    }

    const [existing] = await db
      .select({ id: noteCategories.id })
      .from(noteCategories)
      .where(and(eq(noteCategories.id, id), eq(noteCategories.userId, TEST_USER_ID)));

    if (!existing) {
      return c.json({ error: "Category not found" }, 404);
    }

    const [duplicate] = await db
      .select({ id: noteCategories.id })
      .from(noteCategories)
      .where(and(eq(noteCategories.userId, TEST_USER_ID), eq(noteCategories.name, name)));
    if (duplicate && duplicate.id !== id) {
      return c.json({ error: "Category already exists" }, 409);
    }

    const [updated] = await db
      .update(noteCategories)
      .set({ name, updatedAt: new Date().toISOString() })
      .where(and(eq(noteCategories.id, id), eq(noteCategories.userId, TEST_USER_ID)))
      .returning();

    return c.json(updated);
  });

  // DELETE /api/notes/categories/:id
  app.delete("/api/notes/categories/:id", async (c) => {
    const id = c.req.param("id");
    const [existing] = await db
      .select({ id: noteCategories.id })
      .from(noteCategories)
      .where(and(eq(noteCategories.id, id), eq(noteCategories.userId, TEST_USER_ID)));
    if (!existing) {
      return c.json({ error: "Category not found" }, 404);
    }

    await db
      .update(notes)
      .set({ categoryId: null, updatedAt: new Date().toISOString() })
      .where(and(eq(notes.categoryId, id), eq(notes.userId, TEST_USER_ID)));

    await db
      .delete(noteCategories)
      .where(and(eq(noteCategories.id, id), eq(noteCategories.userId, TEST_USER_ID)));
    return c.json({ success: true });
  });

  const parseBooleanQuery = (value: string | undefined) => {
    if (value === undefined) return undefined;
    const normalized = value.trim().toLowerCase();
    if (normalized === "true" || normalized === "1") return true;
    if (normalized === "false" || normalized === "0") return false;
    return undefined;
  };

  const parseSortQuery = (value: string | undefined) => {
    if (value === "updated_desc" || value === "title_asc") {
      return value;
    }
    return undefined;
  };

  const getNoteById = async (id: string) => {
    const [row] = await db
      .select({
        id: notes.id,
        userId: notes.userId,
        title: notes.title,
        content: notes.content,
        isPinned: notes.isPinned,
        archivedAt: notes.archivedAt,
        categoryId: notes.categoryId,
        categoryName: noteCategories.name,
        createdAt: notes.createdAt,
        updatedAt: notes.updatedAt,
      })
      .from(notes)
      .leftJoin(
        noteCategories,
        and(eq(notes.categoryId, noteCategories.id), eq(noteCategories.userId, TEST_USER_ID)),
      )
      .where(and(eq(notes.id, id), eq(notes.userId, TEST_USER_ID)));

    return row;
  };

  const updateAndReturnNote = async (id: string, updates: Partial<typeof notes.$inferInsert>) => {
    const updated = await db
      .update(notes)
      .set({ ...updates, updatedAt: new Date().toISOString() })
      .where(and(eq(notes.id, id), eq(notes.userId, TEST_USER_ID)))
      .returning({ id: notes.id });

    if (updated.length === 0) {
      return null;
    }

    return getNoteById(id);
  };

  // GET /api/notes
  app.get("/api/notes", async (c) => {
    const parsed = noteListQuerySchema.parse({
      q: c.req.query("q") ?? undefined,
      categoryId: c.req.query("categoryId") ?? undefined,
      includeArchived: parseBooleanQuery(c.req.query("includeArchived")),
      pinnedOnly: parseBooleanQuery(c.req.query("pinnedOnly")),
      sort: parseSortQuery(c.req.query("sort")),
    });
    const conditions = [eq(notes.userId, TEST_USER_ID)];
    if (!(parsed.includeArchived ?? false)) {
      conditions.push(isNull(notes.archivedAt));
    }
    if (parsed.pinnedOnly) {
      conditions.push(eq(notes.isPinned, true));
    }
    if (parsed.categoryId) {
      conditions.push(eq(notes.categoryId, parsed.categoryId));
    }
    const normalizedQuery = parsed.q?.trim();
    if (normalizedQuery) {
      const pattern = `%${normalizedQuery.toLowerCase().replace(/[\\%_]/g, "\\$&")}%`;
      conditions.push(
        sql`(lower(${notes.title}) like ${pattern} escape '\\' or lower(${notes.content}) like ${pattern} escape '\\')`,
      );
    }

    const query = db
      .select({
        id: notes.id,
        userId: notes.userId,
        title: notes.title,
        content: notes.content,
        isPinned: notes.isPinned,
        archivedAt: notes.archivedAt,
        categoryId: notes.categoryId,
        categoryName: noteCategories.name,
        createdAt: notes.createdAt,
        updatedAt: notes.updatedAt,
      })
      .from(notes)
      .leftJoin(
        noteCategories,
        and(eq(notes.categoryId, noteCategories.id), eq(noteCategories.userId, TEST_USER_ID)),
      )
      .where(and(...conditions));

    if (parsed.sort === "title_asc") {
      const rows = await query.orderBy(
        desc(notes.isPinned),
        asc(sql`lower(${notes.title})`),
        desc(notes.updatedAt),
      );
      return c.json(rows);
    }

    const rows = await query.orderBy(desc(notes.isPinned), desc(notes.updatedAt));
    return c.json(rows);
  });

  // GET /api/notes/:id
  app.get("/api/notes/:id", async (c) => {
    const id = c.req.param("id");
    const row = await getNoteById(id);

    if (!row) {
      return c.json({ error: "Note not found" }, 404);
    }

    return c.json(row);
  });

  // POST /api/notes
  app.post("/api/notes", async (c) => {
    const body = await c.req.json();
    const parsed = createNoteSchema.parse(body);
    const title = parsed.title.trim();
    if (title.length === 0) {
      return c.json({ error: "Title is required" }, 400);
    }

    if (parsed.categoryId) {
      const [category] = await db
        .select({ id: noteCategories.id })
        .from(noteCategories)
        .where(and(eq(noteCategories.id, parsed.categoryId), eq(noteCategories.userId, TEST_USER_ID)));
      if (!category) {
        return c.json({ error: "Category not found" }, 404);
      }
    }

    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    await db.insert(notes).values({
      id,
      userId: TEST_USER_ID,
      title,
      content: parsed.content,
      categoryId: parsed.categoryId ?? null,
      createdAt: now,
      updatedAt: now,
    });

    const created = await getNoteById(id);
    return c.json(created, 201);
  });

  // PUT /api/notes/:id
  app.put("/api/notes/:id", async (c) => {
    const id = c.req.param("id");
    const body = await c.req.json();
    const parsed = updateNoteSchema.parse(body);

    const [existing] = await db
      .select({ id: notes.id })
      .from(notes)
      .where(and(eq(notes.id, id), eq(notes.userId, TEST_USER_ID)));

    if (!existing) {
      return c.json({ error: "Note not found" }, 404);
    }

    const title = parsed.title?.trim();
    if (title !== undefined && title.length === 0) {
      return c.json({ error: "Title is required" }, 400);
    }

    if (parsed.categoryId !== undefined && parsed.categoryId !== null) {
      const [category] = await db
        .select({ id: noteCategories.id })
        .from(noteCategories)
        .where(and(eq(noteCategories.id, parsed.categoryId), eq(noteCategories.userId, TEST_USER_ID)));
      if (!category) {
        return c.json({ error: "Category not found" }, 404);
      }
    }

    const updates: Partial<typeof notes.$inferInsert> = {};
    if (title !== undefined) {
      updates.title = title;
    }
    if (parsed.content !== undefined) {
      updates.content = parsed.content;
    }
    if (parsed.categoryId !== undefined) {
      updates.categoryId = parsed.categoryId;
    }
    if (parsed.isPinned !== undefined) {
      updates.isPinned = parsed.isPinned;
    }
    if (parsed.archivedAt !== undefined) {
      updates.archivedAt = parsed.archivedAt;
    }

    const updated = await updateAndReturnNote(id, updates);
    return c.json(updated);
  });

  // PATCH /api/notes/:id/pin
  app.patch("/api/notes/:id/pin", async (c) => {
    const id = c.req.param("id");
    const updated = await updateAndReturnNote(id, { isPinned: true });
    if (!updated) {
      return c.json({ error: "Note not found" }, 404);
    }
    return c.json(updated);
  });

  // PATCH /api/notes/:id/unpin
  app.patch("/api/notes/:id/unpin", async (c) => {
    const id = c.req.param("id");
    const updated = await updateAndReturnNote(id, { isPinned: false });
    if (!updated) {
      return c.json({ error: "Note not found" }, 404);
    }
    return c.json(updated);
  });

  // PATCH /api/notes/:id/archive
  app.patch("/api/notes/:id/archive", async (c) => {
    const id = c.req.param("id");
    const updated = await updateAndReturnNote(id, {
      archivedAt: new Date().toISOString(),
      isPinned: false,
    });
    if (!updated) {
      return c.json({ error: "Note not found" }, 404);
    }
    return c.json(updated);
  });

  // PATCH /api/notes/:id/unarchive
  app.patch("/api/notes/:id/unarchive", async (c) => {
    const id = c.req.param("id");
    const updated = await updateAndReturnNote(id, { archivedAt: null });
    if (!updated) {
      return c.json({ error: "Note not found" }, 404);
    }
    return c.json(updated);
  });

  // DELETE /api/notes/:id
  app.delete("/api/notes/:id", async (c) => {
    const id = c.req.param("id");
    const result = await db
      .delete(notes)
      .where(and(eq(notes.id, id), eq(notes.userId, TEST_USER_ID)))
      .returning();

    if (result.length === 0) {
      return c.json({ error: "Note not found" }, 404);
    }

    return c.json({ success: true });
  });

  // --- Transaction routes ---

  // GET /api/transactions - List with account context (join)
  // Optional query params: from (YYYY-MM-DD), to (YYYY-MM-DD) for date range filtering
  app.get("/api/transactions", async (c) => {
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

    const conditions = [eq(transactions.userId, TEST_USER_ID)];
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

    return c.json(
      rows.map((row) => ({
        ...row,
        date: extractDateOnly(row.date) ?? row.date,
      }))
    );
  });

  // POST /api/transactions - Create + update account balance
  app.post("/api/transactions", async (c) => {
    const body = await c.req.json();
    let normalizedDate: string;
    try {
      normalizedDate = normalizeTransactionDateInput(String(body?.date ?? ""));
    } catch {
      return c.json({ error: "Validation error" }, 400);
    }
    const parsed = createTransactionSchema.parse({ ...body, date: normalizedDate });

    // Verify account exists
    const [account] = await db
      .select()
      .from(accounts)
      .where(and(eq(accounts.id, parsed.accountId), eq(accounts.userId, TEST_USER_ID)));

    if (!account) {
      return c.json({ error: "Account not found" }, 404);
    }

    if (parsed.categoryId) {
      const [category] = await db
        .select({ id: categories.id })
        .from(categories)
        .where(and(eq(categories.id, parsed.categoryId), eq(categories.userId, TEST_USER_ID)));

      if (!category) {
        return c.json({ error: "Category not found" }, 404);
      }
    }

    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    const values = {
      ...parsed,
      date: normalizedDate,
      categoryId: parsed.categoryId ?? null,
      id,
      userId: TEST_USER_ID,
      createdAt: now,
    };
    await db.insert(transactions).values(values);

    // Update account balance
    const balanceDelta =
      parsed.type === "income" ? parsed.amount : -parsed.amount;
    await db
      .update(accounts)
      .set({
        balance: sql`${accounts.balance} + ${balanceDelta}`,
        updatedAt: new Date().toISOString(),
      })
      .where(and(eq(accounts.id, parsed.accountId), eq(accounts.userId, TEST_USER_ID)));

    const [result] = await db
      .select()
      .from(transactions)
      .where(and(eq(transactions.id, id), eq(transactions.userId, TEST_USER_ID)));
    return c.json(
      {
        ...result,
        date: extractDateOnly(result.date) ?? result.date,
      },
      201
    );
  });

  // DELETE /api/transactions/:id - Delete + reverse balance
  app.delete("/api/transactions/:id", async (c) => {
    const id = c.req.param("id");

    const [txn] = await db
      .select()
      .from(transactions)
      .where(and(eq(transactions.id, id), eq(transactions.userId, TEST_USER_ID)));

    if (!txn) {
      return c.json({ error: "Transaction not found" }, 404);
    }

    await db
      .delete(transactions)
      .where(and(eq(transactions.id, id), eq(transactions.userId, TEST_USER_ID)));

    // Reverse the balance effect
    const reverseDelta = txn.type === "income" ? -txn.amount : txn.amount;
    await db
      .update(accounts)
      .set({
        balance: sql`${accounts.balance} + ${reverseDelta}`,
        updatedAt: new Date().toISOString(),
      })
      .where(and(eq(accounts.id, txn.accountId), eq(accounts.userId, TEST_USER_ID)));

    return c.json({ success: true });
  });

  // --- Dashboard routes ---

  // GET /api/dashboard/balances - Balances grouped by currency
  app.get("/api/dashboard/balances", async (c) => {
    const allAccounts = await db.select().from(accounts);

    const grouped: Record<
      string,
      {
        currency: string;
        totalBalance: number;
        accounts: Array<{ id: string; name: string; balance: number }>;
      }
    > = {};

    for (const acct of allAccounts) {
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

  // GET /api/dashboard/chart - Income/expense aggregation by month
  app.get("/api/dashboard/chart", async (c) => {
    const rawFrom = c.req.query("from");
    const rawTo = c.req.query("to");
    const from = normalizeTransactionDateQuery(rawFrom);
    const to = normalizeTransactionDateQuery(rawTo);
    const accountId = c.req.query("accountId");

    if (!rawFrom || !rawTo) {
      return c.json(
        { error: "Missing 'from' and 'to' query parameters" },
        400
      );
    }

    if (!from || !to) {
      return c.json(
        { error: "Invalid date range. Expected YYYY-MM-DD values for 'from' and 'to'." },
        400
      );
    }

    if (from > to) {
      return c.json({ error: "'from' date must be less than or equal to 'to' date." }, 400);
    }

    const conditions = [
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

    const chartMap: Record<
      string,
      { month: string; income: number; expense: number }
    > = {};

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

  // --- Profile routes ---

  // GET /api/profile
  app.get("/api/profile", async (c) => {
    const allProfiles = await db.select().from(profiles);
    if (allProfiles.length === 0) {
      return c.json({ error: "Profile not found" }, 404);
    }
    return c.json(allProfiles[0]);
  });

  // PUT /api/profile - Upsert
  app.put("/api/profile", async (c) => {
    const body = await c.req.json();
    const parsed = updateProfileSchema.parse(body);

    const existing = await db.select().from(profiles);

    if (existing.length === 0) {
      const id = crypto.randomUUID();
      // Keep harness behavior stable for tests while satisfying NOT NULL username.
      const username = parsed.username ?? `user-${crypto.randomUUID()}`;
      const values = { ...parsed, id, username };
      await db.insert(profiles).values(values);
      const [created] = await db
        .select()
        .from(profiles)
        .where(eq(profiles.id, id));
      return c.json(created, 201);
    }

    await db
      .update(profiles)
      .set(parsed)
      .where(eq(profiles.id, existing[0].id));
    const [updated] = await db
      .select()
      .from(profiles)
      .where(eq(profiles.id, existing[0].id));
    return c.json(updated);
  });

  return app;
}
