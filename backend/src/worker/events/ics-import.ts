import { and, eq } from "drizzle-orm";
import type { DrizzleDb } from "../../db";
import { events } from "../../db/schema";

const SUPPORTED_REMINDER_MINUTES = new Set([0, 5, 10, 15, 10080]);

interface ParsedProperty {
  key: string;
  value: string;
  params: Record<string, string>;
}

interface ParsedIcsEvent {
  title: string;
  description: string;
  location: string;
  timezone: string;
  isAllDay: boolean;
  startAt: string;
  endAt: string;
  reminderMinutes: number | null;
  externalUid: string | null;
}

export interface IcsImportResult {
  createdCount: number;
  updatedCount: number;
  skippedRecurringCount: number;
  skippedInvalidCount: number;
  warnings: string[];
}

function unfoldLines(ics: string): string[] {
  const lines = ics.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
  const unfolded: string[] = [];

  for (const line of lines) {
    if ((line.startsWith(" ") || line.startsWith("\t")) && unfolded.length > 0) {
      unfolded[unfolded.length - 1] += line.slice(1);
      continue;
    }
    unfolded.push(line);
  }

  return unfolded;
}

function parseProperty(line: string): ParsedProperty | null {
  const separator = line.indexOf(":");
  if (separator === -1) return null;

  const left = line.slice(0, separator);
  const value = line.slice(separator + 1).trim();
  if (!left) return null;

  const segments = left.split(";");
  const key = segments[0]?.trim().toUpperCase();
  if (!key) return null;

  const params: Record<string, string> = {};
  for (const segment of segments.slice(1)) {
    const [rawName, ...rest] = segment.split("=");
    const name = rawName?.trim().toUpperCase();
    if (!name || rest.length === 0) continue;
    params[name] = rest.join("=").trim();
  }

  return { key, value, params };
}

function parseIcsDateValue(rawValue: string): { date: Date; isAllDay: boolean } | null {
  const value = rawValue.trim();

  const dateOnly = value.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (dateOnly) {
    const year = Number(dateOnly[1]);
    const month = Number(dateOnly[2]);
    const day = Number(dateOnly[3]);
    const date = new Date(Date.UTC(year, month - 1, day, 0, 0, 0));
    if (Number.isNaN(date.getTime())) return null;
    return { date, isAllDay: true };
  }

  const dateTime = value.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})?(Z)?$/);
  if (!dateTime) return null;

  const year = Number(dateTime[1]);
  const month = Number(dateTime[2]);
  const day = Number(dateTime[3]);
  const hour = Number(dateTime[4]);
  const minute = Number(dateTime[5]);
  const second = Number(dateTime[6] ?? "0");
  const isUtc = Boolean(dateTime[7]);

  const date = isUtc
    ? new Date(Date.UTC(year, month - 1, day, hour, minute, second))
    : new Date(year, month - 1, day, hour, minute, second);

  if (Number.isNaN(date.getTime())) return null;
  return { date, isAllDay: false };
}

function parseTriggerMinutes(trigger: string): { minutes: number | null; warning?: string } {
  const normalized = trigger.trim();
  const match = normalized.match(
    /^(-)?P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/i,
  );
  if (!match) {
    return { minutes: null, warning: "Unsupported VALARM trigger format was ignored." };
  }

  const weeks = Number(match[2] ?? "0");
  const days = Number(match[3] ?? "0");
  const hours = Number(match[4] ?? "0");
  const minutes = Number(match[5] ?? "0");
  const seconds = Number(match[6] ?? "0");

  const totalMinutes = Math.round(weeks * 7 * 24 * 60 + days * 24 * 60 + hours * 60 + minutes + seconds / 60);
  const normalizedMinutes = Math.abs(totalMinutes);
  if (!SUPPORTED_REMINDER_MINUTES.has(normalizedMinutes)) {
    return {
      minutes: null,
      warning: `VALARM duration ${normalizedMinutes} minutes is unsupported and was ignored.`,
    };
  }

  return { minutes: normalizedMinutes };
}

