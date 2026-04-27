import { Hono } from "hono";
import { and, eq, gte, inArray, isNotNull, isNull, lte } from "drizzle-orm";
import { createDb } from "../../db";
import { habitLogs, habitPreferences, habits } from "../../db/schema";
import {
  createHabitSchema,
  dateOnlySchema,
  habitFilterSchema,
  habitInsightsQuerySchema,
  habitPreferenceSchema,
  upsertHabitLogSchema,
  updateHabitSchema,
} from "../validators";
import type { AppEnv } from "../types";

type HabitType = "yes_no" | "measurable";
type HabitFrequencyType = "daily" | "weekdays";
type HabitWeekStart = "device" | "sunday" | "monday";
type HabitTimelineDays = 7 | 14 | 30;

export interface HabitPreferences {
  weekStart: HabitWeekStart;
  defaultFilter: "all" | "due_today" | "completed_today";
  timelineDays: HabitTimelineDays;
  showArchivedByDefault: boolean;
  requireNoteForCompletion: boolean;
  reminderMasterEnabled: boolean;
  defaultReminderEnabled: boolean;
  defaultReminderTime: string | null;
}

export interface HabitRow {
  id: string;
  userId: string;
  name: string;
  question: string;
  type: HabitType;
  color: string;
  unit: string | null;
  dailyTarget: number | null;
  frequencyType: HabitFrequencyType;
  frequencyDays: string;
  reminderEnabled: boolean;
  reminderTime: string | null;
  notes: string;
  startDate: string;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface HabitLogRow {
  id: string;
  habitId: string;
  userId: string;
  logDate: string;
  completed: boolean;
  value: number | null;
  note: string;
  createdAt: string;
  updatedAt: string;
}

export interface HabitPreferenceRow {
  userId: string;
  weekStart: string;
  defaultFilter: string;
  timelineDays: number;
  showArchivedByDefault: boolean;
  requireNoteForCompletion: boolean;
  reminderMasterEnabled: boolean;
  defaultReminderEnabled: boolean;
  defaultReminderTime: string | null;
  createdAt: string;
  updatedAt: string;
}

interface HabitDayCell {
  date: string;
  weekday: string;
  dayOfMonth: number;
  scheduled: boolean;
  completed: boolean;
  value: number | null;
  note: string;
  hasLog: boolean;
}

interface NormalizedHabitInput {
  name: string;
  question: string;
  type: HabitType;
  color: string;
  unit: string | null;
  dailyTarget: number | null;
  frequencyType: HabitFrequencyType;
  frequencyDays: number[];
  reminderEnabled: boolean;
  reminderTime: string | null;
  notes: string;
  startDate: string;
}

interface CompletionStats {
  scheduledCount: number;
  completedCount: number;
  rate: number;
}

const habitRoutes = new Hono<AppEnv>();
const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;
const DEFAULT_HABIT_PREFERENCES: HabitPreferences = {
  weekStart: "device",
  defaultFilter: "all",
  timelineDays: 30,
  showArchivedByDefault: false,
  requireNoteForCompletion: false,
  reminderMasterEnabled: true,
  defaultReminderEnabled: false,
  defaultReminderTime: "21:00",
};

export function getDefaultHabitPreferences(): HabitPreferences {
  return { ...DEFAULT_HABIT_PREFERENCES };
}

function sanitizeWeekStart(value: string): HabitWeekStart {
  if (value === "sunday" || value === "monday") return value;
  return "device";
}

function sanitizeDefaultFilter(value: string): HabitPreferences["defaultFilter"] {
  if (value === "due_today" || value === "completed_today") return value;
  return "all";
}

function sanitizeTimelineDays(value: number): HabitTimelineDays {
  if (value === 7 || value === 14) return value;
  return 30;
}

function toDateOnly(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function parseDateOnly(date: string): Date {
  return new Date(`${date}T00:00:00.000Z`);
}

function resolveTimezone(value: string | undefined): string | null {
  const candidate = value?.trim();
  if (!candidate) return null;

  try {
    new Intl.DateTimeFormat("en-US", { timeZone: candidate }).format(new Date());
    return candidate;
  } catch {
    return null;
  }
}

function dateOnlyInTimezone(date: Date, timezone: string): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);

  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;

  if (!year || !month || !day) {
    return toDateOnly(date);
  }

  return `${year}-${month}-${day}`;
}

function todayDateOnly(timezone: string | null = null, now: Date = new Date()): string {
  if (timezone) {
    return dateOnlyInTimezone(now, timezone);
  }
  return toDateOnly(now);
}

