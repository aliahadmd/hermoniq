import { and, eq, isNull, sql } from "drizzle-orm";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { z } from "zod";
import type { DrizzleDb } from "../../db";
import {
  accounts,
  categories,
  events,
  habitLogs,
  habitPreferences,
  habits,
  noteCategories,
  notes,
  transactions,
} from "../../db/schema";
import {
  createHabitSchema,
  createEventSchema,
  createNoteSchema,
  createTransactionSchema,
  upsertHabitLogSchema,
  updateEventSchema,
  updateHabitSchema,
  updateNoteSchema,
} from "../validators";

export type AiActionType =
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
  | "event_delete";

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

interface ExecuteInput {
  db: DrizzleDb;
  userId: string;
  type: string;
  payload: unknown;
}

export class ActionExecutionError extends Error {
  status: ContentfulStatusCode;

  constructor(message: string, status: ContentfulStatusCode = 400) {
    super(message);
    this.status = status;
  }
}

function normalizeActionType(type: string): AiActionType {
  if (type === "create_note") return "note_create";
  return type as AiActionType;
}

function parseFrequencyDays(raw: string): number[] {
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is number => Number.isInteger(item) && item >= 0 && item <= 6);
  } catch {
    return [];
  }
}

function isScheduledDate(
  startDate: string,
  frequencyType: "daily" | "weekdays",
  frequencyDays: number[],
  date: string,
): boolean {
  if (date < startDate) return false;
  if (frequencyType === "daily") return true;
  return frequencyDays.includes(new Date(`${date}T00:00:00.000Z`).getUTCDay());
}

function normalizeHabitCreateInput(input: z.infer<typeof createHabitSchema>) {
  const frequencyDays = input.frequencyType === "daily" ? [] : (input.frequencyDays ?? []);
  const reminderTime = input.reminderEnabled ? (input.reminderTime ?? null) : null;
  if (input.reminderEnabled && !reminderTime) {
    throw new ActionExecutionError("Reminder time is required when reminder is enabled", 400);
  }

  if (input.type === "measurable" && (!input.dailyTarget || input.dailyTarget <= 0)) {
    throw new ActionExecutionError("Daily target is required for measurable habits", 400);
  }

  return {
    ...input,
    unit: input.type === "yes_no" ? null : (input.unit ?? null),
    dailyTarget: input.type === "yes_no" ? null : (input.dailyTarget ?? null),
    frequencyDays,
    reminderTime,
  };
}

function normalizeHabitUpdateInput(
  existing: {
    name: string;
    question: string;
    type: "yes_no" | "measurable";
    color: string;
    unit: string | null;
    dailyTarget: number | null;
    frequencyType: "daily" | "weekdays";
    frequencyDays: string;
    reminderEnabled: boolean;
    reminderTime: string | null;
    notes: string;
    startDate: string;
  },
  patch: z.infer<typeof updateHabitSchema>,
) {
  const merged = {
    name: patch.name ?? existing.name,
    question: patch.question ?? existing.question,
    type: patch.type ?? existing.type,
    color: patch.color ?? existing.color,
    unit: patch.unit ?? existing.unit,
    dailyTarget: patch.dailyTarget ?? existing.dailyTarget,
    frequencyType: patch.frequencyType ?? existing.frequencyType,
    frequencyDays: patch.frequencyDays ?? parseFrequencyDays(existing.frequencyDays),
    reminderEnabled: patch.reminderEnabled ?? existing.reminderEnabled,
    reminderTime: patch.reminderTime ?? existing.reminderTime,
    notes: patch.notes ?? existing.notes,
    startDate: patch.startDate ?? existing.startDate,
  } as const;

  const frequencyDays = merged.frequencyType === "daily" ? [] : merged.frequencyDays;
  const reminderTime = merged.reminderEnabled ? (merged.reminderTime ?? null) : null;
  if (merged.reminderEnabled && !reminderTime) {
    throw new ActionExecutionError("Reminder time is required when reminder is enabled", 400);
  }

  if (merged.type === "measurable" && (!merged.dailyTarget || merged.dailyTarget <= 0)) {
    throw new ActionExecutionError("Daily target is required for measurable habits", 400);
  }

  return {
    ...merged,
    unit: merged.type === "yes_no" ? null : merged.unit,
    dailyTarget: merged.type === "yes_no" ? null : merged.dailyTarget,
    frequencyDays,
    reminderTime,
  };
}

