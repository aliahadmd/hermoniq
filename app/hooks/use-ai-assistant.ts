import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Platform } from 'react-native';
import type { z } from 'zod';
import { apiClient, apiFetch } from '@/lib/api-client';
import type {
  AiChat,
  AiChatMessagesResponse,
  AiMessageAttachment,
  AiChatSearchResult,
  AiPendingAction,
  AiStreamActionEvent,
  AiStreamDoneEvent,
  AiStreamErrorEvent,
  AiStreamEvent,
  AiStreamStartEvent,
  SendAiMessageResponse,
} from '@/lib/types';
import type {
  createAiChatSchema,
  sendAiMessageSchema,
  updateAiChatSchema,
} from '@/lib/validators';

type CreateAiChatInput = z.infer<typeof createAiChatSchema>;
type UpdateAiChatInput = z.infer<typeof updateAiChatSchema>;
type SendAiMessageInput = z.infer<typeof sendAiMessageSchema>;

interface UploadAiAttachmentInput {
  uri: string;
  fileName: string;
  mimeType: string;
  width?: number | null;
  height?: number | null;
}

const AI_CHATS_KEY = ['ai-chats'] as const;
const AI_MESSAGES_KEY = ['ai-messages'] as const;
const NOTES_KEY = ['notes'] as const;
const NOTE_KEY = ['note'] as const;
const NOTE_CATEGORIES_KEY = ['note-categories'] as const;
const TRANSACTIONS_KEY = ['transactions'] as const;
const ACCOUNTS_KEY = ['accounts'] as const;
const DASHBOARD_KEY = ['dashboard'] as const;
const BUDGETS_KEY = ['budgets'] as const;
const HABITS_KEY = ['habits'] as const;
const HABIT_KEY = ['habit'] as const;
const HABIT_INSIGHTS_KEY = ['habit-insights'] as const;
const HABIT_PREFERENCES_KEY = ['habit-preferences'] as const;
const EVENTS_KEY = ['events'] as const;
const EVENT_KEY = ['event'] as const;

export function isAiStreamingSupported(): boolean {
  if (Platform.OS !== 'web') return false;
  if (typeof ReadableStream === 'undefined') return false;
  if (typeof TextDecoder === 'undefined') return false;
  return true;
}

function parseSseFrames(
  input: string,
  onFrame: (eventName: string, dataText: string) => void,
): string {
  let rest = input;
  while (true) {
    const frameEnd = rest.indexOf('\n\n');
    if (frameEnd === -1) break;

    const frame = rest.slice(0, frameEnd);
    rest = rest.slice(frameEnd + 2);

    let eventName = 'message';
    const dataLines: string[] = [];
    for (const line of frame.split('\n')) {
      if (line.startsWith('event:')) {
        eventName = line.slice(6).trim() || 'message';
      }
      if (line.startsWith('data:')) {
        dataLines.push(line.slice(5).trim());
      }
    }

    if (dataLines.length > 0) {
      onFrame(eventName, dataLines.join('\n'));
    }
  }

  return rest;
}

function invalidateAiQueries(queryClient: ReturnType<typeof useQueryClient>, chatId?: string) {
  queryClient.invalidateQueries({ queryKey: AI_CHATS_KEY });
  queryClient.invalidateQueries({ queryKey: AI_MESSAGES_KEY });
  if (chatId) {
    queryClient.invalidateQueries({ queryKey: [...AI_MESSAGES_KEY, chatId] });
  }
}

function readPayloadId(payload: AiPendingAction['payload'], key: string): string | null {
  if (!payload || typeof payload !== 'object') return null;
  const value = payload[key];
  return typeof value === 'string' && value.trim().length > 0 ? value : null;
}