export function resolveToday(
  queryToday: string | undefined,
  queryTimezone: string | undefined,
  now: Date = new Date(),
): string {
  if (!queryToday) return todayDateOnly(resolveTimezone(queryTimezone), now);
  return ensureDateOnly(queryToday);
}

function addDays(date: string, days: number): string {
  const next = parseDateOnly(date);
  next.setUTCDate(next.getUTCDate() + days);
  return toDateOnly(next);
}

function monthStart(date: string): string {
  const parsed = parseDateOnly(date);
  parsed.setUTCDate(1);
  return toDateOnly(parsed);
}

function monthEnd(date: string): string {
  const parsed = parseDateOnly(date);
  parsed.setUTCMonth(parsed.getUTCMonth() + 1, 0);
  return toDateOnly(parsed);
}

function yearStart(date: string): string {
  const parsed = parseDateOnly(date);
  parsed.setUTCMonth(0, 1);
  return toDateOnly(parsed);
}

function enumerateDates(from: string, to: string): string[] {
  if (from > to) return [];

  const dates: string[] = [];
  let cursor = from;
  while (cursor <= to) {
    dates.push(cursor);
    cursor = addDays(cursor, 1);
  }
  return dates;
}

export function parseFrequencyDays(raw: string): number[] {
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const normalized = parsed
      .filter((value): value is number => Number.isInteger(value) && value >= 0 && value <= 6)
      .sort((a, b) => a - b);
    return Array.from(new Set(normalized));
  } catch {
    return [];
  }
}

function getWeekday(date: string): number {
  return parseDateOnly(date).getUTCDay();
}

export function isScheduledDate(
  startDate: string,
  frequencyType: HabitFrequencyType,
  frequencyDays: number[],
  date: string,
): boolean {
  if (date < startDate) return false;
  if (frequencyType === "daily") return true;
  return frequencyDays.includes(getWeekday(date));
}

export function resolveCompletion(
  habitType: HabitType,
  dailyTarget: number | null,
  log: HabitLogRow | undefined,
): boolean {
  if (!log) return false;
  if (habitType === "yes_no") return Boolean(log.completed);
  if (dailyTarget === null) return Boolean(log.completed);
  if (log.value === null) return false;
  return log.value >= dailyTarget;
}

function ratePercent(numerator: number, denominator: number): number {
  if (denominator <= 0) return 0;
  return Math.round((numerator / denominator) * 100);
}

function ensureDateOnly(date: string): string {
  return dateOnlySchema.parse(date);
}

function mapHabitPreferenceRow(row: HabitPreferenceRow | undefined): HabitPreferences {
  if (!row) {
    return getDefaultHabitPreferences();
  }

  return {
    weekStart: sanitizeWeekStart(row.weekStart),
    defaultFilter: sanitizeDefaultFilter(row.defaultFilter),
    timelineDays: sanitizeTimelineDays(row.timelineDays),
    showArchivedByDefault: Boolean(row.showArchivedByDefault),
    requireNoteForCompletion: Boolean(row.requireNoteForCompletion),
    reminderMasterEnabled: Boolean(row.reminderMasterEnabled),
    defaultReminderEnabled: Boolean(row.defaultReminderEnabled),
    defaultReminderTime: row.defaultReminderTime ?? DEFAULT_HABIT_PREFERENCES.defaultReminderTime,
  };
}

export function normalizeHabitPreferences(
  current: HabitPreferences,
  patch: Partial<HabitPreferences>,
): HabitPreferences {
  const merged: HabitPreferences = {
    ...current,
    ...patch,
  };

  if (!merged.reminderMasterEnabled) {
    merged.defaultReminderEnabled = false;
  }

  if (merged.defaultReminderEnabled && !merged.defaultReminderTime) {
    throw new Error("Default reminder time is required when default reminder is enabled");
  }

  return merged;
}

function normalizeHabitInput(input: NormalizedHabitInput): NormalizedHabitInput {
  const normalized: NormalizedHabitInput = { ...input };

  if (normalized.type === "yes_no") {
    normalized.unit = null;
    normalized.dailyTarget = null;
  } else if (normalized.dailyTarget === null || normalized.dailyTarget <= 0) {
    throw new Error("Daily target must be provided for measurable habits");
  }

  if (normalized.frequencyType === "daily") {
    normalized.frequencyDays = [];
  } else if (normalized.frequencyDays.length === 0) {
    throw new Error("Select at least one weekday for weekly frequency");
  }

  if (!normalized.reminderEnabled) {
    normalized.reminderTime = null;
  } else if (!normalized.reminderTime) {
    throw new Error("Reminder time is required when reminder is enabled");
  }

  return normalized;
}

