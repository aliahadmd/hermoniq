import { and, eq } from "drizzle-orm";
import { z } from "zod";
import type { DrizzleDb } from "../../db";
import { accounts, categories, events, habits, noteCategories, notes, transactions } from "../../db/schema";
import {
  createEventSchema,
  createHabitSchema,
  createNoteSchema,
  createTransactionSchema,
  updateEventSchema,
  updateHabitSchema,
  updateNoteSchema,
  upsertHabitLogSchema,
} from "../validators";
import { DEFAULT_CHAT_MODEL, FALLBACK_CHAT_MODEL } from "./models";
import { maybeBuildActionProposal, type AiPendingActionProposal, type AiPendingActionType } from "./prompt";

interface AiRunResponseLike {
  response?: unknown;
  result?: {
    response?: unknown;
  };
  tool_calls?: unknown;
}

interface BuildStructuredActionProposalInput {
  env: Env;
  db: DrizzleDb;
  userId: string;
  userMessage: string;
  assistantAnswer: string;
  contextSnapshot: string;
  timezone?: string;
}

const actionTypeSchema = z.enum([
  "money_create_transaction",
  "money_delete_transaction",
  "habit_create",
  "habit_update",
  "habit_log_upsert",
  "note_create",
  "note_update",
  "note_archive",
  "event_create",
  "event_update",
  "event_delete",
]);

const plannerEnvelopeSchema = z.object({
  action: z
    .object({
      type: actionTypeSchema,
      confidence: z.number().min(0).max(1).default(0),
      payload: z.record(z.string(), z.unknown()).default({}),
      reason: z.string().max(500).optional(),
    })
    .nullable(),
});

const moneyDeletePayloadSchema = z.object({
  transactionId: z.string().min(1),
});

const habitUpdatePayloadSchema = z.object({
  habitId: z.string().min(1),
  patch: updateHabitSchema,
});

const habitLogPayloadSchema = z.union([
  z.object({
    habitId: z.string().min(1),
    data: upsertHabitLogSchema,
  }),
  z.object({
    habitId: z.string().min(1),
  }).and(upsertHabitLogSchema),
]);

const noteUpdatePayloadSchema = z.union([
  z.object({
    noteId: z.string().min(1),
    patch: updateNoteSchema,
  }),
  z
    .object({
      noteId: z.string().min(1),
    })
    .and(updateNoteSchema),
]);

const noteArchivePayloadSchema = z.object({
  noteId: z.string().min(1),
});

const eventUpdatePayloadSchema = z.union([
  z.object({
    eventId: z.string().min(1),
    patch: updateEventSchema,
  }),
  z
    .object({
      eventId: z.string().min(1),
    })
    .and(updateEventSchema),
]);

const eventDeletePayloadSchema = z.object({
  eventId: z.string().min(1),
});

const plannerJsonSchema = {
  type: "object",
  properties: {
    action: {
      anyOf: [
        {
          type: "object",
          properties: {
            type: {
              type: "string",
              enum: actionTypeSchema.options,
            },
            confidence: {
              type: "number",
              minimum: 0,
              maximum: 1,
            },
            payload: {
              type: "object",
              additionalProperties: true,
            },
            reason: {
              type: "string",
            },
          },
          required: ["type", "confidence", "payload"],
          additionalProperties: false,
        },
        { type: "null" },
      ],
    },
  },
  required: ["action"],
  additionalProperties: false,
};

function parseAiTextOrObject(raw: unknown): unknown {
  if (!raw || typeof raw !== "object") return raw;
  const typed = raw as AiRunResponseLike;
  if (typed.response !== undefined) return typed.response;
  if (typed.result?.response !== undefined) return typed.result.response;
  return raw;
}

