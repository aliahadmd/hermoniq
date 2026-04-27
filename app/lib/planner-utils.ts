import dayjs from 'dayjs';
import type { EventReminderMinutes } from '@/lib/types';

export const EVENT_REMINDER_OPTIONS: Array<{ label: string; value: EventReminderMinutes | null }> = [
  { label: 'None', value: null },
  { label: 'At event time', value: 0 },
  { label: '5 min', value: 5 },
  { label: '10 min', value: 10 },
  { label: '15 min', value: 15 },
  { label: '1 week before', value: 10080 },
];

export function getDeviceTimezone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
}

export function toDateOnly(value: Date): string {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function toTimeOnly(value: Date): string {
  const hours = String(value.getHours()).padStart(2, '0');
  const minutes = String(value.getMinutes()).padStart(2, '0');
  return `${hours}:${minutes}`;
}

export function parseIsoToLocalParts(iso: string): { date: string; time: string } {
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) {
    const now = new Date();
    return {
      date: toDateOnly(now),
      time: toTimeOnly(now),
    };
  }

  return {
    date: toDateOnly(parsed),
    time: toTimeOnly(parsed),
  };
}

export function toIsoFromLocal(date: string, time: string): string {
  const [year, month, day] = date.split('-').map((item) => Number(item));
  const [hours, minutes] = time.split(':').map((item) => Number(item));
  const parsed = new Date(year, (month || 1) - 1, day || 1, hours || 0, minutes || 0, 0, 0);
  return parsed.toISOString();
}

export function toAllDayRange(startDate: string, endDate: string): { startAt: string; endAt: string } {
  const start = dayjs(startDate);
  const end = dayjs(endDate);

  const normalizedEnd = end.isBefore(start, 'day') ? start : end;
  return {
    startAt: start.startOf('day').toDate().toISOString(),
    endAt: normalizedEnd.add(1, 'day').startOf('day').toDate().toISOString(),
  };
}

export function nowPlusHourDefaults(): {
  startDate: string;
  startTime: string;
  endDate: string;
  endTime: string;
} {
  const now = new Date();
  const end = new Date(now.getTime() + 60 * 60 * 1000);

  return {
    startDate: toDateOnly(now),
    startTime: toTimeOnly(now),
    endDate: toDateOnly(end),
    endTime: toTimeOnly(end),
  };
}
