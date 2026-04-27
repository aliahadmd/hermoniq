import { describe, expect, it } from "vitest";
import { maybeBuildActionProposal } from "../worker/ai/prompt";

describe("maybeBuildActionProposal", () => {
  it("detects add-this-in-note phrasing and uses user text as note content", () => {
    const message = [
      "Add this in note:",
      "",
      "Creative Writing & Tone",
      "Write a haiku about a robot.",
    ].join("\n");
    const assistantAnswer = "To add the provided text to a note, I propose...";

    const result = maybeBuildActionProposal(message, assistantAnswer);

    expect(result?.type).toBe("note_create");
    expect(result?.payload.title).toBe("Creative Writing & Tone");
    expect(result?.payload.content).toContain("Creative Writing & Tone");
    expect(result?.payload.content).toContain("Write a haiku about a robot.");
    expect(result?.payload.content).not.toContain("I propose");
  });

  it("parses money create intent from natural expense phrasing", () => {
    const message = "I spent $24.50 from account acc_123 for coffee";
    const result = maybeBuildActionProposal(message, "ok");

    expect(result?.type).toBe("money_create_transaction");
    expect(result?.payload.accountId).toBe("acc_123");
    expect(result?.payload.amount).toBe(2450);
    expect(result?.payload.type).toBe("expense");
  });

  it("uses provided timezone for relative money dates", () => {
    const message = "I spent $5 from account acc_123 today for snack";
    const result = maybeBuildActionProposal(message, "ok", {
      timezone: "Asia/Tokyo",
      now: new Date("2026-01-01T23:30:00.000Z"),
    });

    expect(result?.type).toBe("money_create_transaction");
    expect(result?.payload.date).toBe("2026-01-02");
  });

  it("parses money create intent with account id and income wording", () => {
    const message = "Add income $1000 to account acc_salary for monthly salary";
    const result = maybeBuildActionProposal(message, "ok");

    expect(result?.type).toBe("money_create_transaction");
    expect(result?.payload.accountId).toBe("acc_salary");
    expect(result?.payload.amount).toBe(100000);
    expect(result?.payload.type).toBe("income");
  });

  it("supports unquoted habit creation phrasing", () => {
    const message = "add habit called Morning Walk";
    const result = maybeBuildActionProposal(message, "ok");

    expect(result?.type).toBe("habit_create");
    expect(result?.payload.name).toBe("Morning Walk");
  });

  it("supports colon-style habit phrasing from chat", () => {
    const message = "Add habit: I want to quit eating sugar from today.";
    const result = maybeBuildActionProposal(message, "ok");

    expect(result?.type).toBe("habit_create");
    expect(result?.payload.name).toBe("Quit Eating Sugar");
    expect(result?.payload.frequencyType).toBe("daily");
  });

  it("supports screenshot habit phrasing with from-now wording", () => {
    const message = "Add habit: I want to stop using social media from now.";
    const result = maybeBuildActionProposal(message, "ok");

    expect(result?.type).toBe("habit_create");
    expect(result?.payload.name).toBe("Stop Using Social Media From Now");
  });

  it("uses extracted image text for note_create instead of command residue", () => {
    const message = [
      "Extract texts from image and add this in note.",
      "[19.jpg] \"OPPORTUNITY\"",
    ].join("\n");
    const result = maybeBuildActionProposal(message, "assistant fallback");

    expect(result?.type).toBe("note_create");
    expect(result?.payload.content).toBe("OPPORTUNITY");
    expect(result?.payload.content).not.toContain("Extract texts from image");
  });

  it("generates compact note title for long OCR content", () => {
    const message = [
      "Extract text from this image and create a note.",
      '[19.jpg] "Opportunity is missed by most people because it is dressed in overalls and looks like work."',
    ].join("\n");
    const result = maybeBuildActionProposal(message, "assistant fallback");

    expect(result?.type).toBe("note_create");
    expect(String(result?.payload.title)).toBe("Opportunity is missed by most people");
    expect(String(result?.payload.title).length).toBeLessThanOrEqual(40);
  });

  it("does not create an action for plain confirmation text", () => {
    const result = maybeBuildActionProposal("confirm", "ok");
    expect(result).toBeNull();
  });

  it("supports note update with explicit content payload", () => {
    const message = "update note note_123 content: Updated summary line one.";
    const result = maybeBuildActionProposal(message, "assistant fallback");

    expect(result?.type).toBe("note_update");
    expect(result?.payload.noteId).toBe("note_123");
    expect(result?.payload.content).toBe("Updated summary line one.");
  });

  it("supports money delete alias phrasing", () => {
    const message = "remove txn txn_456";
    const result = maybeBuildActionProposal(message, "ok");

    expect(result?.type).toBe("money_delete_transaction");
    expect(result?.payload.transactionId).toBe("txn_456");
  });

  it("builds event create proposal from natural language", () => {
    const message = "Create event: Team demo from 2026-03-01 10:00 to 2026-03-01 11:00 location: Room 5";
    const result = maybeBuildActionProposal(message, "ok");

    expect(result?.type).toBe("event_create");
    expect(result?.payload.title).toContain("Team demo");
    expect(result?.payload.location).toBe("Room 5");
  });

  it("defaults event timezone to provided device timezone", () => {
    const message = "Create event: Morning planning tomorrow";
    const result = maybeBuildActionProposal(message, "ok", {
      timezone: "Asia/Tokyo",
      now: new Date("2026-01-01T23:30:00.000Z"),
    });

    expect(result?.type).toBe("event_create");
    expect(result?.payload.timezone).toBe("Asia/Tokyo");
    expect(String(result?.payload.startAt)).toBe("2026-01-03T00:00:00.000Z");
    expect(String(result?.payload.endAt)).toBe("2026-01-03T01:00:00.000Z");
  });

  it("builds event delete proposal from explicit id command", () => {
    const message = "delete event evt_123";
    const result = maybeBuildActionProposal(message, "ok");

    expect(result?.type).toBe("event_delete");
    expect(result?.payload.eventId).toBe("evt_123");
  });
});
