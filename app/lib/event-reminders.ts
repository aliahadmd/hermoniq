import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import type { EventItem, EventReminderLookaheadDays, EventReminderMinutes } from '@/lib/types';

const PLANNER_CHANNEL_ID = 'planner-events';
const PLANNER_KIND = 'planner_event';
const MAX_SCHEDULED_EVENT_REMINDERS = 120;
const DAY_MS = 24 * 60 * 60 * 1000;
const SUPPORTED_EVENT_REMINDER_MINUTES: EventReminderMinutes[] = [0, 5, 10, 15, 10080];
const PRIORITY_EVENT_KEYWORDS =
  /\b(flight|travel|interview|doctor|exam|deadline|presentation|meeting|appointment)\b/i;

let channelReady = false;

interface ScheduledNotificationLike {
  identifier: string;
  content: {
    data?: {
      kind?: unknown;
    } | null;
  };
}

export interface EventReminderSettings {
  enabled: boolean;
  defaultReminderMinutes: EventReminderMinutes | null;
  smartInsightsEnabled: boolean;
  weekdaysOnly: boolean;
  includeAllDay: boolean;
  lookaheadDays: EventReminderLookaheadDays;
}

export interface EventReminderSyncInput {
  settings: EventReminderSettings;
  events: EventItem[];
  now?: Date;
}

interface ReminderInsight {
  title: string;
  body: string;
}

function isPermissionGranted(
  status: Notifications.NotificationPermissionsStatus,
): boolean {
  return (
    status.granted ||
    status.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL
  );
}

function isSupportedReminderMinutes(value: number): value is EventReminderMinutes {
  return SUPPORTED_EVENT_REMINDER_MINUTES.includes(value as EventReminderMinutes);
}

function isWeekday(date: Date): boolean {
  const day = date.getDay();
  return day >= 1 && day <= 5;
}

function isPriorityEvent(event: EventItem): boolean {
  if (event.location.trim().length > 0) return true;
  return PRIORITY_EVENT_KEYWORDS.test(event.title) || PRIORITY_EVENT_KEYWORDS.test(event.description);
}

function withUniqueOrder(values: EventReminderMinutes[]): EventReminderMinutes[] {
  const seen = new Set<number>();
  const unique: EventReminderMinutes[] = [];
  for (const value of values) {
    if (seen.has(value)) continue;
    seen.add(value);
    unique.push(value);
  }
  return unique;
}

function autoReminderCandidates(
  event: EventItem,
  settings: EventReminderSettings,
  nowMs: number,
): EventReminderMinutes[] {
  const startAt = new Date(event.startAt);
  const startMs = startAt.getTime();
  if (Number.isNaN(startMs)) return [];

  const timeUntilMs = startMs - nowMs;
  const smartCandidates: EventReminderMinutes[] = [];

  if (settings.smartInsightsEnabled) {
    const priorityEvent = isPriorityEvent(event);
    if (timeUntilMs >= 8 * DAY_MS) {
      smartCandidates.push(10080);
    }
    if (event.isAllDay || priorityEvent) {
      smartCandidates.push(15, 10, 5, 0);
    } else {
      smartCandidates.push(10, 5, 0);
    }
  }

  const fallbackCandidates =
    settings.defaultReminderMinutes === null
      ? []
      : [settings.defaultReminderMinutes];

  return withUniqueOrder([...smartCandidates, ...fallbackCandidates]);
}

function resolveAutoReminderMinutes(
  event: EventItem,
  settings: EventReminderSettings,
  nowMs: number,
): EventReminderMinutes | null {
  if (!settings.includeAllDay && event.isAllDay) return null;

  const startAt = new Date(event.startAt);
  if (Number.isNaN(startAt.getTime())) return null;
  if (settings.weekdaysOnly && !isWeekday(startAt)) return null;

  const candidates = autoReminderCandidates(event, settings, nowMs);
  const startMs = startAt.getTime();
  for (const minutes of candidates) {
    const triggerMs = startMs - minutes * 60_000;
    if (triggerMs > nowMs) {
      return minutes;
    }
  }

  return null;
}

function resolveReminderTriggerAt(
  event: EventItem,
  settings: EventReminderSettings,
  nowMs: number,
): Date | null {
  const startAt = new Date(event.startAt);
  const startMs = startAt.getTime();
  if (Number.isNaN(startMs)) return null;

  const explicitReminder = event.reminderMinutes;
  if (explicitReminder !== null && isSupportedReminderMinutes(explicitReminder)) {
    const triggerMs = startMs - explicitReminder * 60_000;
    if (triggerMs <= nowMs) return null;
    return new Date(triggerMs);
  }

  const autoReminder = resolveAutoReminderMinutes(event, settings, nowMs);
  if (autoReminder === null) return null;

  const autoTriggerMs = startMs - autoReminder * 60_000;
  if (autoTriggerMs <= nowMs) return null;
  return new Date(autoTriggerMs);
}