function mapHabitRow(row: HabitRow) {
  return {
    id: row.id,
    userId: row.userId,
    name: row.name,
    question: row.question,
    type: row.type,
    color: row.color,
    unit: row.unit,
    dailyTarget: row.dailyTarget,
    frequencyType: row.frequencyType,
    frequencyDays: parseFrequencyDays(row.frequencyDays),
    reminderEnabled: Boolean(row.reminderEnabled),
    reminderTime: row.reminderTime,
    notes: row.notes,
    startDate: row.startDate,
    archivedAt: row.archivedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export function buildCompletionStats(
  habit: HabitRow,
  logMap: Map<string, HabitLogRow>,
  dates: string[],
): CompletionStats {
  const frequencyDays = parseFrequencyDays(habit.frequencyDays);
  let scheduledCount = 0;
  let completedCount = 0;

  for (const date of dates) {
    if (!isScheduledDate(habit.startDate, habit.frequencyType, frequencyDays, date)) continue;
    scheduledCount += 1;
    const completion = resolveCompletion(
      habit.type,
      habit.dailyTarget,
      logMap.get(`${habit.id}:${date}`),
    );
    if (completion) {
      completedCount += 1;
    }
  }

  return {
    scheduledCount,
    completedCount,
    rate: ratePercent(completedCount, scheduledCount),
  };
}

function monthKey(date: string): string {
  return date.slice(0, 7);
}

export function buildBestStreak(
  habit: HabitRow,
  logMap: Map<string, HabitLogRow>,
  today: string = todayDateOnly(),
) {
  const frequencyDays = parseFrequencyDays(habit.frequencyDays);
  const dates = enumerateDates(habit.startDate, today);

  let current = 0;
  let currentStart: string | null = null;
  let currentEnd: string | null = null;
  let best = 0;
  let bestStart: string | null = null;
  let bestEnd: string | null = null;

  for (const date of dates) {
    if (!isScheduledDate(habit.startDate, habit.frequencyType, frequencyDays, date)) continue;

    const completed = resolveCompletion(
      habit.type,
      habit.dailyTarget,
      logMap.get(`${habit.id}:${date}`),
    );

    if (completed) {
      current += 1;
      currentEnd = date;
      if (currentStart === null) currentStart = date;
      if (current > best) {
        best = current;
        bestStart = currentStart;
        bestEnd = currentEnd;
      }
    } else {
      current = 0;
      currentStart = null;
      currentEnd = null;
    }
  }

  return {
    current,
    currentStartDate: currentStart,
    currentEndDate: currentEnd,
    best,
    bestStartDate: bestStart,
    bestEndDate: bestEnd,
  };
}

function parseBooleanQuery(value: string | undefined, defaultValue: boolean): boolean {
  if (value === undefined) return defaultValue;
  return value.toLowerCase() === "true";
}

habitRoutes.get("/", async (c) => {
  const userId = c.get("user").id;
  const rawFilter = c.req.query("filter");
  const filter = rawFilter ? habitFilterSchema.parse(rawFilter) : "all";
  const includeArchived = parseBooleanQuery(c.req.query("includeArchived"), false);
  const rawDays = Number.parseInt(c.req.query("days") ?? "7", 10);
  const days = Number.isFinite(rawDays) ? Math.min(Math.max(rawDays, 1), 31) : 7;
  const today = resolveToday(c.req.query("today"), c.req.query("timezone"));
  const from = addDays(today, -(days - 1));
  const dateRange = enumerateDates(from, today);
  const db = createDb(c.env.DB);

  const habitConditions = [eq(habits.userId, userId)];
  if (!includeArchived) {
    habitConditions.push(isNull(habits.archivedAt));
  }

  const habitRows = await db
    .select({
      id: habits.id,
      userId: habits.userId,
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
      archivedAt: habits.archivedAt,
      createdAt: habits.createdAt,
      updatedAt: habits.updatedAt,
    })
    .from(habits)
    .where(and(...habitConditions));

  if (habitRows.length === 0) {
    return c.json({
      range: { from, to: today, days },
      filter,
      includeArchived,
      items: [],
      headers: dateRange.map((date) => ({
        date,
        weekday: WEEKDAY_LABELS[getWeekday(date)],
        dayOfMonth: parseDateOnly(date).getUTCDate(),
      })),
    });
  }

  const habitIds = habitRows.map((habit) => habit.id);
  const logRows = await db
    .select({
      id: habitLogs.id,
      habitId: habitLogs.habitId,
      userId: habitLogs.userId,
      logDate: habitLogs.logDate,
      completed: habitLogs.completed,
      value: habitLogs.value,
      note: habitLogs.note,
      createdAt: habitLogs.createdAt,
      updatedAt: habitLogs.updatedAt,
    })
    .from(habitLogs)
    .where(
      and(
        eq(habitLogs.userId, userId),
        inArray(habitLogs.habitId, habitIds),
        gte(habitLogs.logDate, from),
        lte(habitLogs.logDate, today),
      ),
    );

  const logMap = new Map<string, HabitLogRow>();
  for (const log of logRows) {
    logMap.set(`${log.habitId}:${log.logDate}`, log);
  }

  const items = habitRows.map((habit) => {
    const frequencyDays = parseFrequencyDays(habit.frequencyDays);
    const dayCells: HabitDayCell[] = dateRange.map((date) => {
      const scheduled = isScheduledDate(
        habit.startDate,
        habit.frequencyType,
        frequencyDays,
        date,
      );
      const log = logMap.get(`${habit.id}:${date}`);
      const completed = scheduled
        ? resolveCompletion(habit.type, habit.dailyTarget, log)
        : false;

      return {
        date,
        weekday: WEEKDAY_LABELS[getWeekday(date)],
        dayOfMonth: parseDateOnly(date).getUTCDate(),
        scheduled,
        completed,
        value: log?.value ?? null,
        note: log?.note ?? "",
        hasLog: Boolean(log),
      };
    });

    const stats = buildCompletionStats(habit, logMap, dateRange);
    const todayCell = dayCells[dayCells.length - 1];
    const dueToday = todayCell?.scheduled ?? false;
    const completedToday = todayCell?.completed ?? false;

    return {
      ...mapHabitRow(habit),
      progressPercent: stats.rate,
      scheduledCount: stats.scheduledCount,
      completedCount: stats.completedCount,
      dueToday,
      completedToday,
      dayCells,
    };
  });

  const filteredItems = items.filter((item) => {
    if (filter === "all") return true;
    if (filter === "due_today") return item.dueToday && !item.completedToday;
    return item.completedToday;
  });

  const sorted = filteredItems.sort((a, b) => {
    const priorityA = a.dueToday ? (a.completedToday ? 1 : 0) : 2;
    const priorityB = b.dueToday ? (b.completedToday ? 1 : 0) : 2;
    if (priorityA !== priorityB) return priorityA - priorityB;
    return a.name.localeCompare(b.name);
  });

  return c.json({
    range: { from, to: today, days },
    filter,
    includeArchived,
    headers: dateRange.map((date) => ({
      date,
      weekday: WEEKDAY_LABELS[getWeekday(date)],
      dayOfMonth: parseDateOnly(date).getUTCDate(),
    })),
    items: sorted,
  });
});

habitRoutes.post("/", async (c) => {
  const userId = c.get("user").id;
  const body = await c.req.json();
  const parsed = createHabitSchema.parse(body);
  const db = createDb(c.env.DB);

  const normalized = normalizeHabitInput({
    name: parsed.name,
    question: parsed.question,
    type: parsed.type,
    color: parsed.color,
    unit: parsed.unit ?? null,
    dailyTarget: parsed.dailyTarget ?? null,
    frequencyType: parsed.frequencyType,
    frequencyDays: parsed.frequencyDays ?? [],
    reminderEnabled: parsed.reminderEnabled,
    reminderTime: parsed.reminderTime ?? null,
    notes: parsed.notes,
    startDate: parsed.startDate,
  });

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
      userId: habits.userId,
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
      archivedAt: habits.archivedAt,
      createdAt: habits.createdAt,
      updatedAt: habits.updatedAt,
    });

  return c.json(mapHabitRow(created), 201);
});