async function executeMoneyCreateTransaction(
  db: DrizzleDb,
  userId: string,
  payload: unknown,
) {
  const parsed = createTransactionSchema.parse(payload);
  const [account] = await db
    .select({ id: accounts.id })
    .from(accounts)
    .where(and(eq(accounts.id, parsed.accountId), eq(accounts.userId, userId)));

  if (!account) {
    throw new ActionExecutionError("Account not found", 404);
  }

  if (parsed.categoryId) {
    const [category] = await db
      .select({ id: categories.id })
      .from(categories)
      .where(and(eq(categories.id, parsed.categoryId), eq(categories.userId, userId)));

    if (!category) {
      throw new ActionExecutionError("Category not found", 404);
    }
  }

  const [created] = await db
    .insert(transactions)
    .values({
      amount: parsed.amount,
      type: parsed.type,
      date: parsed.date,
      description: parsed.description,
      categoryId: parsed.categoryId ?? null,
      accountId: parsed.accountId,
      userId,
    })
    .returning({
      id: transactions.id,
      amount: transactions.amount,
      type: transactions.type,
      date: transactions.date,
    });

  const delta = parsed.type === "income" ? parsed.amount : -parsed.amount;
  await db
    .update(accounts)
    .set({
      balance: sql`${accounts.balance} + ${delta}`,
      updatedAt: new Date().toISOString(),
    })
    .where(and(eq(accounts.id, parsed.accountId), eq(accounts.userId, userId)));

  return { transaction: created };
}

async function executeMoneyDeleteTransaction(
  db: DrizzleDb,
  userId: string,
  payload: unknown,
) {
  const parsed = moneyDeletePayloadSchema.parse(payload);
  const [txn] = await db
    .select({
      id: transactions.id,
      type: transactions.type,
      amount: transactions.amount,
      accountId: transactions.accountId,
    })
    .from(transactions)
    .where(and(eq(transactions.id, parsed.transactionId), eq(transactions.userId, userId)));

  if (!txn) {
    throw new ActionExecutionError("Transaction not found", 404);
  }

  await db
    .delete(transactions)
    .where(and(eq(transactions.id, parsed.transactionId), eq(transactions.userId, userId)));

  const reverseDelta = txn.type === "income" ? -txn.amount : txn.amount;
  await db
    .update(accounts)
    .set({
      balance: sql`${accounts.balance} + ${reverseDelta}`,
      updatedAt: new Date().toISOString(),
    })
    .where(and(eq(accounts.id, txn.accountId), eq(accounts.userId, userId)));

  return { transaction: txn, deleted: true };
}

async function executeHabitCreate(
  db: DrizzleDb,
  userId: string,
  payload: unknown,
) {
  const parsed = createHabitSchema.parse(payload);
  const normalized = normalizeHabitCreateInput(parsed);
  const [created] = await db
    .insert(habits)
    .values({
      userId,
      name: normalized.name,
      question: normalized.question,
      type: normalized.type,
      color: normalized.color,
      unit: normalized.unit,
      dailyTarget: normalized.dailyTarget,
      frequencyType: normalized.frequencyType,
      frequencyDays: JSON.stringify(normalized.frequencyDays),
      reminderEnabled: normalized.reminderEnabled,
      reminderTime: normalized.reminderTime,
      notes: normalized.notes,
      startDate: normalized.startDate,
    })
    .returning({
      id: habits.id,
      name: habits.name,
    });
  return { habit: created };
}

