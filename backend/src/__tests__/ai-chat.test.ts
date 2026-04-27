import { beforeEach, describe, expect, it, vi } from "vitest";
import Database from "better-sqlite3";
import { Hono } from "hono";
import { aiRoutes } from "../worker/routes/ai";
import type { AppEnv } from "../worker/types";

vi.mock("agents", () => ({
  getAgentByName(namespace: DurableObjectNamespace, name: string) {
    return namespace.get(namespace.idFromName(name));
  },
}));

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

interface FakeAgentMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
}

class FakeAgentSession {
  private counter = 0;
  private readonly messages: FakeAgentMessage[] = [];

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (request.method === "GET" && url.pathname.endsWith("/messages")) {
      return Response.json({ messages: this.messages });
    }

    if (request.method === "GET" && url.pathname.endsWith("/messages/search")) {
      const query = (url.searchParams.get("q") ?? "").toLowerCase();
      const results = this.messages
        .filter((item) => item.content.toLowerCase().includes(query))
        .map((item) => ({
          id: item.id,
          role: item.role,
          snippet: item.content.slice(0, 140),
          createdAt: item.createdAt,
        }));
      return Response.json({ results });
    }

    if (request.method === "POST" && url.pathname.endsWith("/reset")) {
      this.messages.length = 0;
      return Response.json({ success: true });
    }

    if (request.method === "POST" && url.pathname.endsWith("/message")) {
      const body = (await request.json()) as { message: string };
      const now = new Date().toISOString();
      const userMessage: FakeAgentMessage = {
        id: `u-${this.counter++}`,
        role: "user",
        content: body.message,
        createdAt: now,
      };
      const assistantMessage: FakeAgentMessage = {
        id: `a-${this.counter++}`,
        role: "assistant",
        content: `Answer: ${body.message}`,
        createdAt: new Date().toISOString(),
      };
      this.messages.push(userMessage, assistantMessage);
      const createNote = body.message.toLowerCase().includes("note");
      return Response.json(
        {
          userMessage,
          assistantMessage,
          proposedAction: createNote
            ? {
                type: "create_note",
                payload: {
                  title: "AI Note",
                  content: assistantMessage.content,
                },
              }
            : null,
        },
        { status: 201 },
      );
    }

    if (request.method === "POST" && url.pathname.endsWith("/message/stream")) {
      const body = (await request.json()) as { message: string };
      const now = new Date().toISOString();
      const userMessage: FakeAgentMessage = {
        id: `u-${this.counter++}`,
        role: "user",
        content: body.message,
        createdAt: now,
      };
      const assistantMessage: FakeAgentMessage = {
        id: `a-${this.counter++}`,
        role: "assistant",
        content: `Answer: ${body.message}`,
        createdAt: new Date().toISOString(),
      };
      this.messages.push(userMessage, assistantMessage);
      const createNote = body.message.toLowerCase().includes("note");

      const encoder = new TextEncoder();
      const stream = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(
            encoder.encode(`event: start\\ndata: ${JSON.stringify({ userMessage })}\\n\\n`),
          );
          for (const chunk of assistantMessage.content.split(" ")) {
            controller.enqueue(
              encoder.encode(`event: delta\\ndata: ${JSON.stringify({ text: `${chunk} ` })}\\n\\n`),
            );
          }
          controller.enqueue(
            encoder.encode(
              `event: done\\ndata: ${JSON.stringify({
                assistantMessage,
                proposedAction: createNote
                  ? {
                      type: "note_create",
                      payload: {
                        title: "AI Note",
                        content: assistantMessage.content,
                      },
                    }
                  : null,
              })}\\n\\n`,
            ),
          );
          controller.close();
        },
      });
      return new Response(stream, {
        headers: {
          "content-type": "text/event-stream",
        },
      });
    }

    return Response.json({ error: "Not found" }, { status: 404 });
  }
}

class FakeAgentNamespace {
  private readonly sessions = new Map<string, FakeAgentSession>();

  idFromName(name: string) {
    return name as unknown as DurableObjectId;
  }

  get(id: DurableObjectId) {
    const key = String(id);
    if (!this.sessions.has(key)) {
      this.sessions.set(key, new FakeAgentSession());
    }
    const session = this.sessions.get(key)!;
    return {
      fetch: (input: RequestInfo | URL, init?: RequestInit) => session.fetch(new Request(input, init)),
    } as unknown as DurableObjectStub;
  }
}