habitRoutes.get("/preferences", async (c) => {
  const userId = c.get("user").id;
  const db = createDb(c.env.DB);

  const [row] = await db
    .select({
      userId: habitPreferences.userId,
      weekStart: habitPreferences.weekStart,
      defaultFilter: habitPreferences.defaultFilter,
      timelineDays: habitPreferences.timelineDays,
      showArchivedByDefault: habitPreferences.showArchivedByDefault,
      requireNoteForCompletion: habitPreferences.requireNoteForCompletion,
      reminderMasterEnabled: habitPreferences.reminderMasterEnabled,
      defaultReminderEnabled: habitPreferences.defaultReminderEnabled,
      defaultReminderTime: habitPreferences.defaultReminderTime,
      createdAt: habitPreferences.createdAt,
      updatedAt: habitPreferences.updatedAt,
    })
    .from(habitPreferences)
    .where(eq(habitPreferences.userId, userId));

  return c.json(mapHabitPreferenceRow(row));
});

habitRoutes.put("/preferences", async (c) => {
  const userId = c.get("user").id;
  const body = await c.req.json();
  const parsed = habitPreferenceSchema.parse(body);
  const db = createDb(c.env.DB);

  const [existing] = await db
    .select({
      userId: habitPreferences.userId,
      weekStart: habitPreferences.weekStart,
      defaultFilter: habitPreferences.defaultFilter,
      timelineDays: habitPreferences.timelineDays,
      showArchivedByDefault: habitPreferences.showArchivedByDefault,
      requireNoteForCompletion: habitPreferences.requireNoteForCompletion,
      reminderMasterEnabled: habitPreferences.reminderMasterEnabled,
      defaultReminderEnabled: habitPreferences.defaultReminderEnabled,
      defaultReminderTime: habitPreferences.defaultReminderTime,
      createdAt: habitPreferences.createdAt,
      updatedAt: habitPreferences.updatedAt,
    })
    .from(habitPreferences)
    .where(eq(habitPreferences.userId, userId));

  let normalized: HabitPreferences;
  try {
    normalized = normalizeHabitPreferences(mapHabitPreferenceRow(existing), parsed);
  } catch (error) {
    return c.json({ error: error instanceof Error ? error.message : "Invalid preferences" }, 400);
  }

  const now = new Date().toISOString();
  const [upserted] = await db
    .insert(habitPreferences)
    .values({
      userId,
      weekStart: normalized.weekStart,
      defaultFilter: normalized.defaultFilter,
      timelineDays: normalized.timelineDays,
      showArchivedByDefault: normalized.showArchivedByDefault,
      requireNoteForCompletion: normalized.requireNoteForCompletion,
      reminderMasterEnabled: normalized.reminderMasterEnabled,
      defaultReminderEnabled: normalized.defaultReminderEnabled,
      defaultReminderTime: normalized.defaultReminderTime,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: habitPreferences.userId,
      set: {
        weekStart: normalized.weekStart,
        defaultFilter: normalized.defaultFilter,
        timelineDays: normalized.timelineDays,
        showArchivedByDefault: normalized.showArchivedByDefault,
        requireNoteForCompletion: normalized.requireNoteForCompletion,
        reminderMasterEnabled: normalized.reminderMasterEnabled,
        defaultReminderEnabled: normalized.defaultReminderEnabled,
        defaultReminderTime: normalized.defaultReminderTime,
        updatedAt: now,
      },
    })
    .returning({
      userId: habitPreferences.userId,
      weekStart: habitPreferences.weekStart,
      defaultFilter: habitPreferences.defaultFilter,
      timelineDays: habitPreferences.timelineDays,
      showArchivedByDefault: habitPreferences.showArchivedByDefault,
      requireNoteForCompletion: habitPreferences.requireNoteForCompletion,
      reminderMasterEnabled: habitPreferences.reminderMasterEnabled,
      defaultReminderEnabled: habitPreferences.defaultReminderEnabled,
      defaultReminderTime: habitPreferences.defaultReminderTime,
      createdAt: habitPreferences.createdAt,
      updatedAt: habitPreferences.updatedAt,
    });

  return c.json(mapHabitPreferenceRow(upserted));
});

