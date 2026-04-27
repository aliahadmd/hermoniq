import { describe, expect, it } from "vitest";
import {
  buildBestStreak,
  buildCompletionStats,
  getDefaultHabitPreferences,
  isScheduledDate,
  normalizeHabitPreferences,
  parseFrequencyDays,
  resolveCompletion,
  resolveToday,
  type HabitLogRow,
  type HabitRow,
} from "../worker/routes/habits";

function createHabit(overrides: Partial<HabitRow> = {}): HabitRow {
  return {
    id: "habit-1",
    userId: "user-1",
    name: "Exercise",
    question: "Did you exercise today?",
    type: "yes_no",
    color: "#ff6b81",
    unit: null,
    dailyTarget: null,
    frequencyType: "daily",
    frequencyDays: "[]",
    reminderEnabled: false,
    reminderTime: null,
    notes: "",
    startDate: "2026-02-01",
    archivedAt: null,
    createdAt: "2026-02-01T00:00:00.000Z",
    updatedAt: "2026-02-01T00:00:00.000Z",
    ...overrides,
  };
}

function createLog(overrides: Partial<HabitLogRow> = {}): HabitLogRow {
  return {
    id: "log-1",
    habitId: "habit-1",
    userId: "user-1",
    logDate: "2026-02-01",
    completed: false,
    value: null,
    note: "",
    createdAt: "2026-02-01T00:00:00.000Z",
    updatedAt: "2026-02-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("Habit date resolution helpers", () => {
  it("resolves today in the provided timezone when query date is missing", () => {
    const now = new Date("2026-01-01T23:30:00.000Z");

    expect(resolveToday(undefined, "Asia/Tokyo", now)).toBe("2026-01-02");
    expect(resolveToday(undefined, "America/Los_Angeles", now)).toBe("2026-01-01");
  });

  it("falls back safely when timezone is invalid", () => {
    const now = new Date("2026-01-01T23:30:00.000Z");
    expect(resolveToday(undefined, "Invalid/Timezone", now)).toBe("2026-01-01");
  });

  it("prefers explicit query today over timezone-derived date", () => {
    const now = new Date("2026-01-01T23:30:00.000Z");
    expect(resolveToday("2026-02-14", "Asia/Tokyo", now)).toBe("2026-02-14");
  });
});

describe("Habit schedule helpers", () => {
  it("parses and sanitizes frequency days", () => {
    expect(parseFrequencyDays("[1,2,2,6,8]")).toEqual([1, 2, 6]);
    expect(parseFrequencyDays("invalid-json")).toEqual([]);
  });

  it("supports daily and weekday scheduling", () => {
    const dailyHabit = createHabit({ frequencyType: "daily", startDate: "2026-02-01" });
    expect(isScheduledDate(dailyHabit.startDate, "daily", [], "2026-02-10")).toBe(true);
    expect(isScheduledDate(dailyHabit.startDate, "daily", [], "2026-01-31")).toBe(false);

    const weekdayHabit = createHabit({
      frequencyType: "weekdays",
      frequencyDays: JSON.stringify([1, 3, 5]),
    });
    // 2026-02-09 is Monday (1)
    expect(
      isScheduledDate(weekdayHabit.startDate, "weekdays", [1, 3, 5], "2026-02-09"),
    ).toBe(true);
    // 2026-02-10 is Tuesday (2)
    expect(
      isScheduledDate(weekdayHabit.startDate, "weekdays", [1, 3, 5], "2026-02-10"),
    ).toBe(false);
  });
});

describe("Habit completion helpers", () => {
  it("uses completed boolean for yes/no habits", () => {
    const log = createLog({ completed: true });
    expect(resolveCompletion("yes_no", null, log)).toBe(true);
    expect(resolveCompletion("yes_no", null, undefined)).toBe(false);
  });

  it("uses value against target for measurable habits", () => {
    expect(
      resolveCompletion("measurable", 100, createLog({ completed: false, value: 120 })),
    ).toBe(true);
    expect(
      resolveCompletion("measurable", 100, createLog({ completed: true, value: 80 })),
    ).toBe(false);
  });
});

describe("Habit analytics helpers", () => {
  it("calculates completion rate over scheduled dates", () => {
    const habit = createHabit({ frequencyType: "daily" });
    const logMap = new Map<string, HabitLogRow>([
      ["habit-1:2026-02-01", createLog({ logDate: "2026-02-01", completed: true })],
      ["habit-1:2026-02-03", createLog({ logDate: "2026-02-03", completed: true })],
    ]);
    const stats = buildCompletionStats(habit, logMap, [
      "2026-02-01",
      "2026-02-02",
      "2026-02-03",
    ]);

    expect(stats.scheduledCount).toBe(3);
    expect(stats.completedCount).toBe(2);
    expect(stats.rate).toBe(67);
  });

  it("finds best and current streak on scheduled dates only", () => {
    const habit = createHabit({
      frequencyType: "weekdays",
      frequencyDays: JSON.stringify([1, 2, 3, 4, 5]),
      startDate: "2026-02-09",
    });
    const logMap = new Map<string, HabitLogRow>([
      ["habit-1:2026-02-09", createLog({ logDate: "2026-02-09", completed: true })],
      ["habit-1:2026-02-10", createLog({ logDate: "2026-02-10", completed: true })],
      ["habit-1:2026-02-11", createLog({ logDate: "2026-02-11", completed: false })],
      ["habit-1:2026-02-12", createLog({ logDate: "2026-02-12", completed: true })],
      ["habit-1:2026-02-13", createLog({ logDate: "2026-02-13", completed: true })],
      ["habit-1:2026-02-16", createLog({ logDate: "2026-02-16", completed: true })],
    ]);

    const streak = buildBestStreak(habit, logMap);

    expect(streak.best).toBeGreaterThanOrEqual(2);
    expect(streak.bestStartDate).not.toBeNull();
    expect(streak.bestEndDate).not.toBeNull();
    expect(streak.current).toBeGreaterThanOrEqual(0);
  });
});

describe("Habit preference helpers", () => {
  it("returns stable default preferences", () => {
    expect(getDefaultHabitPreferences()).toEqual({
      weekStart: "device",
      defaultFilter: "all",
      timelineDays: 30,
      showArchivedByDefault: false,
      requireNoteForCompletion: false,
      reminderMasterEnabled: true,
      defaultReminderEnabled: false,
      defaultReminderTime: "21:00",
    });
  });

  it("merges preference updates", () => {
    const current = getDefaultHabitPreferences();
    const updated = normalizeHabitPreferences(current, {
      defaultFilter: "due_today",
      timelineDays: 14,
      showArchivedByDefault: true,
      requireNoteForCompletion: true,
      reminderMasterEnabled: true,
      defaultReminderEnabled: true,
      defaultReminderTime: "08:30",
    });

    expect(updated.defaultFilter).toBe("due_today");
    expect(updated.timelineDays).toBe(14);
    expect(updated.showArchivedByDefault).toBe(true);
    expect(updated.requireNoteForCompletion).toBe(true);
    expect(updated.defaultReminderEnabled).toBe(true);
    expect(updated.defaultReminderTime).toBe("08:30");
  });

  it("throws when default reminder is enabled without time", () => {
    const current = getDefaultHabitPreferences();
    expect(() =>
      normalizeHabitPreferences(current, {
        defaultReminderEnabled: true,
        defaultReminderTime: null,
      }),
    ).toThrow("Default reminder time is required");
  });
});
