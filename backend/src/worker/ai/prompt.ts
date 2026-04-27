import type { AiContextSelection } from "./context";

export type AiPendingActionType =
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

export interface AiPendingActionProposal {
  type: AiPendingActionType;
  payload: Record<string, unknown>;
}

function normalizeInstruction(input: string | undefined): string | null {
  if (!input) return null;
  const trimmed = input.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function buildAssistantSystemPrompt(
  contexts: AiContextSelection,
  customInstruction?: string,
): string {
  const enabledContexts = [
    contexts.money ? "Money" : null,
    contexts.habits ? "Habits" : null,
    contexts.notes ? "Notes" : null,
    contexts.events ? "Events" : null,
  ]
    .filter((value): value is string => Boolean(value))
    .join(", ");

  return [
    "You are Harmoniq AI Assistant.",
    "Harmoniq is a personal finance and lifestyle app with money tracking, budgets, habits, notes, planner events, profile context, chat memory, and image understanding.",
    "Only use the authenticated user's data provided in this request; never reference other users or unknown private data.",
    "Use the ecosystem context to connect relevant money, habit, note, event, and profile signals when it helps the user's goal.",
    "Treat context snapshots as compact summaries: do not expose raw retrieval blocks, hidden reasoning, or unrelated internal ids.",
    "Mention entity ids only when the user needs an exact id for a safe update/delete or asks for it.",
    "When image context is present, it comes from a vision model run on the user's attached images for this turn.",
    "Do not claim you cannot read or interpret images when image context is provided.",
    "If image context is empty or unclear, ask for a clearer image or manual text.",
    `Active context chips: ${enabledContexts || "None"}.`,
    "If useful context is missing or disabled, briefly ask the user to enable the related chip or provide the missing fact.",
    "When users explicitly request CRUD changes, you may draft one pending action with concrete fields.",
    "Any data-changing action requires explicit user confirmation through the app UI.",
    "For write-action drafts, keep the assistant reply concise (max 3 short lines) and focused on the draft fields only.",
    "Do not ask follow-up confirmation questions like 'Would you like me to confirm?'; UI accept/reject handles confirmation.",
    "For money writes, require explicit account/transaction ids or an exact id present in the context snapshot before proposing an action.",
    "Do not claim data was created, updated, or deleted unless the app has already confirmed execution.",
    "If a write is requested but required fields are missing, ask for the smallest missing detail instead of guessing.",
    "Keep answers concise and practical.",
    normalizeInstruction(customInstruction)
      ? `Custom instruction for this chat: ${normalizeInstruction(customInstruction)}`
      : null,
  ].join("\n");
}

export function buildRetrievalSection(
  userContextSnapshot: string,
  vectorMemoryChunks: string[],
  aiSearchChunks: string[],
  imageContextChunks: string[] = [],
): string {
  const sections = [`User context snapshot:\n${userContextSnapshot}`];

  if (vectorMemoryChunks.length > 0) {
    sections.push(`Vector memory recall:\n${vectorMemoryChunks.map((chunk) => `- ${chunk}`).join("\n")}`);
  }

  if (aiSearchChunks.length > 0) {
    sections.push(`AI Search recall:\n${aiSearchChunks.map((chunk) => `- ${chunk}`).join("\n")}`);
  }

  if (imageContextChunks.length > 0) {
    sections.push(
      `Image context (current turn only):\n${imageContextChunks.map((chunk) => `- ${chunk}`).join("\n")}`,
    );
  }

  return sections.join("\n\n");
}

export interface NoteActionPayload {
  title: string;
  content: string;
}

interface ProposalTimeContext {
  timezone: string;
  now: Date;
}

export interface AiActionProposalOptions {
  timezone?: string;
  now?: Date;
}

const DATE_ONLY_REGEX = /^(\d{4})-(\d{2})-(\d{2})$/;

function findId(message: string, pattern: RegExp): string | null {
  const match = message.match(pattern);
  if (!match?.[1]) return null;
  return match[1].trim();
}

function parseAmount(message: string): number | null {
  const match =
    message.match(
      /(?:amount|for|of|spent|spend|paid|pay|received|receive|earned|earn)\s*\$?\s*(-?\d+(?:\.\d{1,2})?)/i,
    ) ?? message.match(/\$\s*(-?\d+(?:\.\d{1,2})?)/);
  if (!match?.[1]) return null;
  const value = Number(match[1]);
  return Number.isFinite(value) ? Math.round(value * 100) : null;
}

function zeroPad(value: number): string {
  return String(value).padStart(2, "0");
}

function formatDateOnly(year: number, month: number, day: number): string {
  return `${year}-${zeroPad(month)}-${zeroPad(day)}`;
}

function shiftDateOnly(dateOnly: string, dayDelta: number): string {
  const match = DATE_ONLY_REGEX.exec(dateOnly);
  if (!match) return dateOnly;

  const shifted = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]) + dayDelta));
  return formatDateOnly(
    shifted.getUTCFullYear(),
    shifted.getUTCMonth() + 1,
    shifted.getUTCDate(),
  );
}