function createTestEnv(sqlite: Database.Database): Env {
  return {
    DB: new TestD1Database(sqlite) as unknown as D1Database,
    AI_CHAT_SESSION: new FakeAgentNamespace() as unknown as DurableObjectNamespace,
    CHAT_MEMORY_INDEX: {} as VectorizeIndex,
    AI_CHAT_MEDIA_BUCKET: {
      put: async () => ({ key: "test" } as unknown as R2Object),
      get: async () => null,
      delete: async () => undefined,
    } as unknown as R2Bucket,
    AI: {} as Ai,
    AI_CHAT_MODEL: "@cf/google/gemma-4-26b-a4b-it",
    AI_VISION_MODEL: "@cf/llava-hf/llava-1.5-7b-hf",
    AI_EMBED_MODEL: "@cf/baai/bge-base-en-v1.5",
    AI_SEARCH_ENABLED: "false",
    AI_SEARCH_INSTANCE: "",
    RESEND_API_KEY: "test",
    EMAIL_FROM: "test@example.com",
  };
}

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
CREATE UNIQUE INDEX IF NOT EXISTS user_email_unique ON user(email);

CREATE TABLE IF NOT EXISTS notes (
  id text PRIMARY KEY NOT NULL,
  user_id text NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  title text NOT NULL,
  content text NOT NULL DEFAULT '',
  is_pinned integer NOT NULL DEFAULT 0,
  archived_at text,
  category_id text,
  created_at text NOT NULL,
  updated_at text NOT NULL
);

CREATE TABLE IF NOT EXISTS ai_chats (
  id text PRIMARY KEY NOT NULL,
  user_id text NOT NULL REFERENCES user(id) ON DELETE cascade,
  title text NOT NULL DEFAULT 'New chat',
  custom_instruction text NOT NULL DEFAULT '',
  context_money integer NOT NULL DEFAULT 1,
  context_habits integer NOT NULL DEFAULT 1,
  context_notes integer NOT NULL DEFAULT 0,
  context_events integer NOT NULL DEFAULT 0,
  pinned integer NOT NULL DEFAULT 0,
  last_message_preview text NOT NULL DEFAULT '',
  last_active_at text NOT NULL,
  created_at text NOT NULL,
  updated_at text NOT NULL
);
CREATE INDEX IF NOT EXISTS ai_chats_user_last_active_idx ON ai_chats(user_id, last_active_at);

CREATE TABLE IF NOT EXISTS ai_pending_actions (
  id text PRIMARY KEY NOT NULL,
  chat_id text NOT NULL REFERENCES ai_chats(id) ON DELETE cascade,
  user_id text NOT NULL REFERENCES user(id) ON DELETE cascade,
  type text NOT NULL,
  payload text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  expires_at text NOT NULL,
  created_at text NOT NULL,
  updated_at text NOT NULL
);
CREATE INDEX IF NOT EXISTS ai_pending_actions_chat_status_idx ON ai_pending_actions(chat_id, status);
CREATE INDEX IF NOT EXISTS ai_pending_actions_user_status_idx ON ai_pending_actions(user_id, status);

CREATE TABLE IF NOT EXISTS ai_chat_attachments (
  id text PRIMARY KEY NOT NULL,
  user_id text NOT NULL REFERENCES user(id) ON DELETE cascade,
  chat_id text NOT NULL REFERENCES ai_chats(id) ON DELETE cascade,
  message_id text,
  object_key text NOT NULL,
  file_name text NOT NULL,
  mime_type text NOT NULL,
  size_bytes integer NOT NULL,
  width integer,
  height integer,
  status text NOT NULL DEFAULT 'uploaded',
  created_at text NOT NULL,
  updated_at text NOT NULL
);
CREATE INDEX IF NOT EXISTS ai_chat_attachments_user_chat_status_idx
  ON ai_chat_attachments(user_id, chat_id, status);
CREATE INDEX IF NOT EXISTS ai_chat_attachments_chat_message_idx
  ON ai_chat_attachments(chat_id, message_id);
CREATE INDEX IF NOT EXISTS ai_chat_attachments_user_created_idx
  ON ai_chat_attachments(user_id, created_at);