function invalidateDomainQueriesAfterAction(
  queryClient: ReturnType<typeof useQueryClient>,
  action?: AiPendingAction,
) {
  queryClient.invalidateQueries({ queryKey: NOTES_KEY });
  queryClient.invalidateQueries({ queryKey: NOTE_CATEGORIES_KEY });
  queryClient.invalidateQueries({ queryKey: TRANSACTIONS_KEY });
  queryClient.invalidateQueries({ queryKey: ACCOUNTS_KEY });
  queryClient.invalidateQueries({ queryKey: DASHBOARD_KEY });
  queryClient.invalidateQueries({ queryKey: BUDGETS_KEY });
  queryClient.invalidateQueries({ queryKey: HABITS_KEY });
  queryClient.invalidateQueries({ queryKey: HABIT_PREFERENCES_KEY });
  queryClient.invalidateQueries({ queryKey: HABIT_INSIGHTS_KEY });
  queryClient.invalidateQueries({ queryKey: EVENTS_KEY });

  if (!action) return;

  const noteId = readPayloadId(action.payload, 'noteId');
  if (noteId) {
    queryClient.invalidateQueries({ queryKey: [...NOTE_KEY, noteId] });
  }

  const habitId = readPayloadId(action.payload, 'habitId');
  if (habitId) {
    queryClient.invalidateQueries({ queryKey: [...HABIT_KEY, habitId] });
    queryClient.invalidateQueries({ queryKey: [...HABIT_INSIGHTS_KEY, habitId] });
  }

  const eventId = readPayloadId(action.payload, 'eventId');
  if (eventId) {
    queryClient.invalidateQueries({ queryKey: [...EVENT_KEY, eventId] });
  }
}

export function useAiChats() {
  return useQuery({
    queryKey: AI_CHATS_KEY,
    queryFn: () => apiClient<AiChat[]>('/api/ai/chats'),
  });
}

export function useCreateAiChat() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateAiChatInput = {}) =>
      apiClient<AiChat>('/api/ai/chats', {
        method: 'POST',
        body: data,
      }),
    onSuccess: () => {
      invalidateAiQueries(queryClient);
    },
  });
}

export function useUpdateAiChat() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateAiChatInput }) =>
      apiClient<AiChat>(`/api/ai/chats/${id}`, {
        method: 'PATCH',
        body: data,
      }),
    onSuccess: (_, variables) => {
      invalidateAiQueries(queryClient, variables.id);
    },
  });
}

export function useResetAiChat() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (chatId: string) =>
      apiClient<{ success: boolean }>(`/api/ai/chats/${chatId}/reset`, {
        method: 'POST',
        body: {},
      }),
    onSuccess: (_, chatId) => {
      invalidateAiQueries(queryClient, chatId);
    },
  });
}

export function useDeleteAiChat() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (chatId: string) =>
      apiClient<{ success: boolean }>(`/api/ai/chats/${chatId}`, {
        method: 'DELETE',
      }),
    onSuccess: () => {
      invalidateAiQueries(queryClient);
    },
  });
}

export function useAiMessages(chatId: string) {
  return useQuery({
    queryKey: [...AI_MESSAGES_KEY, chatId],
    queryFn: () =>
      apiClient<AiChatMessagesResponse>(`/api/ai/chats/${chatId}/messages`),
    enabled: Boolean(chatId),
    refetchInterval: 10_000,
  });
}

export function useAiChatSearch(chatId: string) {
  return useMutation({
    mutationFn: ({ q, limit = 20 }: { q: string; limit?: number }) =>
      apiClient<{ results: AiChatSearchResult[] }>(
        `/api/ai/chats/${chatId}/search?q=${encodeURIComponent(q)}&limit=${limit}`,
      ),
  });
}

export function useSendAiMessage(chatId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: SendAiMessageInput) =>
      apiClient<SendAiMessageResponse>(`/api/ai/chats/${chatId}/messages`, {
        method: 'POST',
        body: data,
      }),
    onSuccess: () => {
      invalidateAiQueries(queryClient, chatId);
    },
  });
}

