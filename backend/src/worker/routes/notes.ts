import { Hono } from "hono";
import { and, asc, desc, eq, isNull, sql } from "drizzle-orm";
import { createDb } from "../../db";
import { noteCategories, notes } from "../../db/schema";
import {
  createNoteCategorySchema,
  createNoteSchema,
  noteListQuerySchema,
  updateNoteCategorySchema,
  updateNoteSchema,
} from "../validators";
import type { AppEnv } from "../types";

const noteRoutes = new Hono<AppEnv>();
const DEFAULT_NOTE_CATEGORIES = ["Personal", "Work", "Ideas"] as const;
const NOTE_SORTS = ["updated_desc", "title_asc"] as const;

function normalizeSearchInput(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function escapeLikePattern(value: string): string {
  return value.replace(/[\\%_]/g, "\\$&");
}

function parseBooleanQuery(value: string | undefined): boolean | undefined {
  if (value === undefined) return undefined;
  const normalized = value.trim().toLowerCase();
  if (normalized === "true" || normalized === "1") return true;
  if (normalized === "false" || normalized === "0") return false;
  return undefined;
}

function parseSortQuery(value: string | undefined): (typeof NOTE_SORTS)[number] | undefined {
  if (!value) return undefined;
  return NOTE_SORTS.includes(value as (typeof NOTE_SORTS)[number])
    ? (value as (typeof NOTE_SORTS)[number])
    : undefined;
}

async function ensureDefaultNoteCategories(userId: string, db: ReturnType<typeof createDb>) {
  const existing = await db
    .select({ id: noteCategories.id })
    .from(noteCategories)
    .where(eq(noteCategories.userId, userId))
    .limit(1);

  if (existing.length > 0) return;

  const now = new Date().toISOString();
  await db.insert(noteCategories).values(
    DEFAULT_NOTE_CATEGORIES.map((name) => ({
      userId,
      name,
      createdAt: now,
      updatedAt: now,
    })),
  );
}

async function getOwnedCategory(
  userId: string,
  categoryId: string,
  db: ReturnType<typeof createDb>,
) {
  const [row] = await db
    .select({
      id: noteCategories.id,
      userId: noteCategories.userId,
      name: noteCategories.name,
      createdAt: noteCategories.createdAt,
      updatedAt: noteCategories.updatedAt,
    })
    .from(noteCategories)
    .where(and(eq(noteCategories.id, categoryId), eq(noteCategories.userId, userId)));

  return row;
}

async function getNoteById(userId: string, noteId: string, db: ReturnType<typeof createDb>) {
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
      and(eq(notes.categoryId, noteCategories.id), eq(noteCategories.userId, userId)),
    )
    .where(and(eq(notes.id, noteId), eq(notes.userId, userId)));

  return row;
}

async function updateAndReturnNote(
  userId: string,
  noteId: string,
  db: ReturnType<typeof createDb>,
  updates: Partial<typeof notes.$inferInsert>,
) {
  const now = new Date().toISOString();
  const updated = await db
    .update(notes)
    .set({ ...updates, updatedAt: now })
    .where(and(eq(notes.id, noteId), eq(notes.userId, userId)))
    .returning({ id: notes.id });

  if (updated.length === 0) {
    return null;
  }

  return getNoteById(userId, noteId, db);
}

noteRoutes.get("/categories", async (c) => {
  const userId = c.get("user").id;
  const db = createDb(c.env.DB);
  await ensureDefaultNoteCategories(userId, db);

  const rows = await db
    .select({
      id: noteCategories.id,
      userId: noteCategories.userId,
      name: noteCategories.name,
      createdAt: noteCategories.createdAt,
      updatedAt: noteCategories.updatedAt,
    })
    .from(noteCategories)
    .where(eq(noteCategories.userId, userId))
    .orderBy(noteCategories.name);

  return c.json(rows);
});

noteRoutes.post("/categories", async (c) => {
  const userId = c.get("user").id;
  const body = await c.req.json();
  const parsed = createNoteCategorySchema.parse(body);
  const db = createDb(c.env.DB);

  const name = parsed.name.trim();
  if (name.length === 0) {
    return c.json({ error: "Category name is required" }, 400);
  }

  const [duplicate] = await db
    .select({ id: noteCategories.id })
    .from(noteCategories)
    .where(and(eq(noteCategories.userId, userId), eq(noteCategories.name, name)));

  if (duplicate) {
    return c.json({ error: "Category already exists" }, 409);
  }

  const now = new Date().toISOString();
  const [created] = await db
    .insert(noteCategories)
    .values({ userId, name, createdAt: now, updatedAt: now })
    .returning({
      id: noteCategories.id,
      userId: noteCategories.userId,
      name: noteCategories.name,
      createdAt: noteCategories.createdAt,
      updatedAt: noteCategories.updatedAt,
    });

  return c.json(created, 201);
});