function datePartsInTimezone(
  date: Date,
  timezone: string,
): {
  year: number;
  month: number;
  day: number;
} {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);

  const year = Number(parts.find((part) => part.type === "year")?.value ?? "0");
  const month = Number(parts.find((part) => part.type === "month")?.value ?? "1");
  const day = Number(parts.find((part) => part.type === "day")?.value ?? "1");

  return { year, month, day };
}

function currentDateOnlyInTimezone(now: Date, timezone: string): string {
  const parts = datePartsInTimezone(now, timezone);
  return formatDateOnly(parts.year, parts.month, parts.day);
}

function parseTimezoneOffsetMinutes(value: string): number | null {
  if (value === "GMT" || value === "UTC") return 0;

  const match = value.match(/^GMT([+-])(\d{1,2})(?::?(\d{2}))?$/);
  if (!match) return null;

  const sign = match[1] === "-" ? -1 : 1;
  const hours = Number(match[2] ?? "0");
  const minutes = Number(match[3] ?? "0");
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;

  return sign * (hours * 60 + minutes);
}

function timezoneOffsetMinutesAt(date: Date, timezone: string): number | null {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    timeZoneName: "shortOffset",
  }).formatToParts(date);
  const offset = parts.find((part) => part.type === "timeZoneName")?.value ?? "";
  return parseTimezoneOffsetMinutes(offset);
}

function isoFromTimezoneLocal(
  dateOnly: string,
  timeOnly: string,
  timezone: string,
): string | null {
  const dateMatch = DATE_ONLY_REGEX.exec(dateOnly);
  const timeMatch = /^(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(timeOnly);
  if (!dateMatch || !timeMatch) return null;

  const year = Number(dateMatch[1]);
  const month = Number(dateMatch[2]);
  const day = Number(dateMatch[3]);
  const hour = Number(timeMatch[1]);
  const minute = Number(timeMatch[2]);
  const second = Number(timeMatch[3] ?? "0");
  const baseUtcMs = Date.UTC(year, month - 1, day, hour, minute, second);

  const firstOffset = timezoneOffsetMinutesAt(new Date(baseUtcMs), timezone);
  if (firstOffset === null) {
    return new Date(baseUtcMs).toISOString();
  }

  let correctedUtcMs = baseUtcMs - firstOffset * 60_000;
  const secondOffset = timezoneOffsetMinutesAt(new Date(correctedUtcMs), timezone);
  if (secondOffset !== null && secondOffset !== firstOffset) {
    correctedUtcMs = baseUtcMs - secondOffset * 60_000;
  }

  return new Date(correctedUtcMs).toISOString();
}

function parseTimeOnlyCandidate(input: string): string | null {
  const match = input.match(/\b(\d{1,2}):(\d{2})(?::(\d{2}))?\s*([ap]m)?\b/i);
  if (!match) return null;

  let hours = Number(match[1]);
  const minutes = Number(match[2]);
  const seconds = Number(match[3] ?? "0");
  const meridiem = match[4]?.toLowerCase() ?? "";

  if (minutes > 59 || seconds > 59) return null;
  if (meridiem) {
    if (hours < 1 || hours > 12) return null;
    if (meridiem === "pm" && hours < 12) hours += 12;
    if (meridiem === "am" && hours === 12) hours = 0;
  }
  if (!meridiem && (hours < 0 || hours > 23)) return null;

  return `${zeroPad(hours)}:${zeroPad(minutes)}:${zeroPad(seconds)}`;
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

function resolveProposalTimeContext(options?: AiActionProposalOptions): ProposalTimeContext {
  return {
    timezone: resolveTimezone(options?.timezone),
    now: options?.now ?? new Date(),
  };
}

function parseDate(message: string, timeContext: ProposalTimeContext): string | null {
  const match = message.match(/\b(20\d{2}-\d{2}-\d{2})\b/);
  if (match?.[1]) return match[1];

  const today = currentDateOnlyInTimezone(timeContext.now, timeContext.timezone);
  if (/\btoday\b/i.test(message)) return today;
  if (/\btomorrow\b/i.test(message)) return shiftDateOnly(today, 1);
  if (/\byesterday\b/i.test(message)) return shiftDateOnly(today, -1);

  return null;
}

function clip(value: string, max: number): string {
  if (value.length <= max) return value;
  return value.slice(0, max);
}

function looksLikeNoteCreateIntent(normalized: string): boolean {
  if (/\b(?:add|save|store|put|create|make)\b[\s\S]{0,40}\bnotes?\b/i.test(normalized)) {
    return true;
  }
  if (/\badd this in note\b/i.test(normalized)) return true;
  if (/\bsave this (?:to|in) notes?\b/i.test(normalized)) return true;
  return false;
}

function extractQuotedSegments(message: string): string[] {
  const matches: string[] = [];
  const pattern = /"([^"]{3,})"/g;
  let match: RegExpExecArray | null = null;
  while (true) {
    match = pattern.exec(message);
    if (!match) break;
    const text = match[1]?.trim();
    if (text) matches.push(text);
  }
  return matches;
}

