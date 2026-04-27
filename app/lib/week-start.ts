import type { HabitWeekStart } from '@/lib/types';

export type ResolvedWeekStart = 'sunday' | 'monday';

const WEEKDAY_LABELS_SUNDAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;
const WEEKDAY_LABELS_MONDAY = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;

function resolveDeviceWeekStart(): ResolvedWeekStart {
  try {
    const locale = Intl.DateTimeFormat().resolvedOptions().locale;
    const localeCtor = (
      Intl as unknown as {
        Locale?: new (tag: string) => { weekInfo?: { firstDay?: number } };
      }
    ).Locale;

    if (localeCtor) {
      const localeInfo = new localeCtor(locale);
      const firstDay = localeInfo.weekInfo?.firstDay;
      if (firstDay === 1) return 'monday';
      if (firstDay === 7 || firstDay === 0) return 'sunday';
    }
  } catch {
    // Fall through to default.
  }

  return 'sunday';
}

export function resolveWeekStart(preference: HabitWeekStart | undefined): ResolvedWeekStart {
  if (preference === 'monday') return 'monday';
  if (preference === 'sunday') return 'sunday';
  return resolveDeviceWeekStart();
}

export function getWeekdayLabels(preference: HabitWeekStart | undefined): readonly string[] {
  return resolveWeekStart(preference) === 'monday'
    ? WEEKDAY_LABELS_MONDAY
    : WEEKDAY_LABELS_SUNDAY;
}

export function getLeadingOffset(
  firstDayOfMonthSundayBased: number,
  preference: HabitWeekStart | undefined,
): number {
  if (resolveWeekStart(preference) === 'monday') {
    return (firstDayOfMonthSundayBased + 6) % 7;
  }
  return firstDayOfMonthSundayBased;
}