export function useUploadAiAttachment(chatId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: UploadAiAttachmentInput) => {
      const form = new FormData();
      form.append('file', {
        uri: input.uri,
        name: input.fileName,
        type: input.mimeType,
      } as unknown as Blob);
      if (typeof input.width === 'number') {
        form.append('width', String(input.width));
      }
      if (typeof input.height === 'number') {
        form.append('height', String(input.height));
      }
      return apiClient<{ attachment: AiMessageAttachment }>(`/api/ai/chats/${chatId}/attachments`, {
        method: 'POST',
        body: form,
      });
    },
    onSuccess: () => {
      invalidateAiQueries(queryClient, chatId);
    },
  });
}

export function useDeleteAiAttachment(chatId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (attachmentId: string) =>
      apiClient<{ success: boolean }>(`/api/ai/chats/${chatId}/attachments/${attachmentId}`, {
        method: 'DELETE',
      }),
    onSuccess: () => {
      invalidateAiQueries(queryClient, chatId);
    },
  });
}

interface StreamHandlers {
  signal?: AbortSignal;
  onStart?: (event: AiStreamStartEvent) => void;
  onDelta?: (text: string) => void;
  onAction?: (event: AiStreamActionEvent) => void;
  onDone?: (event: AiStreamDoneEvent) => void;
  onError?: (event: AiStreamErrorEvent) => void;
}

export async function sendAiMessageStream(
  chatId: string,
  data: SendAiMessageInput,
  handlers: StreamHandlers,
): Promise<void> {
  const response = await apiFetch(`/api/ai/chats/${chatId}/messages/stream`, {
    method: 'POST',
    headers: {
      Accept: 'text/event-stream',
    },
    body: data,
    signal: handlers.signal,
  });

  if (!response.ok) {
    const errorPayload = await response.json().catch(() => ({ error: 'Request failed' }));
    throw new Error((errorPayload as { error?: string }).error ?? `HTTP ${response.status}`);
  }

  if (!response.body || !('getReader' in response.body)) {
    throw new Error('Streaming not supported in this runtime');
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    buffer = parseSseFrames(buffer, (eventName, dataText) => {
      let parsed: Record<string, unknown> = {};
      try {
        parsed = JSON.parse(dataText) as Record<string, unknown>;
      } catch {
        parsed = {};
      }

      const streamEvent = { type: eventName, ...parsed } as AiStreamEvent;

      switch (streamEvent.type) {
        case 'start':
          handlers.onStart?.(streamEvent as AiStreamStartEvent);
          break;
        case 'delta':
          handlers.onDelta?.(String((streamEvent as { text?: unknown }).text ?? ''));
          break;
        case 'action':
          handlers.onAction?.(streamEvent as AiStreamActionEvent);
          break;
        case 'done':
          handlers.onDone?.(streamEvent as AiStreamDoneEvent);
          break;
        case 'error':
          handlers.onError?.(streamEvent as AiStreamErrorEvent);
          break;
        default:
          break;
      }
    });
  }
}

export function useConfirmAiAction(chatId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (actionId: string) =>
      apiClient<{
        success: boolean;
        action: AiPendingAction;
      }>(`/api/ai/chats/${chatId}/actions/${actionId}/confirm`, {
        method: 'POST',
        body: {},
      }),
    onSuccess: (result) => {
      invalidateAiQueries(queryClient, chatId);
      invalidateDomainQueriesAfterAction(queryClient, result.action);
    },
  });
}

export function useCancelAiAction(chatId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (actionId: string) =>
      apiClient<{
        success: boolean;
        action: AiPendingAction;
      }>(`/api/ai/chats/${chatId}/actions/${actionId}/cancel`, {
        method: 'POST',
        body: {},
      }),
    onSuccess: () => {
      invalidateAiQueries(queryClient, chatId);
    },
  });
}

export function useRejectAiAction(chatId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (actionId: string) =>
      apiClient<{
        success: boolean;
        action: AiPendingAction;
      }>(`/api/ai/chats/${chatId}/actions/${actionId}/reject`, {
        method: 'POST',
        body: {},
      }),
    onSuccess: () => {
      invalidateAiQueries(queryClient, chatId);
    },
  });
}