function extractImageContextBlocks(message: string): string[] {
  const pattern = /\[[^\]\n]+\]\s*([\s\S]*?)(?=(?:\n\[[^\]\n]+\]\s*)|$)/g;
  const blocks: string[] = [];
  let match: RegExpExecArray | null = null;

  while (true) {
    match = pattern.exec(message);
    if (!match?.[1]) break;

    const normalized = match[1]
      .replace(/\bNO_TEXT_FOUND\b/gi, "")
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.length > 0)
      .map((line) => line.replace(/^"(.*)"$/, "$1").trim())
      .join("\n")
      .trim();

    if (normalized.length > 0) {
      blocks.push(normalized);
    }
  }

  return blocks;
}

function looksLikeImageDrivenNoteRequest(message: string): boolean {
  return /\b(image|images|screenshot|photo|ocr|extract\s+text|attached)\b/i.test(message);
}

function extractNoteContent(message: string, assistantAnswer: string): string {
  const fromCue = message.match(
    /\b(?:add|save|store|put|create|make)\b[\s\S]{0,40}\b(?:in|as|to)?\s*(?:a\s+)?notes?\b\s*[:-]\s*([\s\S]+)/i,
  );
  if (fromCue?.[1]?.trim()) {
    return clip(fromCue[1].trim(), 10_000);
  }

  const explicitNoteField = message.match(/\bnotes?\s*[:-]\s*([\s\S]+)/i);
  if (explicitNoteField?.[1]?.trim()) {
    return clip(explicitNoteField[1].trim(), 10_000);
  }

  const imageBlocks = extractImageContextBlocks(message);
  if (imageBlocks.length > 0 && looksLikeImageDrivenNoteRequest(message)) {
    return clip(imageBlocks.join("\n\n"), 10_000);
  }

  const strippedCommand = message
    .replace(/\b(?:please\s+)?(?:add|save|store|put|create|make)\b[\s\S]{0,80}\bnotes?\b\s*[:-]?/i, "")
    .replace(/^[\s:;.,-]+/, "")
    .trim();
  if (strippedCommand.length > 0) {
    const looksLikeResidualCommand =
      strippedCommand.length < 100 &&
      /\b(?:extract|read|get|add|save|store|create|make)\b/i.test(strippedCommand) &&
      /\b(?:image|screenshot|photo|note|notes|ocr)\b/i.test(strippedCommand);
    if (!looksLikeResidualCommand) {
      return clip(strippedCommand, 10_000);
    }
  }

  const quoted = extractQuotedSegments(message);
  if (quoted.length > 0) {
    return clip(quoted.join("\n\n"), 10_000);
  }

  if (imageBlocks.length > 0) {
    return clip(imageBlocks.join("\n\n"), 10_000);
  }

  return clip(assistantAnswer.trim() || "New note from AI chat.", 10_000);
}

