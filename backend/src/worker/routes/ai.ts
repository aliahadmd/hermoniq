import { Hono, type Context } from "hono";
import { and, desc, eq, gt, inArray, isNull, lt, lte } from "drizzle-orm";
import { nanoid } from "nanoid";
import { getAgentByName } from "agents";
import { createDb } from "../../db";
import { aiChatAttachments, aiChats, aiPendingActions } from "../../db/schema";
import { executeConfirmedAction, ActionExecutionError } from "../ai/action-executor";
import { resolveAiContexts } from "../ai/context";
import { generateChatTitleFromTopic, shouldAutoGenerateTitle } from "../ai/title";
import type { AppEnv } from "../types";
import {
  aiSearchQuerySchema,
  createAiChatSchema,
  sendAiMessageSchema,
  sendAiMessageStreamSchema,
  updateAiChatSchema,
} from "../validators";

type PendingActionType =
  | "money_create_transaction"
  | "money_delete_transaction"
  | "habit_create"
  | "habit_update"
  | "habit_log_upsert"
  | "note_create"
  | "note_update"
  | "note_archive"
  | "event_create"
  | "event_update"
  | "event_delete"
  | "create_note";

type PendingActionStatus = "pending" | "confirmed" | "canceled" | "expired";

interface AiAgentMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  createdAt: string;
  attachments?: AiMessageAttachment[];
}

interface AiAgentPostMessageResult {
  userMessage: AiAgentMessage;
  assistantMessage: AiAgentMessage;
  proposedAction: {
    type: PendingActionType;
    payload: Record<string, unknown>;
  } | null;
}

interface ChatRow {
  id: string;
  userId: string;
  title: string;
  customInstruction: string;
  contextMoney: boolean;
  contextHabits: boolean;
  contextNotes: boolean;
  contextEvents: boolean;
  pinned: boolean;
  lastMessagePreview: string;
  lastActiveAt: string;
  createdAt: string;
  updatedAt: string;
}

interface ActionRow {
  id: string;
  chatId: string;
  userId: string;
  type: PendingActionType;
  payload: string;
  status: PendingActionStatus;
  expiresAt: string;
  createdAt: string;
  updatedAt: string;
}

interface StreamDonePayload {
  userMessage?: AiAgentMessage;
  assistantMessage?: AiAgentMessage;
  proposedAction?: {
    type: PendingActionType;
    payload: Record<string, unknown>;
  } | null;
}

interface StreamStartPayload {
  userMessage?: AiAgentMessage;
}

interface AiSearchResult {
  id: string;
  role: "user" | "assistant" | "system";
  snippet: string;
  createdAt: string;
}

type AttachmentStatus = "uploaded" | "linked" | "deleted";

interface AttachmentRow {
  id: string;
  userId: string;
  chatId: string;
  messageId: string | null;
  objectKey: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  width: number | null;
  height: number | null;
  status: AttachmentStatus;
  createdAt: string;
  updatedAt: string;
}

interface AiMessageAttachment {
  id: string;
  chatId: string;
  messageId: string | null;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  width: number | null;
  height: number | null;
  contentUrl: string;
  createdAt: string;
}

const ALLOWED_ATTACHMENT_MIME = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_ATTACHMENT_COUNT = 4;
const MAX_ATTACHMENT_SIZE_BYTES = 4 * 1024 * 1024;
const MAX_ATTACHMENT_TOTAL_BYTES = 12 * 1024 * 1024;

function truncatePreview(value: string, max = 140): string {
  const trimmed = value.trim();
  if (trimmed.length <= max) return trimmed;
  return `${trimmed.slice(0, max - 1)}…`;
}

function parseActionPayload(payload: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(payload);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    return parsed as Record<string, unknown>;
  } catch {
    return null;
  }
}

function attachmentContentPath(chatId: string, attachmentId: string): string {
  return `/api/ai/chats/${chatId}/attachments/${attachmentId}/content`;
}

function mapAttachment(row: AttachmentRow): AiMessageAttachment {
  return {
    id: row.id,
    chatId: row.chatId,
    messageId: row.messageId,
    fileName: row.fileName,
    mimeType: row.mimeType,
    sizeBytes: row.sizeBytes,
    width: row.width,
    height: row.height,
    contentUrl: attachmentContentPath(row.chatId, row.id),
    createdAt: row.createdAt,
  };
}

