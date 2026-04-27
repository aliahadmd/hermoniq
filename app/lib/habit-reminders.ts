import { Linking, Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import type { HabitListItem } from '@/lib/types';

const HABIT_CHANNEL_ID = 'habit-reminders';
export const HABIT_REMINDER_KIND = 'habit_reminder';
const MAX_SCHEDULED_HABIT_REMINDERS = 60;

let channelReady = false;

interface ScheduledNotificationLike {
  identifier: string;
  content: {
    data?: {
      kind?: unknown;
    } | null;
  };
}

interface HabitReminderContent {
  title: string;
  body: string;
}

export interface HabitReminderNotificationData {
  kind: typeof HABIT_REMINDER_KIND;
  habitId?: string;
  habitName?: string;
  test?: boolean;
}

export interface HabitReminderSettings {
  enabled: boolean;
  smartInsightsEnabled: boolean;
}

export interface HabitReminderSyncInput {
  settings: HabitReminderSettings;
  habits: HabitListItem[];
  now?: Date;
}

export function isHabitReminderNotificationData(
  value: unknown,
): value is HabitReminderNotificationData {
  if (!value || typeof value !== 'object') return false;
  return (value as { kind?: unknown }).kind === HABIT_REMINDER_KIND;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function isPermissionGranted(
  status: Notifications.NotificationPermissionsStatus,
): boolean {
  return status.granted
    || status.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL;
}

function parseReminderTime(value: string | null | undefined): { hour: number; minute: number } | null {
  if (!value) return null;
  const match = /^([01]?\d|2[0-3]):([0-5]\d)$/.exec(value.trim());
  if (!match) return null;
  return {
    hour: Number(match[1]),
    minute: Number(match[2]),
  };
}

function asExpoWeekday(day: number): number | null {
  if (!Number.isInteger(day) || day < 0 || day > 6) return null;
  return day + 1;
}

function habitPriority(habit: HabitListItem): number {
  if (habit.dueToday && !habit.completedToday) return 0;
  if (habit.dueToday && habit.completedToday) return 1;
  return 2;
}

function buildReminderContent(
  habit: HabitListItem,
  settings: HabitReminderSettings,
): HabitReminderContent {
  if (!settings.smartInsightsEnabled) {
    return {
      title: habit.name,
      body: `Check in for ${habit.name} and keep your habit streak moving.`,
    };
  }

  const targetLabel =
    habit.type === 'measurable' && habit.dailyTarget !== null
      ? `${habit.dailyTarget}${habit.unit ? ` ${habit.unit}` : ''}`
      : 'today\'s goal';
  const completionRate = clamp(Math.round(habit.progressPercent), 0, 100);
  const misses = Math.max(habit.scheduledCount - habit.completedCount, 0);

  if (habit.dueToday && !habit.completedToday && completionRate >= 80) {
    return {
      title: `${habit.name} is on fire`,
      body: `You are at ${completionRate}% lately. One more check-in today keeps momentum.`,
    };
  }

  if (habit.dueToday && !habit.completedToday && completionRate <= 35) {
    return {
      title: `Small step on ${habit.name}`,
      body: `Focus on ${targetLabel} today. Consistency beats intensity.`,
    };
  }

  if (habit.dueToday && !habit.completedToday) {
    return {
      title: `${habit.name} is due today`,
      body: misses > 0
        ? `${misses} recent miss${misses === 1 ? '' : 'es'}. Quick check-in now helps recovery.`
        : `Log a quick completion now to stay consistent.`,
    };
  }

  if (habit.completedToday) {
    return {
      title: `${habit.name} already done`,
      body: `Nice work today. Keep this pace tomorrow.`,
    };
  }

  return {
    title: `Routine check: ${habit.name}`,
    body: `Stay steady with ${habit.name} and protect your current rhythm.`,
  };
}

function resolveReminderClock(
  habit: HabitListItem,
): { hour: number; minute: number } | null {
  return parseReminderTime(habit.reminderTime);
}

async function ensureAndroidChannel() {
  if (Platform.OS !== 'android') return;
  if (channelReady) return;

  await Notifications.setNotificationChannelAsync(HABIT_CHANNEL_ID, {
    name: 'Habit reminders',
    importance: Notifications.AndroidImportance.HIGH,
    vibrationPattern: [0, 200, 180, 200],
    lightColor: '#5FA5DB',
    description: 'Smart reminders for your active habits',
  });

  channelReady = true;
}

async function scheduleHabitReminder(
  habit: HabitListItem,
  clock: { hour: number; minute: number },
  content: HabitReminderContent,
  scheduledCount: number,
): Promise<number> {
  if (scheduledCount >= MAX_SCHEDULED_HABIT_REMINDERS) return 0;

  const baseContent = {
    title: content.title,
    body: content.body,
    data: {
      kind: HABIT_REMINDER_KIND,
      habitId: habit.id,
      habitName: habit.name,
    },
  };
  const androidChannel = Platform.OS === 'android' ? { channelId: HABIT_CHANNEL_ID } : {};

  if (habit.frequencyType === 'daily') {
    await Notifications.scheduleNotificationAsync({
      content: baseContent,
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DAILY,
        hour: clock.hour,
        minute: clock.minute,
        ...androidChannel,
      },
    });
    return 1;
  }

  const weekdays = Array.from(
    new Set(
      habit.frequencyDays
        .map((day) => asExpoWeekday(day))
        .filter((day): day is number => day !== null),
    ),
  );
  if (weekdays.length === 0) return 0;

  let added = 0;
  for (const weekday of weekdays) {
    if (scheduledCount + added >= MAX_SCHEDULED_HABIT_REMINDERS) break;
    await Notifications.scheduleNotificationAsync({
      content: baseContent,
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.WEEKLY,
        weekday,
        hour: clock.hour,
        minute: clock.minute,
        ...androidChannel,
      },
    });
    added += 1;
  }

  return added;
}

