import { and, eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { executeConfirmedAction } from "../worker/ai/action-executor";
import { habitLogs, habitPreferences, habits } from "../db/schema";
import { createTestApp } from "./helpers/test-app";

const TEST_USER_ID = "test-user";

describe("executeConfirmedAction habit_log_upsert", () => {
  it("preserves existing note when note is omitted", async () => {
    const { db, sqlite } = createTestApp();
    const habitId = "habit-note-keep";

    try {
      await db.insert(habits).values({
        id: habitId,
        userId: TEST_USER_ID,
        name: "Meditate",
        question: "Did you meditate today?",
        type: "yes_no",
        color: "#e88795",
        frequencyType: "daily",
        frequencyDays: "[]",
        reminderEnabled: false,
        notes: "",
        startDate: "2026-02-01",
      });
      await db.insert(habitLogs).values({
        id: "log-existing",
        habitId,
        userId: TEST_USER_ID,
        logDate: "2026-02-14",
        completed: true,
        note: "Existing note",
      });

      await executeConfirmedAction({
        db,
        userId: TEST_USER_ID,
        type: "habit_log_upsert",
        payload: {
          habitId,
          data: {
            date: "2026-02-14",
            completed: false,
          },
        },
      });

      const [updated] = await db
        .select({
          note: habitLogs.note,
          completed: habitLogs.completed,
        })
        .from(habitLogs)
        .where(
          and(
            eq(habitLogs.habitId, habitId),
            eq(habitLogs.userId, TEST_USER_ID),
            eq(habitLogs.logDate, "2026-02-14"),
          ),
        );

      expect(updated?.completed).toBe(false);
      expect(updated?.note).toBe("Existing note");
    } finally {
      sqlite.close();
    }
  });

  it("allows completion with require-note preference when existing note is present", async () => {
    const { db, sqlite } = createTestApp();
    const habitId = "habit-require-note-existing";

    try {
      await db.insert(habits).values({
        id: habitId,
        userId: TEST_USER_ID,
        name: "Read",
        question: "Did you read today?",
        type: "yes_no",
        color: "#65b68b",
        frequencyType: "daily",
        frequencyDays: "[]",
        reminderEnabled: false,
        notes: "",
        startDate: "2026-02-01",
      });
      await db.insert(habitPreferences).values({
        userId: TEST_USER_ID,
        requireNoteForCompletion: true,
      });
      await db.insert(habitLogs).values({
        id: "log-with-note",
        habitId,
        userId: TEST_USER_ID,
        logDate: "2026-02-15",
        completed: false,
        note: "Kept note",
      });

      await executeConfirmedAction({
        db,
        userId: TEST_USER_ID,
        type: "habit_log_upsert",
        payload: {
          habitId,
          data: {
            date: "2026-02-15",
            completed: true,
          },
        },
      });

      const [updated] = await db
        .select({
          note: habitLogs.note,
          completed: habitLogs.completed,
        })
        .from(habitLogs)
        .where(
          and(
            eq(habitLogs.habitId, habitId),
            eq(habitLogs.userId, TEST_USER_ID),
            eq(habitLogs.logDate, "2026-02-15"),
          ),
        );

      expect(updated?.completed).toBe(true);
      expect(updated?.note).toBe("Kept note");
    } finally {
      sqlite.close();
    }
  });

  it("rejects completion when require-note preference is on and no final note exists", async () => {
    const { db, sqlite } = createTestApp();
    const habitId = "habit-require-note-missing";

    try {
      await db.insert(habits).values({
        id: habitId,
        userId: TEST_USER_ID,
        name: "Walk",
        question: "Did you walk today?",
        type: "yes_no",
        color: "#5fa5db",
        frequencyType: "daily",
        frequencyDays: "[]",
        reminderEnabled: false,
        notes: "",
        startDate: "2026-02-01",
      });
      await db.insert(habitPreferences).values({
        userId: TEST_USER_ID,
        requireNoteForCompletion: true,
      });

      await expect(
        executeConfirmedAction({
          db,
          userId: TEST_USER_ID,
          type: "habit_log_upsert",
          payload: {
            habitId,
            data: {
              date: "2026-02-16",
              completed: true,
            },
          },
        }),
      ).rejects.toMatchObject({
        message: "Note is required when marking this habit as completed",
        status: 400,
      });
    } finally {
      sqlite.close();
    }
  });
});