function mapChat(row: ChatRow) {
  return {
    id: row.id,
    userId: row.userId,
    title: row.title,
    customInstruction: row.customInstruction,
    contexts: {
      money: Boolean(row.contextMoney),
      habits: Boolean(row.contextHabits),
      notes: Boolean(row.contextNotes),
      events: Boolean(row.contextEvents),
    },
    pinned: Boolean(row.pinned),
    lastMessagePreview: row.lastMessagePreview,
    lastActiveAt: row.lastActiveAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function mapPendingAction(row: ActionRow) {
  return {
    id: row.id,
    chatId: row.chatId,
    userId: row.userId,
    type: row.type,
    payload: parseActionPayload(row.payload),
    status: row.status,
    expiresAt: row.expiresAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function agentUrl(pathname: string): string {
  return `https://ai-chat-session${pathname}`;
}

function parseSseFrames(
  buffer: string,
  onFrame: (eventName: string, dataText: string) => void,
): string {
  let rest = buffer;
  while (true) {
    const frameEnd = rest.indexOf("\n\n");
    if (frameEnd === -1) break;

    const frame = rest.slice(0, frameEnd);
    rest = rest.slice(frameEnd + 2);

    let eventName = "message";
    const dataLines: string[] = [];
    for (const line of frame.split("\n")) {
      if (line.startsWith("event:")) {
        eventName = line.slice(6).trim() || "message";
      }
      if (line.startsWith("data:")) {
        dataLines.push(line.slice(5).trim());
      }
    }

    if (dataLines.length > 0) {
      onFrame(eventName, dataLines.join("\n"));
    }
  }

  return rest;
}

async function getAgentStub(env: Env, userId: string, chatId: string): Promise<DurableObjectStub> {
  return getAgentByName(env.AI_CHAT_SESSION, `chat:${userId}:${chatId}`);
}

async function callAgent(stub: DurableObjectStub, pathname: string, init: RequestInit): Promise<Response> {
  return stub.fetch(
    new Request(agentUrl(pathname), {
      ...init,
      headers: {
        "content-type": "application/json",
        ...(init.headers ?? {}),
      },
    }),
  );
}

async function getOwnedChat(db: ReturnType<typeof createDb>, userId: string, chatId: string) {
  const [row] = await db
    .select({
      id: aiChats.id,
      userId: aiChats.userId,
      title: aiChats.title,
      customInstruction: aiChats.customInstruction,
      contextMoney: aiChats.contextMoney,
      contextHabits: aiChats.contextHabits,
      contextNotes: aiChats.contextNotes,
      contextEvents: aiChats.contextEvents,
      pinned: aiChats.pinned,
      lastMessagePreview: aiChats.lastMessagePreview,
      lastActiveAt: aiChats.lastActiveAt,
      createdAt: aiChats.createdAt,
      updatedAt: aiChats.updatedAt,
    })
    .from(aiChats)
    .where(and(eq(aiChats.id, chatId), eq(aiChats.userId, userId)));
  return row;
}

async function removeAttachmentObjects(env: Env, objectKeys: string[]): Promise<void> {
  if (objectKeys.length === 0) return;
  for (let index = 0; index < objectKeys.length; index += 1_000) {
    await env.AI_CHAT_MEDIA_BUCKET.delete(objectKeys.slice(index, index + 1_000));
  }
}

async function purgeStaleUploadedAttachments(
  db: ReturnType<typeof createDb>,
  env: Env,
  userId: string,
  chatId: string,
): Promise<void> {
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const staleRows = await db
    .select({
      id: aiChatAttachments.id,
      objectKey: aiChatAttachments.objectKey,
    })
    .from(aiChatAttachments)
    .where(
      and(
        eq(aiChatAttachments.userId, userId),
        eq(aiChatAttachments.chatId, chatId),
        eq(aiChatAttachments.status, "uploaded"),
        isNull(aiChatAttachments.messageId),
        lt(aiChatAttachments.createdAt, cutoff),
      ),
    );

  if (staleRows.length === 0) return;

  await removeAttachmentObjects(
    env,
    staleRows.map((row) => row.objectKey),
  );
  await db
    .delete(aiChatAttachments)
    .where(
      and(
        eq(aiChatAttachments.userId, userId),
        eq(aiChatAttachments.chatId, chatId),
        inArray(
          aiChatAttachments.id,
          staleRows.map((row) => row.id),
        ),
      ),
    );
}

async function listChatAttachments(
  db: ReturnType<typeof createDb>,
  userId: string,
  chatId: string,
): Promise<AttachmentRow[]> {
  const rows = await db
    .select({
      id: aiChatAttachments.id,
      userId: aiChatAttachments.userId,
      chatId: aiChatAttachments.chatId,
      messageId: aiChatAttachments.messageId,
      objectKey: aiChatAttachments.objectKey,
      fileName: aiChatAttachments.fileName,
      mimeType: aiChatAttachments.mimeType,
      sizeBytes: aiChatAttachments.sizeBytes,
      width: aiChatAttachments.width,
      height: aiChatAttachments.height,
      status: aiChatAttachments.status,
      createdAt: aiChatAttachments.createdAt,
      updatedAt: aiChatAttachments.updatedAt,
    })
    .from(aiChatAttachments)
    .where(and(eq(aiChatAttachments.userId, userId), eq(aiChatAttachments.chatId, chatId)));

  return rows as AttachmentRow[];
}

async function resolveMessageAttachments(
  db: ReturnType<typeof createDb>,
  userId: string,
  chatId: string,
  messageIds: string[],
): Promise<Record<string, AiMessageAttachment[]>> {
  if (messageIds.length === 0) return {};

  const rows = await db
    .select({
      id: aiChatAttachments.id,
      userId: aiChatAttachments.userId,
      chatId: aiChatAttachments.chatId,
      messageId: aiChatAttachments.messageId,
      objectKey: aiChatAttachments.objectKey,
      fileName: aiChatAttachments.fileName,
      mimeType: aiChatAttachments.mimeType,
      sizeBytes: aiChatAttachments.sizeBytes,
      width: aiChatAttachments.width,
      height: aiChatAttachments.height,
      status: aiChatAttachments.status,
      createdAt: aiChatAttachments.createdAt,
      updatedAt: aiChatAttachments.updatedAt,
    })
    .from(aiChatAttachments)
    .where(
      and(
        eq(aiChatAttachments.userId, userId),
        eq(aiChatAttachments.chatId, chatId),
        eq(aiChatAttachments.status, "linked"),
        inArray(aiChatAttachments.messageId, messageIds),
      ),
    );

  const mapped: Record<string, AiMessageAttachment[]> = {};
  for (const row of rows as AttachmentRow[]) {
    const messageId = row.messageId;
    if (!messageId) continue;
    if (!mapped[messageId]) mapped[messageId] = [];
    mapped[messageId].push(mapAttachment(row));
  }
  return mapped;
}

async function resolveUploadedAttachmentsForSend(
  db: ReturnType<typeof createDb>,
  userId: string,
  chatId: string,
  attachmentIds: string[],
): Promise<AttachmentRow[]> {
  if (attachmentIds.length === 0) return [];
  if (attachmentIds.length > MAX_ATTACHMENT_COUNT) {
    throw new Error(`You can attach up to ${MAX_ATTACHMENT_COUNT} images per message.`);
  }

  const rows = await db
    .select({
      id: aiChatAttachments.id,
      userId: aiChatAttachments.userId,
      chatId: aiChatAttachments.chatId,
      messageId: aiChatAttachments.messageId,
      objectKey: aiChatAttachments.objectKey,
      fileName: aiChatAttachments.fileName,
      mimeType: aiChatAttachments.mimeType,
      sizeBytes: aiChatAttachments.sizeBytes,
      width: aiChatAttachments.width,
      height: aiChatAttachments.height,
      status: aiChatAttachments.status,
      createdAt: aiChatAttachments.createdAt,
      updatedAt: aiChatAttachments.updatedAt,
    })
    .from(aiChatAttachments)
    .where(
      and(
        eq(aiChatAttachments.userId, userId),
        eq(aiChatAttachments.chatId, chatId),
        eq(aiChatAttachments.status, "uploaded"),
        isNull(aiChatAttachments.messageId),
        inArray(aiChatAttachments.id, attachmentIds),
      ),
    );

  if (rows.length !== attachmentIds.length) {
    throw new Error("One or more attachments are missing or already linked.");
  }

  const totalSize = (rows as AttachmentRow[]).reduce((sum, row) => sum + row.sizeBytes, 0);
  if (totalSize > MAX_ATTACHMENT_TOTAL_BYTES) {
    throw new Error("Total attachment size exceeds 12 MB.");
  }

  return rows as AttachmentRow[];
}

async function linkAttachmentsToMessage(
  db: ReturnType<typeof createDb>,
  userId: string,
  chatId: string,
  attachmentIds: string[],
  messageId: string,
): Promise<AiMessageAttachment[]> {
  if (attachmentIds.length === 0) return [];

  const now = new Date().toISOString();
  const updatedRows = await db
    .update(aiChatAttachments)
    .set({
      messageId,
      status: "linked",
      updatedAt: now,
    })
    .where(
      and(
        eq(aiChatAttachments.userId, userId),
        eq(aiChatAttachments.chatId, chatId),
        eq(aiChatAttachments.status, "uploaded"),
        isNull(aiChatAttachments.messageId),
        inArray(aiChatAttachments.id, attachmentIds),
      ),
    )
    .returning({
      id: aiChatAttachments.id,
      userId: aiChatAttachments.userId,
      chatId: aiChatAttachments.chatId,
      messageId: aiChatAttachments.messageId,
      objectKey: aiChatAttachments.objectKey,
      fileName: aiChatAttachments.fileName,
      mimeType: aiChatAttachments.mimeType,
      sizeBytes: aiChatAttachments.sizeBytes,
      width: aiChatAttachments.width,
      height: aiChatAttachments.height,
      status: aiChatAttachments.status,
      createdAt: aiChatAttachments.createdAt,
      updatedAt: aiChatAttachments.updatedAt,
    });

  return (updatedRows as AttachmentRow[]).map(mapAttachment);
}

async function deleteChatAttachments(
  db: ReturnType<typeof createDb>,
  env: Env,
  userId: string,
  chatId: string,
): Promise<void> {
  const rows = await listChatAttachments(db, userId, chatId);
  await removeAttachmentObjects(
    env,
    rows.map((row) => row.objectKey),
  );
  await db
    .delete(aiChatAttachments)
    .where(and(eq(aiChatAttachments.userId, userId), eq(aiChatAttachments.chatId, chatId)));
}

async function expirePendingActions(db: ReturnType<typeof createDb>, userId: string, chatId: string) {
  const now = new Date().toISOString();
  await db
    .update(aiPendingActions)
    .set({ status: "expired", updatedAt: now })
    .where(
      and(
        eq(aiPendingActions.userId, userId),
        eq(aiPendingActions.chatId, chatId),
        eq(aiPendingActions.status, "pending"),
        lte(aiPendingActions.expiresAt, now),
      ),
    );
}

async function createPendingAction(
  db: ReturnType<typeof createDb>,
  userId: string,
  chatId: string,
  proposedAction: {
    type: PendingActionType;
    payload: Record<string, unknown>;
  },
) {
  const now = new Date().toISOString();
  const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24).toISOString();
  const [createdAction] = await db
    .insert(aiPendingActions)
    .values({
      chatId,
      userId,
      type: proposedAction.type,
      payload: JSON.stringify(proposedAction.payload),
      status: "pending",
      expiresAt,
      createdAt: now,
      updatedAt: now,
    })
    .returning({
      id: aiPendingActions.id,
      chatId: aiPendingActions.chatId,
      userId: aiPendingActions.userId,
      type: aiPendingActions.type,
      payload: aiPendingActions.payload,
      status: aiPendingActions.status,
      expiresAt: aiPendingActions.expiresAt,
      createdAt: aiPendingActions.createdAt,
      updatedAt: aiPendingActions.updatedAt,
    });

  return mapPendingAction(createdAction as unknown as ActionRow);
}

const aiRoutes = new Hono<AppEnv>();

aiRoutes.get("/chats", async (c) => {
  const userId = c.get("user").id;
  const db = createDb(c.env.DB);

  const rows = await db
    .select({
      id: aiChats.id,
      userId: aiChats.userId,
      title: aiChats.title,
      customInstruction: aiChats.customInstruction,
      contextMoney: aiChats.contextMoney,
      contextHabits: aiChats.contextHabits,
      contextNotes: aiChats.contextNotes,
      contextEvents: aiChats.contextEvents,
      pinned: aiChats.pinned,
      lastMessagePreview: aiChats.lastMessagePreview,
      lastActiveAt: aiChats.lastActiveAt,
      createdAt: aiChats.createdAt,
      updatedAt: aiChats.updatedAt,
    })
    .from(aiChats)
    .where(eq(aiChats.userId, userId))
    .orderBy(desc(aiChats.pinned), desc(aiChats.lastActiveAt));

  return c.json(rows.map((row) => mapChat(row as ChatRow)));
});

aiRoutes.post("/chats", async (c) => {
  const userId = c.get("user").id;
  const db = createDb(c.env.DB);
  const body = await c.req.json();
  const parsed = createAiChatSchema.parse(body);
  const contexts = resolveAiContexts(parsed.contexts);

  const now = new Date().toISOString();
  const title = parsed.title?.trim() || "New chat";
  const [created] = await db
    .insert(aiChats)
    .values({
      userId,
      title,
      customInstruction: parsed.customInstruction?.trim() ?? "",
      contextMoney: contexts.money,
      contextHabits: contexts.habits,
      contextNotes: contexts.notes,
      contextEvents: contexts.events,
      lastActiveAt: now,
      createdAt: now,
      updatedAt: now,
    })
    .returning({
      id: aiChats.id,
      userId: aiChats.userId,
      title: aiChats.title,
      customInstruction: aiChats.customInstruction,
      contextMoney: aiChats.contextMoney,
      contextHabits: aiChats.contextHabits,
      contextNotes: aiChats.contextNotes,
      contextEvents: aiChats.contextEvents,
      pinned: aiChats.pinned,
      lastMessagePreview: aiChats.lastMessagePreview,
      lastActiveAt: aiChats.lastActiveAt,
      createdAt: aiChats.createdAt,
      updatedAt: aiChats.updatedAt,
    });

  return c.json(mapChat(created as ChatRow), 201);
});

aiRoutes.patch("/chats/:id", async (c) => {
  const userId = c.get("user").id;
  const chatId = c.req.param("id");
  const db = createDb(c.env.DB);
  const body = await c.req.json();
  const parsed = updateAiChatSchema.parse(body);

  const existing = await getOwnedChat(db, userId, chatId);
  if (!existing) {
    return c.json({ error: "Chat not found" }, 404);
  }

  const nextContexts = parsed.contexts
    ? resolveAiContexts({
        money: parsed.contexts.money ?? existing.contextMoney,
        habits: parsed.contexts.habits ?? existing.contextHabits,
        notes: parsed.contexts.notes ?? existing.contextNotes,
        events: parsed.contexts.events ?? existing.contextEvents,
      })
    : resolveAiContexts({
        money: existing.contextMoney,
        habits: existing.contextHabits,
        notes: existing.contextNotes,
        events: existing.contextEvents,
      });

  const nextTitle = parsed.title?.trim();
  if (nextTitle !== undefined && nextTitle.length === 0) {
    return c.json({ error: "Title is required" }, 400);
  }

  const [updated] = await db
    .update(aiChats)
    .set({
      title: nextTitle ?? existing.title,
      customInstruction: parsed.customInstruction?.trim() ?? existing.customInstruction,
      pinned: parsed.pinned ?? existing.pinned,
      contextMoney: nextContexts.money,
      contextHabits: nextContexts.habits,
      contextNotes: nextContexts.notes,
      contextEvents: nextContexts.events,
      updatedAt: new Date().toISOString(),
    })
    .where(and(eq(aiChats.id, chatId), eq(aiChats.userId, userId)))
    .returning({
      id: aiChats.id,
      userId: aiChats.userId,
      title: aiChats.title,
      customInstruction: aiChats.customInstruction,
      contextMoney: aiChats.contextMoney,
      contextHabits: aiChats.contextHabits,
      contextNotes: aiChats.contextNotes,
      contextEvents: aiChats.contextEvents,
      pinned: aiChats.pinned,
      lastMessagePreview: aiChats.lastMessagePreview,
      lastActiveAt: aiChats.lastActiveAt,
      createdAt: aiChats.createdAt,
      updatedAt: aiChats.updatedAt,
    });

  return c.json(mapChat(updated as ChatRow));
});

aiRoutes.post("/chats/:id/reset", async (c) => {
  const userId = c.get("user").id;
  const chatId = c.req.param("id");
  const db = createDb(c.env.DB);

  const existing = await getOwnedChat(db, userId, chatId);
  if (!existing) {
    return c.json({ error: "Chat not found" }, 404);
  }

  try {
    const stub = await getAgentStub(c.env, userId, chatId);
    const resetResponse = await callAgent(stub, "/reset", {
      method: "POST",
      body: JSON.stringify({ clearVectors: true }),
    });

    if (!resetResponse.ok) {
      return c.json({ error: "Failed to reset chat context" }, 502);
    }

    await deleteChatAttachments(db, c.env, userId, chatId);
  } catch (error) {
    console.error("AI chat reset failed", {
      userId,
      chatId,
      error: error instanceof Error ? error.message : String(error),
    });
    return c.json({ error: "Failed to reset chat context" }, 502);
  }

  const now = new Date().toISOString();
  const [updated] = await db
    .update(aiChats)
    .set({
      lastMessagePreview: "",
      lastActiveAt: now,
      updatedAt: now,
    })
    .where(and(eq(aiChats.id, chatId), eq(aiChats.userId, userId)))
    .returning({
      id: aiChats.id,
      userId: aiChats.userId,
      title: aiChats.title,
      customInstruction: aiChats.customInstruction,
      contextMoney: aiChats.contextMoney,
      contextHabits: aiChats.contextHabits,
      contextNotes: aiChats.contextNotes,
      contextEvents: aiChats.contextEvents,
      pinned: aiChats.pinned,
      lastMessagePreview: aiChats.lastMessagePreview,
      lastActiveAt: aiChats.lastActiveAt,
      createdAt: aiChats.createdAt,
      updatedAt: aiChats.updatedAt,
    });

  return c.json({ success: true, chat: mapChat(updated as ChatRow) });
});

aiRoutes.delete("/chats/:id", async (c) => {
  const userId = c.get("user").id;
  const chatId = c.req.param("id");
  const db = createDb(c.env.DB);

  const existing = await getOwnedChat(db, userId, chatId);
  if (!existing) {
    return c.json({ error: "Chat not found" }, 404);
  }

  try {
    const stub = await getAgentStub(c.env, userId, chatId);
    await callAgent(stub, "/reset", {
      method: "POST",
      body: JSON.stringify({ clearVectors: true }),
    });
  } catch {
    // Ignore cleanup failures; chat row deletion still enforces ownership isolation.
  }

  try {
    await deleteChatAttachments(db, c.env, userId, chatId);
  } catch {
    // Ignore attachment cleanup failures during delete.
  }

  await db.delete(aiChats).where(and(eq(aiChats.id, chatId), eq(aiChats.userId, userId)));
  return c.json({ success: true });
});

aiRoutes.get("/chats/:id/search", async (c) => {
  const userId = c.get("user").id;
  const chatId = c.req.param("id");
  const db = createDb(c.env.DB);

  const existing = await getOwnedChat(db, userId, chatId);
  if (!existing) {
    return c.json({ error: "Chat not found" }, 404);
  }

  const parsedQuery = aiSearchQuerySchema.parse({
    q: c.req.query("q") ?? "",
    limit: c.req.query("limit") ? Number(c.req.query("limit")) : undefined,
  });

  try {
    const stub = await getAgentStub(c.env, userId, chatId);
    const query = new URLSearchParams({
      q: parsedQuery.q,
      limit: String(parsedQuery.limit ?? 20),
    });
    const res = await stub.fetch(new Request(agentUrl(`/messages/search?${query.toString()}`), { method: "GET" }));
    if (!res.ok) {
      return c.json({ error: "Search failed" }, 502);
    }

    const body = (await res.json()) as { results?: AiSearchResult[] };
    return c.json({ results: body.results ?? [] });
  } catch (error) {
    console.error("AI chat search failed", {
      userId,
      chatId,
      error: error instanceof Error ? error.message : String(error),
    });
    return c.json({ error: "Search failed" }, 502);
  }
});

aiRoutes.post("/chats/:id/attachments", async (c) => {
  const userId = c.get("user").id;
  const chatId = c.req.param("id");
  const db = createDb(c.env.DB);

  const existing = await getOwnedChat(db, userId, chatId);
  if (!existing) {
    return c.json({ error: "Chat not found" }, 404);
  }

  await purgeStaleUploadedAttachments(db, c.env, userId, chatId);

  const formData = await c.req.raw.formData().catch(() => null);
  const file = formData?.get("file");
  if (!(file instanceof File)) {
    return c.json({ error: "Expected an image file upload" }, 400);
  }

  const mimeType = (file.type || String(formData?.get("mimeType") ?? "")).toLowerCase();
  if (!ALLOWED_ATTACHMENT_MIME.has(mimeType)) {
    return c.json({ error: "Unsupported image format. Use JPG, PNG, or WebP." }, 400);
  }

  if (file.size > MAX_ATTACHMENT_SIZE_BYTES) {
    return c.json({ error: "Each image must be 4 MB or smaller." }, 400);
  }

  const uploadedRows = await db
    .select({ id: aiChatAttachments.id })
    .from(aiChatAttachments)
    .where(
      and(
        eq(aiChatAttachments.userId, userId),
        eq(aiChatAttachments.chatId, chatId),
        eq(aiChatAttachments.status, "uploaded"),
        isNull(aiChatAttachments.messageId),
      ),
    );
  if (uploadedRows.length >= MAX_ATTACHMENT_COUNT) {
    return c.json({ error: "You can upload up to 4 images before sending." }, 400);
  }

  const attachmentId = nanoid();
  const objectKey = `u/${userId}/c/${chatId}/a/${attachmentId}`;
  const fileName = file.name?.trim() || `${attachmentId}.jpg`;
  const widthInput = Number(formData?.get("width") ?? "");
  const heightInput = Number(formData?.get("height") ?? "");
  const width = Number.isFinite(widthInput) && widthInput > 0 ? Math.round(widthInput) : null;
  const height = Number.isFinite(heightInput) && heightInput > 0 ? Math.round(heightInput) : null;

  const fileBytes = await file.arrayBuffer();
  await c.env.AI_CHAT_MEDIA_BUCKET.put(objectKey, fileBytes, {
    httpMetadata: {
      contentType: mimeType,
    },
    customMetadata: {
      userId,
      chatId,
      attachmentId,
      fileName,
    },
  });

  const now = new Date().toISOString();
  const [created] = await db
    .insert(aiChatAttachments)
    .values({
      id: attachmentId,
      userId,
      chatId,
      objectKey,
      fileName,
      mimeType,
      sizeBytes: file.size,
      width,
      height,
      status: "uploaded",
      createdAt: now,
      updatedAt: now,
    })
    .returning({
      id: aiChatAttachments.id,
      userId: aiChatAttachments.userId,
      chatId: aiChatAttachments.chatId,
      messageId: aiChatAttachments.messageId,
      objectKey: aiChatAttachments.objectKey,
      fileName: aiChatAttachments.fileName,
      mimeType: aiChatAttachments.mimeType,
      sizeBytes: aiChatAttachments.sizeBytes,
      width: aiChatAttachments.width,
      height: aiChatAttachments.height,
      status: aiChatAttachments.status,
      createdAt: aiChatAttachments.createdAt,
      updatedAt: aiChatAttachments.updatedAt,
    });

  return c.json({ attachment: mapAttachment(created as AttachmentRow) }, 201);
});

aiRoutes.delete("/chats/:id/attachments/:attachmentId", async (c) => {
  const userId = c.get("user").id;
  const chatId = c.req.param("id");
  const attachmentId = c.req.param("attachmentId");
  const db = createDb(c.env.DB);

  const existing = await getOwnedChat(db, userId, chatId);
  if (!existing) {
    return c.json({ error: "Chat not found" }, 404);
  }

  const [row] = await db
    .select({
      id: aiChatAttachments.id,
      userId: aiChatAttachments.userId,
      chatId: aiChatAttachments.chatId,
      messageId: aiChatAttachments.messageId,
      objectKey: aiChatAttachments.objectKey,
      fileName: aiChatAttachments.fileName,
      mimeType: aiChatAttachments.mimeType,
      sizeBytes: aiChatAttachments.sizeBytes,
      width: aiChatAttachments.width,
      height: aiChatAttachments.height,
      status: aiChatAttachments.status,
      createdAt: aiChatAttachments.createdAt,
      updatedAt: aiChatAttachments.updatedAt,
    })
    .from(aiChatAttachments)
    .where(
      and(
        eq(aiChatAttachments.id, attachmentId),
        eq(aiChatAttachments.chatId, chatId),
        eq(aiChatAttachments.userId, userId),
        eq(aiChatAttachments.status, "uploaded"),
        isNull(aiChatAttachments.messageId),
      ),
    );

  if (!row) {
    return c.json({ error: "Attachment not found" }, 404);
  }

  await c.env.AI_CHAT_MEDIA_BUCKET.delete(row.objectKey);
  await db
    .delete(aiChatAttachments)
    .where(and(eq(aiChatAttachments.id, attachmentId), eq(aiChatAttachments.userId, userId)));

  return c.json({ success: true });
});

aiRoutes.get("/chats/:id/attachments/:attachmentId/content", async (c) => {
  const userId = c.get("user").id;
  const chatId = c.req.param("id");
  const attachmentId = c.req.param("attachmentId");
  const db = createDb(c.env.DB);

  const [row] = await db
    .select({
      id: aiChatAttachments.id,
      userId: aiChatAttachments.userId,
      chatId: aiChatAttachments.chatId,
      messageId: aiChatAttachments.messageId,
      objectKey: aiChatAttachments.objectKey,
      fileName: aiChatAttachments.fileName,
      mimeType: aiChatAttachments.mimeType,
      sizeBytes: aiChatAttachments.sizeBytes,
      width: aiChatAttachments.width,
      height: aiChatAttachments.height,
      status: aiChatAttachments.status,
      createdAt: aiChatAttachments.createdAt,
      updatedAt: aiChatAttachments.updatedAt,
    })
    .from(aiChatAttachments)
    .where(
      and(
        eq(aiChatAttachments.id, attachmentId),
        eq(aiChatAttachments.chatId, chatId),
        eq(aiChatAttachments.userId, userId),
      ),
    );

  if (!row) {
    return c.json({ error: "Attachment not found" }, 404);
  }

  const object = await c.env.AI_CHAT_MEDIA_BUCKET.get(row.objectKey);
  if (!object || !object.body) {
    return c.json({ error: "Attachment not found" }, 404);
  }

  return new Response(object.body, {
    status: 200,
    headers: {
      "content-type": row.mimeType || object.httpMetadata?.contentType || "application/octet-stream",
      "content-length": String(object.size),
      "cache-control": "private, max-age=300",
      "content-disposition": `inline; filename*=UTF-8''${encodeURIComponent(row.fileName)}`,
      "x-content-type-options": "nosniff",
    },
  });
});

aiRoutes.get("/chats/:id/messages", async (c) => {
  const userId = c.get("user").id;
  const chatId = c.req.param("id");
  const db = createDb(c.env.DB);
  const limit = Number(c.req.query("limit") ?? "150");

  const existing = await getOwnedChat(db, userId, chatId);
  if (!existing) {
    return c.json({ error: "Chat not found" }, 404);
  }

  await purgeStaleUploadedAttachments(db, c.env, userId, chatId);
  await expirePendingActions(db, userId, chatId);

  let messages: AiAgentMessage[] = [];
  try {
    const stub = await getAgentStub(c.env, userId, chatId);
    const res = await stub.fetch(
      new Request(agentUrl(`/messages?limit=${Number.isFinite(limit) ? limit : 150}`), {
        method: "GET",
      }),
    );
    if (res.ok) {
      const body = (await res.json()) as { messages?: AiAgentMessage[] };
      messages = Array.isArray(body.messages) ? body.messages : [];
    }
  } catch {
    messages = [];
  }

  const messageAttachmentsById = await resolveMessageAttachments(
    db,
    userId,
    chatId,
    messages.map((message) => message.id),
  );
  const enrichedMessages = messages.map((message) => ({
    ...message,
    attachments: messageAttachmentsById[message.id] ?? [],
  }));

  const pendingRows = await db
    .select({
      id: aiPendingActions.id,
      chatId: aiPendingActions.chatId,
      userId: aiPendingActions.userId,
      type: aiPendingActions.type,
      payload: aiPendingActions.payload,
      status: aiPendingActions.status,
      expiresAt: aiPendingActions.expiresAt,
      createdAt: aiPendingActions.createdAt,
      updatedAt: aiPendingActions.updatedAt,
    })
    .from(aiPendingActions)
    .where(
      and(
        eq(aiPendingActions.chatId, chatId),
        eq(aiPendingActions.userId, userId),
        eq(aiPendingActions.status, "pending"),
        gt(aiPendingActions.expiresAt, new Date().toISOString()),
      ),
    )
    .orderBy(desc(aiPendingActions.createdAt));

  return c.json({
    messages: enrichedMessages,
    pendingActions: pendingRows.map((row) => mapPendingAction(row as unknown as ActionRow)),
  });
});

aiRoutes.post("/chats/:id/messages", async (c) => {
  const userId = c.get("user").id;
  const chatId = c.req.param("id");
  const db = createDb(c.env.DB);
  const body = await c.req.json();
  const parsed = sendAiMessageSchema.parse(body);
  const messageText = parsed.message?.trim() ?? "";
  const attachmentIds = parsed.attachmentIds ?? [];

  const existing = await getOwnedChat(db, userId, chatId);
  if (!existing) {
    return c.json({ error: "Chat not found" }, 404);
  }

  await purgeStaleUploadedAttachments(db, c.env, userId, chatId);

  let uploadedAttachments: AttachmentRow[] = [];
  try {
    uploadedAttachments = await resolveUploadedAttachmentsForSend(db, userId, chatId, attachmentIds);
  } catch (error) {
    return c.json({ error: error instanceof Error ? error.message : "Invalid attachments" }, 400);
  }

  const mergedContexts = resolveAiContexts({
    money: parsed.contexts?.money ?? existing.contextMoney,
    habits: parsed.contexts?.habits ?? existing.contextHabits,
    notes: parsed.contexts?.notes ?? existing.contextNotes,
    events: parsed.contexts?.events ?? existing.contextEvents,
  });

  if (parsed.contexts) {
    await db
      .update(aiChats)
      .set({
        contextMoney: mergedContexts.money,
        contextHabits: mergedContexts.habits,
        contextNotes: mergedContexts.notes,
        contextEvents: mergedContexts.events,
        updatedAt: new Date().toISOString(),
      })
      .where(and(eq(aiChats.id, chatId), eq(aiChats.userId, userId)));
  }

  let agentResponse: Response;
  try {
    const stub = await getAgentStub(c.env, userId, chatId);
    agentResponse = await callAgent(stub, "/message", {
      method: "POST",
      body: JSON.stringify({
        userId,
        chatId,
        message: messageText,
        timezone: parsed.timezone,
        attachments: uploadedAttachments.map((attachment) => ({
          id: attachment.id,
          objectKey: attachment.objectKey,
          mimeType: attachment.mimeType,
          fileName: attachment.fileName,
        })),
        contexts: mergedContexts,
        customInstruction: existing.customInstruction,
      }),
    });
  } catch (error) {
    console.error("AI chat agent request failed", {
      userId,
      chatId,
      error: error instanceof Error ? error.message : String(error),
    });
    return c.json({ error: "AI assistant failed to process message" }, 502);
  }

  if (!agentResponse.ok) {
    return c.json({ error: "AI assistant failed to process message" }, 502);
  }

  const result = (await agentResponse.json()) as AiAgentPostMessageResult;
  const now = new Date().toISOString();
  const titleSource = messageText || uploadedAttachments[0]?.fileName || existing.title;
  const generatedTitle = shouldAutoGenerateTitle(existing.title)
    ? generateChatTitleFromTopic(titleSource)
    : existing.title;

  await db
    .update(aiChats)
    .set({
      title: generatedTitle,
      lastMessagePreview: truncatePreview(result.assistantMessage.content),
      lastActiveAt: now,
      updatedAt: now,
    })
    .where(and(eq(aiChats.id, chatId), eq(aiChats.userId, userId)));

  const linkedAttachments = await linkAttachmentsToMessage(
    db,
    userId,
    chatId,
    attachmentIds,
    result.userMessage.id,
  );

  let pendingAction: ReturnType<typeof mapPendingAction> | null = null;
  if (result.proposedAction) {
    pendingAction = await createPendingAction(db, userId, chatId, result.proposedAction);
  }

  return c.json(
    {
      userMessage: {
        ...result.userMessage,
        attachments: linkedAttachments,
      },
      assistantMessage: result.assistantMessage,
      pendingAction,
    },
    201,
  );
});

aiRoutes.post("/chats/:id/messages/stream", async (c) => {
  const userId = c.get("user").id;
  const chatId = c.req.param("id");
  const db = createDb(c.env.DB);
  const body = await c.req.json();
  const parsed = sendAiMessageStreamSchema.parse(body);
  const messageText = parsed.message?.trim() ?? "";
  const attachmentIds = parsed.attachmentIds ?? [];

  const existing = await getOwnedChat(db, userId, chatId);
  if (!existing) {
    return c.json({ error: "Chat not found" }, 404);
  }

  await purgeStaleUploadedAttachments(db, c.env, userId, chatId);

  let uploadedAttachments: AttachmentRow[] = [];
  try {
    uploadedAttachments = await resolveUploadedAttachmentsForSend(db, userId, chatId, attachmentIds);
  } catch (error) {
    return c.json({ error: error instanceof Error ? error.message : "Invalid attachments" }, 400);
  }

  const mergedContexts = resolveAiContexts({
    money: parsed.contexts?.money ?? existing.contextMoney,
    habits: parsed.contexts?.habits ?? existing.contextHabits,
    notes: parsed.contexts?.notes ?? existing.contextNotes,
    events: parsed.contexts?.events ?? existing.contextEvents,
  });

  if (parsed.contexts) {
    await db
      .update(aiChats)
      .set({
        contextMoney: mergedContexts.money,
        contextHabits: mergedContexts.habits,
        contextNotes: mergedContexts.notes,
        contextEvents: mergedContexts.events,
        updatedAt: new Date().toISOString(),
      })
      .where(and(eq(aiChats.id, chatId), eq(aiChats.userId, userId)));
  }

  let agentResponse: Response;
  try {
    const stub = await getAgentStub(c.env, userId, chatId);
    agentResponse = await callAgent(stub, "/message/stream", {
      method: "POST",
      body: JSON.stringify({
        userId,
        chatId,
        message: messageText,
        timezone: parsed.timezone,
        attachments: uploadedAttachments.map((attachment) => ({
          id: attachment.id,
          objectKey: attachment.objectKey,
          mimeType: attachment.mimeType,
          fileName: attachment.fileName,
        })),
        contexts: mergedContexts,
        customInstruction: existing.customInstruction,
      }),
    });
  } catch (error) {
    console.error("AI chat stream request failed", {
      userId,
      chatId,
      error: error instanceof Error ? error.message : String(error),
    });
    return c.json({ error: "AI assistant failed to process message" }, 502);
  }

  if (!agentResponse.ok || !agentResponse.body) {
    return c.json({ error: "AI assistant failed to process message" }, 502);
  }

  const decoder = new TextDecoder();
  let frameBuffer = "";
  let donePayload: StreamDonePayload | null = null;
  let startPayload: StreamStartPayload | null = null;

  const stream = agentResponse.body.pipeThrough(
    new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, controller) {
        controller.enqueue(chunk);
        frameBuffer += decoder.decode(chunk, { stream: true });
        frameBuffer = parseSseFrames(frameBuffer, (eventName, dataText) => {
          if (eventName === "start") {
            try {
              startPayload = JSON.parse(dataText) as StreamStartPayload;
            } catch {
              startPayload = null;
            }
            return;
          }
          if (eventName === "done") {
            try {
              donePayload = JSON.parse(dataText) as StreamDonePayload;
            } catch {
              donePayload = null;
            }
          }
        });
      },
      async flush() {
        frameBuffer += decoder.decode();
        frameBuffer = parseSseFrames(frameBuffer, (eventName, dataText) => {
          if (eventName === "start") {
            try {
              startPayload = JSON.parse(dataText) as StreamStartPayload;
            } catch {
              startPayload = null;
            }
            return;
          }
          if (eventName === "done") {
            try {
              donePayload = JSON.parse(dataText) as StreamDonePayload;
            } catch {
              donePayload = null;
            }
          }
        });

        const userMessageId = startPayload?.userMessage?.id ?? donePayload?.userMessage?.id;
        if (userMessageId) {
          await linkAttachmentsToMessage(db, userId, chatId, attachmentIds, userMessageId);
        }

        const assistantMessage = donePayload?.assistantMessage;
        if (!assistantMessage) return;

        const now = new Date().toISOString();
        const titleSource = messageText || uploadedAttachments[0]?.fileName || existing.title;
        const generatedTitle = shouldAutoGenerateTitle(existing.title)
          ? generateChatTitleFromTopic(titleSource)
          : existing.title;

        await db
          .update(aiChats)
          .set({
            title: generatedTitle,
            lastMessagePreview: truncatePreview(assistantMessage.content),
            lastActiveAt: now,
            updatedAt: now,
          })
          .where(and(eq(aiChats.id, chatId), eq(aiChats.userId, userId)));

        if (donePayload?.proposedAction) {
          await createPendingAction(db, userId, chatId, donePayload.proposedAction);
        }
      },
    }),
  );

  return new Response(stream, {
    status: 200,
    headers: {
      "content-type": "text/event-stream",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
    },
  });
});