habitRoutes.get("/:id", async (c) => {
  const userId = c.get("user").id;
  const id = c.req.param("id");
  const db = createDb(c.env.DB);

  const [row] = await db
    .select({
      id: habits.id,
      userId: habits.userId,
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
      archivedAt: habits.archivedAt,
      createdAt: habits.createdAt,
      updatedAt: habits.updatedAt,
    })
    .from(habits)
    .where(and(eq(habits.id, id), eq(habits.userId, userId)));

  if (!row) {
    return c.json({ error: "Habit not found" }, 404);
  }

  return c.json(mapHabitRow(row));
});

habitRoutes.put("/:id", async (c) => {
  const userId = c.get("user").id;
  const id = c.req.param("id");
  const body = await c.req.json();
  const parsed = updateHabitSchema.parse(body);
  const db = createDb(c.env.DB);

  const [existing] = await db
    .select({
      id: habits.id,
      userId: habits.userId,
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
      archivedAt: habits.archivedAt,
      createdAt: habits.createdAt,
      updatedAt: habits.updatedAt,
    })
    .from(habits)
    .where(and(eq(habits.id, id), eq(habits.userId, userId)));

  if (!existing) {
    return c.json({ error: "Habit not found" }, 404);
  }

  const merged = {
    ...mapHabitRow(existing),
    ...parsed,
    frequencyDays:
      parsed.frequencyDays !== undefined
        ? parsed.frequencyDays
        : parseFrequencyDays(existing.frequencyDays),
    reminderEnabled:
      parsed.reminderEnabled !== undefined
        ? parsed.reminderEnabled
        : Boolean(existing.reminderEnabled),
  };

  const normalized = normalizeHabitInput({
    name: merged.name,
    question: merged.question,
    type: merged.type,
    color: merged.color,
    unit: merged.unit,
    dailyTarget: merged.dailyTarget,
    frequencyType: merged.frequencyType,
    frequencyDays: merged.frequencyDays,
    reminderEnabled: merged.reminderEnabled,
    reminderTime: merged.reminderTime,
    notes: merged.notes,
    startDate: merged.startDate,
  });

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
    .where(and(eq(habits.id, id), eq(habits.userId, userId)))
    .returning({
      id: habits.id,
      userId: habits.userId,
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
      archivedAt: habits.archivedAt,
      createdAt: habits.createdAt,
      updatedAt: habits.updatedAt,
    });

  return c.json(mapHabitRow(updated));
});

