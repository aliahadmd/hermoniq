import { Agent } from "agents";
import { nanoid } from "nanoid";
import { createDb } from "../../db";
import { buildActionProposalWithFallback } from "../ai/action-planner";
import { queryAiSearchContext } from "../ai/ai-search";
import { buildUserContextSnapshot, resolveAiContexts } from "../ai/context";
import { DEFAULT_CHAT_MODEL, FALLBACK_CHAT_MODEL } from "../ai/models";
import {
  buildAssistantSystemPrompt,
  buildRetrievalSection,
  type AiPendingActionProposal,
} from "../ai/prompt";
import { extractVisionContextForAttachments } from "../ai/vision";
import {
  deleteVectorMemories,
  queryVectorMemories,
  upsertConversationMemory,
} from "../ai/vector-memory";

type MessageRole = "user" | "assistant" | "system";

interface AgentMessage {
  id: string;
  role: MessageRole;
  content: string;
  createdAt: string;
}

interface MessageRow {
  id: string;
  role: MessageRole;
  content: string;
  created_at: string;
}

interface SearchRow {
  id: string;
  role: MessageRole;
  content: string;
  created_at: string;
}

interface VectorRefRow {
  vector_id: string;
}

interface PostMessageBody {
  userId: string;
  chatId: string;
  message?: string;
  timezone?: string;
  attachments?: Array<{
    id: string;
    objectKey: string;
    mimeType: string;
    fileName: string;
  }>;
  customInstruction?: string;
  contexts?: {
    money?: boolean;
    habits?: boolean;
    notes?: boolean;
    events?: boolean;
  };
}

interface ResetBody {
  clearVectors?: boolean;
}

interface AiRunMessage {
  role: MessageRole;
  content: string;
}

interface AiRunResponseLike {
  response?: string;
  result?: {
    response?: string;
  };
}

interface PostMessageResponse {
  userMessage: AgentMessage;
  assistantMessage: AgentMessage;
  proposedAction: AiPendingActionProposal | null;
}

interface SearchResult {
  id: string;
  role: MessageRole;
  snippet: string;
  createdAt: string;
}

const AI_RUN_TIMEOUT_MS = 25_000;

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json",
    },
  });
}

function parseAiText(raw: unknown): string | null {
  if (!raw || typeof raw !== "object") return null;
  const typed = raw as AiRunResponseLike;
  if (typeof typed.response === "string" && typed.response.length > 0) {
    return typed.response;
  }
  if (typeof typed.result?.response === "string" && typed.result.response.length > 0) {
    return typed.result.response;
  }
  return null;
}

function toAgentMessage(row: MessageRow): AgentMessage {
  return {
    id: row.id,
    role: row.role,
    content: row.content,
    createdAt: row.created_at,
  };
}