aiRoutes.post("/chats/:id/actions/:actionId/confirm", async (c) => {
  const userId = c.get("user").id;
  const chatId = c.req.param("id");
  const actionId = c.req.param("actionId");
  const db = createDb(c.env.DB);

  const existing = await getOwnedChat(db, userId, chatId);
  if (!existing) {
    return c.json({ error: "Chat not found" }, 404);
  }

  await expirePendingActions(db, userId, chatId);

  const [action] = await db
    .select({
      id: aiPendingActions.id,
      chatId: aiPendingActions.chatId,
      userId: aiPendingActions.userId,
      type: aiPendingActions.type,
      payload: aiPendingActions.payload,
      status: aiPendingActions.status,
      expiresAt: aiPendingActions.expiresAt,
      createdAt: aiPendingActions.createdAt,
      updatedAt: aiPendingActions.updatedAt,
    })
    .from(aiPendingActions)
    .where(
      and(
        eq(aiPendingActions.id, actionId),
        eq(aiPendingActions.chatId, chatId),
        eq(aiPendingActions.userId, userId),
        eq(aiPendingActions.status, "pending"),
      ),
    );

  if (!action) {
    return c.json({ error: "Pending action not found" }, 404);
  }

  const payload = parseActionPayload(action.payload);
  if (!payload) {
    return c.json({ error: "Invalid action payload" }, 400);
  }

  let result: unknown;
  try {
    result = await executeConfirmedAction({
      db,
      userId,
      type: action.type,
      payload,
    });
  } catch (error) {
    if (error instanceof ActionExecutionError) {
      const status = [400, 401, 403, 404, 409, 422].includes(error.status) ? error.status : 400;
      return c.json({ error: error.message }, status as 400 | 401 | 403 | 404 | 409 | 422);
    }
    return c.json({ error: "Failed to execute action" }, 500);
  }

  const [updatedAction] = await db
    .update(aiPendingActions)
    .set({
      status: "confirmed",
      updatedAt: new Date().toISOString(),
    })
    .where(and(eq(aiPendingActions.id, actionId), eq(aiPendingActions.userId, userId)))
    .returning({
      id: aiPendingActions.id,
      chatId: aiPendingActions.chatId,
      userId: aiPendingActions.userId,
      type: aiPendingActions.type,
      payload: aiPendingActions.payload,
      status: aiPendingActions.status,
      expiresAt: aiPendingActions.expiresAt,
      createdAt: aiPendingActions.createdAt,
      updatedAt: aiPendingActions.updatedAt,
    });

  return c.json({
    success: true,
    action: mapPendingAction(updatedAction as unknown as ActionRow),
    result,
  });
});