noteRoutes.put("/categories/:id", async (c) => {
  const userId = c.get("user").id;
  const id = c.req.param("id");
  const body = await c.req.json();
  const parsed = updateNoteCategorySchema.parse(body);
  const db = createDb(c.env.DB);

  const name = parsed.name.trim();
  if (name.length === 0) {
    return c.json({ error: "Category name is required" }, 400);
  }

  const [existing] = await db
    .select({ id: noteCategories.id })
    .from(noteCategories)
    .where(and(eq(noteCategories.id, id), eq(noteCategories.userId, userId)));

  if (!existing) {
    return c.json({ error: "Category not found" }, 404);
  }

  const [duplicate] = await db
    .select({ id: noteCategories.id })
    .from(noteCategories)
    .where(and(eq(noteCategories.userId, userId), eq(noteCategories.name, name)));

  if (duplicate && duplicate.id !== id) {
    return c.json({ error: "Category already exists" }, 409);
  }

  const [updated] = await db
    .update(noteCategories)
    .set({ name, updatedAt: new Date().toISOString() })
    .where(and(eq(noteCategories.id, id), eq(noteCategories.userId, userId)))
    .returning({
      id: noteCategories.id,
      userId: noteCategories.userId,
      name: noteCategories.name,
      createdAt: noteCategories.createdAt,
      updatedAt: noteCategories.updatedAt,
    });

  return c.json(updated);
});

noteRoutes.delete("/categories/:id", async (c) => {
  const userId = c.get("user").id;
  const id = c.req.param("id");
  const db = createDb(c.env.DB);
  const now = new Date().toISOString();

  const [existing] = await db
    .select({ id: noteCategories.id })
    .from(noteCategories)
    .where(and(eq(noteCategories.id, id), eq(noteCategories.userId, userId)));

  if (!existing) {
    return c.json({ error: "Category not found" }, 404);
  }

  await db
    .update(notes)
    .set({ categoryId: null, updatedAt: now })
    .where(and(eq(notes.userId, userId), eq(notes.categoryId, id)));

  await db
    .delete(noteCategories)
    .where(and(eq(noteCategories.id, id), eq(noteCategories.userId, userId)));

  return c.json({ success: true });
});

noteRoutes.get("/", async (c) => {
  const userId = c.get("user").id;
  const parsedQuery = noteListQuerySchema.parse({
    q: c.req.query("q") ?? undefined,
    categoryId: c.req.query("categoryId") ?? undefined,
    includeArchived: parseBooleanQuery(c.req.query("includeArchived")),
    pinnedOnly: parseBooleanQuery(c.req.query("pinnedOnly")),
    sort: parseSortQuery(c.req.query("sort")),
  });
  const db = createDb(c.env.DB);

  const conditions = [eq(notes.userId, userId)];
  if (!(parsedQuery.includeArchived ?? false)) {
    conditions.push(isNull(notes.archivedAt));
  }
  if (parsedQuery.pinnedOnly) {
    conditions.push(eq(notes.isPinned, true));
  }
  if (parsedQuery.categoryId) {
    conditions.push(eq(notes.categoryId, parsedQuery.categoryId));
  }

  const normalizedSearch = normalizeSearchInput(parsedQuery.q);
  if (normalizedSearch) {
    const pattern = `%${escapeLikePattern(normalizedSearch.toLowerCase())}%`;
    conditions.push(
      sql`(lower(${notes.title}) like ${pattern} escape '\\' or lower(${notes.content}) like ${pattern} escape '\\')`,
    );
  }

  const baseQuery = db
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
      and(eq(notes.categoryId, noteCategories.id), eq(noteCategories.userId, userId)),
    )
    .where(and(...conditions));

  if (parsedQuery.sort === "title_asc") {
    const rows = await baseQuery.orderBy(
      desc(notes.isPinned),
      asc(sql`lower(${notes.title})`),
      desc(notes.updatedAt),
    );
    return c.json(rows);
  }

  const rows = await baseQuery.orderBy(desc(notes.isPinned), desc(notes.updatedAt));

  return c.json(rows);
});

