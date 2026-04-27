import { and, asc, desc, eq, gte, isNull, lte } from "drizzle-orm";
import type { DrizzleDb } from "../../db";
import {
  accounts,
  categories,
  events,
  habitLogs,
  habitPreferences,
  habits,
  monthlyBudgets,
  noteCategories,
  notes,
  profiles,
  transactions,
  user,
} from "../../db/schema";

export interface AiContextSelection {
  money: boolean;
  habits: boolean;
  notes: boolean;
  events: boolean;
}

export const DEFAULT_AI_CONTEXTS: AiContextSelection = {
  money: true,
  habits: true,
  notes: false,
  events: false,
};

export function resolveAiContexts(input?: Partial<AiContextSelection>): AiContextSelection {
  return {
    money: input?.money ?? DEFAULT_AI_CONTEXTS.money,
    habits: input?.habits ?? DEFAULT_AI_CONTEXTS.habits,
    notes: input?.notes ?? DEFAULT_AI_CONTEXTS.notes,
    events: input?.events ?? DEFAULT_AI_CONTEXTS.events,
  };
}

function truncate(value: string, max = 120): string {
  if (value.length <= max) return value;
  return `${value.slice(0, max - 1)}…`;
}

function formatMinorUnitAmount(amount: number): string {
  const absolute = Math.abs(amount);
  const formatted = (absolute / 100).toFixed(2);
  return amount < 0 ? `-${formatted}` : formatted;
}

interface UserContextSnapshotOptions {
  timezone?: string;
  now?: Date;
}

function resolveTimezone(value?: string): string {
  const fallback = "UTC";
  const candidate = value?.trim();
  if (!candidate) return fallback;

  try {
    new Intl.DateTimeFormat("en-US", { timeZone: candidate }).format(new Date());
    return candidate;
  } catch {
    return fallback;
  }
}

function dateOnlyInTimezone(date: Date, timezone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);

  const year = parts.find((part) => part.type === "year")?.value ?? "1970";
  const month = parts.find((part) => part.type === "month")?.value ?? "01";
  const day = parts.find((part) => part.type === "day")?.value ?? "01";
  return `${year}-${month}-${day}`;
}

function addDaysIso(date: Date, days: number): string {
  const copy = new Date(date);
  copy.setUTCDate(copy.getUTCDate() + days);
  return copy.toISOString();
}

function parseFrequencyDays(raw: string): number[] {
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((value): value is number => Number.isInteger(value) && value >= 0 && value <= 6);
  } catch {
    return [];
  }
}

function isHabitDueToday(row: {
  startDate: string;
  frequencyType: "daily" | "weekdays";
  frequencyDays: string;
}, today: string): boolean {
  if (today < row.startDate) return false;
  if (row.frequencyType === "daily") return true;

  const weekday = new Date(`${today}T00:00:00.000Z`).getUTCDay();
  return parseFrequencyDays(row.frequencyDays).includes(weekday);
}

