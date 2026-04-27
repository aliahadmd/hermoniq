import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

export interface NoteDraftValue {
  title: string;
  content: string;
  categoryId: string | null;
}

function isMeaningfulDraft(draft: NoteDraftValue): boolean {
  return (
    draft.title.trim().length > 0 ||
    draft.content.trim().length > 0 ||
    draft.categoryId !== null
  );
}

function toStorageKey(key: string): string {
  const trimmed = key.trim();
  const sanitized = trimmed.replace(/[^A-Za-z0-9._-]/g, '_');
  return sanitized.length > 0 ? sanitized : 'notes_draft_default';
}

async function setStorageItem(key: string, value: string | null): Promise<void> {
  const storageKey = toStorageKey(key);

  if (Platform.OS === 'web') {
    try {
      if (value === null) {
        localStorage.removeItem(storageKey);
      } else {
        localStorage.setItem(storageKey, value);
      }
    } catch {
      // no-op: storage is best-effort
    }
    return;
  }

  if (value === null) {
    await SecureStore.deleteItemAsync(storageKey);
  } else {
    await SecureStore.setItemAsync(storageKey, value);
  }
}

async function getStorageItem(key: string): Promise<string | null> {
  const storageKey = toStorageKey(key);

  if (Platform.OS === 'web') {
    try {
      return localStorage.getItem(storageKey);
    } catch {
      return null;
    }
  }

  return SecureStore.getItemAsync(storageKey);
}

export async function readNoteDraft(key: string): Promise<NoteDraftValue | null> {
  const raw = await getStorageItem(key);
  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as Partial<NoteDraftValue>;
    return {
      title: typeof parsed.title === 'string' ? parsed.title : '',
      content: typeof parsed.content === 'string' ? parsed.content : '',
      categoryId: typeof parsed.categoryId === 'string' ? parsed.categoryId : null,
    };
  } catch {
    return null;
  }
}

export async function writeNoteDraft(key: string, draft: NoteDraftValue): Promise<void> {
  if (!isMeaningfulDraft(draft)) {
    await setStorageItem(key, null);
    return;
  }
  await setStorageItem(key, JSON.stringify(draft));
}

export async function clearNoteDraft(key: string): Promise<void> {
  await setStorageItem(key, null);
}
