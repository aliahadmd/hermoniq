import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import dayjs from 'dayjs';
import type { MonthlyBudgetSummary, Transaction } from '@/lib/types';

const MONEY_CHANNEL_ID = 'money-reminders';
const MONEY_REMINDER_KIND = 'money_expense_reminder';
const FALLBACK_REMINDER_TIME = '20:30';

let channelReady = false;

interface ScheduledNotificationLike {
  identifier: string;
  content: {
    data?: {
      kind?: unknown;
    } | null;
  };
}

export interface MoneyReminderSettings {
  enabled: boolean;
  reminderTime: string;
  smartInsightsEnabled: boolean;
  weekdaysOnly: boolean;
}

export interface MoneyReminderSyncInput {
  settings: MoneyReminderSettings;
  transactions?: Transaction[];
  budgetSummary?: MonthlyBudgetSummary | null;
  now?: Date;
}

interface MoneyInsight {
  title: string;
  body: string;
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

function parseReminderTime(value: string | undefined): { hour: number; minute: number } {
  const source = value?.trim() || FALLBACK_REMINDER_TIME;
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(source);
  if (!match) {
    return parseReminderTime(FALLBACK_REMINDER_TIME);
  }

  return {
    hour: Number(match[1]),
    minute: Number(match[2]),
  };
}

function inferMedianLogHour(transactions: Transaction[]): number | null {
  const hours = transactions
    .slice(0, 30)
    .map((tx) => new Date(tx.createdAt))
    .filter((date) => !Number.isNaN(date.getTime()))
    .map((date) => date.getHours())
    .sort((a, b) => a - b);

  if (hours.length === 0) {
    return null;
  }

  return hours[Math.floor(hours.length / 2)];
}

function resolveReminderClock(
  settings: MoneyReminderSettings,
  transactions: Transaction[],
): { hour: number; minute: number } {
  const preferred = parseReminderTime(settings.reminderTime);
  if (!settings.smartInsightsEnabled) {
    return preferred;
  }

  const medianHour = inferMedianLogHour(transactions);
  if (medianHour === null) {
    return preferred;
  }

  const blendedHour = Math.round((preferred.hour * 2 + medianHour) / 3);
  return {
    hour: clamp(blendedHour, 0, 23),
    minute: preferred.minute,
  };
}

function buildMoneyInsight(
  settings: MoneyReminderSettings,
  transactions: Transaction[],
  budgetSummary: MonthlyBudgetSummary | null | undefined,
  now: Date,
): MoneyInsight {
  if (!settings.smartInsightsEnabled) {
    return {
      title: 'Daily money check-in',
      body: 'Take one minute to log today\'s expenses and keep your records clean.',
    };
  }

  const todayKey = dayjs(now).format('YYYY-MM-DD');
  const hasTodayEntry = transactions.some((tx) => tx.date === todayKey);
  const validDates = transactions
    .map((tx) => tx.date)
    .filter((value) => /^\d{4}-\d{2}-\d{2}$/.test(value))
    .sort();
  const latestDate = validDates.length > 0 ? validDates[validDates.length - 1] : null;
  const daysSinceLastEntry = latestDate
    ? dayjs(todayKey).diff(dayjs(`${latestDate}T00:00:00`), 'day')
    : null;

  const mostAtRiskBudget = (budgetSummary?.accountSummaries ?? [])
    .filter((account) => account.totalLimit > 0)
    .sort((a, b) => b.progressPercent - a.progressPercent)[0];
  const daysRemainingInMonth = Math.max(dayjs(now).endOf('month').diff(dayjs(now), 'day'), 0);

  if (mostAtRiskBudget && mostAtRiskBudget.progressPercent >= 100) {
    return {
      title: 'Budget limit reached',
      body: `${mostAtRiskBudget.accountName} is at ${mostAtRiskBudget.progressPercent}% with ${daysRemainingInMonth} day(s) left. Log expenses and rebalance your plan.`,
    };
  }

  if (mostAtRiskBudget && mostAtRiskBudget.progressPercent >= 90) {
    return {
      title: 'Budget alert',
      body: `${mostAtRiskBudget.accountName} is at ${mostAtRiskBudget.progressPercent}% this month. Capture every expense so you can adjust early.`,
    };
  }

  if (!hasTodayEntry && daysSinceLastEntry !== null && daysSinceLastEntry >= 2) {
    return {
      title: 'You are behind on logging',
      body: `No money entries for ${daysSinceLastEntry} days. Add today\'s spending to keep your insights accurate.`,
    };
  }

  if (!hasTodayEntry) {
    return {
      title: 'Quick money check-in',
      body: 'Add today\'s transactions now so your dashboard and budgets stay up to date.',
    };
  }

  return {
    title: 'Great tracking today',
    body: 'You logged money activity today. Do one quick review before the day ends.',
  };
}

async function ensureAndroidChannel() {
  if (Platform.OS !== 'android') return;
  if (channelReady) return;

  await Notifications.setNotificationChannelAsync(MONEY_CHANNEL_ID, {
    name: 'Money reminders',
    importance: Notifications.AndroidImportance.HIGH,
    vibrationPattern: [0, 250, 200, 250],
    lightColor: '#C78512',
    description: 'Daily money check-ins and budget reminder alerts',
  });

  channelReady = true;
}

export async function ensureMoneyReminderPermissions(): Promise<boolean> {
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

export async function hasMoneyReminderPermissions(): Promise<boolean> {
  const current = await Notifications.getPermissionsAsync();
  return isPermissionGranted(current);
}

export async function cancelMoneyReminderNotifications(): Promise<void> {
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  const scheduledItems = scheduled as ScheduledNotificationLike[];

  await Promise.all(
    scheduledItems
      .filter((request) => request.content.data?.kind === MONEY_REMINDER_KIND)
      .map((request) => Notifications.cancelScheduledNotificationAsync(request.identifier)),
  );
}

async function scheduleMoneyNotifications(
  insight: MoneyInsight,
  clock: { hour: number; minute: number },
  weekdaysOnly: boolean,
): Promise<number> {
  const baseData = { kind: MONEY_REMINDER_KIND };
  const content = {
    title: insight.title,
    body: insight.body,
    data: baseData,
  };
  const androidChannel = Platform.OS === 'android' ? { channelId: MONEY_CHANNEL_ID } : {};

  if (weekdaysOnly) {
    const weekdays = [2, 3, 4, 5, 6];
    for (const weekday of weekdays) {
      await Notifications.scheduleNotificationAsync({
        content,
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.WEEKLY,
          weekday,
          hour: clock.hour,
          minute: clock.minute,
          ...androidChannel,
        },
      });
    }
    return weekdays.length;
  }

  await Notifications.scheduleNotificationAsync({
    content,
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DAILY,
      hour: clock.hour,
      minute: clock.minute,
      ...androidChannel,
    },
  });
  return 1;
}

