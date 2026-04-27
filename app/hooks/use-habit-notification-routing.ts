import { useEffect, useRef } from 'react';
import * as Notifications from 'expo-notifications';
import { router } from 'expo-router';
import type { Href } from 'expo-router';

import { isHabitReminderNotificationData } from '@/lib/habit-reminders';

function resolveHabitRoute(
  response: Notifications.NotificationResponse,
): Href | null {
  if (response.actionIdentifier !== Notifications.DEFAULT_ACTION_IDENTIFIER) {
    return null;
  }

  const data = response.notification.request.content.data;
  if (!isHabitReminderNotificationData(data)) {
    return null;
  }

  if (typeof data.habitId === 'string' && data.habitId.length > 0 && !data.test) {
    return {
      pathname: '/habits/[id]',
      params: { id: data.habitId },
    };
  }

  return '/(tabs)/habit-tracker';
}

export function useHabitNotificationRouting(enabled = true) {
  const lastHandledResponseKey = useRef<string | null>(null);

  useEffect(() => {
    if (!enabled) {
      return;
    }

    const handleResponse = (response: Notifications.NotificationResponse | null) => {
      if (!response) return;

      const responseKey = `${response.notification.request.identifier}:${response.actionIdentifier}`;
      if (lastHandledResponseKey.current === responseKey) {
        return;
      }

      const route = resolveHabitRoute(response);
      if (!route) {
        return;
      }

      lastHandledResponseKey.current = responseKey;
      router.push(route);
      void Notifications.clearLastNotificationResponseAsync();
    };

    void Notifications.getLastNotificationResponseAsync()
      .then((response) => {
        handleResponse(response);
      })
      .catch((error) => {
        console.error('Failed to read last notification response', error);
      });

    const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
      handleResponse(response);
    });

    return () => {
      subscription.remove();
    };
  }, [enabled]);
}