habitRoutes.delete("/:id", async (c) => {
  const userId = c.get("user").id;
  const id = c.req.param("id");
  const db = createDb(c.env.DB);

  const result = await db
    .update(habits)
    .set({
      archivedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    })
    .where(and(eq(habits.id, id), eq(habits.userId, userId), isNull(habits.archivedAt)))
    .returning({ id: habits.id });

  if (result.length === 0) {
    return c.json({ error: "Habit not found" }, 404);
  }

  return c.json({ success: true });
});

habitRoutes.post("/:id/restore", async (c) => {
  const userId = c.get("user").id;
  const id = c.req.param("id");
  const db = createDb(c.env.DB);

  const result = await db
    .update(habits)
    .set({
      archivedAt: null,
      updatedAt: new Date().toISOString(),
    })
    .where(and(eq(habits.id, id), eq(habits.userId, userId), isNotNull(habits.archivedAt)))
    .returning({ id: habits.id });

  if (result.length === 0) {
    return c.json({ error: "Archived habit not found" }, 404);
  }

  return c.json({ success: true });
});

habitRoutes.delete("/:id/hard", async (c) => {
  const userId = c.get("user").id;
  const id = c.req.param("id");
  const db = createDb(c.env.DB);

  const deleted = await db
    .delete(habits)
    .where(and(eq(habits.id, id), eq(habits.userId, userId)))
    .returning({ id: habits.id });

  if (deleted.length === 0) {
    return c.json({ error: "Habit not found" }, 404);
  }

  return c.json({ success: true });
});

habitRoutes.post("/:id/logs", async (c) => {
  const userId = c.get("user").id;
  const habitId = c.req.param("id");
  const body = await c.req.json();
  const parsed = upsertHabitLogSchema.parse(body);
  const db = createDb(c.env.DB);

  const [habit] = await db
    .select({
      id: habits.id,
      userId: habits.userId,
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
      archivedAt: habits.archivedAt,
      createdAt: habits.createdAt,
      updatedAt: habits.updatedAt,
    })
    .from(habits)
    .where(
      and(eq(habits.id, habitId), eq(habits.userId, userId), isNull(habits.archivedAt)),
    );

  if (!habit) {
    return c.json({ error: "Habit not found" }, 404);
  }

  const date = ensureDateOnly(parsed.date);
  const frequencyDays = parseFrequencyDays(habit.frequencyDays);

  if (date < habit.startDate) {
    return c.json({ error: "Cannot log before habit start date" }, 400);
  }

  if (!isScheduledDate(habit.startDate, habit.frequencyType, frequencyDays, date)) {
    return c.json({ error: "Date is outside scheduled frequency" }, 400);
  }

  let completed = false;
  let value: number | null = null;
  const nextNote = parsed.note === undefined ? undefined : (parsed.note ?? "").trim();

  if (habit.type === "yes_no") {
    if (parsed.completed === undefined) {
      return c.json({ error: "completed is required for yes/no habits" }, 400);
    }
    completed = parsed.completed;
    value = null;
  } else {
    if (parsed.value === undefined || parsed.value === null) {
      return c.json({ error: "value is required for measurable habits" }, 400);
    }
    value = parsed.value;
    const target = habit.dailyTarget ?? 0;
    completed = target > 0 && value >= target;
  }

  const [preferenceRow] = await db
    .select({
      requireNoteForCompletion: habitPreferences.requireNoteForCompletion,
    })
    .from(habitPreferences)
    .where(eq(habitPreferences.userId, userId));

  const requireNoteForCompletion = Boolean(preferenceRow?.requireNoteForCompletion);

  const [existing] = await db
    .select({
      id: habitLogs.id,
      habitId: habitLogs.habitId,
      userId: habitLogs.userId,
      logDate: habitLogs.logDate,
      completed: habitLogs.completed,
      value: habitLogs.value,
      note: habitLogs.note,
      createdAt: habitLogs.createdAt,
      updatedAt: habitLogs.updatedAt,
    })
    .from(habitLogs)
    .where(
      and(
        eq(habitLogs.habitId, habitId),
        eq(habitLogs.userId, userId),
        eq(habitLogs.logDate, date),
      ),
    );

  const finalNote = (nextNote ?? existing?.note ?? "").trim();
  if (requireNoteForCompletion && completed && finalNote.length === 0) {
    return c.json({ error: "Note is required when marking this habit as completed" }, 400);
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
        userId: habitLogs.userId,
        logDate: habitLogs.logDate,
        completed: habitLogs.completed,
        value: habitLogs.value,
        note: habitLogs.note,
        createdAt: habitLogs.createdAt,
        updatedAt: habitLogs.updatedAt,
      });

    return c.json(updated);
  }

  const [created] = await db
    .insert(habitLogs)
    .values({
      habitId,
      userId,
      logDate: date,
      completed,
      value,
      note: finalNote,
    })
    .returning({
      id: habitLogs.id,
      habitId: habitLogs.habitId,
      userId: habitLogs.userId,
      logDate: habitLogs.logDate,
      completed: habitLogs.completed,
      value: habitLogs.value,
      note: habitLogs.note,
      createdAt: habitLogs.createdAt,
      updatedAt: habitLogs.updatedAt,
    });

  return c.json(created, 201);
});

