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

class FakeR2Bucket {
  private readonly objects = new Map<string, { bytes: Uint8Array; contentType: string }>();

  async put(
    key: string,
    value: ReadableStream | ArrayBuffer | ArrayBufferView | string | null | Blob,
    options?: R2PutOptions,
  ) {
    let bytes: Uint8Array;
    if (value === null) {
      bytes = new Uint8Array();
    } else if (typeof value === "string") {
      bytes = new TextEncoder().encode(value);
    } else if (value instanceof Blob) {
      bytes = new Uint8Array(await value.arrayBuffer());
    } else if (ArrayBuffer.isView(value)) {
      bytes = new Uint8Array(value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength));
    } else if (value instanceof ArrayBuffer) {
      bytes = new Uint8Array(value);
    } else {
      const response = new Response(value);
      bytes = new Uint8Array(await response.arrayBuffer());
    }

    const metadata = options?.httpMetadata as { contentType?: string } | Headers | undefined;
    let contentType = "application/octet-stream";
    if (metadata instanceof Headers) {
      contentType = metadata.get("content-type") ?? contentType;
    } else if (metadata && typeof metadata.contentType === "string") {
      contentType = metadata.contentType;
    }

    this.objects.set(key, {
      bytes,
      contentType,
    });
    return { key, size: bytes.length } as unknown as R2Object;
  }

  async get(key: string) {
    const stored = this.objects.get(key);
    if (!stored) return null;
    const body = new Response(stored.bytes).body;
    return {
      key,
      size: stored.bytes.length,
      body,
      httpMetadata: {
        contentType: stored.contentType,
      },
      arrayBuffer: async () => stored.bytes.buffer.slice(0),
    } as unknown as R2ObjectBody;
  }

  async delete(key: string | string[]) {
    const keys = Array.isArray(key) ? key : [key];
    for (const item of keys) {
      this.objects.delete(item);
    }
  }

  has(key: string): boolean {
    return this.objects.has(key);
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

    if (request.method === "POST" && url.pathname.endsWith("/reset")) {
      this.messages.length = 0;
      return Response.json({ success: true });
    }

    if (request.method === "POST" && url.pathname.endsWith("/message")) {
      const body = (await request.json()) as { message?: string; attachments?: unknown[] };
      const now = new Date().toISOString();
      const userMessage: FakeAgentMessage = {
        id: `u-${this.counter++}`,
        role: "user",
        content: body.message ?? "",
        createdAt: now,
      };
      const attachmentCount = Array.isArray(body.attachments) ? body.attachments.length : 0;
      const assistantMessage: FakeAgentMessage = {
        id: `a-${this.counter++}`,
        role: "assistant",
        content: `Answer: ${(body.message ?? "").trim() || `image(${attachmentCount})`}`,
        createdAt: new Date().toISOString(),
      };
      this.messages.push(userMessage, assistantMessage);
      return Response.json(
        {
          userMessage,
          assistantMessage,
          proposedAction: null,
        },
        { status: 201 },
      );
    }

    if (request.method === "POST" && url.pathname.endsWith("/message/stream")) {
      const body = (await request.json()) as { message?: string; attachments?: unknown[] };
      const now = new Date().toISOString();
      const userMessage: FakeAgentMessage = {
        id: `u-${this.counter++}`,
        role: "user",
        content: body.message ?? "",
        createdAt: now,
      };
      const attachmentCount = Array.isArray(body.attachments) ? body.attachments.length : 0;
      const assistantMessage: FakeAgentMessage = {
        id: `a-${this.counter++}`,
        role: "assistant",
        content: `Answer: ${(body.message ?? "").trim() || `image(${attachmentCount})`}`,
        createdAt: new Date().toISOString(),
      };
      this.messages.push(userMessage, assistantMessage);

      const encoder = new TextEncoder();
      const stream = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(encoder.encode(`event: start\ndata: ${JSON.stringify({ userMessage })}\n\n`));
          controller.enqueue(encoder.encode(`event: delta\ndata: ${JSON.stringify({ text: "Answer: " })}\n\n`));
          controller.enqueue(
            encoder.encode(
              `event: done\ndata: ${JSON.stringify({
                assistantMessage,
                proposedAction: null,
              })}\n\n`,
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

  const bucket = new FakeR2Bucket();

  const env: Env = {
    DB: new TestD1Database(sqlite) as unknown as D1Database,
    AI_CHAT_SESSION: new FakeAgentNamespace() as unknown as DurableObjectNamespace,
    CHAT_MEMORY_INDEX: {} as VectorizeIndex,
    AI_CHAT_MEDIA_BUCKET: bucket as unknown as R2Bucket,
    AI: {} as Ai,
    AI_CHAT_MODEL: "@cf/google/gemma-4-26b-a4b-it",
    AI_VISION_MODEL: "@cf/llava-hf/llava-1.5-7b-hf",
    AI_EMBED_MODEL: "@cf/baai/bge-base-en-v1.5",
    AI_SEARCH_ENABLED: "false",
    AI_SEARCH_INSTANCE: "",
    RESEND_API_KEY: "test",
    EMAIL_FROM: "test@example.com",
  };

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

  return { app, sqlite, env, bucket };
}

describe("AI chat image routes", () => {
  let app: Hono<AppEnv>;
  let sqlite: Database.Database;
  let env: Env;
  let bucket: FakeR2Bucket;

  beforeEach(() => {
    const test = createAiApp();
    app = test.app;
    sqlite = test.sqlite;
    env = test.env;
    bucket = test.bucket;
  });

  async function createChat(): Promise<string> {
    const response = await app.request(
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
    const body = (await response.json()) as { id: string };
    return body.id;
  }

  async function uploadImage(chatId: string, userId = "user-a") {
    const form = new FormData();
    form.append("file", new File([new Uint8Array([1, 2, 3, 4])], "shot.jpg", { type: "image/jpeg" }));
    const response = await app.request(
      `/api/ai/chats/${chatId}/attachments`,
      {
        method: "POST",
        headers: {
          "x-user-id": userId,
        },
        body: form,
      },
      env,
    );
    return response;
  }

  it("uploads image and enforces ownership on content access", async () => {
    const chatId = await createChat();
    const uploadRes = await uploadImage(chatId);
    expect(uploadRes.status).toBe(201);
    const uploaded = (await uploadRes.json()) as { attachment: { id: string; contentUrl: string } };
    expect(uploaded.attachment.id).toBeTruthy();

    const contentRes = await app.request(
      uploaded.attachment.contentUrl,
      {
        headers: {
          "x-user-id": "user-a",
        },
      },
      env,
    );
    expect(contentRes.status).toBe(200);

    const forbiddenRes = await app.request(
      uploaded.attachment.contentUrl,
      {
        headers: {
          "x-user-id": "user-b",
        },
      },
      env,
    );
    expect(forbiddenRes.status).toBe(404);
  });

  it("rejects invalid mime and supports image-only message linking", async () => {
    const chatId = await createChat();

    const invalidForm = new FormData();
    invalidForm.append("file", new File(["hello"], "note.txt", { type: "text/plain" }));
    const invalidRes = await app.request(
      `/api/ai/chats/${chatId}/attachments`,
      {
        method: "POST",
        headers: {
          "x-user-id": "user-a",
        },
        body: invalidForm,
      },
      env,
    );
    expect(invalidRes.status).toBe(400);

    const uploadRes = await uploadImage(chatId);
    const uploaded = (await uploadRes.json()) as { attachment: { id: string } };

    const messageRes = await app.request(
      `/api/ai/chats/${chatId}/messages`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-user-id": "user-a",
        },
        body: JSON.stringify({
          attachmentIds: [uploaded.attachment.id],
          contexts: { money: true, habits: true, notes: false, events: false },
        }),
      },
      env,
    );
    expect(messageRes.status).toBe(201);
    const sent = (await messageRes.json()) as { userMessage: { attachments?: Array<{ id: string }> } };
    expect(sent.userMessage.attachments?.length).toBe(1);

    const linked = sqlite
      .prepare("SELECT status, message_id FROM ai_chat_attachments WHERE id = ?")
      .get(uploaded.attachment.id) as { status: string; message_id: string | null };
    expect(linked.status).toBe("linked");
    expect(linked.message_id).toBeTruthy();
  });

  it("links stream attachments and reset clears rows and objects", async () => {
    const chatId = await createChat();
    const uploadRes = await uploadImage(chatId);
    const uploaded = (await uploadRes.json()) as { attachment: { id: string } };

    const objectKey = sqlite
      .prepare("SELECT object_key FROM ai_chat_attachments WHERE id = ?")
      .get(uploaded.attachment.id) as { object_key: string };
    expect(bucket.has(objectKey.object_key)).toBe(true);

    const streamRes = await app.request(
      `/api/ai/chats/${chatId}/messages/stream`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-user-id": "user-a",
        },
        body: JSON.stringify({
          message: "",
          attachmentIds: [uploaded.attachment.id],
        }),
      },
      env,
    );
    expect(streamRes.status).toBe(200);
    const streamBody = await streamRes.text();
    expect(streamBody).toContain("event: done");

    const linked = sqlite
      .prepare("SELECT status, message_id FROM ai_chat_attachments WHERE id = ?")
      .get(uploaded.attachment.id) as { status: string; message_id: string | null };
    expect(linked.status).toBe("linked");
    expect(linked.message_id).toBeTruthy();

    const resetRes = await app.request(
      `/api/ai/chats/${chatId}/reset`,
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

    const remaining = sqlite
      .prepare("SELECT COUNT(*) as count FROM ai_chat_attachments WHERE chat_id = ?")
      .get(chatId) as { count: number };
    expect(remaining.count).toBe(0);
    expect(bucket.has(objectKey.object_key)).toBe(false);
  });
});