noteRoutes.patch("/:id/pin", async (c) => {
  const userId = c.get("user").id;
  const id = c.req.param("id");
  const db = createDb(c.env.DB);

  const updated = await updateAndReturnNote(userId, id, db, { isPinned: true });
  if (!updated) {
    return c.json({ error: "Note not found" }, 404);
  }

  return c.json(updated);
});

noteRoutes.patch("/:id/unpin", async (c) => {
  const userId = c.get("user").id;
  const id = c.req.param("id");
  const db = createDb(c.env.DB);

  const updated = await updateAndReturnNote(userId, id, db, { isPinned: false });
  if (!updated) {
    return c.json({ error: "Note not found" }, 404);
  }

  return c.json(updated);
});

noteRoutes.patch("/:id/archive", async (c) => {
  const userId = c.get("user").id;
  const id = c.req.param("id");
  const db = createDb(c.env.DB);

  const updated = await updateAndReturnNote(userId, id, db, {
    archivedAt: new Date().toISOString(),
    isPinned: false,
  });
  if (!updated) {
    return c.json({ error: "Note not found" }, 404);
  }

  return c.json(updated);
});

noteRoutes.patch("/:id/unarchive", async (c) => {
  const userId = c.get("user").id;
  const id = c.req.param("id");
  const db = createDb(c.env.DB);

  const updated = await updateAndReturnNote(userId, id, db, { archivedAt: null });
  if (!updated) {
    return c.json({ error: "Note not found" }, 404);
  }

  return c.json(updated);
});

noteRoutes.get("/:id", async (c) => {
  const userId = c.get("user").id;
  const id = c.req.param("id");
  const db = createDb(c.env.DB);

  const row = await getNoteById(userId, id, db);
  if (!row) {
    return c.json({ error: "Note not found" }, 404);
  }

  return c.json(row);
});

noteRoutes.post("/", async (c) => {
  const userId = c.get("user").id;
  const body = await c.req.json();
  const parsed = createNoteSchema.parse(body);
  const db = createDb(c.env.DB);

  const title = parsed.title.trim();
  if (title.length === 0) {
    return c.json({ error: "Title is required" }, 400);
  }

  const categoryId = parsed.categoryId ?? null;
  if (categoryId) {
    const category = await getOwnedCategory(userId, categoryId, db);
    if (!category) {
      return c.json({ error: "Category not found" }, 404);
    }
  }

  const [created] = await db
    .insert(notes)
    .values({
      userId,
      title,
      content: parsed.content,
      categoryId,
    })
    .returning({ id: notes.id });

  const row = await getNoteById(userId, created.id, db);
  if (!row) {
    return c.json({ error: "Note not found" }, 404);
  }

  return c.json(row, 201);
});

noteRoutes.put("/:id", async (c) => {
  const userId = c.get("user").id;
  const id = c.req.param("id");
  const body = await c.req.json();
  const parsed = updateNoteSchema.parse(body);
  const db = createDb(c.env.DB);

  const [existing] = await db
    .select({ id: notes.id })
    .from(notes)
    .where(and(eq(notes.id, id), eq(notes.userId, userId)));

  if (!existing) {
    return c.json({ error: "Note not found" }, 404);
  }

  if (parsed.categoryId !== undefined && parsed.categoryId !== null) {
    const category = await getOwnedCategory(userId, parsed.categoryId, db);
    if (!category) {
      return c.json({ error: "Category not found" }, 404);
    }
  }

  const nextTitle = parsed.title?.trim();
  if (nextTitle !== undefined && nextTitle.length === 0) {
    return c.json({ error: "Title is required" }, 400);
  }

  const updates: Partial<typeof notes.$inferInsert> = {};
  if (nextTitle !== undefined) {
    updates.title = nextTitle;
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

  const updated = await updateAndReturnNote(userId, id, db, updates);
  if (!updated) {
    return c.json({ error: "Note not found" }, 404);
  }

  return c.json(updated);
});

noteRoutes.delete("/:id", async (c) => {
  const userId = c.get("user").id;
  const id = c.req.param("id");
  const db = createDb(c.env.DB);

  const deleted = await db
    .delete(notes)
    .where(and(eq(notes.id, id), eq(notes.userId, userId)))
    .returning({ id: notes.id });

  if (deleted.length === 0) {
    return c.json({ error: "Note not found" }, 404);
  }

  return c.json({ success: true });
});

export { noteRoutes };