function reminderTimeLabel(minutes: EventReminderMinutes): string {
  if (minutes === 0) return 'at event time';
  if (minutes === 10080) return '1 week before';
  return `${minutes} minutes before`;
}

function buildReminderBody(event: EventItem): string {
  const startText = new Date(event.startAt).toLocaleString();
  if (event.location.trim().length > 0) {
    return `${event.location} • starts at ${startText}`;
  }
  return `Starts at ${startText}`;
}

async function ensureAndroidChannel() {
  if (Platform.OS !== 'android') return;
  if (channelReady) return;

  await Notifications.setNotificationChannelAsync(PLANNER_CHANNEL_ID, {
    name: 'Planner reminders',
    importance: Notifications.AndroidImportance.HIGH,
    vibrationPattern: [0, 250, 250, 250],
    lightColor: '#C78512',
    description: 'Reminder notifications for planner events',
  });

  channelReady = true;
}

export async function ensureEventReminderPermissions(): Promise<boolean> {
  if (Platform.OS === 'android') {
    await ensureAndroidChannel();
  }

  const current = await Notifications.getPermissionsAsync();
  if (isPermissionGranted(current)) {
    return true;
  }

  const requested = await Notifications.requestPermissionsAsync({
    ios: {
      allowAlert: true,
      allowBadge: true,
      allowSound: true,
    },
  });

  return isPermissionGranted(requested);
}

export async function hasEventReminderPermissions(): Promise<boolean> {
  const current = await Notifications.getPermissionsAsync();
  return isPermissionGranted(current);
}

export async function cancelEventReminderNotifications(): Promise<void> {
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  const scheduledItems = scheduled as ScheduledNotificationLike[];

  await Promise.all(
    scheduledItems
      .filter((request) => request.content.data?.kind === PLANNER_KIND)
      .map((request) => Notifications.cancelScheduledNotificationAsync(request.identifier)),
  );
}

export async function countEventReminderNotifications(): Promise<number> {
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  const scheduledItems = scheduled as ScheduledNotificationLike[];
  return scheduledItems.filter((request) => request.content.data?.kind === PLANNER_KIND).length;
}

export async function syncEventReminders(input: EventReminderSyncInput): Promise<number> {
  const settings = input.settings;
  const events = input.events ?? [];
  const nowMs = (input.now ?? new Date()).getTime();

  await cancelEventReminderNotifications();
  if (!settings.enabled) {
    return 0;
  }

  if (!(await hasEventReminderPermissions())) {
    return 0;
  }

  await ensureAndroidChannel();

  const sortedEvents = [...events].sort((left, right) => left.startAt.localeCompare(right.startAt));
  let scheduledCount = 0;

  for (const event of sortedEvents) {
    if (scheduledCount >= MAX_SCHEDULED_EVENT_REMINDERS) break;
    const triggerAt = resolveReminderTriggerAt(event, settings, nowMs);
    if (!triggerAt) continue;

    const reminderMinutes = event.reminderMinutes ?? resolveAutoReminderMinutes(event, settings, nowMs);
    const reminderLabel =
      reminderMinutes === null ? 'scheduled' : reminderTimeLabel(reminderMinutes);

    await Notifications.scheduleNotificationAsync({
      content: {
        title: event.title,
        body: `${buildReminderBody(event)} • ${reminderLabel}`,
        data: {
          kind: PLANNER_KIND,
          eventId: event.id,
        },
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: triggerAt,
        ...(Platform.OS === 'android' ? { channelId: PLANNER_CHANNEL_ID } : {}),
      },
    });
    scheduledCount += 1;
  }

  return scheduledCount;
}

function buildReminderInsight(
  settings: EventReminderSettings,
  events: EventItem[],
): ReminderInsight {
  const total = events.length;
  const allDay = events.filter((event) => event.isAllDay).length;

  if (total === 0) {
    return {
      title: 'Planner reminder test',
      body: 'No upcoming events in your sync window yet. Create one to verify reminders.',
    };
  }

  const next = [...events].sort((left, right) => left.startAt.localeCompare(right.startAt))[0];
  if (!next) {
    return {
      title: 'Planner reminder test',
      body: 'No upcoming events in your sync window yet.',
    };
  }

  return {
    title: `Planner test: ${next.title}`,
    body: `${total} upcoming event(s) in next ${settings.lookaheadDays} day(s), including ${allDay} all-day.`,
  };
}

export async function sendEventReminderTest(
  settings: EventReminderSettings,
  events: EventItem[] = [],
): Promise<void> {
  await ensureAndroidChannel();
  const insight = buildReminderInsight(settings, events);
  const androidChannel = Platform.OS === 'android' ? { channelId: PLANNER_CHANNEL_ID } : {};

  await Notifications.scheduleNotificationAsync({
    content: {
      title: insight.title,
      body: insight.body,
      data: { kind: PLANNER_KIND, test: true },
      ...androidChannel,
    },
    trigger: null,
  });
}