export async function ensureHabitReminderPermissions(): Promise<boolean> {
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

export async function openExactAlarmSettings(): Promise<void> {
  if (Platform.OS !== 'android') {
    await Linking.openSettings();
    return;
  }

  try {
    await Linking.sendIntent('android.settings.REQUEST_SCHEDULE_EXACT_ALARM');
  } catch {
    await Linking.openSettings();
  }
}

export async function hasHabitReminderPermissions(): Promise<boolean> {
  const current = await Notifications.getPermissionsAsync();
  return isPermissionGranted(current);
}

export async function cancelHabitReminderNotifications(): Promise<void> {
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  const scheduledItems = scheduled as ScheduledNotificationLike[];

  await Promise.all(
    scheduledItems
      .filter((request) => request.content.data?.kind === HABIT_REMINDER_KIND)
      .map((request) => Notifications.cancelScheduledNotificationAsync(request.identifier)),
  );
}

export async function countHabitReminderNotifications(): Promise<number> {
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  const scheduledItems = scheduled as ScheduledNotificationLike[];
  return scheduledItems.filter((request) => request.content.data?.kind === HABIT_REMINDER_KIND).length;
}

export async function syncHabitReminders(input: HabitReminderSyncInput): Promise<number> {
  const habits = input.habits ?? [];

  await cancelHabitReminderNotifications();
  if (!input.settings.enabled) {
    return 0;
  }

  if (!(await hasHabitReminderPermissions())) {
    return 0;
  }

  await ensureAndroidChannel();

  const schedulable = habits
    .filter((habit) => !habit.archivedAt)
    .filter((habit) => habit.reminderEnabled)
    .filter((habit) => parseReminderTime(habit.reminderTime) !== null)
    .sort((a, b) => {
      const priority = habitPriority(a) - habitPriority(b);
      if (priority !== 0) return priority;
      return a.name.localeCompare(b.name);
    });

  let scheduledCount = 0;

  for (const habit of schedulable) {
    const clock = resolveReminderClock(habit);
    if (!clock) continue;

    const content = buildReminderContent(habit, input.settings);
    const added = await scheduleHabitReminder(habit, clock, content, scheduledCount);
    scheduledCount += added;

    if (scheduledCount >= MAX_SCHEDULED_HABIT_REMINDERS) {
      break;
    }
  }

  return scheduledCount;
}

export async function sendHabitReminderTest(
  settings: HabitReminderSettings,
  habits: HabitListItem[] = [],
): Promise<void> {
  await ensureAndroidChannel();

  const pendingToday = habits.filter((habit) => habit.dueToday && !habit.completedToday).length;
  const allActive = habits.filter((habit) => !habit.archivedAt).length;
  const body = settings.smartInsightsEnabled
    ? pendingToday > 0
      ? `You have ${pendingToday} habit${pendingToday === 1 ? '' : 's'} pending today.`
      : 'Great pace today. Keep your habit loop consistent.'
    : `You have ${allActive} active habit${allActive === 1 ? '' : 's'} to maintain.`;
  const androidChannel = Platform.OS === 'android' ? { channelId: HABIT_CHANNEL_ID } : {};

  await Notifications.scheduleNotificationAsync({
    content: {
      title: 'Test: Habit reminder',
      body,
      data: { kind: HABIT_REMINDER_KIND, test: true },
      ...androidChannel,
    },
    trigger: null,
  });
}
