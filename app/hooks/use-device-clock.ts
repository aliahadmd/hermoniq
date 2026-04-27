import { useEffect, useState } from 'react';
import { AppState } from 'react-native';
import dayjs from 'dayjs';

export interface DeviceClockSnapshot {
  today: string;
  timezone: string;
}

function resolveDeviceTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

function snapshotNow(): DeviceClockSnapshot {
  return {
    today: dayjs().format('YYYY-MM-DD'),
    timezone: resolveDeviceTimezone(),
  };
}

function isSameSnapshot(a: DeviceClockSnapshot, b: DeviceClockSnapshot): boolean {
  return a.today === b.today && a.timezone === b.timezone;
}

/**
 * Keeps a device-date snapshot fresh across app resume and timezone/day rollover.
 * Re-renders only when `today` or `timezone` actually changes.
 */
export function useDeviceClockSnapshot(): DeviceClockSnapshot {
  const [snapshot, setSnapshot] = useState<DeviceClockSnapshot>(() => snapshotNow());

  useEffect(() => {
    const refresh = () => {
      setSnapshot((current) => {
        const next = snapshotNow();
        return isSameSnapshot(current, next) ? current : next;
      });
    };

    const appStateSubscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        refresh();
      }
    });
    const intervalId = setInterval(refresh, 60 * 1000);

    return () => {
      clearInterval(intervalId);
      appStateSubscription.remove();
    };
  }, []);

  return snapshot;
}