export async function buildUserContextSnapshot(
  db: DrizzleDb,
  userId: string,
  contexts: AiContextSelection,
  options: UserContextSnapshotOptions = {},
): Promise<string> {
  const blocks: string[] = [];
  const signals: string[] = [];
  const timezone = resolveTimezone(options.timezone);
  const now = options.now ?? new Date();
  const nowIso = now.toISOString();
  const today = dateOnlyInTimezone(now, timezone);
  const currentMonth = today.slice(0, 7);
  const nextWeekIso = addDaysIso(now, 7);

  blocks.push(`Ecosystem clock:\nToday=${today}; now=${nowIso}; timezone=${timezone}`);

  const [profileRow] = await db
    .select({
      authName: user.name,
      profileName: profiles.name,
      username: profiles.username,
      about: profiles.about,
      location: profiles.location,
      workCompany: profiles.workCompany,
      workPosition: profiles.workPosition,
      educationSchool: profiles.educationSchool,
      educationDegree: profiles.educationDegree,
    })
    .from(user)
    .leftJoin(profiles, eq(profiles.userId, user.id))
    .where(eq(user.id, userId))
    .limit(1);

  if (profileRow) {
    const profileBits = [
      `name=${truncate(profileRow.profileName ?? profileRow.authName, 80)}`,
      profileRow.username ? `username=${profileRow.username}` : null,
      profileRow.location ? `location=${truncate(profileRow.location, 80)}` : null,
      profileRow.about ? `about="${truncate(profileRow.about, 120)}"` : null,
      profileRow.workCompany || profileRow.workPosition
        ? `work=${truncate([profileRow.workPosition, profileRow.workCompany].filter(Boolean).join(" at "), 120)}`
        : null,
      profileRow.educationSchool || profileRow.educationDegree
        ? `education=${truncate([profileRow.educationDegree, profileRow.educationSchool].filter(Boolean).join(", "), 120)}`
        : null,
    ].filter((value): value is string => Boolean(value));
    blocks.push(`Profile context:\n${profileBits.join("; ")}`);
  }

  if (contexts.money) {
    const [accountRows, categoryRows, budgetRows, transactionRows, monthTransactionRows] = await Promise.all([
      db
        .select({
          id: accounts.id,
          name: accounts.name,
          type: accounts.type,
          currency: accounts.currency,
          balance: accounts.balance,
        })
        .from(accounts)
        .where(eq(accounts.userId, userId))
        .orderBy(desc(accounts.updatedAt))
        .limit(8),
      db
        .select({
          id: categories.id,
          title: categories.title,
          details: categories.details,
          icon: categories.icon,
        })
        .from(categories)
        .where(eq(categories.userId, userId))
        .limit(12),
      db
        .select({
          id: monthlyBudgets.id,
          month: monthlyBudgets.month,
          amountLimit: monthlyBudgets.amountLimit,
          categoryId: monthlyBudgets.categoryId,
          accountId: monthlyBudgets.accountId,
          categoryTitle: categories.title,
          accountName: accounts.name,
          currency: accounts.currency,
        })
        .from(monthlyBudgets)
        .leftJoin(categories, and(eq(monthlyBudgets.categoryId, categories.id), eq(categories.userId, userId)))
        .leftJoin(accounts, and(eq(monthlyBudgets.accountId, accounts.id), eq(accounts.userId, userId)))
        .where(and(eq(monthlyBudgets.userId, userId), eq(monthlyBudgets.month, currentMonth)))
        .limit(12),
      db
        .select({
          id: transactions.id,
          type: transactions.type,
          amount: transactions.amount,
          date: transactions.date,
          accountName: accounts.name,
          currency: accounts.currency,
          categoryTitle: categories.title,
          description: transactions.description,
        })
        .from(transactions)
        .leftJoin(accounts, and(eq(transactions.accountId, accounts.id), eq(accounts.userId, userId)))
        .leftJoin(categories, and(eq(transactions.categoryId, categories.id), eq(categories.userId, userId)))
        .where(eq(transactions.userId, userId))
        .orderBy(desc(transactions.date))
        .limit(16),
      db
        .select({
          type: transactions.type,
          amount: transactions.amount,
          categoryId: transactions.categoryId,
          accountId: transactions.accountId,
        })
        .from(transactions)
        .where(and(eq(transactions.userId, userId), gte(transactions.date, `${currentMonth}-01`)))
        .limit(200),
    ]);

    const moneyLines: string[] = [];
    if (accountRows.length > 0) {
      const totalsByCurrency = accountRows.reduce<Record<string, number>>((totals, row) => {
        totals[row.currency] = (totals[row.currency] ?? 0) + row.balance;
        return totals;
      }, {});
      moneyLines.push(
        `Accounts: ${accountRows
          .map((row) => `${row.id} ${row.name}(${row.type}, ${row.currency}) balance=${formatMinorUnitAmount(row.balance)}`)
          .join("; ")}`,
      );
      moneyLines.push(
        `Account totals by currency: ${Object.entries(totalsByCurrency)
          .map(([currency, total]) => `${currency}=${formatMinorUnitAmount(total)}`)
          .join("; ")}`,
      );
    }
    if (categoryRows.length > 0) {
      moneyLines.push(
        `Categories: ${categoryRows
          .map((row) => `${row.id} ${row.title}${row.details ? ` "${truncate(row.details, 40)}"` : ""}`)
          .join("; ")}`,
      );
    }
    if (budgetRows.length > 0) {
      const spentByBudgetKey = monthTransactionRows.reduce<Record<string, number>>((totals, row) => {
        if (row.type !== "expense") return totals;
        const key = `${row.accountId}:${row.categoryId ?? ""}`;
        totals[key] = (totals[key] ?? 0) + row.amount;
        return totals;
      }, {});

      moneyLines.push(
        `Current month budgets (${currentMonth}): ${budgetRows
          .map((row) => {
            const spent = spentByBudgetKey[`${row.accountId}:${row.categoryId}`] ?? 0;
            const percent = row.amountLimit > 0 ? Math.round((spent / row.amountLimit) * 100) : 0;
            if (percent >= 80) {
              signals.push(
                `Budget pressure: ${row.categoryTitle ?? row.categoryId} on ${row.accountName ?? row.accountId} is ${percent}% used`,
              );
            }
            return `${row.categoryTitle ?? row.categoryId} on ${row.accountName ?? row.accountId}: ${formatMinorUnitAmount(spent)}/${formatMinorUnitAmount(row.amountLimit)}${row.currency ? ` ${row.currency}` : ""} (${percent}%)`;
          })
          .join("; ")}`,
      );
    }
    if (transactionRows.length > 0) {
      moneyLines.push(
        `Recent transactions: ${transactionRows
          .map(
            (row) =>
              `${row.id} ${row.date} ${row.type} ${formatMinorUnitAmount(row.amount)}${row.currency ? ` ${row.currency}` : ""}${
                row.accountName ? ` [${truncate(row.accountName, 24)}]` : ""
              }${row.categoryTitle ? ` category=${truncate(row.categoryTitle, 32)}` : ""}${
                row.description ? ` "${truncate(row.description, 40)}"` : ""
              }`,
          )
          .join(" | ")}`,
      );
    }
    if (moneyLines.length > 0) {
      blocks.push(`Money context:\n${moneyLines.join("\n")}`);
    }
  }

  if (contexts.habits) {
    const [preferenceRow, habitRows, logRows] = await Promise.all([
      db
        .select({
          weekStart: habitPreferences.weekStart,
          defaultFilter: habitPreferences.defaultFilter,
          timelineDays: habitPreferences.timelineDays,
          requireNoteForCompletion: habitPreferences.requireNoteForCompletion,
          reminderMasterEnabled: habitPreferences.reminderMasterEnabled,
          defaultReminderEnabled: habitPreferences.defaultReminderEnabled,
          defaultReminderTime: habitPreferences.defaultReminderTime,
        })
        .from(habitPreferences)
        .where(eq(habitPreferences.userId, userId))
        .limit(1),
      db
        .select({
          id: habits.id,
          name: habits.name,
          type: habits.type,
          question: habits.question,
          unit: habits.unit,
          dailyTarget: habits.dailyTarget,
          frequencyType: habits.frequencyType,
          frequencyDays: habits.frequencyDays,
          reminderEnabled: habits.reminderEnabled,
          reminderTime: habits.reminderTime,
          startDate: habits.startDate,
          notes: habits.notes,
        })
        .from(habits)
        .where(and(eq(habits.userId, userId), isNull(habits.archivedAt)))
        .orderBy(desc(habits.updatedAt))
        .limit(10),
      db
        .select({
          habitName: habits.name,
          habitId: habitLogs.habitId,
          logDate: habitLogs.logDate,
          completed: habitLogs.completed,
          value: habitLogs.value,
          note: habitLogs.note,
        })
        .from(habitLogs)
        .leftJoin(habits, and(eq(habitLogs.habitId, habits.id), eq(habits.userId, userId)))
        .where(eq(habitLogs.userId, userId))
        .orderBy(desc(habitLogs.logDate))
        .limit(18),
    ]);

    const habitLines: string[] = [];
    if (preferenceRow[0]) {
      const pref = preferenceRow[0];
      habitLines.push(
        `Preferences: weekStart=${pref.weekStart}; defaultFilter=${pref.defaultFilter}; timelineDays=${pref.timelineDays}; requireNote=${Number(pref.requireNoteForCompletion)}; reminders=${Number(pref.reminderMasterEnabled)} default=${Number(pref.defaultReminderEnabled)}${pref.defaultReminderTime ? ` at ${pref.defaultReminderTime}` : ""}`,
      );
    }
    if (habitRows.length > 0) {
      habitLines.push(
        `Habits: ${habitRows
          .map((row) => {
            const frequency =
              row.frequencyType === "daily"
                ? "daily"
                : `weekdays=${parseFrequencyDays(row.frequencyDays).join(",") || "none"}`;
            const target = row.type === "measurable" ? ` target=${row.dailyTarget ?? "-"}${row.unit ?? ""}` : "";
            const reminder = row.reminderEnabled ? ` reminder=${row.reminderTime ?? "on"}` : "";
            return `${row.id} ${row.name} (${row.type}, ${frequency}${target}) "${truncate(row.question, 48)}"${reminder}${
              row.notes ? ` note="${truncate(row.notes, 48)}"` : ""
            }`;
          })
          .join("; ")}`,
      );

      const loggedTodayIds = new Set(logRows.filter((row) => row.logDate === today).map((row) => row.habitId));
      const missedDueToday = habitRows
        .filter((row) => isHabitDueToday(row, today) && !loggedTodayIds.has(row.id))
        .map((row) => row.name);
      if (missedDueToday.length > 0) {
        signals.push(`Habits due without a ${today} log: ${missedDueToday.slice(0, 6).join(", ")}`);
      }
    }
    if (logRows.length > 0) {
      habitLines.push(
        `Recent logs: ${logRows
          .map(
            (row) =>
              `${row.logDate} ${row.habitName ?? row.habitId} completed=${Number(row.completed)} value=${
                row.value ?? "-"
              }${row.note ? ` note="${truncate(row.note, 40)}"` : ""}`,
          )
          .join(" | ")}`,
      );
    }
    if (habitLines.length > 0) {
      blocks.push(`Habits context:\n${habitLines.join("\n")}`);
    }
  }

  if (contexts.notes) {
    const [categoryRows, noteRows, archivedRows] = await Promise.all([
      db
        .select({
          id: noteCategories.id,
          name: noteCategories.name,
        })
        .from(noteCategories)
        .where(eq(noteCategories.userId, userId))
        .orderBy(asc(noteCategories.name))
        .limit(12),
      db
        .select({
          id: notes.id,
          title: notes.title,
          content: notes.content,
          isPinned: notes.isPinned,
          updatedAt: notes.updatedAt,
          categoryName: noteCategories.name,
        })
        .from(notes)
        .leftJoin(noteCategories, and(eq(notes.categoryId, noteCategories.id), eq(noteCategories.userId, userId)))
        .where(and(eq(notes.userId, userId), isNull(notes.archivedAt)))
        .orderBy(desc(notes.isPinned), desc(notes.updatedAt))
        .limit(10),
      db
        .select({
          id: notes.id,
          title: notes.title,
          archivedAt: notes.archivedAt,
        })
        .from(notes)
        .where(and(eq(notes.userId, userId), lte(notes.archivedAt, nowIso)))
        .orderBy(desc(notes.archivedAt))
        .limit(6),
    ]);

    const noteLines: string[] = [];
    if (categoryRows.length > 0) {
      noteLines.push(`Categories: ${categoryRows.map((row) => `${row.id} ${row.name}`).join("; ")}`);
    }
    if (noteRows.length > 0) {
      const pinned = noteRows.filter((row) => row.isPinned).map((row) => row.title);
      if (pinned.length > 0) {
        signals.push(`Pinned notes to keep in mind: ${pinned.slice(0, 4).join(", ")}`);
      }
      noteLines.push(
        `Active notes: ${noteRows
          .map(
            (row) =>
              `${row.id} ${row.updatedAt.slice(0, 10)}${row.isPinned ? " pinned" : ""}${
                row.categoryName ? ` [${row.categoryName}]` : ""
              } "${truncate(row.title, 50)}" => ${truncate(row.content, 120)}`,
          )
          .join(" | ")}`,
      );
    }
    if (archivedRows.length > 0) {
      noteLines.push(
        `Recently archived notes: ${archivedRows
          .map((row) => `${row.id} "${truncate(row.title, 50)}" archived=${row.archivedAt?.slice(0, 10) ?? "unknown"}`)
          .join("; ")}`,
      );
    }
    if (noteLines.length > 0) {
      blocks.push(`Notes context:\n${noteLines.join("\n")}`);
    }
  }

  if (contexts.events) {
    const [eventRows, recentEventRows] = await Promise.all([
      db
        .select({
          id: events.id,
          title: events.title,
          description: events.description,
          timezone: events.timezone,
          startAt: events.startAt,
          endAt: events.endAt,
          isAllDay: events.isAllDay,
          location: events.location,
          reminderMinutes: events.reminderMinutes,
        })
        .from(events)
        .where(and(eq(events.userId, userId), gte(events.endAt, nowIso)))
        .orderBy(asc(events.startAt))
        .limit(12),
      db
        .select({
          id: events.id,
          title: events.title,
          startAt: events.startAt,
          endAt: events.endAt,
          location: events.location,
        })
        .from(events)
        .where(and(eq(events.userId, userId), lte(events.endAt, nowIso)))
        .orderBy(desc(events.endAt))
        .limit(5),
    ]);

    const eventLines: string[] = [];
    if (eventRows.length > 0) {
      const soon = eventRows.filter((row) => row.startAt <= nextWeekIso).map((row) => row.title);
      if (soon.length > 0) {
        signals.push(`Upcoming within 7 days: ${soon.slice(0, 5).join(", ")}`);
      }
      eventLines.push(
        `Upcoming events: ${eventRows
          .map((row) => {
            const kind = row.isAllDay ? "all-day" : "timed";
            const location = row.location ? ` @${truncate(row.location, 40)}` : "";
            const reminder = row.reminderMinutes === null ? "" : ` reminder=${row.reminderMinutes}m`;
            const description = row.description ? ` desc="${truncate(row.description, 60)}"` : "";
            return `${row.id} ${row.startAt} -> ${row.endAt} ${kind} tz=${row.timezone} "${truncate(row.title, 60)}"${location}${reminder}${description}`;
          })
          .join(" | ")}`,
      );
    }
    if (recentEventRows.length > 0) {
      eventLines.push(
        `Recent past events: ${recentEventRows
          .map(
            (row) =>
              `${row.id} ${row.startAt.slice(0, 10)} "${truncate(row.title, 50)}"${
                row.location ? ` @${truncate(row.location, 32)}` : ""
              }`,
          )
          .join("; ")}`,
      );
    }
    if (eventLines.length > 0) {
      blocks.push(`Events context:\n${eventLines.join("\n")}`);
    }
  }

  if (signals.length > 0) {
    blocks.push(`Cross-domain signals:\n${signals.slice(0, 8).map((signal) => `- ${signal}`).join("\n")}`);
  }

  if (blocks.length === 1) {
    return "No user context available yet for the selected chips.";
  }

  return blocks.join("\n\n");
}