async function executeHabitUpdate(
  db: DrizzleDb,
  userId: string,
  payload: unknown,
) {
  const parsed = habitUpdatePayloadSchema.parse(payload);
  const [existing] = await db
    .select({
      id: habits.id,
      name: habits.name,
      question: habits.question,
      type: habits.type,
      color: habits.color,
      unit: habits.unit,
      dailyTarget: habits.dailyTarget,
      frequencyType: habits.frequencyType,
      frequencyDays: habits.frequencyDays,
      reminderEnabled: habits.reminderEnabled,
      reminderTime: habits.reminderTime,
      notes: habits.notes,
      startDate: habits.startDate,
    })
    .from(habits)
    .where(and(eq(habits.id, parsed.habitId), eq(habits.userId, userId)));

  if (!existing) {
    throw new ActionExecutionError("Habit not found", 404);
  }

  const normalized = normalizeHabitUpdateInput(existing, parsed.patch);
  const [updated] = await db
    .update(habits)
    .set({
      name: normalized.name,
      question: normalized.question,
      type: normalized.type,
      color: normalized.color,
      unit: normalized.unit,
      dailyTarget: normalized.dailyTarget,
      frequencyType: normalized.frequencyType,
      frequencyDays: JSON.stringify(normalized.frequencyDays),
      reminderEnabled: normalized.reminderEnabled,
      reminderTime: normalized.reminderTime,
      notes: normalized.notes,
      startDate: normalized.startDate,
      updatedAt: new Date().toISOString(),
    })
    .where(and(eq(habits.id, parsed.habitId), eq(habits.userId, userId)))
    .returning({ id: habits.id });

  return { habit: updated };
}

