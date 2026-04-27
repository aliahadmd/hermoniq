import { beforeEach, describe, expect, it } from "vitest";
import Database from "better-sqlite3";
import { Hono } from "hono";
import { ZodError } from "zod";
import { eventRoutes } from "../worker/routes/events";
import type { AppEnv } from "../worker/types";

class TestD1PreparedStatement {
  private readonly params: unknown[];
  private readonly statement: Database.Statement;

  constructor(statement: Database.Statement, params: unknown[] = []) {
    this.statement = statement;
    this.params = params;
  }

  bind(...params: unknown[]) {
    return new TestD1PreparedStatement(this.statement, params);
  }

  async first(columnName?: string) {
    const row = this.statement.get(...this.params) as Record<string, unknown> | undefined;
    if (!row) return null;
    if (columnName) return row[columnName];
    return row;
  }

  async run() {
    const result = this.statement.run(...this.params);
    return {
      success: true,
      meta: {
        changes: result.changes,
        last_row_id: Number(result.lastInsertRowid ?? 0),
      },
    };
  }

  async all() {
    const rows = this.statement.all(...this.params) as Record<string, unknown>[];
    return {
      success: true,
      results: rows,
      meta: {
        changes: 0,
        last_row_id: 0,
      },
    };
  }

  async raw() {
    return this.statement.raw().all(...this.params);
  }
}

class TestD1Database {
  private readonly sqlite: Database.Database;

  constructor(sqlite: Database.Database) {
    this.sqlite = sqlite;
  }

  prepare(query: string) {
    return new TestD1PreparedStatement(this.sqlite.prepare(query));
  }

  async batch(statements: Array<TestD1PreparedStatement>) {
    return Promise.all(statements.map((statement) => statement.run()));
  }

  async exec(query: string) {
    this.sqlite.exec(query);
    return {
      count: 0,
      duration: 0,
    };
  }
}

const MIGRATION_SQL = `
CREATE TABLE IF NOT EXISTS user (
  id text PRIMARY KEY NOT NULL,
  name text NOT NULL,
  email text NOT NULL,
  emailVerified integer NOT NULL DEFAULT 0,
  createdAt integer NOT NULL,
  updatedAt integer NOT NULL
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
CREATE INDEX IF NOT EXISTS events_user_start_idx ON events(user_id, start_at);
CREATE INDEX IF NOT EXISTS events_user_end_idx ON events(user_id, end_at);
CREATE UNIQUE INDEX IF NOT EXISTS events_user_external_uid_start_unique ON events(user_id, external_uid, start_at);
`;