function parsePlannerEnvelope(raw: unknown): z.infer<typeof plannerEnvelopeSchema> | null {
  const candidate = parseAiTextOrObject(raw);
  if (candidate && typeof candidate === "object") {
    const parsed = plannerEnvelopeSchema.safeParse(candidate);
    return parsed.success ? parsed.data : null;
  }

  if (typeof candidate !== "string") return null;
  const normalized = candidate
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```$/i, "")
    .trim();

  try {
    const parsedJson = JSON.parse(normalized);
    const parsed = plannerEnvelopeSchema.safeParse(parsedJson);
    return parsed.success ? parsed.data : null;
  } catch {
    const match = normalized.match(/\{[\s\S]*\}/);
    if (!match) return null;
    try {
      const parsedJson = JSON.parse(match[0]);
      const parsed = plannerEnvelopeSchema.safeParse(parsedJson);
      return parsed.success ? parsed.data : null;
    } catch {
      return null;
    }
  }
}

async function existsByUser(
  db: DrizzleDb,
  table: "account" | "category" | "transaction" | "habit" | "noteCategory" | "note" | "event",
  id: string | null | undefined,
  userId: string,
): Promise<boolean> {
  if (!id) return false;

  switch (table) {
    case "account": {
      const [row] = await db.select({ id: accounts.id }).from(accounts).where(and(eq(accounts.id, id), eq(accounts.userId, userId))).limit(1);
      return Boolean(row);
    }
    case "category": {
      const [row] = await db.select({ id: categories.id }).from(categories).where(and(eq(categories.id, id), eq(categories.userId, userId))).limit(1);
      return Boolean(row);
    }
    case "transaction": {
      const [row] = await db.select({ id: transactions.id }).from(transactions).where(and(eq(transactions.id, id), eq(transactions.userId, userId))).limit(1);
      return Boolean(row);
    }
    case "habit": {
      const [row] = await db.select({ id: habits.id }).from(habits).where(and(eq(habits.id, id), eq(habits.userId, userId))).limit(1);
      return Boolean(row);
    }
    case "noteCategory": {
      const [row] = await db.select({ id: noteCategories.id }).from(noteCategories).where(and(eq(noteCategories.id, id), eq(noteCategories.userId, userId))).limit(1);
      return Boolean(row);
    }
    case "note": {
      const [row] = await db.select({ id: notes.id }).from(notes).where(and(eq(notes.id, id), eq(notes.userId, userId))).limit(1);
      return Boolean(row);
    }
    case "event": {
      const [row] = await db.select({ id: events.id }).from(events).where(and(eq(events.id, id), eq(events.userId, userId))).limit(1);
      return Boolean(row);
    }
    default:
      return false;
  }
}

async function validateProposal(
  db: DrizzleDb,
  userId: string,
  type: AiPendingActionType,
  payload: Record<string, unknown>,
): Promise<AiPendingActionProposal | null> {
  switch (type) {
    case "money_create_transaction": {
      const parsed = createTransactionSchema.safeParse(payload);
      if (!parsed.success) return null;
      const [accountOk, categoryOk] = await Promise.all([
        existsByUser(db, "account", parsed.data.accountId, userId),
        parsed.data.categoryId ? existsByUser(db, "category", parsed.data.categoryId, userId) : Promise.resolve(true),
      ]);
      return accountOk && categoryOk ? { type, payload: parsed.data } : null;
    }
    case "money_delete_transaction": {
      const parsed = moneyDeletePayloadSchema.safeParse(payload);
      if (!parsed.success) return null;
      return (await existsByUser(db, "transaction", parsed.data.transactionId, userId))
        ? { type, payload: parsed.data }
        : null;
    }
    case "habit_create": {
      const parsed = createHabitSchema.safeParse(payload);
      return parsed.success ? { type, payload: parsed.data } : null;
    }
    case "habit_update": {
      const parsed = habitUpdatePayloadSchema.safeParse(payload);
      if (!parsed.success) return null;
      return (await existsByUser(db, "habit", parsed.data.habitId, userId)) ? { type, payload: parsed.data } : null;
    }
    case "habit_log_upsert": {
      const parsed = habitLogPayloadSchema.safeParse(payload);
      if (!parsed.success) return null;
      return (await existsByUser(db, "habit", parsed.data.habitId, userId)) ? { type, payload: parsed.data } : null;
    }
    case "note_create": {
      const parsed = createNoteSchema.safeParse(payload);
      if (!parsed.success) return null;
      const categoryOk = parsed.data.categoryId
        ? await existsByUser(db, "noteCategory", parsed.data.categoryId, userId)
        : true;
      return categoryOk ? { type, payload: parsed.data } : null;
    }
    case "note_update": {
      const parsed = noteUpdatePayloadSchema.safeParse(payload);
      if (!parsed.success) return null;
      const categoryId =
        "patch" in parsed.data ? parsed.data.patch.categoryId : parsed.data.categoryId;
      const [noteOk, categoryOk] = await Promise.all([
        existsByUser(db, "note", parsed.data.noteId, userId),
        categoryId ? existsByUser(db, "noteCategory", categoryId, userId) : Promise.resolve(true),
      ]);
      return noteOk && categoryOk ? { type, payload: parsed.data } : null;
    }
    case "note_archive": {
      const parsed = noteArchivePayloadSchema.safeParse(payload);
      if (!parsed.success) return null;
      return (await existsByUser(db, "note", parsed.data.noteId, userId)) ? { type, payload: parsed.data } : null;
    }
    case "event_create": {
      const parsed = createEventSchema.safeParse(payload);
      return parsed.success ? { type, payload: parsed.data } : null;
    }
    case "event_update": {
      const parsed = eventUpdatePayloadSchema.safeParse(payload);
      if (!parsed.success) return null;
      return (await existsByUser(db, "event", parsed.data.eventId, userId)) ? { type, payload: parsed.data } : null;
    }
    case "event_delete": {
      const parsed = eventDeletePayloadSchema.safeParse(payload);
      if (!parsed.success) return null;
      return (await existsByUser(db, "event", parsed.data.eventId, userId)) ? { type, payload: parsed.data } : null;
    }
    default:
      return null;
  }
}

function buildPlannerMessages(input: BuildStructuredActionProposalInput) {
  return [
    {
      role: "system",
      content: [
        "You are Harmoniq's pending-action planner.",
        "Return only JSON matching the requested schema.",
        "Create at most one action, only when the user clearly requested a create, update, delete, archive, or log operation.",
        "Use exact entity ids from the context snapshot for updates/deletes and relationship fields.",
        "If a required id or field is missing, return {\"action\":null}.",
        "Never invent ids, never execute actions, and never include explanatory text outside JSON.",
      ].join("\n"),
    },
    {
      role: "user",
      content: [
        `Timezone: ${input.timezone ?? "UTC"}`,
        `User message:\n${input.userMessage}`,
        `Assistant answer:\n${input.assistantAnswer}`,
        `Context snapshot:\n${input.contextSnapshot}`,
      ].join("\n\n"),
    },
  ];
}

export async function buildStructuredActionProposal(
  input: BuildStructuredActionProposalInput,
): Promise<AiPendingActionProposal | null> {
  const configuredModel = input.env.AI_CHAT_MODEL || DEFAULT_CHAT_MODEL;
  const candidateModels = Array.from(new Set([configuredModel, FALLBACK_CHAT_MODEL]));
  const runModel = input.env.AI.run.bind(input.env.AI) as (modelName: string, input: unknown) => Promise<unknown>;
  const messages = buildPlannerMessages(input);

  for (const model of candidateModels) {
    try {
      const response = await runModel(model, {
        messages,
        response_format: {
          type: "json_schema",
          json_schema: plannerJsonSchema,
        },
      });
      const envelope = parsePlannerEnvelope(response);
      if (!envelope?.action || envelope.action.confidence < 0.62) {
        return null;
      }

      return await validateProposal(input.db, input.userId, envelope.action.type, envelope.action.payload);
    } catch (error) {
      console.error("AI action planner invocation failed", {
        model,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return null;
}

export async function buildActionProposalWithFallback(
  input: BuildStructuredActionProposalInput,
): Promise<AiPendingActionProposal | null> {
  const structured = await buildStructuredActionProposal(input);
  if (structured) return structured;

  const heuristic = maybeBuildActionProposal(input.userMessage, input.assistantAnswer, {
    timezone: input.timezone,
  });
  if (!heuristic) return null;

  return validateProposal(input.db, input.userId, heuristic.type, heuristic.payload);
}