function sseEvent(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

function buildSnippet(content: string, query: string): string {
  const normalized = content.toLowerCase();
  const needle = query.toLowerCase();
  const index = normalized.indexOf(needle);
  if (index < 0) return content.slice(0, 220);
  const start = Math.max(0, index - 48);
  const end = Math.min(content.length, index + needle.length + 96);
  return content.slice(start, end).trim();
}

function extractSseTextChunk(data: string): string {
  if (!data || data === "[DONE]") return "";

  try {
    const parsed = JSON.parse(data) as Record<string, unknown>;

    if (typeof parsed.response === "string") return parsed.response;
    if (
      parsed.result &&
      typeof parsed.result === "object" &&
      typeof (parsed.result as { response?: unknown }).response === "string"
    ) {
      return (parsed.result as { response: string }).response;
    }
    if (typeof parsed.content === "string") return parsed.content;
    if (
      parsed.delta &&
      typeof parsed.delta === "object" &&
      typeof (parsed.delta as { content?: unknown }).content === "string"
    ) {
      return (parsed.delta as { content: string }).content;
    }
    if (Array.isArray(parsed.choices) && parsed.choices.length > 0) {
      const first = parsed.choices[0] as
        | {
            delta?: { content?: string };
            message?: { content?: string };
            text?: string;
          }
        | undefined;
      if (typeof first?.delta?.content === "string") return first.delta.content;
      if (typeof first?.message?.content === "string") return first.message.content;
      if (typeof first?.text === "string") return first.text;
    }
  } catch {
    return data;
  }

  return "";
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function emitWords(
  controller: ReadableStreamDefaultController<Uint8Array>,
  encoder: TextEncoder,
  content: string,
  delayMs = 0,
) {
  if (!content.trim()) return;
  const words = content.match(/\S+\s*/g) ?? [content];
  for (const word of words) {
    controller.enqueue(encoder.encode(sseEvent("delta", { text: word })));
    if (delayMs > 0 && words.length <= 500) {
      await delay(delayMs);
    }
  }
}

function looksLikeImageCapabilityRefusal(content: string): boolean {
  const normalized = content.toLowerCase();
  return (
    /text[-\s]?based ai/.test(normalized) ||
    /(cannot|can't|do not|don't)\s+(?:visually\s+)?(?:read|interpret|analy[sz]e)\s+images?/.test(normalized) ||
    /i\s+do\s+not\s+have\s+the\s+capability\s+to\s+(?:visually\s+)?(?:read|interpret)\s+images?/.test(normalized)
  );
}

function enforceVisionAnswer(content: string, imageContextChunks: string[]): string {
  if (imageContextChunks.length === 0) return content;
  if (!looksLikeImageCapabilityRefusal(content)) return content;

  const excerpt = imageContextChunks.slice(0, 3).join("\n");
  return [
    "I processed your attached image and extracted the following:",
    excerpt,
    "",
    "If you want, I can convert this into a note, habit, money transaction draft, or event draft for confirmation.",
  ].join("\n");
}

function summarizeProposedAction(proposedAction: AiPendingActionProposal): string {
  switch (proposedAction.type) {
    case "note_create":
      return "Draft note ready. Review the request card below to accept or reject.";
    case "note_update":
      return "Draft note update ready. Review the request card below to accept or reject.";
    case "note_archive":
      return "Draft note archive ready. Review the request card below to accept or reject.";
    case "habit_create":
      return "Draft habit ready. Review the request card below to accept or reject.";
    case "habit_update":
      return "Draft habit update ready. Review the request card below to accept or reject.";
    case "habit_log_upsert":
      return "Draft habit log ready. Review the request card below to accept or reject.";
    case "money_create_transaction":
      return "Draft transaction ready. Review the request card below to accept or reject.";
    case "money_delete_transaction":
      return "Draft transaction delete ready. Review the request card below to accept or reject.";
    case "event_create":
      return "Draft event ready. Review the request card below to accept or reject.";
    case "event_update":
      return "Draft event update ready. Review the request card below to accept or reject.";
    case "event_delete":
      return "Draft event delete ready. Review the request card below to accept or reject.";
    default:
      return "Draft action ready. Review the request card below to accept or reject.";
  }
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error(`${label} timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    promise.then(
      (value) => {
        clearTimeout(timeout);
        resolve(value);
      },
      (error) => {
        clearTimeout(timeout);
        reject(error);
      },
    );
  });
}

export class AiChatSessionAgent extends Agent<Env> {
  async onStart() {
    void this.sql`CREATE TABLE IF NOT EXISTS chat_messages (
      id TEXT PRIMARY KEY,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      created_at TEXT NOT NULL
    )`;
    void this.sql`CREATE INDEX IF NOT EXISTS chat_messages_created_idx ON chat_messages(created_at)`;
    void this.sql`CREATE TABLE IF NOT EXISTS chat_vector_refs (
      id TEXT PRIMARY KEY,
      vector_id TEXT NOT NULL,
      created_at TEXT NOT NULL
    )`;
  }

  private readMessages(limit: number): AgentMessage[] {
    const safeLimit = Math.max(1, Math.min(limit, 300));
    const rows = this.sql<MessageRow>`
      SELECT id, role, content, created_at
      FROM chat_messages
      ORDER BY created_at ASC
      LIMIT ${safeLimit}
    `;
    return rows.map(toAgentMessage);
  }

  private searchMessages(query: string, limit: number): SearchResult[] {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return [];

    const safeLimit = Math.max(1, Math.min(limit, 50));
    const pattern = `%${normalized}%`;
    const rows = this.sql<SearchRow>`
      SELECT id, role, content, created_at
      FROM chat_messages
      WHERE lower(content) LIKE ${pattern}
      ORDER BY created_at DESC
      LIMIT ${safeLimit}
    `;

    return rows.map((row) => ({
      id: row.id,
      role: row.role,
      snippet: buildSnippet(row.content, normalized),
      createdAt: row.created_at,
    }));
  }

  private insertMessage(message: AgentMessage) {
    void this.sql`
      INSERT INTO chat_messages (id, role, content, created_at)
      VALUES (${message.id}, ${message.role}, ${message.content}, ${message.createdAt})
    `;
  }

  private insertVectorRef(id: string, vectorId: string, createdAt: string) {
    void this.sql`
      INSERT INTO chat_vector_refs (id, vector_id, created_at)
      VALUES (${id}, ${vectorId}, ${createdAt})
    `;
  }

  private getVectorIds(): string[] {
    const rows = this.sql<VectorRefRow>`SELECT vector_id FROM chat_vector_refs`;
    return rows.map((row) => row.vector_id);
  }

  private resetStorage() {
    void this.sql`DELETE FROM chat_messages`;
    void this.sql`DELETE FROM chat_vector_refs`;
  }

  private async runChatModel(messages: AiRunMessage[]): Promise<string> {
    const configuredModel = this.env.AI_CHAT_MODEL || DEFAULT_CHAT_MODEL;
    const candidateModels = Array.from(new Set([configuredModel, FALLBACK_CHAT_MODEL]));
    const runModel = this.env.AI.run.bind(this.env.AI) as (
      modelName: string,
      input: unknown,
    ) => Promise<unknown>;

    let lastError: unknown = null;
    for (const model of candidateModels) {
      try {
        const response = await withTimeout(
          runModel(model, { messages }),
          AI_RUN_TIMEOUT_MS,
          `AI model ${model}`,
        );
        const text = parseAiText(response);
        if (text && text.trim().length > 0) {
          return text;
        }
      } catch (error) {
        lastError = error;
        console.error("AI model invocation failed", {
          model,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    if (lastError instanceof Error) throw lastError;
    throw new Error("No AI chat model produced a response");
  }

  private async openChatModelStream(messages: AiRunMessage[]): Promise<ReadableStream<Uint8Array> | null> {
    const configuredModel = this.env.AI_CHAT_MODEL || DEFAULT_CHAT_MODEL;
    const candidateModels = Array.from(new Set([configuredModel, FALLBACK_CHAT_MODEL]));
    const runModel = this.env.AI.run.bind(this.env.AI) as (
      modelName: string,
      input: unknown,
    ) => Promise<unknown>;

    for (const model of candidateModels) {
      try {
        const response = await withTimeout(
          runModel(model, { messages, stream: true }),
          AI_RUN_TIMEOUT_MS,
          `AI stream model ${model}`,
        );
        if (
          response &&
          typeof response === "object" &&
          "getReader" in response &&
          typeof (response as ReadableStream<Uint8Array>).getReader === "function"
        ) {
          return response as ReadableStream<Uint8Array>;
        }
        if (
          response &&
          typeof response === "object" &&
          "body" in response &&
          (response as { body?: unknown }).body &&
          typeof (response as { body: ReadableStream<Uint8Array> }).body.getReader === "function"
        ) {
          return (response as { body: ReadableStream<Uint8Array> }).body;
        }
      } catch (error) {
        console.error("AI streaming invocation failed", {
          model,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    return null;
  }

  private async buildPromptMessages(
    body: PostMessageBody,
    imageContextChunks: string[],
    intentQuery: string,
  ): Promise<{ messages: AiRunMessage[]; contextSnapshot: string }> {
    const db = createDb(this.env.DB);
    const contexts = resolveAiContexts(body.contexts);
    const queryText = intentQuery.trim();

    const [contextSnapshot, memoryChunks, aiSearchChunks] = await Promise.all([
      buildUserContextSnapshot(db, body.userId, contexts, {
        timezone: body.timezone,
      }),
      queryText ? queryVectorMemories(this.env, `u:${body.userId}:c:${body.chatId}`, queryText, 6) : Promise.resolve([]),
      queryText ? queryAiSearchContext(this.env, body.userId, queryText) : Promise.resolve([]),
    ]);

    const historyForPrompt = this.readMessages(24).map(
      (item): AiRunMessage => ({ role: item.role, content: item.content }),
    );
    const retrievalSection = buildRetrievalSection(
      contextSnapshot,
      memoryChunks,
      aiSearchChunks,
      imageContextChunks,
    );

    return {
      contextSnapshot,
      messages: [
        {
          role: "system",
          content: `${buildAssistantSystemPrompt(contexts, body.customInstruction)}\n\n${retrievalSection}`,
        },
        ...historyForPrompt,
      ],
    };
  }

  private async persistAssistantOutput(
    body: PostMessageBody,
    userMessage: AgentMessage,
    assistantText: string,
    actionIntentSource: string,
    contextSnapshot: string,
  ): Promise<{ assistantMessage: AgentMessage; proposedAction: AiPendingActionProposal | null }> {
    const db = createDb(this.env.DB);
    const proposedAction = await buildActionProposalWithFallback({
      env: this.env,
      db,
      userId: body.userId,
      userMessage: actionIntentSource,
      assistantAnswer: assistantText,
      contextSnapshot,
      timezone: body.timezone,
    });
    const finalAssistantText = proposedAction ? summarizeProposedAction(proposedAction) : assistantText;
    const assistantMessage: AgentMessage = {
      id: nanoid(),
      role: "assistant",
      content: finalAssistantText,
      createdAt: new Date().toISOString(),
    };
    this.insertMessage(assistantMessage);

    const vectorId = `${body.chatId}:${assistantMessage.id}`;
    const vectorSaved = await upsertConversationMemory(this.env, {
      namespace: `u:${body.userId}:c:${body.chatId}`,
      id: vectorId,
      text: `User: ${userMessage.content}\nAssistant: ${assistantMessage.content}`,
      userId: body.userId,
      chatId: body.chatId,
      createdAt: assistantMessage.createdAt,
    });

    if (vectorSaved) {
      this.insertVectorRef(assistantMessage.id, vectorId, assistantMessage.createdAt);
    }

    return {
      assistantMessage,
      proposedAction,
    };
  }

  async onRequest(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === "GET" && url.pathname.endsWith("/messages")) {
      const limit = Number(url.searchParams.get("limit") ?? "150");
      return jsonResponse({ messages: this.readMessages(Number.isFinite(limit) ? limit : 150) });
    }

    if (request.method === "GET" && url.pathname.endsWith("/messages/search")) {
      const query = url.searchParams.get("q") ?? "";
      const limit = Number(url.searchParams.get("limit") ?? "20");
      return jsonResponse({
        results: this.searchMessages(query, Number.isFinite(limit) ? limit : 20),
      });
    }

    if (request.method === "POST" && url.pathname.endsWith("/reset")) {
      const body = (await request.json().catch(() => ({}))) as ResetBody;
      if (body.clearVectors) {
        await deleteVectorMemories(this.env, this.getVectorIds());
      }
      this.resetStorage();
      return jsonResponse({ success: true });
    }

    if (request.method === "POST" && url.pathname.endsWith("/message/stream")) {
      const body = (await request.json().catch(() => null)) as PostMessageBody | null;
      const messageText = body?.message?.trim() ?? "";
      const attachments = body?.attachments ?? [];
      if (!body || !body.userId || !body.chatId || (!messageText && attachments.length === 0)) {
        return jsonResponse({ error: "Invalid message payload" }, 400);
      }

      const now = new Date().toISOString();
      const userMessage: AgentMessage = {
        id: nanoid(),
        role: "user",
        content: messageText,
        createdAt: now,
      };
      this.insertMessage(userMessage);

      const stream = new ReadableStream<Uint8Array>({
        start: async (controller) => {
          const encoder = new TextEncoder();
          controller.enqueue(
            encoder.encode(
              sseEvent("start", {
                userMessage,
              }),
            ),
          );

          try {
            const vision = await extractVisionContextForAttachments(this.env, attachments);
            const intentSource = [messageText, vision.combinedText].filter((value) => value.length > 0).join("\n");
            const prompt = await this.buildPromptMessages(body, vision.chunks, intentSource || messageText);
            const upstream = await this.openChatModelStream(prompt.messages);
            let assistantText = "";

            if (upstream) {
              const reader = upstream.getReader();
              const decoder = new TextDecoder();
              let buffer = "";

              while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                buffer += decoder.decode(value, { stream: true });

                while (true) {
                  const frameEnd = buffer.indexOf("\n\n");
                  if (frameEnd === -1) break;

                  const frame = buffer.slice(0, frameEnd);
                  buffer = buffer.slice(frameEnd + 2);
                  const dataLines = frame
                    .split("\n")
                    .filter((line) => line.startsWith("data:"))
                    .map((line) => line.slice(5).trim());
                  if (dataLines.length === 0) continue;

                  const parsedChunk = extractSseTextChunk(dataLines.join("\n"));
                  if (!parsedChunk) continue;
                  const delta = parsedChunk.startsWith(assistantText)
                    ? parsedChunk.slice(assistantText.length)
                    : parsedChunk;
                  if (!delta) continue;
                  assistantText += delta;
                  await emitWords(controller, encoder, delta);
                }
              }

              buffer += decoder.decode();
              if (buffer.trim()) {
                const parsedChunk = extractSseTextChunk(buffer.trim());
                if (parsedChunk) {
                  const delta = parsedChunk.startsWith(assistantText)
                    ? parsedChunk.slice(assistantText.length)
                    : parsedChunk;
                  if (delta) {
                    assistantText += delta;
                    await emitWords(controller, encoder, delta);
                  }
                }
              }
            }

            if (!assistantText || assistantText.trim().length === 0) {
              assistantText = await this.runChatModel(prompt.messages);
              await emitWords(controller, encoder, assistantText, 8);
            }

            assistantText = enforceVisionAnswer(assistantText, vision.chunks);

            const persisted = await this.persistAssistantOutput(
              body,
              userMessage,
              assistantText,
              intentSource || messageText,
              prompt.contextSnapshot,
            );
            if (persisted.proposedAction) {
              controller.enqueue(
                encoder.encode(sseEvent("action", { proposedAction: persisted.proposedAction })),
              );
            }

            controller.enqueue(
              encoder.encode(
                sseEvent("done", {
                  assistantMessage: persisted.assistantMessage,
                  proposedAction: persisted.proposedAction,
                }),
              ),
            );
          } catch (error) {
            console.error("AI chat streaming failed", {
              userId: body.userId,
              chatId: body.chatId,
              error: error instanceof Error ? error.message : String(error),
            });
            controller.enqueue(
              encoder.encode(
                sseEvent("error", {
                  message: "I hit a temporary model issue. You can retry or ask me in a shorter form.",
                }),
              ),
            );
          } finally {
            controller.close();
          }
        },
      });

      return new Response(stream, {
        status: 200,
        headers: {
          "content-type": "text/event-stream",
          "cache-control": "no-cache, no-transform",
          connection: "keep-alive",
        },
      });
    }

    if (request.method === "POST" && url.pathname.endsWith("/message")) {
      const body = (await request.json().catch(() => null)) as PostMessageBody | null;
      const messageText = body?.message?.trim() ?? "";
      const attachments = body?.attachments ?? [];
      if (!body || !body.userId || !body.chatId || (!messageText && attachments.length === 0)) {
        return jsonResponse({ error: "Invalid message payload" }, 400);
      }

      const now = new Date().toISOString();
      const userMessage: AgentMessage = {
        id: nanoid(),
        role: "user",
        content: messageText,
        createdAt: now,
      };
      this.insertMessage(userMessage);

      let assistantText = "I could not generate a response right now. Please try again.";
      let intentSource = messageText;
      try {
        const vision = await extractVisionContextForAttachments(this.env, attachments);
        intentSource = [messageText, vision.combinedText].filter((value) => value.length > 0).join("\n");
        const prompt = await this.buildPromptMessages(body, vision.chunks, intentSource || messageText);
        assistantText = await this.runChatModel(prompt.messages);
        assistantText = enforceVisionAnswer(assistantText, vision.chunks);
        const persisted = await this.persistAssistantOutput(
          body,
          userMessage,
          assistantText,
          intentSource || messageText,
          prompt.contextSnapshot,
        );
        const responsePayload: PostMessageResponse = {
          userMessage,
          assistantMessage: persisted.assistantMessage,
          proposedAction: persisted.proposedAction,
        };

        return jsonResponse(responsePayload, 201);
      } catch (error) {
        console.error("AI chat response failed after model fallback", {
          userId: body.userId,
          chatId: body.chatId,
          error: error instanceof Error ? error.message : String(error),
        });
        assistantText =
          "I hit a temporary model issue. You can retry or ask me in a shorter form.";
      }

      const persisted = await this.persistAssistantOutput(body, userMessage, assistantText, intentSource || messageText, "");
      const responsePayload: PostMessageResponse = {
        userMessage,
        assistantMessage: persisted.assistantMessage,
        proposedAction: persisted.proposedAction,
      };

      return jsonResponse(responsePayload, 201);
    }

    return jsonResponse({ error: "Not found" }, 404);
  }
}