function compactTitle(source: string): string {
  const normalized = source
    .replace(/\s+/g, " ")
    .replace(/^[-\s"':;,.]+/, "")
    .replace(/[-\s"':;,.]+$/, "")
    .trim();
  if (!normalized) return "AI Note";

  const sentenceFirst = normalized.split(/[.!?]\s/)[0]?.trim() ?? normalized;
  const words = sentenceFirst.split(" ").filter(Boolean);
  const headWords = words.slice(0, 6).join(" ");
  const candidate = headWords || sentenceFirst;
  const bounded = candidate.length > 40 ? `${candidate.slice(0, 39).trimEnd()}…` : candidate;
  return bounded || "AI Note";
}

function inferNoteTitle(message: string, content: string): string {
  const explicitTitle = message.match(/\btitle\s*[:-]\s*([^\n]+)/i)?.[1]?.trim();
  if (explicitTitle) {
    return clip(explicitTitle, 120);
  }

  const firstContentLine = content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line.length > 0);
  if (firstContentLine) {
    const sanitized = firstContentLine.replace(/^[-*#>\d.\s)]+/, "").trim();
    if (sanitized) return clip(compactTitle(sanitized), 120);
  }

  return "AI Note";
}

function looksLikeTransactionCreateIntent(normalized: string): boolean {
  return (
    /\b(?:create|add|log|record)\b[\s\S]{0,18}\b(?:transaction|expense|income)\b/i.test(normalized) ||
    /\b(?:spent|spend|paid|pay|received|receive|earned|earn)\b/i.test(normalized)
  );
}

function looksLikeHabitCreateIntent(normalized: string): boolean {
  return (
    /\b(?:create|add|start|begin|make|set\s*up)\b[\s\S]{0,24}\bhabit\b/i.test(normalized) ||
    /\bhabit\s*[:-]\s*[a-z0-9]/i.test(normalized)
  );
}

function toTitleCase(value: string): string {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => {
      if (word.length <= 2) return word.toLowerCase();
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    })
    .join(" ");
}

function inferHabitName(message: string): string | null {
  const candidates = [
    message.match(/(?:create|add|start|begin)\s+habit(?:\s+called|\s+named)?\s+"([^"]{2,120})"/i)?.[1],
    message.match(/(?:create|add|start|begin)\s+habit(?:\s+called|\s+named)?\s*[:-]\s*([^\n]{2,140})/i)?.[1],
    message.match(/(?:create|add|start|begin)\s+habit(?:\s+called|\s+named)?\s+([^\n.,]{2,120})/i)?.[1],
    message.match(/\bhabit\s*[:-]\s*([^\n]{2,140})/i)?.[1],
  ]
    .map((value) => value?.trim())
    .filter((value): value is string => Boolean(value));

  let raw = candidates[0];
  if (!raw) {
    const quoted = extractQuotedSegments(message);
    raw = quoted[0];
  }
  if (!raw) return null;

  const normalized = raw
    .replace(/^i\s+want\s+to\s+/i, "")
    .replace(/^to\s+/i, "")
    .replace(/\b(?:starting|from)\s+today\b/gi, "")
    .replace(/\btoday\b/gi, "")
    .replace(/[.!?]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();

  if (!normalized) return null;
  const title = toTitleCase(normalized);
  return clip(title, 100);
}

function parseTransactionType(normalized: string): "income" | "expense" {
  const hasIncomeHint = /\b(income|salary|earned|earn|received|receive|refund|reimburse|deposit)\b/i.test(
    normalized,
  );
  const hasExpenseHint = /\b(expense|spent|spend|paid|pay|bought|buy|purchase|purchased|cost)\b/i.test(
    normalized,
  );

  if (hasIncomeHint && !hasExpenseHint) return "income";
  if (hasExpenseHint && !hasIncomeHint) return "expense";
  if (hasIncomeHint && hasExpenseHint) return "income";
  return normalized.includes("income") ? "income" : "expense";
}

function inferAccountId(message: string): string | null {
  return (
    findId(message, /from\s+account(?:\s+id)?[:\s]+([a-zA-Z0-9_-]+)/i) ??
    findId(message, /to\s+account(?:\s+id)?[:\s]+([a-zA-Z0-9_-]+)/i) ??
    findId(message, /account(?:\s+id)?(?:\s+is)?[:\s]+([a-zA-Z0-9_-]+)/i) ??
    findId(message, /acct(?:\s+id)?[:\s]+([a-zA-Z0-9_-]+)/i)
  );
}

function inferTransactionDescription(message: string): string {
  const explicit = message.match(/\b(?:for|about|desc(?:ription)?)\s*[:-]?\s+([^\n]+)$/i)?.[1]?.trim();
  if (explicit) return clip(explicit, 500);

  const normalized = message
    .replace(/\b(?:create|add|log|record|new)\b/gi, "")
    .replace(/\b(?:transaction|expense|income)\b/gi, "")
    .replace(/\b(?:from|to)\s+account(?:\s+id)?[:\s]+[a-zA-Z0-9_-]+/gi, "")
    .replace(/\baccount(?:\s+id)?(?:\s+is)?[:\s]+[a-zA-Z0-9_-]+/gi, "")
    .replace(/\bacct(?:\s+id)?[:\s]+[a-zA-Z0-9_-]+/gi, "")
    .replace(/\b\d{4}-\d{2}-\d{2}\b/g, "")
    .replace(/\b(?:today|yesterday)\b/gi, "")
    .replace(/\$?\d+(?:\.\d{1,2})?/g, "")
    .replace(/[,:]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return clip(normalized, 500);
}

function extractNoteUpdateContent(message: string, assistantAnswer: string): string {
  const explicitContent = message.match(/\bcontent\s*[:-]\s*([\s\S]+)/i)?.[1]?.trim();
  if (explicitContent) return clip(explicitContent, 10_000);

  const quoted = extractQuotedSegments(message);
  if (quoted.length > 0) return clip(quoted.join("\n\n"), 10_000);

  return clip(assistantAnswer, 10_000);
}

function looksLikeEventCreateIntent(normalized: string): boolean {
  return (
    /\b(?:add|create|schedule|plan|book|set\s*up)\b[\s\S]{0,30}\b(?:event|planner|meeting|appointment|calendar)\b/i.test(
      normalized,
    ) || /\bevent\s*[:-]\s*[a-z0-9]/i.test(normalized)
  );
}

function inferEventAllDay(message: string): boolean {
  return /\ball[\s-]?day\b/i.test(message);
}

function parseFlexibleDateTime(input: string, timeContext: ProposalTimeContext): string | null {
  const candidate = input.trim();
  if (!candidate) return null;

  const isoWithZone =
    candidate.match(
      /\b(20\d{2}-\d{2}-\d{2})[T\s](\d{2}:\d{2})(?::(\d{2})(?:\.\d{1,3})?)?\s*(Z|[+-]\d{2}:?\d{2})\b/i,
    );
  if (isoWithZone?.[1] && isoWithZone[2] && isoWithZone[4]) {
    const rawOffset = isoWithZone[4].toUpperCase();
    const normalizedOffset =
      rawOffset === "Z" || rawOffset.includes(":")
        ? rawOffset
        : `${rawOffset.slice(0, 3)}:${rawOffset.slice(3)}`;
    const normalized = `${isoWithZone[1]}T${isoWithZone[2]}:${isoWithZone[3] ?? "00"}${normalizedOffset}`;
    const parsed = new Date(normalized);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed.toISOString();
    }
  }

  const dateTime = candidate.match(/\b(20\d{2}-\d{2}-\d{2})[ T](\d{2}:\d{2})(?::(\d{2}))?\b/);
  if (dateTime?.[1] && dateTime?.[2]) {
    const iso = isoFromTimezoneLocal(
      dateTime[1],
      `${dateTime[2]}:${dateTime[3] ?? "00"}`,
      timeContext.timezone,
    );
    if (iso) return iso;
  }

  const keywordDate = parseDate(candidate, timeContext);
  if (keywordDate) {
    const explicitTime = parseTimeOnlyCandidate(candidate);
    const iso = isoFromTimezoneLocal(keywordDate, explicitTime ?? "09:00:00", timeContext.timezone);
    if (iso) return iso;
  }

  const dateOnly = candidate.match(/\b(20\d{2}-\d{2}-\d{2})\b/)?.[1];
  if (dateOnly) {
    const iso = isoFromTimezoneLocal(dateOnly, "09:00:00", timeContext.timezone);
    if (iso) return iso;
  }

  return null;
}

function inferEventRange(
  message: string,
  isAllDay: boolean,
  timeContext: ProposalTimeContext,
): { startAt: string; endAt: string } {
  const todayDate = currentDateOnlyInTimezone(timeContext.now, timeContext.timezone);

  const rangeMatch = message.match(/\bfrom\s+([^\n]+?)\s+to\s+([^\n]+?)(?:$|,|\.|;)/i);
  const rangedStart = rangeMatch?.[1] ? parseFlexibleDateTime(rangeMatch[1], timeContext) : null;
  const rangedEnd = rangeMatch?.[2] ? parseFlexibleDateTime(rangeMatch[2], timeContext) : null;

  const singleStartMatch =
    message.match(/\b(?:start(?:ing)?(?:\s+at)?|on|at)\s+([^\n,.;]+)/i)?.[1] ?? null;
  const singleStart = singleStartMatch ? parseFlexibleDateTime(singleStartMatch, timeContext) : null;
  const inferredDateOnly = parseDate(message, timeContext);

  if (isAllDay) {
    const startDate = rangedStart?.slice(0, 10) ?? singleStart?.slice(0, 10) ?? inferredDateOnly ?? todayDate;
    const rawEndDate = rangedEnd?.slice(0, 10) ?? startDate;
    const normalizedEndDate = rawEndDate < startDate ? startDate : rawEndDate;
    const startAt = isoFromTimezoneLocal(startDate, "00:00:00", timeContext.timezone);
    const endAt = isoFromTimezoneLocal(
      shiftDateOnly(normalizedEndDate, 1),
      "00:00:00",
      timeContext.timezone,
    );

    if (!startAt || !endAt) {
      const start = new Date(`${startDate}T00:00:00.000Z`);
      const end = new Date(start);
      end.setUTCDate(end.getUTCDate() + 1);
      return {
        startAt: start.toISOString(),
        endAt: end.toISOString(),
      };
    }

    return {
      startAt,
      endAt,
    };
  }

  const inferredStart =
    inferredDateOnly
      ? isoFromTimezoneLocal(inferredDateOnly, "09:00:00", timeContext.timezone)
      : null;
  const start = rangedStart ?? singleStart ?? inferredStart ?? timeContext.now.toISOString();
  const startDate = new Date(start);

  let endDate = rangedEnd ? new Date(rangedEnd) : new Date(startDate.getTime() + 60 * 60 * 1000);
  if (endDate.getTime() <= startDate.getTime()) {
    endDate = new Date(startDate.getTime() + 60 * 60 * 1000);
  }

  return {
    startAt: startDate.toISOString(),
    endAt: endDate.toISOString(),
  };
}

function inferEventTitle(message: string): string {
  const explicit = message.match(/\btitle\s*[:-]\s*([^\n]+)/i)?.[1]?.trim();
  if (explicit) return clip(explicit, 160);

  const fromCommand = message
    .match(
      /\b(?:add|create|schedule|plan|book|set\s*up)\b[\s\S]{0,28}\b(?:event|planner|meeting|appointment|calendar)\b\s*[:-]?\s*([^\n]+)/i,
    )?.[1]
    ?.trim();
  if (fromCommand) return clip(fromCommand, 160);

  const quoted = extractQuotedSegments(message)[0];
  if (quoted) return clip(quoted, 160);

  return "New Event";
}

function inferEventDescription(message: string): string {
  const explicit = message.match(/\bdescription\s*[:-]\s*([\s\S]+)/i)?.[1]?.trim();
  if (explicit) return clip(explicit, 4_000);
  return "";
}

function inferEventLocation(message: string): string {
  const explicit = message.match(/\blocation\s*[:-]\s*([^\n]+)/i)?.[1]?.trim();
  if (explicit) return clip(explicit, 240);
  return "";
}

function inferEventTimezone(message: string, fallbackTimezone: string): string {
  const explicit = message.match(/\btimezone\s*[:-]\s*([a-zA-Z_/+-]{2,64})/i)?.[1]?.trim();
  if (explicit) return resolveTimezone(clip(explicit, 100));
  return resolveTimezone(fallbackTimezone);
}

function inferEventReminderMinutes(message: string): number | null {
  const normalized = message.toLowerCase();
  if (/\b(?:no reminder|reminder none|without reminder)\b/.test(normalized)) return null;
  if (/\b(?:at event time|at the time|at time of event)\b/.test(normalized)) return 0;
  if (/\b5\s*(?:min|minute)s?\b/.test(normalized)) return 5;
  if (/\b10\s*(?:min|minute)s?\b/.test(normalized)) return 10;
  if (/\b15\s*(?:min|minute)s?\b/.test(normalized)) return 15;
  if (/\b1\s*week\b/.test(normalized)) return 10080;
  return null;
}

export function maybeBuildActionProposal(
  message: string,
  assistantAnswer: string,
  options?: AiActionProposalOptions,
): AiPendingActionProposal | null {
  const normalized = message.toLowerCase();
  const timeContext = resolveProposalTimeContext(options);
  const currentDate = currentDateOnlyInTimezone(timeContext.now, timeContext.timezone);

  if (looksLikeNoteCreateIntent(normalized)) {
    const content = extractNoteContent(message, assistantAnswer);
    const titleFromMessage = inferNoteTitle(message, content);

    return {
      type: "note_create",
      payload: {
        title: titleFromMessage || "AI Note",
        content,
      },
    };
  }

  const updateNoteId = findId(message, /update note\s+([a-zA-Z0-9_-]+)/i);
  if (updateNoteId) {
    const nextTitle = message.match(/\btitle\s*[:-]\s*([^\n]+)/i)?.[1]?.trim();
    return {
      type: "note_update",
      payload: {
        noteId: updateNoteId,
        ...(nextTitle ? { title: clip(nextTitle, 120) } : {}),
        content: extractNoteUpdateContent(message, assistantAnswer),
      },
    };
  }

  const archiveNoteId =
    findId(message, /archive note\s+([a-zA-Z0-9_-]+)/i) ??
    findId(message, /(?:delete|remove) note\s+([a-zA-Z0-9_-]+)/i);
  if (archiveNoteId) {
    return {
      type: "note_archive",
      payload: {
        noteId: archiveNoteId,
      },
    };
  }

  const deleteEventId =
    findId(message, /(?:delete|remove|cancel)\s+event\s+([a-zA-Z0-9_-]+)/i) ??
    findId(message, /(?:delete|remove|cancel)\s+planner\s+([a-zA-Z0-9_-]+)/i);
  if (deleteEventId) {
    return {
      type: "event_delete",
      payload: {
        eventId: deleteEventId,
      },
    };
  }

  const updateEventId =
    findId(message, /(?:update|edit|change)\s+event\s+([a-zA-Z0-9_-]+)/i) ??
    findId(message, /(?:update|edit|change)\s+planner\s+([a-zA-Z0-9_-]+)/i);
  if (updateEventId) {
    const patch: Record<string, unknown> = {};

    const title = message.match(/\btitle\s*[:-]\s*([^\n]+)/i)?.[1]?.trim();
    if (title) patch.title = clip(title, 160);

    const description = message.match(/\bdescription\s*[:-]\s*([\s\S]+)/i)?.[1]?.trim();
    if (description) patch.description = clip(description, 4_000);

    const location = message.match(/\blocation\s*[:-]\s*([^\n]+)/i)?.[1]?.trim();
    if (location) patch.location = clip(location, 240);

    const timezone = message.match(/\btimezone\s*[:-]\s*([a-zA-Z_/+-]{2,64})/i)?.[1]?.trim();
    if (timezone) patch.timezone = clip(timezone, 100);

    if (/\bnot all[\s-]?day\b/i.test(message) || /\btimed\b/i.test(message)) {
      patch.isAllDay = false;
    } else if (/\ball[\s-]?day\b/i.test(message)) {
      patch.isAllDay = true;
    }

    const hasDateHint = /\b20\d{2}-\d{2}-\d{2}\b|\btoday\b|\btomorrow\b|\byesterday\b/i.test(message);
    if (hasDateHint || /\bfrom\b/i.test(message)) {
      const isAllDay = patch.isAllDay === true;
      const nextRange = inferEventRange(message, isAllDay, timeContext);
      patch.startAt = nextRange.startAt;
      patch.endAt = nextRange.endAt;
    }

    if (/\breminder\b/i.test(message)) {
      patch.reminderMinutes = inferEventReminderMinutes(message);
    }

    if (Object.keys(patch).length > 0) {
      return {
        type: "event_update",
        payload: {
          eventId: updateEventId,
          patch,
        },
      };
    }
  }

  if (looksLikeEventCreateIntent(normalized)) {
    const isAllDay = inferEventAllDay(message);
    const range = inferEventRange(message, isAllDay, timeContext);
    return {
      type: "event_create",
      payload: {
        title: inferEventTitle(message),
        description: inferEventDescription(message),
        location: inferEventLocation(message),
        timezone: inferEventTimezone(message, timeContext.timezone),
        isAllDay,
        startAt: range.startAt,
        endAt: range.endAt,
        reminderMinutes: inferEventReminderMinutes(message),
        source: "manual",
      },
    };
  }

  const deleteTransactionId =
    findId(message, /delete transaction\s+([a-zA-Z0-9_-]+)/i) ??
    findId(message, /remove transaction\s+([a-zA-Z0-9_-]+)/i) ??
    findId(message, /delete txn\s+([a-zA-Z0-9_-]+)/i) ??
    findId(message, /remove txn\s+([a-zA-Z0-9_-]+)/i);
  if (deleteTransactionId) {
    return {
      type: "money_delete_transaction",
      payload: {
        transactionId: deleteTransactionId,
      },
    };
  }

  if (looksLikeTransactionCreateIntent(normalized)) {
    const type = parseTransactionType(normalized);
    const amount = parseAmount(message);
    const accountId = inferAccountId(message);
    if (amount && accountId) {
      return {
        type: "money_create_transaction",
        payload: {
          type,
          amount,
          accountId,
          date: parseDate(message, timeContext) ?? currentDate,
          description: inferTransactionDescription(message),
        },
      };
    }
  }

  if (looksLikeHabitCreateIntent(normalized)) {
    const habitName = inferHabitName(message) ?? "New Habit";
    return {
      type: "habit_create",
      payload: {
        name: habitName,
        question: `Did you do ${habitName.slice(0, 80)}?`,
        type: "yes_no",
        color: "#F59E0B",
        frequencyType: "daily",
        startDate: currentDate,
      },
    };
  }

  const updateHabitId = findId(message, /update habit\s+([a-zA-Z0-9_-]+)/i);
  if (updateHabitId) {
    const nameMatch = message.match(/name\s+"([^"]+)"/i);
    const notesMatch = message.match(/notes?\s+"([^"]+)"/i);
    const patch: Record<string, unknown> = {};
    if (nameMatch?.[1]) patch.name = nameMatch[1].trim().slice(0, 100);
    if (notesMatch?.[1]) patch.notes = notesMatch[1].trim().slice(0, 500);
    if (Object.keys(patch).length > 0) {
      return {
        type: "habit_update",
        payload: {
          habitId: updateHabitId,
          patch,
        },
      };
    }
  }

  const logHabitId = findId(message, /log habit\s+([a-zA-Z0-9_-]+)/i);
  if (logHabitId) {
    const completed = /complete|completed|done|yes/i.test(message);
    return {
      type: "habit_log_upsert",
      payload: {
        habitId: logHabitId,
        date: parseDate(message, timeContext) ?? currentDate,
        completed,
        note: assistantAnswer.slice(0, 500),
      },
    };
  }

  return null;
}