function createEventsApp() {
  const sqlite = new Database(":memory:");
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  sqlite.exec(MIGRATION_SQL);

  const now = Date.now();
  sqlite
    .prepare(
      `INSERT INTO user (id, name, email, emailVerified, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .run("user-a", "User A", "user-a@example.com", 1, now, now);
  sqlite
    .prepare(
      `INSERT INTO user (id, name, email, emailVerified, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .run("user-b", "User B", "user-b@example.com", 1, now, now);

  const app = new Hono<AppEnv>();
  app.onError((error, c) => {
    if (error instanceof ZodError) {
      return c.json({ error: "Validation error", details: error.issues }, 400);
    }
    if (error instanceof SyntaxError) {
      return c.json({ error: "Invalid request body" }, 400);
    }
    return c.json({ error: "Internal server error" }, 500);
  });
  app.use("/api/events/*", async (c, next) => {
    const userId = c.req.header("x-user-id") ?? "user-a";
    c.set("user", {
      id: userId,
      name: userId,
      email: `${userId}@example.com`,
      role: "user",
    });
    c.set("session", {
      id: "session-id",
      userId,
      token: "session-token",
    });
    await next();
  });
  app.route("/api/events", eventRoutes);

  const env = {
    DB: new TestD1Database(sqlite) as unknown as D1Database,
  } as Env;

  return { app, sqlite, env };
}

describe("events routes", () => {
  let app: Hono<AppEnv>;
  let env: Env;

  beforeEach(() => {
    const test = createEventsApp();
    app = test.app;
    env = test.env;
  });

  it("creates, lists, updates, and deletes user-owned events", async () => {
    const createRes = await app.request(
      "/api/events",
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-user-id": "user-a",
        },
        body: JSON.stringify({
          title: "Design Review",
          description: "Sprint sync",
          location: "HQ",
          timezone: "UTC",
          isAllDay: false,
          startAt: "2026-02-20T09:00:00.000Z",
          endAt: "2026-02-20T10:00:00.000Z",
          reminderMinutes: 10,
        }),
      },
      env,
    );
    expect(createRes.status).toBe(201);

    const created = (await createRes.json()) as { id: string; title: string };
    expect(created.title).toBe("Design Review");

    const listRes = await app.request(
      "/api/events?from=2026-02-20T00:00:00.000Z&to=2026-02-21T00:00:00.000Z",
      {
        headers: { "x-user-id": "user-a" },
      },
      env,
    );
    expect(listRes.status).toBe(200);
    const list = (await listRes.json()) as Array<{ id: string }>;
    expect(list.length).toBe(1);
    expect(list[0]?.id).toBe(created.id);

    const updateRes = await app.request(
      `/api/events/${created.id}`,
      {
        method: "PUT",
        headers: {
          "content-type": "application/json",
          "x-user-id": "user-a",
        },
        body: JSON.stringify({ title: "Updated Review" }),
      },
      env,
    );
    expect(updateRes.status).toBe(200);
    const updated = (await updateRes.json()) as { title: string };
    expect(updated.title).toBe("Updated Review");

    const deleteRes = await app.request(
      `/api/events/${created.id}`,
      {
        method: "DELETE",
        headers: { "x-user-id": "user-a" },
      },
      env,
    );
    expect(deleteRes.status).toBe(200);

    const getDeleted = await app.request(
      `/api/events/${created.id}`,
      {
        headers: { "x-user-id": "user-a" },
      },
      env,
    );
    expect(getDeleted.status).toBe(404);
  });

  it("forbids cross-user access", async () => {
    const createRes = await app.request(
      "/api/events",
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-user-id": "user-a",
        },
        body: JSON.stringify({
          title: "Private Event",
          timezone: "UTC",
          isAllDay: false,
          startAt: "2026-02-22T09:00:00.000Z",
          endAt: "2026-02-22T10:00:00.000Z",
        }),
      },
      env,
    );
    const created = (await createRes.json()) as { id: string };

    const getOther = await app.request(
      `/api/events/${created.id}`,
      {
        headers: { "x-user-id": "user-b" },
      },
      env,
    );
    expect(getOther.status).toBe(404);

    const deleteOther = await app.request(
      `/api/events/${created.id}`,
      {
        method: "DELETE",
        headers: { "x-user-id": "user-b" },
      },
      env,
    );
    expect(deleteOther.status).toBe(404);
  });

  it("filters events by from/to range", async () => {
    const payloads = [
      {
        title: "A",
        timezone: "UTC",
        isAllDay: false,
        startAt: "2026-03-01T09:00:00.000Z",
        endAt: "2026-03-01T10:00:00.000Z",
      },
      {
        title: "B",
        timezone: "UTC",
        isAllDay: false,
        startAt: "2026-03-05T09:00:00.000Z",
        endAt: "2026-03-05T10:00:00.000Z",
      },
      {
        title: "C",
        timezone: "UTC",
        isAllDay: false,
        startAt: "2026-03-10T09:00:00.000Z",
        endAt: "2026-03-10T10:00:00.000Z",
      },
    ];

    for (const body of payloads) {
      const res = await app.request(
        "/api/events",
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-user-id": "user-a",
          },
          body: JSON.stringify(body),
        },
        env,
      );
      expect(res.status).toBe(201);
    }

    const filtered = await app.request(
      "/api/events?from=2026-03-04T00:00:00.000Z&to=2026-03-06T23:59:59.000Z",
      {
        headers: { "x-user-id": "user-a" },
      },
      env,
    );
    expect(filtered.status).toBe(200);
    const list = (await filtered.json()) as Array<{ title: string }>;
    expect(list).toHaveLength(1);
    expect(list[0]?.title).toBe("B");
  });

  it("rejects invalid event payloads", async () => {
    const badRangeRes = await app.request(
      "/api/events",
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-user-id": "user-a",
        },
        body: JSON.stringify({
          title: "Invalid",
          timezone: "UTC",
          isAllDay: false,
          startAt: "2026-02-20T10:00:00.000Z",
          endAt: "2026-02-20T09:00:00.000Z",
        }),
      },
      env,
    );
    expect(badRangeRes.status).toBe(400);

    const badReminderRes = await app.request(
      "/api/events",
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-user-id": "user-a",
        },
        body: JSON.stringify({
          title: "Invalid reminder",
          timezone: "UTC",
          isAllDay: false,
          startAt: "2026-02-20T10:00:00.000Z",
          endAt: "2026-02-20T11:00:00.000Z",
          reminderMinutes: 7,
        }),
      },
      env,
    );
    expect(badReminderRes.status).toBe(400);
  });

  it("imports ICS, skips recurring events, and deduplicates by UID+start", async () => {
    const firstImport = await app.request(
      "/api/events/import-ics",
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-user-id": "user-a",
        },
        body: JSON.stringify({
          timezone: "UTC",
          ics: [
            "BEGIN:VCALENDAR",
            "VERSION:2.0",
            "PRODID:-//Harmoniq Test//EN",
            "BEGIN:VEVENT",
            "UID:event-uid-1",
            "DTSTART:20260315T090000Z",
            "DTEND:20260315T100000Z",
            "SUMMARY:Initial Summary",
            "DESCRIPTION:Original",
            "LOCATION:Room A",
            "BEGIN:VALARM",
            "TRIGGER:-PT10M",
            "ACTION:DISPLAY",
            "DESCRIPTION:Reminder",
            "END:VALARM",
            "END:VEVENT",
            "BEGIN:VEVENT",
            "UID:event-uid-2",
            "DTSTART:20260316T090000Z",
            "DTEND:20260316T100000Z",
            "SUMMARY:Recurring",
            "RRULE:FREQ=DAILY;COUNT=2",
            "END:VEVENT",
            "END:VCALENDAR",
          ].join("\r\n"),
        }),
      },
      env,
    );
    expect(firstImport.status).toBe(201);
    const firstBody = (await firstImport.json()) as {
      createdCount: number;
      updatedCount: number;
      skippedRecurringCount: number;
    };
    expect(firstBody.createdCount).toBe(1);
    expect(firstBody.updatedCount).toBe(0);
    expect(firstBody.skippedRecurringCount).toBe(1);

    const secondImport = await app.request(
      "/api/events/import-ics",
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-user-id": "user-a",
        },
        body: JSON.stringify({
          timezone: "UTC",
          ics: [
            "BEGIN:VCALENDAR",
            "VERSION:2.0",
            "PRODID:-//Harmoniq Test//EN",
            "BEGIN:VEVENT",
            "UID:event-uid-1",
            "DTSTART:20260315T090000Z",
            "DTEND:20260315T100000Z",
            "SUMMARY:Updated Summary",
            "END:VEVENT",
            "END:VCALENDAR",
          ].join("\r\n"),
        }),
      },
      env,
    );
    expect(secondImport.status).toBe(201);
    const secondBody = (await secondImport.json()) as {
      createdCount: number;
      updatedCount: number;
    };
    expect(secondBody.createdCount).toBe(0);
    expect(secondBody.updatedCount).toBe(1);

    const listRes = await app.request(
      "/api/events?q=updated",
      { headers: { "x-user-id": "user-a" } },
      env,
    );
    expect(listRes.status).toBe(200);
    const list = (await listRes.json()) as Array<{ title: string }>;
    expect(list).toHaveLength(1);
    expect(list[0]?.title).toBe("Updated Summary");
  });
});
