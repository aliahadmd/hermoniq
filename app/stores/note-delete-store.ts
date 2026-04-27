import { create } from 'zustand';
import type { Note } from '@/lib/types';

const DELETE_UNDO_WINDOW_MS = 5000;

interface PendingDeleteState {
  pendingNote: Note | null;
  deadlineAt: number | null;
  setPendingNote: (note: Note, windowMs?: number) => void;
  clearPendingNote: () => void;
}

export const useNoteDeleteStore = create<PendingDeleteState>((set) => ({
  pendingNote: null,
  deadlineAt: null,
  setPendingNote: (note, windowMs = DELETE_UNDO_WINDOW_MS) =>
    set({
      pendingNote: note,
      deadlineAt: Date.now() + windowMs,
    }),
  clearPendingNote: () =>
    set({
      pendingNote: null,
      deadlineAt: null,
    }),
}));

export const NOTE_DELETE_UNDO_WINDOW_MS = DELETE_UNDO_WINDOW_MS;
