import { Hono } from "hono";
import { and, asc, eq, gte, lte, sql } from "drizzle-orm";
import { createDb } from "../../db";
import { events } from "../../db/schema";
import {
  createEventSchema,
  importIcsSchema,
  listEventsQuerySchema,
  updateEventSchema,
} from "../validators";
import { importIcsIntoEvents } from "../events/ics-import";
import type { AppEnv } from "../types";

const eventRoutes = new Hono<AppEnv>();

function escapeLikePattern(value: string): string {
  return value.replace(/[\\%_]/g, "\\$&");
}

async function getOwnedEvent(db: ReturnType<typeof createDb>, userId: string, eventId: string) {
  const [row] = await db
    .select({
      id: events.id,
      userId: events.userId,
      title: events.title,
      description: events.description,
      location: events.location,
      timezone: events.timezone,
      isAllDay: events.isAllDay,
      startAt: events.startAt,
      endAt: events.endAt,
      reminderMinutes: events.reminderMinutes,
      source: events.source,
      externalUid: events.externalUid,
      createdAt: events.createdAt,
      updatedAt: events.updatedAt,
    })
    .from(events)
    .where(and(eq(events.id, eventId), eq(events.userId, userId)));

  return row;
}

eventRoutes.get("/", async (c) => {
  const userId = c.get("user").id;
  const db = createDb(c.env.DB);

  const parsed = listEventsQuerySchema.parse({
    from: c.req.query("from") ?? undefined,
    to: c.req.query("to") ?? undefined,
    q: c.req.query("q") ?? undefined,
  });

  const conditions = [eq(events.userId, userId)];
  if (parsed.from) {
    conditions.push(gte(events.endAt, parsed.from));
  }
  if (parsed.to) {
    conditions.push(lte(events.startAt, parsed.to));
  }

  const normalizedSearch = parsed.q?.trim().toLowerCase();
  if (normalizedSearch) {
    const pattern = `%${escapeLikePattern(normalizedSearch)}%`;
    conditions.push(
      sql`(
        lower(${events.title}) LIKE ${pattern} ESCAPE '\\' OR
        lower(${events.description}) LIKE ${pattern} ESCAPE '\\' OR
        lower(${events.location}) LIKE ${pattern} ESCAPE '\\'
      )`,
    );
  }

  const rows = await db
    .select({
      id: events.id,
      userId: events.userId,
      title: events.title,
      description: events.description,
      location: events.location,
      timezone: events.timezone,
      isAllDay: events.isAllDay,
      startAt: events.startAt,
      endAt: events.endAt,
      reminderMinutes: events.reminderMinutes,
      source: events.source,
      externalUid: events.externalUid,
      createdAt: events.createdAt,
      updatedAt: events.updatedAt,
    })
    .from(events)
    .where(and(...conditions))
    .orderBy(asc(events.startAt));

  return c.json(rows);
});

eventRoutes.get("/:id", async (c) => {
  const userId = c.get("user").id;
  const eventId = c.req.param("id");
  const db = createDb(c.env.DB);

  const row = await getOwnedEvent(db, userId, eventId);
  if (!row) {
    return c.json({ error: "Event not found" }, 404);
  }

  return c.json(row);
});

eventRoutes.post("/", async (c) => {
  const userId = c.get("user").id;
  const db = createDb(c.env.DB);
  const body = await c.req.json();
  const parsed = createEventSchema.parse(body);

  const title = parsed.title.trim();
  if (!title) {
    return c.json({ error: "Title is required" }, 400);
  }

  const now = new Date().toISOString();
  const [created] = await db
    .insert(events)
    .values({
      userId,
      title,
      description: parsed.description,
      location: parsed.location,
      timezone: parsed.timezone,
      isAllDay: parsed.isAllDay,
      startAt: parsed.startAt,
      endAt: parsed.endAt,
      reminderMinutes: parsed.reminderMinutes ?? null,
      source: parsed.source ?? "manual",
      externalUid: parsed.externalUid ?? null,
      createdAt: now,
      updatedAt: now,
    })
    .returning({ id: events.id });

  const row = await getOwnedEvent(db, userId, created.id);
  if (!row) {
    return c.json({ error: "Event not found" }, 404);
  }

  return c.json(row, 201);
});

eventRoutes.put("/:id", async (c) => {
  const userId = c.get("user").id;
  const eventId = c.req.param("id");
  const db = createDb(c.env.DB);
  const body = await c.req.json();
  const parsed = updateEventSchema.parse(body);

  const existing = await getOwnedEvent(db, userId, eventId);
  if (!existing) {
    return c.json({ error: "Event not found" }, 404);
  }

  const nextTitle = parsed.title?.trim();
  if (nextTitle !== undefined && nextTitle.length === 0) {
    return c.json({ error: "Title is required" }, 400);
  }

  const nextStartAt = parsed.startAt ?? existing.startAt;
  const nextEndAt = parsed.endAt ?? existing.endAt;
  if (new Date(nextEndAt).getTime() <= new Date(nextStartAt).getTime()) {
    return c.json({ error: "endAt must be greater than startAt" }, 400);
  }

  await db
    .update(events)
    .set({
      title: nextTitle ?? undefined,
      description: parsed.description,
      location: parsed.location,
      timezone: parsed.timezone,
      isAllDay: parsed.isAllDay,
      startAt: parsed.startAt,
      endAt: parsed.endAt,
      reminderMinutes: parsed.reminderMinutes,
      externalUid: parsed.externalUid,
      updatedAt: new Date().toISOString(),
    })
    .where(and(eq(events.id, eventId), eq(events.userId, userId)));

  const row = await getOwnedEvent(db, userId, eventId);
  if (!row) {
    return c.json({ error: "Event not found" }, 404);
  }

  return c.json(row);
});

eventRoutes.delete("/:id", async (c) => {
  const userId = c.get("user").id;
  const eventId = c.req.param("id");
  const db = createDb(c.env.DB);

  const [deleted] = await db
    .delete(events)
    .where(and(eq(events.id, eventId), eq(events.userId, userId)))
    .returning({ id: events.id });

  if (!deleted) {
    return c.json({ error: "Event not found" }, 404);
  }

  return c.json({ success: true });
});

eventRoutes.post("/import-ics", async (c) => {
  const userId = c.get("user").id;
  const db = createDb(c.env.DB);
  const body = await c.req.json();
  const parsed = importIcsSchema.parse(body);

  const result = await importIcsIntoEvents({
    db,
    userId,
    ics: parsed.ics,
    timezone: parsed.timezone ?? "UTC",
  });

  return c.json(result, 201);
});

export { eventRoutes };
