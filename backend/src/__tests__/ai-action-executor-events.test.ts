import { and, eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { executeConfirmedAction } from "../worker/ai/action-executor";
import { events, user } from "../db/schema";
import { createTestApp } from "./helpers/test-app";

const TEST_USER_ID = "test-user";
const OTHER_USER_ID = "other-user";

describe("executeConfirmedAction event actions", () => {
  it("creates, updates, and deletes an event for the authenticated user", async () => {
    const { db, sqlite } = createTestApp();

    try {
      const createdResult = await executeConfirmedAction({
        db,
        userId: TEST_USER_ID,
        type: "event_create",
        payload: {
          title: "Team Demo",
          description: "Sprint review",
          location: "Room 5",
          timezone: "UTC",
          isAllDay: false,
          startAt: "2026-03-01T10:00:00.000Z",
          endAt: "2026-03-01T11:00:00.000Z",
          reminderMinutes: 10,
          source: "manual",
        },
      });

      expect(createdResult.event).toBeDefined();
      expect(createdResult.event.title).toBe("Team Demo");
      const createdId = String(createdResult.event.id);

      const updatedResult = await executeConfirmedAction({
        db,
        userId: TEST_USER_ID,
        type: "event_update",
        payload: {
          eventId: createdId,
          patch: {
            title: "Updated Team Demo",
            reminderMinutes: 15,
          },
        },
      });

      expect(updatedResult.event).toBeDefined();
      expect(updatedResult.event.title).toBe("Updated Team Demo");

      const [updatedRow] = await db
        .select({
          title: events.title,
          reminderMinutes: events.reminderMinutes,
        })
        .from(events)
        .where(and(eq(events.id, createdId), eq(events.userId, TEST_USER_ID)));

      expect(updatedRow?.title).toBe("Updated Team Demo");
      expect(updatedRow?.reminderMinutes).toBe(15);

      const deletedResult = await executeConfirmedAction({
        db,
        userId: TEST_USER_ID,
        type: "event_delete",
        payload: {
          eventId: createdId,
        },
      });

      expect(deletedResult.deleted).toBe(true);
      expect(deletedResult.event.id).toBe(createdId);

      const [deletedRow] = await db
        .select({ id: events.id })
        .from(events)
        .where(and(eq(events.id, createdId), eq(events.userId, TEST_USER_ID)));

      expect(deletedRow).toBeUndefined();
    } finally {
      sqlite.close();
    }
  });

  it("blocks cross-user event update and delete actions", async () => {
    const { db, sqlite } = createTestApp();

    try {
      await db.insert(user).values({
        id: OTHER_USER_ID,
        name: "Other User",
        email: "other@example.com",
        emailVerified: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      await db.insert(events).values({
        id: "evt-other-1",
        userId: OTHER_USER_ID,
        title: "Private Event",
        description: "",
        location: "",
        timezone: "UTC",
        isAllDay: false,
        startAt: "2026-03-02T09:00:00.000Z",
        endAt: "2026-03-02T10:00:00.000Z",
        reminderMinutes: null,
        source: "manual",
        createdAt: "2026-03-01T00:00:00.000Z",
        updatedAt: "2026-03-01T00:00:00.000Z",
      });

      await expect(
        executeConfirmedAction({
          db,
          userId: TEST_USER_ID,
          type: "event_update",
          payload: {
            eventId: "evt-other-1",
            patch: { title: "Hijacked" },
          },
        }),
      ).rejects.toMatchObject({
        message: "Event not found",
        status: 404,
      });

      await expect(
        executeConfirmedAction({
          db,
          userId: TEST_USER_ID,
          type: "event_delete",
          payload: {
            eventId: "evt-other-1",
          },
        }),
      ).rejects.toMatchObject({
        message: "Event not found",
        status: 404,
      });
    } finally {
      sqlite.close();
    }
  });
});
