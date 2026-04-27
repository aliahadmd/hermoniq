import { beforeEach, describe, expect, it } from "vitest";
import type Database from "better-sqlite3";
import { createTestApp, type TestDb } from "./helpers/test-app";
import type { DrizzleDb } from "../db";
import { buildUserContextSnapshot, resolveAiContexts } from "../worker/ai/context";

let db: TestDb;
let sqlite: Database.Database;

beforeEach(() => {
  const test = createTestApp();
  db = test.db;
  sqlite = test.sqlite;
});

describe("AI context builder", () => {
  it("resolves default and partial context selections", () => {
    const defaults = resolveAiContexts();
    expect(defaults).toEqual({ money: true, habits: true, notes: false, events: false });

    const custom = resolveAiContexts({ notes: true, money: false, events: true });
    expect(custom).toEqual({ money: false, habits: true, notes: true, events: true });
  });

  it("returns only requested user's data in context snapshots", async () => {
    const now = Date.now();
    sqlite
      .prepare(
        `INSERT INTO user (id, name, email, emailVerified, createdAt, updatedAt)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run("other-user", "Other User", "other@example.com", 1, now, now);

    sqlite.exec(`
      INSERT INTO accounts (id, name, type, currency, balance, user_id, created_at, updated_at)
      VALUES ('acct-a', 'Main Wallet', 'cash', 'USD', 2550, 'test-user', '2026-02-01T00:00:00.000Z', '2026-02-01T00:00:00.000Z');
      INSERT INTO accounts (id, name, type, currency, balance, user_id, created_at, updated_at)
      VALUES ('acct-b', 'Other Wallet', 'cash', 'USD', 9900, 'other-user', '2026-02-01T00:00:00.000Z', '2026-02-01T00:00:00.000Z');

      INSERT INTO profiles (id, name, username, about, location, user_id)
      VALUES ('profile-a', 'Test Person', 'testperson', 'Building better routines', 'Dhaka', 'test-user');

      INSERT INTO categories (id, title, details, color, icon, user_id)
      VALUES ('cat-a', 'Groceries', 'Food at home', '#ffcc00', 'basket', 'test-user');
      INSERT INTO categories (id, title, details, color, icon, user_id)
      VALUES ('cat-b', 'Other Category', 'Must not leak', '#000000', 'lock', 'other-user');

      INSERT INTO monthly_budgets (id, month, amount_limit, category_id, account_id, user_id, created_at, updated_at)
      VALUES ('budget-a', '2026-02', 1500, 'cat-a', 'acct-a', 'test-user', '2026-02-01T00:00:00.000Z', '2026-02-01T00:00:00.000Z');

      INSERT INTO transactions (id, amount, type, date, description, category_id, account_id, user_id, created_at)
      VALUES ('txn-a', 1200, 'expense', '2026-02-10', 'Coffee beans', 'cat-a', 'acct-a', 'test-user', '2026-02-10T00:00:00.000Z');
      INSERT INTO transactions (id, amount, type, date, description, account_id, user_id, created_at)
      VALUES ('txn-b', 4800, 'expense', '2026-02-11', 'Other user transaction', 'acct-b', 'other-user', '2026-02-11T00:00:00.000Z');

      INSERT INTO habit_preferences (user_id, week_start, default_filter, timeline_days, show_archived_by_default, require_note_for_completion, reminder_master_enabled, default_reminder_enabled, default_reminder_time, created_at, updated_at)
      VALUES ('test-user', 'monday', 'due_today', 30, 0, 1, 1, 1, '08:00', '2026-02-01T00:00:00.000Z', '2026-02-01T00:00:00.000Z');

      INSERT INTO habits (id, user_id, name, question, type, color, frequency_type, frequency_days, notes, start_date, created_at, updated_at)
      VALUES ('habit-a', 'test-user', 'Hydrate', 'Did you drink water?', 'yes_no', '#336699', 'daily', '[]', '', '2026-02-01', '2026-02-01T00:00:00.000Z', '2026-02-01T00:00:00.000Z');
      INSERT INTO habits (id, user_id, name, question, type, color, frequency_type, frequency_days, notes, start_date, created_at, updated_at)
      VALUES ('habit-b', 'other-user', 'Other Habit', 'Other user habit?', 'yes_no', '#663399', 'daily', '[]', '', '2026-02-01', '2026-02-01T00:00:00.000Z', '2026-02-01T00:00:00.000Z');

      INSERT INTO habit_logs (id, habit_id, user_id, log_date, completed, value, note, created_at, updated_at)
      VALUES ('log-a', 'habit-a', 'test-user', '2026-02-10', 1, null, 'Drank 8 glasses', '2026-02-10T00:00:00.000Z', '2026-02-10T00:00:00.000Z');

      INSERT INTO note_categories (id, user_id, name, created_at, updated_at)
      VALUES ('note-cat-a', 'test-user', 'Work', '2026-02-01T00:00:00.000Z', '2026-02-01T00:00:00.000Z');
      INSERT INTO notes (id, user_id, title, content, is_pinned, category_id, created_at, updated_at)
      VALUES ('note-a', 'test-user', 'Meeting', 'Budget sync notes', 1, 'note-cat-a', '2026-02-01T00:00:00.000Z', '2026-02-01T00:00:00.000Z');
      INSERT INTO notes (id, user_id, title, content, is_pinned, created_at, updated_at)
      VALUES ('note-b', 'other-user', 'Other secret', 'Must not leak', 0, '2026-02-01T00:00:00.000Z', '2026-02-01T00:00:00.000Z');

      INSERT INTO events (id, user_id, title, description, location, timezone, is_all_day, start_at, end_at, reminder_minutes, source, external_uid, created_at, updated_at)
      VALUES ('event-a', 'test-user', 'Design Review', 'Sprint planning', 'Office', 'UTC', 0, '2099-02-17T08:00:00.000Z', '2099-02-17T09:00:00.000Z', 10, 'manual', null, '2026-02-01T00:00:00.000Z', '2026-02-01T00:00:00.000Z');
      INSERT INTO events (id, user_id, title, description, location, timezone, is_all_day, start_at, end_at, reminder_minutes, source, external_uid, created_at, updated_at)
      VALUES ('event-b', 'other-user', 'Secret Event', 'Private', 'Hidden', 'UTC', 0, '2099-02-18T08:00:00.000Z', '2099-02-18T09:00:00.000Z', null, 'manual', null, '2026-02-01T00:00:00.000Z', '2026-02-01T00:00:00.000Z');
    `);

    const snapshot = await buildUserContextSnapshot(
      db as unknown as DrizzleDb,
      "test-user",
      { money: true, habits: true, notes: true, events: true },
      {
        timezone: "UTC",
        now: new Date("2026-02-11T12:00:00.000Z"),
      },
    );

    expect(snapshot).toContain("Ecosystem clock:");
    expect(snapshot).toContain("Profile context:");
    expect(snapshot).toContain("Test Person");
    expect(snapshot).toContain("Building better routines");
    expect(snapshot).toContain("Main Wallet");
    expect(snapshot).toContain("acct-a Main Wallet(cash, USD) balance=25.50");
    expect(snapshot).toContain("Account totals by currency: USD=25.50");
    expect(snapshot).toContain("Groceries");
    expect(snapshot).toContain("12.00/15.00 USD (80%)");
    expect(snapshot).toContain("txn-a 2026-02-10 expense 12.00 USD [Main Wallet] category=Groceries \"Coffee beans\"");
    expect(snapshot).toContain("Coffee beans");
    expect(snapshot).toContain("Hydrate");
    expect(snapshot).toContain("Drank 8 glasses");
    expect(snapshot).toContain("Preferences: weekStart=monday");
    expect(snapshot).toContain("Meeting");
    expect(snapshot).toContain("pinned [Work]");
    expect(snapshot).toContain("Design Review");
    expect(snapshot).toContain("Cross-domain signals:");
    expect(snapshot).toContain("Budget pressure: Groceries on Main Wallet is 80% used");

    expect(snapshot).not.toContain("Other Wallet");
    expect(snapshot).not.toContain("Other Category");
    expect(snapshot).not.toContain("Other user transaction");
    expect(snapshot).not.toContain("Other Habit");
    expect(snapshot).not.toContain("Other secret");
    expect(snapshot).not.toContain("Secret Event");
    expect(snapshot).not.toContain("balance=2550");
    expect(snapshot).not.toContain("expense 1200");
  });
});
