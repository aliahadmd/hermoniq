import { create } from 'zustand';
import * as SecureStore from 'expo-secure-store';
import { createJSONStorage, persist, type StateStorage } from 'zustand/middleware';
import type { EventReminderLookaheadDays, EventReminderMinutes } from '@/lib/types';

interface AppState {
  /** User's preferred theme override; null means follow system */
  themeOverride: 'light' | 'dark' | null;
  setThemeOverride: (theme: 'light' | 'dark' | null) => void;
  /** Whether daily expense reminder notifications are enabled */
  expenseReminderEnabled: boolean;
  setExpenseReminderEnabled: (enabled: boolean) => void;
  /** Local reminder time in HH:mm */
  expenseReminderTime: string;
  setExpenseReminderTime: (time: string) => void;
  /** If enabled, reminder copy/time adapts to spending signals */
  expenseReminderSmartInsightsEnabled: boolean;
  setExpenseReminderSmartInsightsEnabled: (enabled: boolean) => void;
  /** If enabled, only schedule reminders for Monday-Friday */
  expenseReminderWeekdaysOnly: boolean;
  setExpenseReminderWeekdaysOnly: (enabled: boolean) => void;
  /** If enabled, habit reminder message copy adapts to habit completion signals */
  habitReminderSmartInsightsEnabled: boolean;
  setHabitReminderSmartInsightsEnabled: (enabled: boolean) => void;
  /** Master switch for planner event reminders on this device */
  eventReminderEnabled: boolean;
  setEventReminderEnabled: (enabled: boolean) => void;
  /** Default reminder lead time for events without explicit reminder */
  eventReminderDefaultMinutes: EventReminderMinutes | null;
  setEventReminderDefaultMinutes: (minutes: EventReminderMinutes | null) => void;
  /** If enabled, auto reminders adapt based on event urgency signals */
  eventReminderSmartInsightsEnabled: boolean;
  setEventReminderSmartInsightsEnabled: (enabled: boolean) => void;
  /** If enabled, auto reminders are scheduled only Monday-Friday */
  eventReminderWeekdaysOnly: boolean;
  setEventReminderWeekdaysOnly: (enabled: boolean) => void;
  /** If enabled, all-day events are included in auto reminder scheduling */
  eventReminderIncludeAllDay: boolean;
  setEventReminderIncludeAllDay: (enabled: boolean) => void;
  /** Upcoming event window used for scheduling sync */
  eventReminderLookaheadDays: EventReminderLookaheadDays;
  setEventReminderLookaheadDays: (days: EventReminderLookaheadDays) => void;
}

const secureStateStorage: StateStorage = {
  getItem: async (name) => {
    try {
      return await SecureStore.getItemAsync(name);
    } catch {
      return null;
    }
  },
  setItem: async (name, value) => {
    await SecureStore.setItemAsync(name, value);
  },
  removeItem: async (name) => {
    await SecureStore.deleteItemAsync(name);
  },
};

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      themeOverride: null,
      setThemeOverride: (theme) => set({ themeOverride: theme }),
      expenseReminderEnabled: false,
      setExpenseReminderEnabled: (enabled) => set({ expenseReminderEnabled: enabled }),
      expenseReminderTime: '20:30',
      setExpenseReminderTime: (time) => set({ expenseReminderTime: time }),
      expenseReminderSmartInsightsEnabled: true,
      setExpenseReminderSmartInsightsEnabled: (enabled) =>
        set({ expenseReminderSmartInsightsEnabled: enabled }),
      expenseReminderWeekdaysOnly: false,
      setExpenseReminderWeekdaysOnly: (enabled) =>
        set({ expenseReminderWeekdaysOnly: enabled }),
      habitReminderSmartInsightsEnabled: true,
      setHabitReminderSmartInsightsEnabled: (enabled) =>
        set({ habitReminderSmartInsightsEnabled: enabled }),
      eventReminderEnabled: true,
      setEventReminderEnabled: (enabled) => set({ eventReminderEnabled: enabled }),
      eventReminderDefaultMinutes: null,
      setEventReminderDefaultMinutes: (minutes) => set({ eventReminderDefaultMinutes: minutes }),
      eventReminderSmartInsightsEnabled: false,
      setEventReminderSmartInsightsEnabled: (enabled) =>
        set({ eventReminderSmartInsightsEnabled: enabled }),
      eventReminderWeekdaysOnly: false,
      setEventReminderWeekdaysOnly: (enabled) =>
        set({ eventReminderWeekdaysOnly: enabled }),
      eventReminderIncludeAllDay: true,
      setEventReminderIncludeAllDay: (enabled) =>
        set({ eventReminderIncludeAllDay: enabled }),
      eventReminderLookaheadDays: 30,
      setEventReminderLookaheadDays: (days) => set({ eventReminderLookaheadDays: days }),
    }),
    {
      name: 'harmoniq-app-state',
      storage: createJSONStorage(() => secureStateStorage),
      partialize: (state) => ({
        themeOverride: state.themeOverride,
        expenseReminderEnabled: state.expenseReminderEnabled,
        expenseReminderTime: state.expenseReminderTime,
        expenseReminderSmartInsightsEnabled: state.expenseReminderSmartInsightsEnabled,
        expenseReminderWeekdaysOnly: state.expenseReminderWeekdaysOnly,
        habitReminderSmartInsightsEnabled: state.habitReminderSmartInsightsEnabled,
        eventReminderEnabled: state.eventReminderEnabled,
        eventReminderDefaultMinutes: state.eventReminderDefaultMinutes,
        eventReminderSmartInsightsEnabled: state.eventReminderSmartInsightsEnabled,
        eventReminderWeekdaysOnly: state.eventReminderWeekdaysOnly,
        eventReminderIncludeAllDay: state.eventReminderIncludeAllDay,
        eventReminderLookaheadDays: state.eventReminderLookaheadDays,
      }),
    },
  ),
);