async function executeHabitLogUpsert(
  db: DrizzleDb,
  userId: string,
  payload: unknown,
) {
  const parsed = habitLogPayloadSchema.parse(payload);
  const data = "data" in parsed ? parsed.data : parsed;
  const [habit] = await db
    .select({
      id: habits.id,
      type: habits.type,
      dailyTarget: habits.dailyTarget,
      frequencyType: habits.frequencyType,
      frequencyDays: habits.frequencyDays,
      startDate: habits.startDate,
      archivedAt: habits.archivedAt,
    })
    .from(habits)
    .where(
      and(eq(habits.id, parsed.habitId), eq(habits.userId, userId), isNull(habits.archivedAt)),
    );

  if (!habit) {
    throw new ActionExecutionError("Habit not found", 404);
  }

  const date = data.date;
  if (date < habit.startDate) {
    throw new ActionExecutionError("Cannot log before habit start date", 400);
  }

  if (!isScheduledDate(habit.startDate, habit.frequencyType, parseFrequencyDays(habit.frequencyDays), date)) {
    throw new ActionExecutionError("Date is outside scheduled frequency", 400);
  }

  let completed = false;
  let value: number | null = null;
  const nextNote = data.note === undefined ? undefined : (data.note ?? "").trim();
  if (habit.type === "yes_no") {
    if (data.completed === undefined) {
      throw new ActionExecutionError("completed is required for yes/no habits", 400);
    }
    completed = data.completed;
  } else {
    if (data.value === undefined || data.value === null) {
      throw new ActionExecutionError("value is required for measurable habits", 400);
    }
    value = data.value;
    completed = (habit.dailyTarget ?? 0) > 0 && value >= (habit.dailyTarget ?? 0);
  }

  const [existing] = await db
    .select({
      id: habitLogs.id,
      note: habitLogs.note,
    })
    .from(habitLogs)
    .where(
      and(
        eq(habitLogs.habitId, parsed.habitId),
        eq(habitLogs.userId, userId),
        eq(habitLogs.logDate, date),
      ),
    );

  const finalNote = (nextNote ?? existing?.note ?? "").trim();

  const [preferenceRow] = await db
    .select({
      requireNoteForCompletion: habitPreferences.requireNoteForCompletion,
    })
    .from(habitPreferences)
    .where(eq(habitPreferences.userId, userId));
  if (Boolean(preferenceRow?.requireNoteForCompletion) && completed && !finalNote) {
    throw new ActionExecutionError("Note is required when marking this habit as completed", 400);
  }

  if (existing) {
    const [updated] = await db
      .update(habitLogs)
      .set({
        completed,
        value,
        note: finalNote,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(habitLogs.id, existing.id))
      .returning({
        id: habitLogs.id,
        habitId: habitLogs.habitId,
        logDate: habitLogs.logDate,
        completed: habitLogs.completed,
        value: habitLogs.value,
      });
    return { habitLog: updated };
  }

  const [created] = await db
    .insert(habitLogs)
    .values({
      habitId: parsed.habitId,
      userId,
      logDate: date,
      completed,
      value,
      note: finalNote,
    })
    .returning({
      id: habitLogs.id,
      habitId: habitLogs.habitId,
      logDate: habitLogs.logDate,
      completed: habitLogs.completed,
      value: habitLogs.value,
    });

  return { habitLog: created };
}

async function executeNoteCreate(
  db: DrizzleDb,
  userId: string,
  payload: unknown,
) {
  const parsed = createNoteSchema.parse(payload);
  const title = parsed.title.trim();
  if (!title) {
    throw new ActionExecutionError("Title is required", 400);
  }

  const categoryId = parsed.categoryId ?? null;
  if (categoryId) {
    const [category] = await db
      .select({ id: noteCategories.id })
      .from(noteCategories)
      .where(and(eq(noteCategories.id, categoryId), eq(noteCategories.userId, userId)));
    if (!category) {
      throw new ActionExecutionError("Category not found", 404);
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
    .returning({
      id: notes.id,
      title: notes.title,
      content: notes.content,
      categoryId: notes.categoryId,
    });

  return { note: created };
}

async function executeNoteUpdate(
  db: DrizzleDb,
  userId: string,
  payload: unknown,
) {
  const parsed = noteUpdatePayloadSchema.parse(payload);
  const patch = "patch" in parsed ? parsed.patch : parsed;
  const [existing] = await db
    .select({ id: notes.id })
    .from(notes)
    .where(and(eq(notes.id, parsed.noteId), eq(notes.userId, userId)));
  if (!existing) {
    throw new ActionExecutionError("Note not found", 404);
  }

  if (patch.categoryId !== undefined && patch.categoryId !== null) {
    const [category] = await db
      .select({ id: noteCategories.id })
      .from(noteCategories)
      .where(and(eq(noteCategories.id, patch.categoryId), eq(noteCategories.userId, userId)));
    if (!category) {
      throw new ActionExecutionError("Category not found", 404);
    }
  }

  const nextTitle = patch.title?.trim();
  if (nextTitle !== undefined && nextTitle.length === 0) {
    throw new ActionExecutionError("Title is required", 400);
  }

  const [updated] = await db
    .update(notes)
    .set({
      title: nextTitle ?? undefined,
      content: patch.content,
      categoryId: patch.categoryId,
      isPinned: patch.isPinned,
      archivedAt: patch.archivedAt,
      updatedAt: new Date().toISOString(),
    })
    .where(and(eq(notes.id, parsed.noteId), eq(notes.userId, userId)))
    .returning({
      id: notes.id,
      title: notes.title,
      content: notes.content,
      categoryId: notes.categoryId,
      archivedAt: notes.archivedAt,
    });

  return { note: updated };
}

async function executeNoteArchive(
  db: DrizzleDb,
  userId: string,
  payload: unknown,
) {
  const parsed = noteArchivePayloadSchema.parse(payload);
  const [updated] = await db
    .update(notes)
    .set({
      archivedAt: new Date().toISOString(),
      isPinned: false,
      updatedAt: new Date().toISOString(),
    })
    .where(and(eq(notes.id, parsed.noteId), eq(notes.userId, userId)))
    .returning({
      id: notes.id,
      archivedAt: notes.archivedAt,
    });

  if (!updated) {
    throw new ActionExecutionError("Note not found", 404);
  }

  return { note: updated };
}

async function executeEventCreate(
  db: DrizzleDb,
  userId: string,
  payload: unknown,
) {
  const parsed = createEventSchema.parse(payload);
  const title = parsed.title.trim();
  if (!title) {
    throw new ActionExecutionError("Title is required", 400);
  }

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
    })
    .returning({
      id: events.id,
      title: events.title,
      startAt: events.startAt,
      endAt: events.endAt,
      isAllDay: events.isAllDay,
    });

  return { event: created };
}

async function executeEventUpdate(
  db: DrizzleDb,
  userId: string,
  payload: unknown,
) {
  const parsed = eventUpdatePayloadSchema.parse(payload);
  const patch = "patch" in parsed ? parsed.patch : parsed;

  const [existing] = await db
    .select({
      id: events.id,
      startAt: events.startAt,
      endAt: events.endAt,
    })
    .from(events)
    .where(and(eq(events.id, parsed.eventId), eq(events.userId, userId)));

  if (!existing) {
    throw new ActionExecutionError("Event not found", 404);
  }

  const nextTitle = patch.title?.trim();
  if (nextTitle !== undefined && nextTitle.length === 0) {
    throw new ActionExecutionError("Title is required", 400);
  }

  const nextStartAt = patch.startAt ?? existing.startAt;
  const nextEndAt = patch.endAt ?? existing.endAt;
  if (new Date(nextEndAt).getTime() <= new Date(nextStartAt).getTime()) {
    throw new ActionExecutionError("endAt must be greater than startAt", 400);
  }

  const [updated] = await db
    .update(events)
    .set({
      title: nextTitle ?? undefined,
      description: patch.description,
      location: patch.location,
      timezone: patch.timezone,
      isAllDay: patch.isAllDay,
      startAt: patch.startAt,
      endAt: patch.endAt,
      reminderMinutes: patch.reminderMinutes,
      externalUid: patch.externalUid,
      updatedAt: new Date().toISOString(),
    })
    .where(and(eq(events.id, parsed.eventId), eq(events.userId, userId)))
    .returning({
      id: events.id,
      title: events.title,
      startAt: events.startAt,
      endAt: events.endAt,
      isAllDay: events.isAllDay,
    });

  return { event: updated };
}

async function executeEventDelete(
  db: DrizzleDb,
  userId: string,
  payload: unknown,
) {
  const parsed = eventDeletePayloadSchema.parse(payload);
  const [deleted] = await db
    .delete(events)
    .where(and(eq(events.id, parsed.eventId), eq(events.userId, userId)))
    .returning({
      id: events.id,
      title: events.title,
    });

  if (!deleted) {
    throw new ActionExecutionError("Event not found", 404);
  }

  return { event: deleted, deleted: true };
}

export async function executeConfirmedAction(input: ExecuteInput) {
  const normalizedType = normalizeActionType(input.type);
  try {
    switch (normalizedType) {
      case "money_create_transaction":
        return await executeMoneyCreateTransaction(input.db, input.userId, input.payload);
      case "money_delete_transaction":
        return await executeMoneyDeleteTransaction(input.db, input.userId, input.payload);
      case "habit_create":
        return await executeHabitCreate(input.db, input.userId, input.payload);
      case "habit_update":
        return await executeHabitUpdate(input.db, input.userId, input.payload);
      case "habit_log_upsert":
        return await executeHabitLogUpsert(input.db, input.userId, input.payload);
      case "note_create":
        return await executeNoteCreate(input.db, input.userId, input.payload);
      case "note_update":
        return await executeNoteUpdate(input.db, input.userId, input.payload);
      case "note_archive":
        return await executeNoteArchive(input.db, input.userId, input.payload);
      case "event_create":
        return await executeEventCreate(input.db, input.userId, input.payload);
      case "event_update":
        return await executeEventUpdate(input.db, input.userId, input.payload);
      case "event_delete":
        return await executeEventDelete(input.db, input.userId, input.payload);
      default:
        throw new ActionExecutionError("Unsupported action type", 400);
    }
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new ActionExecutionError("Invalid action payload", 400);
    }
    if (error instanceof ActionExecutionError) {
      throw error;
    }
    throw new ActionExecutionError("Failed to execute action", 500);
  }
}