async function cancelActionHandler(c: Context<AppEnv>) {
  const userId = c.get("user").id;
  const chatId = c.req.param("id");
  const actionId = c.req.param("actionId");
  const db = createDb(c.env.DB);

  const existing = await getOwnedChat(db, userId, chatId);
  if (!existing) {
    return c.json({ error: "Chat not found" }, 404);
  }

  await expirePendingActions(db, userId, chatId);

  const [updated] = await db
    .update(aiPendingActions)
    .set({
      status: "canceled",
      updatedAt: new Date().toISOString(),
    })
    .where(
      and(
        eq(aiPendingActions.id, actionId),
        eq(aiPendingActions.chatId, chatId),
        eq(aiPendingActions.userId, userId),
        eq(aiPendingActions.status, "pending"),
      ),
    )
    .returning({
      id: aiPendingActions.id,
      chatId: aiPendingActions.chatId,
      userId: aiPendingActions.userId,
      type: aiPendingActions.type,
      payload: aiPendingActions.payload,
      status: aiPendingActions.status,
      expiresAt: aiPendingActions.expiresAt,
      createdAt: aiPendingActions.createdAt,
      updatedAt: aiPendingActions.updatedAt,
    });

  if (!updated) {
    return c.json({ error: "Pending action not found" }, 404);
  }

  return c.json({ success: true, action: mapPendingAction(updated as unknown as ActionRow) });
}

aiRoutes.post("/chats/:id/actions/:actionId/cancel", cancelActionHandler);
aiRoutes.post("/chats/:id/actions/:actionId/reject", cancelActionHandler);

export { aiRoutes };