`;

function createAiApp() {
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
  app.use("/api/ai/*", async (c, next) => {
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
  app.route("/api/ai", aiRoutes);

  const env = createTestEnv(sqlite);
  return { app, sqlite, env };
}

async function readResponseText(response: Response): Promise<string> {
  return response.text();
}

describe("AI chat routes", () => {
  let app: Hono<AppEnv>;
  let sqlite: Database.Database;
  let env: Env;

  beforeEach(() => {
    const test = createAiApp();
    app = test.app;
    sqlite = test.sqlite;
    env = test.env;
  });

  it("creates and lists chats with default contexts", async () => {
    const createRes = await app.request(
      "/api/ai/chats",
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-user-id": "user-a",
        },
        body: JSON.stringify({}),
      },
      env,
    );

    expect(createRes.status).toBe(201);
    const created = (await createRes.json()) as { contexts: { money: boolean; habits: boolean; notes: boolean } };
    expect(created.contexts).toEqual({ money: true, habits: true, notes: false, events: false });

    const listRes = await app.request("/api/ai/chats", { headers: { "x-user-id": "user-a" } }, env);
    expect(listRes.status).toBe(200);
    const chats = (await listRes.json()) as Array<{ id: string }>;
    expect(chats.length).toBe(1);
  });

  it("prevents cross-user access to chat resources", async () => {
    const createRes = await app.request(
      "/api/ai/chats",
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-user-id": "user-a",
        },
        body: JSON.stringify({ title: "Private chat" }),
      },
      env,
    );
    const created = (await createRes.json()) as { id: string };

    const listAsUserB = await app.request("/api/ai/chats", { headers: { "x-user-id": "user-b" } }, env);
    const userBChats = (await listAsUserB.json()) as Array<{ id: string }>;
    expect(userBChats.some((item) => item.id === created.id)).toBe(false);

    const getMessagesAsUserB = await app.request(
      `/api/ai/chats/${created.id}/messages`,
      { headers: { "x-user-id": "user-b" } },
      env,
    );
    expect(getMessagesAsUserB.status).toBe(404);
  });

  it("updates chat preview and activity timestamp when sending a message", async () => {
    const createRes = await app.request(
      "/api/ai/chats",
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-user-id": "user-a",
        },
        body: JSON.stringify({ title: "Insights" }),
      },
      env,
    );
    const created = (await createRes.json()) as { id: string; lastActiveAt: string };

    const messageRes = await app.request(
      `/api/ai/chats/${created.id}/messages`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-user-id": "user-a",
        },
        body: JSON.stringify({
          message: "How is my budget?",
          contexts: { money: true, habits: true, notes: false, events: false },
        }),
      },
      env,
    );
    expect(messageRes.status).toBe(201);

    const listRes = await app.request("/api/ai/chats", { headers: { "x-user-id": "user-a" } }, env);
    const list = (await listRes.json()) as Array<{ id: string; lastMessagePreview: string; lastActiveAt: string }>;
    const chat = list.find((item) => item.id === created.id);
    expect(chat).toBeDefined();
    expect(chat?.lastMessagePreview).toContain("Answer:");
    expect(new Date(chat!.lastActiveAt).getTime()).toBeGreaterThanOrEqual(
      new Date(created.lastActiveAt).getTime(),
    );
  });

  it("persists custom instruction and auto-generates title only for default chat names", async () => {
    const createRes = await app.request(
      "/api/ai/chats",
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-user-id": "user-a",
        },
        body: JSON.stringify({
          customInstruction: "Keep responses in bullet points",
        }),
      },
      env,
    );
    expect(createRes.status).toBe(201);
    const created = (await createRes.json()) as { id: string; title: string; customInstruction: string };
    expect(created.title).toBe("New chat");
    expect(created.customInstruction).toContain("bullet points");

    const firstMessageRes = await app.request(
      `/api/ai/chats/${created.id}/messages`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-user-id": "user-a",
        },
        body: JSON.stringify({ message: "coffee spending this month by week" }),
      },
      env,
    );
    expect(firstMessageRes.status).toBe(201);

    const [afterFirst] = sqlite
      .prepare("SELECT title FROM ai_chats WHERE id = ?")
      .all(created.id) as Array<{ title: string }>;
    expect(afterFirst.title).not.toBe("New chat");

    const renameRes = await app.request(
      `/api/ai/chats/${created.id}`,
      {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
          "x-user-id": "user-a",
        },
        body: JSON.stringify({ title: "Manual title" }),
      },
      env,
    );
    expect(renameRes.status).toBe(200);

    const secondMessageRes = await app.request(
      `/api/ai/chats/${created.id}/messages`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-user-id": "user-a",
        },
        body: JSON.stringify({ message: "another question" }),
      },
      env,
    );
    expect(secondMessageRes.status).toBe(201);

    const [afterSecond] = sqlite
      .prepare("SELECT title FROM ai_chats WHERE id = ?")
      .all(created.id) as Array<{ title: string }>;
    expect(afterSecond.title).toBe("Manual title");
  });

  it("confirms note action and creates note for owning user", async () => {
    const createRes = await app.request(
      "/api/ai/chats",
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-user-id": "user-a",
        },
        body: JSON.stringify({}),
      },
      env,
    );
    const created = (await createRes.json()) as { id: string };

    const messageRes = await app.request(
      `/api/ai/chats/${created.id}/messages`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-user-id": "user-a",
        },
        body: JSON.stringify({
          message: "create note from this conversation",
          contexts: { money: true, habits: true, notes: false, events: false },
        }),
      },
      env,
    );
    expect(messageRes.status).toBe(201);
    const sent = (await messageRes.json()) as { pendingAction: { id: string } | null };
    expect(sent.pendingAction?.id).toBeTruthy();

    const confirmRes = await app.request(
      `/api/ai/chats/${created.id}/actions/${sent.pendingAction!.id}/confirm`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-user-id": "user-a",
        },
        body: JSON.stringify({}),
      },
      env,
    );
    expect(confirmRes.status).toBe(200);

    const noteCountUserA = sqlite
      .prepare("SELECT COUNT(*) as count FROM notes WHERE user_id = ?")
      .get("user-a") as { count: number };
    const noteCountUserB = sqlite
      .prepare("SELECT COUNT(*) as count FROM notes WHERE user_id = ?")
      .get("user-b") as { count: number };
    expect(noteCountUserA.count).toBe(1);
    expect(noteCountUserB.count).toBe(0);
  });

  it("rejects confirming canceled or expired actions", async () => {
    const createRes = await app.request(
      "/api/ai/chats",
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-user-id": "user-a",
        },
        body: JSON.stringify({}),
      },
      env,
    );
    const created = (await createRes.json()) as { id: string };

    const firstMsgRes = await app.request(
      `/api/ai/chats/${created.id}/messages`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-user-id": "user-a",
        },
        body: JSON.stringify({
          message: "create note now",
          contexts: { money: true, habits: true, notes: false, events: false },
        }),
      },
      env,
    );
    const first = (await firstMsgRes.json()) as { pendingAction: { id: string } | null };

    const cancelRes = await app.request(
      `/api/ai/chats/${created.id}/actions/${first.pendingAction!.id}/cancel`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-user-id": "user-a",
        },
        body: JSON.stringify({}),
      },
      env,
    );
    expect(cancelRes.status).toBe(200);

    const confirmCanceledRes = await app.request(
      `/api/ai/chats/${created.id}/actions/${first.pendingAction!.id}/confirm`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-user-id": "user-a",
        },
        body: JSON.stringify({}),
      },
      env,
    );
    expect(confirmCanceledRes.status).toBe(404);

    const secondMsgRes = await app.request(
      `/api/ai/chats/${created.id}/messages`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-user-id": "user-a",
        },
        body: JSON.stringify({
          message: "create note and expire",
          contexts: { money: true, habits: true, notes: false, events: false },
        }),
      },
      env,
    );
    const second = (await secondMsgRes.json()) as { pendingAction: { id: string } | null };

    sqlite
      .prepare("UPDATE ai_pending_actions SET expires_at = ?, updated_at = ? WHERE id = ?")
      .run("2000-01-01T00:00:00.000Z", "2000-01-01T00:00:00.000Z", second.pendingAction!.id);

    const confirmExpiredRes = await app.request(
      `/api/ai/chats/${created.id}/actions/${second.pendingAction!.id}/confirm`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-user-id": "user-a",
        },
        body: JSON.stringify({}),
      },
      env,
    );
    expect(confirmExpiredRes.status).toBe(404);
  });

  it("resets chat context and clears agent messages", async () => {
    const createRes = await app.request(
      "/api/ai/chats",
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-user-id": "user-a",
        },
        body: JSON.stringify({}),
      },
      env,
    );
    const created = (await createRes.json()) as { id: string };

    await app.request(
      `/api/ai/chats/${created.id}/messages`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-user-id": "user-a",
        },
        body: JSON.stringify({ message: "hello there" }),
      },
      env,
    );

    const resetRes = await app.request(
      `/api/ai/chats/${created.id}/reset`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-user-id": "user-a",
        },
        body: JSON.stringify({}),
      },
      env,
    );
    expect(resetRes.status).toBe(200);

    const messagesRes = await app.request(
      `/api/ai/chats/${created.id}/messages`,
      {
        headers: {
          "x-user-id": "user-a",
        },
      },
      env,
    );
    const payload = (await messagesRes.json()) as { messages: Array<{ id: string }> };
    expect(payload.messages).toHaveLength(0);
  });

  it("supports chat search and stream endpoints", async () => {
    const createRes = await app.request(
      "/api/ai/chats",
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-user-id": "user-a",
        },
        body: JSON.stringify({}),
      },
      env,
    );
    const created = (await createRes.json()) as { id: string };

    const streamRes = await app.request(
      `/api/ai/chats/${created.id}/messages/stream`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-user-id": "user-a",
        },
        body: JSON.stringify({ message: "create note about friday budget review" }),
      },
      env,
    );
    expect(streamRes.status).toBe(200);
    const streamBody = await readResponseText(streamRes);
    expect(streamBody).toContain("event: done");

    const searchRes = await app.request(
      `/api/ai/chats/${created.id}/search?q=${encodeURIComponent("budget")}&limit=10`,
      {
        headers: {
          "x-user-id": "user-a",
        },
      },
      env,
    );
    expect(searchRes.status).toBe(200);
    const searchBody = (await searchRes.json()) as { results: Array<{ id: string }> };
    expect(searchBody.results.length).toBeGreaterThan(0);
  });
});