habitRoutes.delete("/:id/logs/:date", async (c) => {
  const userId = c.get("user").id;
  const habitId = c.req.param("id");
  const date = ensureDateOnly(c.req.param("date"));
  const db = createDb(c.env.DB);

  const [habit] = await db
    .select({ id: habits.id })
    .from(habits)
    .where(and(eq(habits.id, habitId), eq(habits.userId, userId)));

  if (!habit) {
    return c.json({ error: "Habit not found" }, 404);
  }

  await db
    .delete(habitLogs)
    .where(
      and(
        eq(habitLogs.habitId, habitId),
        eq(habitLogs.userId, userId),
        eq(habitLogs.logDate, date),
      ),
    );

  return c.json({ success: true });
});

habitRoutes.get("/:id/insights", async (c) => {
  const userId = c.get("user").id;
  const habitId = c.req.param("id");
  const parsedQuery = habitInsightsQuerySchema.parse({
    range: c.req.query("range") ?? "week",
    month: c.req.query("month") ?? undefined,
    today: c.req.query("today") ?? undefined,
  });
  const today = parsedQuery.today ?? todayDateOnly(resolveTimezone(c.req.query("timezone")));
  const db = createDb(c.env.DB);

  const [habit] = await db
    .select({
      id: habits.id,
      userId: habits.userId,
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
      archivedAt: habits.archivedAt,
      createdAt: habits.createdAt,
      updatedAt: habits.updatedAt,
    })
    .from(habits)
    .where(and(eq(habits.id, habitId), eq(habits.userId, userId)));

  if (!habit) {
    return c.json({ error: "Habit not found" }, 404);
  }

  const logs = await db
    .select({
      id: habitLogs.id,
      habitId: habitLogs.habitId,
      userId: habitLogs.userId,
      logDate: habitLogs.logDate,
      completed: habitLogs.completed,
      value: habitLogs.value,
      note: habitLogs.note,
      createdAt: habitLogs.createdAt,
      updatedAt: habitLogs.updatedAt,
    })
    .from(habitLogs)
    .where(and(eq(habitLogs.habitId, habitId), eq(habitLogs.userId, userId)));

  const logMap = new Map<string, HabitLogRow>();
  for (const log of logs) {
    logMap.set(`${habit.id}:${log.logDate}`, log);
  }

  const allDates = enumerateDates(habit.startDate, today);
  const monthDates = enumerateDates(monthStart(today), today);
  const yearDates = enumerateDates(yearStart(today), today);

  const allStats = buildCompletionStats(habit, logMap, allDates);
  const monthStats = buildCompletionStats(habit, logMap, monthDates);
  const yearStats = buildCompletionStats(habit, logMap, yearDates);

  const rangeDates =
    parsedQuery.range === "week"
      ? enumerateDates(addDays(today, -6), today)
      : parsedQuery.range === "month"
        ? monthDates
        : yearDates;

  let scoreSeries: Array<{ label: string; date: string; value: number }>;
  let historySeries: Array<{ label: string; date: string; value: number }>;

  if (parsedQuery.range === "year") {
    const monthStartDate = yearStart(today);
    const monthKeys = Array.from(
      new Set(enumerateDates(monthStartDate, today).map((date) => monthKey(date))),
    );

    scoreSeries = monthKeys.map((currentMonth) => {
      const monthRangeDates = enumerateDates(`${currentMonth}-01`, monthEnd(`${currentMonth}-01`));
      const filtered = monthRangeDates.filter((date) => date <= today);
      const stats = buildCompletionStats(habit, logMap, filtered);
      return {
        label: currentMonth,
        date: `${currentMonth}-01`,
        value: stats.rate,
      };
    });

    historySeries = monthKeys.map((currentMonth) => {
      const monthRangeDates = enumerateDates(`${currentMonth}-01`, monthEnd(`${currentMonth}-01`));
      const filtered = monthRangeDates.filter((date) => date <= today);
      const stats = buildCompletionStats(habit, logMap, filtered);
      return {
        label: currentMonth,
        date: `${currentMonth}-01`,
        value: stats.completedCount,
      };
    });
  } else {
    scoreSeries = rangeDates.map((date) => {
      const frequencyDays = parseFrequencyDays(habit.frequencyDays);
      const scheduled = isScheduledDate(
        habit.startDate,
        habit.frequencyType,
        frequencyDays,
        date,
      );
      const completed = scheduled
        ? resolveCompletion(habit.type, habit.dailyTarget, logMap.get(`${habit.id}:${date}`))
        : false;
      return {
        label: date,
        date,
        value: scheduled ? (completed ? 100 : 0) : 0,
      };
    });

    historySeries = rangeDates.map((date) => {
      const frequencyDays = parseFrequencyDays(habit.frequencyDays);
      const scheduled = isScheduledDate(
        habit.startDate,
        habit.frequencyType,
        frequencyDays,
        date,
      );
      const completed = scheduled
        ? resolveCompletion(habit.type, habit.dailyTarget, logMap.get(`${habit.id}:${date}`))
        : false;
      return {
        label: date,
        date,
        value: completed ? 1 : 0,
      };
    });
  }

  const calendarMonth = parsedQuery.month ?? monthKey(today);
  const calendarFrom = `${calendarMonth}-01`;
  const calendarTo = monthEnd(calendarFrom);
  const calendarDates = enumerateDates(calendarFrom, calendarTo);
  const frequencyDays = parseFrequencyDays(habit.frequencyDays);
  const calendarDays = calendarDates.map((date) => {
    const scheduled = isScheduledDate(habit.startDate, habit.frequencyType, frequencyDays, date);
    const log = logMap.get(`${habit.id}:${date}`);
    return {
      date,
      weekday: WEEKDAY_LABELS[getWeekday(date)],
      dayOfMonth: parseDateOnly(date).getUTCDate(),
      scheduled,
      completed: scheduled
        ? resolveCompletion(habit.type, habit.dailyTarget, log)
        : false,
      value: log?.value ?? null,
      note: log?.note ?? "",
      hasLog: Boolean(log),
      isToday: date === today,
    };
  });

  const weekdayFrequency = WEEKDAY_LABELS.map((label, dayIndex) => {
    let scheduledCount = 0;
    let completedCount = 0;
    for (const date of rangeDates) {
      if (getWeekday(date) !== dayIndex) continue;
      const scheduled = isScheduledDate(
        habit.startDate,
        habit.frequencyType,
        frequencyDays,
        date,
      );
      if (!scheduled) continue;
      scheduledCount += 1;
      const completed = resolveCompletion(
        habit.type,
        habit.dailyTarget,
        logMap.get(`${habit.id}:${date}`),
      );
      if (completed) completedCount += 1;
    }

    return {
      weekday: label,
      dayIndex,
      scheduledCount,
      completedCount,
      completionRate: ratePercent(completedCount, scheduledCount),
    };
  });

  const streak = buildBestStreak(habit, logMap, today);

  return c.json({
    habit: mapHabitRow(habit),
    range: parsedQuery.range,
    overview: {
      scorePercent: allStats.rate,
      monthPercent: monthStats.rate,
      yearPercent: yearStats.rate,
      totalCompleted: allStats.completedCount,
    },
    scoreSeries,
    historySeries,
    calendar: {
      month: calendarMonth,
      from: calendarFrom,
      to: calendarTo,
      days: calendarDays,
    },
    streak,
    weekdayFrequency,
  });
});

export { habitRoutes };