function parseEventBlock(lines: string[], fallbackTimezone: string) {
  const props: ParsedProperty[] = [];
  const alarms: ParsedProperty[] = [];
  let inAlarm = false;

  for (const line of lines) {
    const upper = line.trim().toUpperCase();
    if (upper === "BEGIN:VALARM") {
      inAlarm = true;
      continue;
    }
    if (upper === "END:VALARM") {
      inAlarm = false;
      continue;
    }

    const parsed = parseProperty(line);
    if (!parsed) continue;

    if (inAlarm) {
      alarms.push(parsed);
    } else {
      props.push(parsed);
    }
  }

  const hasRecurrence = props.some((item) => item.key === "RRULE" || item.key === "RDATE");
  if (hasRecurrence) {
    return { event: null as ParsedIcsEvent | null, skippedRecurring: true, warning: null as string | null };
  }

  const startProp = props.find((item) => item.key === "DTSTART");
  if (!startProp) {
    return {
      event: null,
      skippedRecurring: false,
      warning: "Skipped VEVENT without a valid DTSTART.",
    };
  }

  const startParsed = parseIcsDateValue(startProp.value);
  if (!startParsed) {
    return {
      event: null,
      skippedRecurring: false,
      warning: "Skipped VEVENT with invalid DTSTART format.",
    };
  }

  const endProp = props.find((item) => item.key === "DTEND");
  const endParsed = endProp ? parseIcsDateValue(endProp.value) : null;

  const isAllDay =
    startParsed.isAllDay ||
    startProp.params.VALUE?.toUpperCase() === "DATE";

  let endDate: Date;
  if (endParsed) {
    endDate = endParsed.date;
  } else {
    endDate = new Date(startParsed.date);
    if (isAllDay) {
      endDate.setUTCDate(endDate.getUTCDate() + 1);
    } else {
      endDate = new Date(endDate.getTime() + 60 * 60 * 1000);
    }
  }

  if (endDate.getTime() <= startParsed.date.getTime()) {
    return {
      event: null,
      skippedRecurring: false,
      warning: "Skipped VEVENT where DTEND is not after DTSTART.",
    };
  }

  const uid = props.find((item) => item.key === "UID")?.value.trim() ?? "";
  const summary = props.find((item) => item.key === "SUMMARY")?.value.trim() ?? "";
  const description = props.find((item) => item.key === "DESCRIPTION")?.value.trim() ?? "";
  const location = props.find((item) => item.key === "LOCATION")?.value.trim() ?? "";

  const trigger = alarms.find((item) => item.key === "TRIGGER")?.value;
  const reminder = trigger ? parseTriggerMinutes(trigger) : { minutes: null as number | null };

  return {
    event: {
      title: summary || "Untitled Event",
      description,
      location,
      timezone: startProp.params.TZID?.trim() || fallbackTimezone,
      isAllDay,
      startAt: startParsed.date.toISOString(),
      endAt: endDate.toISOString(),
      reminderMinutes: reminder.minutes,
      externalUid: uid || null,
    },
    skippedRecurring: false,
    warning: reminder.warning ?? null,
  };
}

export async function importIcsIntoEvents(params: {
  db: DrizzleDb;
  userId: string;
  ics: string;
  timezone: string;
}): Promise<IcsImportResult> {
  const { db, userId, ics, timezone } = params;
  const warnings: string[] = [];

  const unfolded = unfoldLines(ics);
  const eventBlocks: string[][] = [];
  let current: string[] | null = null;

  for (const line of unfolded) {
    const normalized = line.trim().toUpperCase();
    if (normalized === "BEGIN:VEVENT") {
      current = [];
      continue;
    }
    if (normalized === "END:VEVENT") {
      if (current) {
        eventBlocks.push(current);
      }
      current = null;
      continue;
    }
    if (current) {
      current.push(line);
    }
  }

  if (eventBlocks.length === 0) {
    return {
      createdCount: 0,
      updatedCount: 0,
      skippedRecurringCount: 0,
      skippedInvalidCount: 1,
      warnings: ["No VEVENT entries were found in the ICS file."],
    };
  }

  let createdCount = 0;
  let updatedCount = 0;
  let skippedRecurringCount = 0;
  let skippedInvalidCount = 0;

  for (const block of eventBlocks) {
    const parsed = parseEventBlock(block, timezone);

    if (parsed.warning) {
      warnings.push(parsed.warning);
    }

    if (parsed.skippedRecurring) {
      skippedRecurringCount += 1;
      continue;
    }

    if (!parsed.event) {
      skippedInvalidCount += 1;
      continue;
    }

    const now = new Date().toISOString();
    const row = {
      userId,
      title: parsed.event.title,
      description: parsed.event.description,
      location: parsed.event.location,
      timezone: parsed.event.timezone,
      isAllDay: parsed.event.isAllDay,
      startAt: parsed.event.startAt,
      endAt: parsed.event.endAt,
      reminderMinutes: parsed.event.reminderMinutes,
      source: "ics" as const,
      externalUid: parsed.event.externalUid,
      updatedAt: now,
    };

    if (parsed.event.externalUid) {
      const [existing] = await db
        .select({ id: events.id })
        .from(events)
        .where(
          and(
            eq(events.userId, userId),
            eq(events.externalUid, parsed.event.externalUid),
            eq(events.startAt, parsed.event.startAt),
          ),
        );

      if (existing) {
        await db
          .update(events)
          .set(row)
          .where(and(eq(events.id, existing.id), eq(events.userId, userId)));
        updatedCount += 1;
        continue;
      }
    }

    await db.insert(events).values({
      ...row,
      createdAt: now,
    });
    createdCount += 1;
  }

  return {
    createdCount,
    updatedCount,
    skippedRecurringCount,
    skippedInvalidCount,
    warnings,
  };
}