export async function syncMoneyReminders(input: MoneyReminderSyncInput): Promise<number> {
  const transactions = input.transactions ?? [];
  const budgetSummary = input.budgetSummary ?? null;
  const now = input.now ?? new Date();

  await cancelMoneyReminderNotifications();
  if (!input.settings.enabled) {
    return 0;
  }

  if (!(await hasMoneyReminderPermissions())) {
    return 0;
  }

  await ensureAndroidChannel();

  const clock = resolveReminderClock(input.settings, transactions);
  const insight = buildMoneyInsight(input.settings, transactions, budgetSummary, now);
  return scheduleMoneyNotifications(insight, clock, input.settings.weekdaysOnly);
}

export async function sendMoneyReminderTest(
  settings: MoneyReminderSettings,
  transactions: Transaction[] = [],
  budgetSummary: MonthlyBudgetSummary | null = null,
): Promise<void> {
  await ensureAndroidChannel();
  const insight = buildMoneyInsight(settings, transactions, budgetSummary, new Date());
  const androidChannel = Platform.OS === 'android' ? { channelId: MONEY_CHANNEL_ID } : {};

  await Notifications.scheduleNotificationAsync({
    content: {
      title: `Test: ${insight.title}`,
      body: insight.body,
      data: { kind: MONEY_REMINDER_KIND, test: true },
      ...androidChannel,
    },
    trigger: null,
  });
}
