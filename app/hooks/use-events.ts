import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { z } from 'zod';
import { apiClient } from '@/lib/api-client';
import type { EventItem, ImportIcsResult } from '@/lib/types';
import type {
  createEventSchema,
  importIcsSchema,
  listEventsQuerySchema,
  updateEventSchema,
} from '@/lib/validators';

type CreateEventInput = z.infer<typeof createEventSchema>;
type UpdateEventInput = z.infer<typeof updateEventSchema>;
type ListEventsQuery = z.infer<typeof listEventsQuerySchema>;
type ImportIcsInput = z.infer<typeof importIcsSchema>;

const EVENTS_KEY = ['events'] as const;
const EVENT_KEY = ['event'] as const;

interface UseEventsOptions {
  enabled?: boolean;
}

function buildEventsPath(query: ListEventsQuery): string {
  const params = new URLSearchParams();
  if (query.from) {
    params.set('from', query.from);
  }
  if (query.to) {
    params.set('to', query.to);
  }
  if (query.q?.trim()) {
    params.set('q', query.q.trim());
  }
  const suffix = params.toString();
  return `/api/events${suffix ? `?${suffix}` : ''}`;
}

function invalidateEventQueries(queryClient: ReturnType<typeof useQueryClient>) {
  queryClient.invalidateQueries({ queryKey: EVENTS_KEY });
}

export function useEvents(query: ListEventsQuery, options: UseEventsOptions = {}) {
  return useQuery({
    queryKey: [...EVENTS_KEY, query.from, query.to, query.q ?? ''],
    queryFn: () => apiClient<EventItem[]>(buildEventsPath(query)),
    enabled: Boolean(query.from && query.to) && (options.enabled ?? true),
  });
}

export function useEvent(id: string) {
  return useQuery({
    queryKey: [...EVENT_KEY, id],
    queryFn: () => apiClient<EventItem>(`/api/events/${id}`),
    enabled: Boolean(id),
  });
}

export function useCreateEvent() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateEventInput) =>
      apiClient<EventItem>('/api/events', {
        method: 'POST',
        body: data,
      }),
    onSuccess: () => {
      invalidateEventQueries(queryClient);
    },
  });
}

export function useUpdateEvent() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateEventInput }) =>
      apiClient<EventItem>(`/api/events/${id}`, {
        method: 'PUT',
        body: data,
      }),
    onSuccess: (_, variables) => {
      invalidateEventQueries(queryClient);
      queryClient.invalidateQueries({ queryKey: [...EVENT_KEY, variables.id] });
    },
  });
}

export function useDeleteEvent() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiClient<{ success: boolean }>(`/api/events/${id}`, {
        method: 'DELETE',
      }),
    onSuccess: (_, id) => {
      invalidateEventQueries(queryClient);
      queryClient.removeQueries({ queryKey: [...EVENT_KEY, id] });
    },
  });
}

export function useImportIcsEvents() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: ImportIcsInput) =>
      apiClient<ImportIcsResult>('/api/events/import-ics', {
        method: 'POST',
        body: data,
      }),
    onSuccess: () => {
      invalidateEventQueries(queryClient);
    },
  });
}
