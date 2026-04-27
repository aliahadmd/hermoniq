import { beforeEach, describe, expect, it } from "vitest";
import type Database from "better-sqlite3";
import { createTestApp, type TestDb } from "./helpers/test-app";
import { buildActionProposalWithFallback } from "../worker/ai/action-planner";
import type { DrizzleDb } from "../db";

let db: TestDb;
let sqlite: Database.Database;

beforeEach(() => {
  const test = createTestApp();
  db = test.db;
  sqlite = test.sqlite;

  sqlite.exec(`
    INSERT INTO accounts (id, name, type, currency, balance, user_id, created_at, updated_at)
    VALUES ('acct-main', 'Main Wallet', 'cash', 'USD', 5000, 'test-user', '2026-02-01T00:00:00.000Z', '2026-02-01T00:00:00.000Z');

    INSERT INTO notes (id, user_id, title, content, is_pinned, created_at, updated_at)
    VALUES ('note-main', 'test-user', 'Trip Ideas', 'Visit museum', 0, '2026-02-01T00:00:00.000Z', '2026-02-01T00:00:00.000Z');
  `);
});

function buildEnv(response: unknown): Env {
  return {
    AI_CHAT_MODEL: "@cf/google/gemma-4-26b-a4b-it",
    AI: {
      run: async () => response,
    },
  } as unknown as Env;
}

describe("structured AI action planner", () => {
  it("accepts a valid structured planner action", async () => {
    const result = await buildActionProposalWithFallback({
      env: buildEnv({
        response: {
          action: {
            type: "money_create_transaction",
            confidence: 0.94,
            payload: {
              amount: 2450,
              type: "expense",
              date: "2026-02-10",
              description: "Coffee",
              accountId: "acct-main",
            },
          },
        },
      }),
      db: db as unknown as DrizzleDb,
      userId: "test-user",
      userMessage: "Log coffee",
      assistantAnswer: "Drafting coffee expense.",
      contextSnapshot: "Accounts: acct-main Main Wallet",
      timezone: "UTC",
    });

    expect(result?.type).toBe("money_create_transaction");
    expect(result?.payload.accountId).toBe("acct-main");
    expect(result?.payload.amount).toBe(2450);
  });

  it("rejects structured actions for ids outside the authenticated user", async () => {
    sqlite
      .prepare(
        `INSERT INTO user (id, name, email, emailVerified, createdAt, updatedAt)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run("other-user", "Other User", "other@example.com", 1, Date.now(), Date.now());
    sqlite.exec(`
      INSERT INTO notes (id, user_id, title, content, is_pinned, created_at, updated_at)
      VALUES ('note-other', 'other-user', 'Private', 'Secret', 0, '2026-02-01T00:00:00.000Z', '2026-02-01T00:00:00.000Z');
    `);

    const result = await buildActionProposalWithFallback({
      env: buildEnv({
        response: {
          action: {
            type: "note_archive",
            confidence: 0.91,
            payload: {
              noteId: "note-other",
            },
          },
        },
      }),
      db: db as unknown as DrizzleDb,
      userId: "test-user",
      userMessage: "Archive note-other",
      assistantAnswer: "Drafting archive.",
      contextSnapshot: "Notes: note-main Trip Ideas",
      timezone: "UTC",
    });

    expect(result).toBeNull();
  });

  it("ignores low-confidence or no-action planner output", async () => {
    const result = await buildActionProposalWithFallback({
      env: buildEnv({
        response: {
          action: {
            type: "note_archive",
            confidence: 0.4,
            payload: {
              noteId: "note-main",
            },
          },
        },
      }),
      db: db as unknown as DrizzleDb,
      userId: "test-user",
      userMessage: "What notes do I have?",
      assistantAnswer: "You have Trip Ideas.",
      contextSnapshot: "Notes: note-main Trip Ideas",
      timezone: "UTC",
    });

    expect(result).toBeNull();
  });

  it("falls back to validated heuristic planning when structured planning fails", async () => {
    const result = await buildActionProposalWithFallback({
      env: buildEnv({
        response: "not json",
      }),
      db: db as unknown as DrizzleDb,
      userId: "test-user",
      userMessage: "Add this in note: Travel packing list",
      assistantAnswer: "Drafting note.",
      contextSnapshot: "",
      timezone: "UTC",
    });

    expect(result?.type).toBe("note_create");
    expect(result?.payload.title).toBe("Travel packing list");
  });
});
