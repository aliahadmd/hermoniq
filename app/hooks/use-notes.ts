import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { z } from 'zod';
import { apiClient } from '@/lib/api-client';
import type { Note, NoteCategory } from '@/lib/types';
import type {
  createNoteCategorySchema,
  createNoteSchema,
  noteListQuerySchema,
  updateNoteCategorySchema,
  updateNoteSchema,
} from '@/lib/validators';

type CreateNoteInput = z.infer<typeof createNoteSchema>;
type UpdateNoteInput = z.infer<typeof updateNoteSchema>;
type CreateNoteCategoryInput = z.infer<typeof createNoteCategorySchema>;
type UpdateNoteCategoryInput = z.infer<typeof updateNoteCategorySchema>;
type NoteListQuery = z.infer<typeof noteListQuerySchema>;

const NOTES_KEY = ['notes'] as const;
const NOTE_KEY = ['note'] as const;
const NOTE_CATEGORIES_KEY = ['note-categories'] as const;
const NOTES_STALE_TIME_MS = 20_000;

function invalidateNoteQueries(queryClient: ReturnType<typeof useQueryClient>) {
  queryClient.invalidateQueries({ queryKey: NOTES_KEY });
  queryClient.invalidateQueries({ queryKey: NOTE_CATEGORIES_KEY });
}

export function useNotes(query: NoteListQuery = {}) {
  const q = query.q?.trim() ?? '';
  const categoryId = query.categoryId ?? '';
  const includeArchived = query.includeArchived ?? false;
  const pinnedOnly = query.pinnedOnly ?? false;
  const sort = query.sort ?? 'updated_desc';

  return useQuery({
    queryKey: [...NOTES_KEY, q, categoryId, includeArchived, pinnedOnly, sort],
    queryFn: () => {
      const params = new URLSearchParams();
      if (q) params.set('q', q);
      if (categoryId) params.set('categoryId', categoryId);
      if (includeArchived) params.set('includeArchived', 'true');
      if (pinnedOnly) params.set('pinnedOnly', 'true');
      params.set('sort', sort);
      const suffix = params.toString();
      return apiClient<Note[]>(`/api/notes${suffix ? `?${suffix}` : ''}`);
    },
    staleTime: NOTES_STALE_TIME_MS,
    placeholderData: keepPreviousData,
  });
}

export function useNote(id: string) {
  return useQuery({
    queryKey: [...NOTE_KEY, id],
    queryFn: () => apiClient<Note>(`/api/notes/${id}`),
    enabled: !!id,
    staleTime: NOTES_STALE_TIME_MS,
  });
}

export function useCreateNote() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateNoteInput) =>
      apiClient<Note>('/api/notes', { method: 'POST', body: data }),
    onSuccess: () => {
      invalidateNoteQueries(queryClient);
    },
  });
}

export function useUpdateNote() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateNoteInput }) =>
      apiClient<Note>(`/api/notes/${id}`, { method: 'PUT', body: data }),
    onSuccess: (_, variables) => {
      invalidateNoteQueries(queryClient);
      queryClient.invalidateQueries({ queryKey: [...NOTE_KEY, variables.id] });
    },
  });
}

export function useDeleteNote() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiClient<{ success: boolean }>(`/api/notes/${id}`, { method: 'DELETE' }),
    onSuccess: (_, id) => {
      invalidateNoteQueries(queryClient);
      queryClient.removeQueries({ queryKey: [...NOTE_KEY, id] });
    },
  });
}

function createNotePatchMutation(path: (id: string) => string) {
  return function useNotePatchMutation() {
    const queryClient = useQueryClient();
    return useMutation({
      mutationFn: (id: string) => apiClient<Note>(path(id), { method: 'PATCH' }),
      onSuccess: (note) => {
        invalidateNoteQueries(queryClient);
        queryClient.setQueryData([...NOTE_KEY, note.id], note);
      },
    });
  };
}

export const usePinNote = createNotePatchMutation((id) => `/api/notes/${id}/pin`);
export const useUnpinNote = createNotePatchMutation((id) => `/api/notes/${id}/unpin`);

async function archiveNoteWithFallback(id: string) {
  try {
    const archived = await apiClient<Note>(`/api/notes/${id}/archive`, { method: 'PATCH' });
    if (archived.archivedAt) {
      return archived;
    }
  } catch {
    // Fall through to PUT fallback for older backend routes.
  }

  const fallbackArchivedAt = new Date().toISOString();
  const archived = await apiClient<Note>(`/api/notes/${id}`, {
    method: 'PUT',
    body: { archivedAt: fallbackArchivedAt, isPinned: false },
  });

  if (!archived.archivedAt) {
    throw new Error('Failed to archive note');
  }

  return archived;
}

async function unarchiveNoteWithFallback(id: string) {
  try {
    const unarchived = await apiClient<Note>(`/api/notes/${id}/unarchive`, { method: 'PATCH' });
    if (!unarchived.archivedAt) {
      return unarchived;
    }
  } catch {
    // Fall through to PUT fallback for older backend routes.
  }

  const unarchived = await apiClient<Note>(`/api/notes/${id}`, {
    method: 'PUT',
    body: { archivedAt: null },
  });

  if (unarchived.archivedAt) {
    throw new Error('Failed to unarchive note');
  }

  return unarchived;
}

export function useArchiveNote() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => archiveNoteWithFallback(id),
    onSuccess: (note) => {
      invalidateNoteQueries(queryClient);
      queryClient.setQueryData([...NOTE_KEY, note.id], note);
    },
  });
}

export function useUnarchiveNote() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => unarchiveNoteWithFallback(id),
    onSuccess: (note) => {
      invalidateNoteQueries(queryClient);
      queryClient.setQueryData([...NOTE_KEY, note.id], note);
    },
  });
}

export function useNoteCategories() {
  return useQuery({
    queryKey: NOTE_CATEGORIES_KEY,
    queryFn: () => apiClient<NoteCategory[]>('/api/notes/categories'),
  });
}

export function useCreateNoteCategory() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateNoteCategoryInput) =>
      apiClient<NoteCategory>('/api/notes/categories', { method: 'POST', body: data }),
    onSuccess: () => {
      invalidateNoteQueries(queryClient);
    },
  });
}

export function useUpdateNoteCategory() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateNoteCategoryInput }) =>
      apiClient<NoteCategory>(`/api/notes/categories/${id}`, { method: 'PUT', body: data }),
    onSuccess: () => {
      invalidateNoteQueries(queryClient);
    },
  });
}

export function useDeleteNoteCategory() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiClient<{ success: boolean }>(`/api/notes/categories/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      invalidateNoteQueries(queryClient);
    },
  });
}
