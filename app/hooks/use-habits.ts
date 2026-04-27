import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import type {
  Habit,
  HabitPreferences,
  HabitInsights,
  HabitInsightsRange,
  HabitListFilter,
  HabitListResponse,
  HabitLog,
} from '@/lib/types';
import { useDeviceClockSnapshot } from '@/hooks/use-device-clock';
import type { z } from 'zod';
import type {
  createHabitSchema,
  habitPreferenceSchema,
  updateHabitSchema,
  upsertHabitLogSchema,
} from '@/lib/validators';

type CreateHabitInput = z.infer<typeof createHabitSchema>;
type UpdateHabitInput = z.infer<typeof updateHabitSchema>;
type UpsertHabitLogInput = z.infer<typeof upsertHabitLogSchema>;
type UpdateHabitPreferencesInput = z.infer<typeof habitPreferenceSchema>;

const HABITS_KEY = ['habits'] as const;
const HABIT_KEY = ['habit'] as const;
const HABIT_INSIGHTS_KEY = ['habit-insights'] as const;
const HABIT_PREFERENCES_KEY = ['habit-preferences'] as const;

interface UseHabitsListOptions {
  filter?: HabitListFilter;
  includeArchived?: boolean;
  days?: number;
  enabled?: boolean;
}

export function useHabitsList(options: UseHabitsListOptions = {}) {
  const {
    filter = 'all',
    includeArchived = false,
    days = 7,
    enabled = true,
  } = options;
  const { today, timezone } = useDeviceClockSnapshot();

  return useQuery({
    queryKey: [...HABITS_KEY, filter, includeArchived, days, today, timezone],
    queryFn: () =>
      apiClient<HabitListResponse>(
        `/api/habits?filter=${encodeURIComponent(filter)}&includeArchived=${includeArchived ? 'true' : 'false'}&days=${days}&today=${encodeURIComponent(today)}&timezone=${encodeURIComponent(timezone)}`
      ),
    enabled,
  });
}

export function useHabit(id: string) {
  return useQuery({
    queryKey: [...HABIT_KEY, id],
    queryFn: () => apiClient<Habit>(`/api/habits/${id}`),
    enabled: !!id,
  });
}

export function useHabitPreferences(enabled = true) {
  return useQuery({
    queryKey: HABIT_PREFERENCES_KEY,
    queryFn: () => apiClient<HabitPreferences>('/api/habits/preferences'),
    enabled,
  });
}

export function useHabitInsights(
  id: string,
  range: HabitInsightsRange,
  month?: string,
) {
  const { today, timezone } = useDeviceClockSnapshot();
  return useQuery({
    queryKey: [...HABIT_INSIGHTS_KEY, id, range, month ?? '', today, timezone],
    queryFn: () => {
      const monthPart = month ? `&month=${encodeURIComponent(month)}` : '';
      return apiClient<HabitInsights>(
        `/api/habits/${id}/insights?range=${encodeURIComponent(range)}${monthPart}&today=${encodeURIComponent(today)}&timezone=${encodeURIComponent(timezone)}`
      );
    },
    enabled: !!id,
  });
}

export function useCreateHabit() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateHabitInput) =>
      apiClient<Habit>('/api/habits', { method: 'POST', body: data }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: HABITS_KEY });
    },
  });
}

export function useUpdateHabit() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateHabitInput }) =>
      apiClient<Habit>(`/api/habits/${id}`, { method: 'PUT', body: data }),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: HABITS_KEY });
      queryClient.invalidateQueries({ queryKey: [...HABIT_KEY, variables.id] });
      queryClient.invalidateQueries({ queryKey: [...HABIT_INSIGHTS_KEY, variables.id] });
    },
  });
}

export function useArchiveHabit() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiClient<{ success: boolean }>(`/api/habits/${id}`, { method: 'DELETE' }),
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: HABITS_KEY });
      queryClient.invalidateQueries({ queryKey: [...HABIT_KEY, id] });
      queryClient.invalidateQueries({ queryKey: [...HABIT_INSIGHTS_KEY, id] });
    },
  });
}

export function useRestoreHabit() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiClient<{ success: boolean }>(`/api/habits/${id}/restore`, { method: 'POST' }),
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: HABITS_KEY });
      queryClient.invalidateQueries({ queryKey: [...HABIT_KEY, id] });
      queryClient.invalidateQueries({ queryKey: [...HABIT_INSIGHTS_KEY, id] });
    },
  });
}

export function useHardDeleteHabit() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiClient<{ success: boolean }>(`/api/habits/${id}/hard`, { method: 'DELETE' }),
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: HABITS_KEY });
      queryClient.removeQueries({ queryKey: [...HABIT_KEY, id] });
      queryClient.removeQueries({ queryKey: [...HABIT_INSIGHTS_KEY, id] });
    },
  });
}

export function useUpsertHabitLog() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpsertHabitLogInput }) =>
      apiClient<HabitLog>(`/api/habits/${id}/logs`, { method: 'POST', body: data }),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: HABITS_KEY });
      queryClient.invalidateQueries({ queryKey: [...HABIT_KEY, variables.id] });
      queryClient.invalidateQueries({ queryKey: [...HABIT_INSIGHTS_KEY, variables.id] });
    },
  });
}

export function useDeleteHabitLog() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, date }: { id: string; date: string }) =>
      apiClient<{ success: boolean }>(
        `/api/habits/${id}/logs/${encodeURIComponent(date)}`,
        { method: 'DELETE' }
      ),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: HABITS_KEY });
      queryClient.invalidateQueries({ queryKey: [...HABIT_KEY, variables.id] });
      queryClient.invalidateQueries({ queryKey: [...HABIT_INSIGHTS_KEY, variables.id] });
    },
  });
}

export function useUpdateHabitPreferences() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: UpdateHabitPreferencesInput) =>
      apiClient<HabitPreferences>('/api/habits/preferences', { method: 'PUT', body: data }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: HABIT_PREFERENCES_KEY });
      queryClient.invalidateQueries({ queryKey: HABITS_KEY });
      queryClient.invalidateQueries({ queryKey: HABIT_INSIGHTS_KEY });
    },
  });
}
