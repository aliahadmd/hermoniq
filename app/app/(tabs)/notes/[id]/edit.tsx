import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Clipboard,
  Pressable,
  Share,
  StyleSheet,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useNavigation, usePreventRemove } from '@react-navigation/native';

import { NoteForm, type NoteFormValues } from '@/components/notes/note-form';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import {
  useArchiveNote,
  useNote,
  usePinNote,
  useUnarchiveNote,
  useUnpinNote,
  useUpdateNote,
} from '@/hooks/use-notes';
import {
  clearNoteDraft,
  readNoteDraft,
  type NoteDraftValue,
  writeNoteDraft,
} from '@/lib/note-drafts';
import { useThemeColor } from '@/hooks/use-theme-color';
import { NOTE_DELETE_UNDO_WINDOW_MS, useNoteDeleteStore } from '@/stores/note-delete-store';

function resolveId(rawId: string | string[] | undefined): string {
  return Array.isArray(rawId) ? rawId[0] : (rawId ?? '');
}

function toDraftValue(values: Pick<NoteFormValues, 'title' | 'content' | 'categoryId'>): NoteDraftValue {
  return {
    title: values.title,
    content: values.content,
    categoryId: values.categoryId ?? null,
  };
}

export default function EditNoteScreen() {
  const params = useLocalSearchParams<{ id?: string }>();
  const router = useRouter();
  const navigation = useNavigation();
  const id = resolveId(params.id);
  const tint = useThemeColor({}, 'tint');
  const textSecondary = useThemeColor({}, 'textSecondary');
  const border = useThemeColor({}, 'border');
  const surface = useThemeColor({}, 'surface');

  const noteQuery = useNote(id);
  const updateNote = useUpdateNote();
  const pinNote = usePinNote();
  const unpinNote = useUnpinNote();
  const archiveNote = useArchiveNote();
  const unarchiveNote = useUnarchiveNote();
  const setPendingDelete = useNoteDeleteStore((state) => state.setPendingNote);

  const draftKey = useMemo(() => `notes.draft.edit.${id}`, [id]);
  const allowNavigationRef = useRef(false);
  const discardPromptVisibleRef = useRef(false);
  const hydratedNoteIdRef = useRef<string | null>(null);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [isHydrated, setIsHydrated] = useState(false);
  const [initialValues, setInitialValues] = useState<Partial<NoteFormValues>>({
    title: '',
    content: '',
    categoryId: null,
  });
  const [draftValues, setDraftValues] = useState<NoteDraftValue>({
    title: '',
    content: '',
    categoryId: null,
  });
  const undoWindowSeconds = Math.round(NOTE_DELETE_UNDO_WINDOW_MS / 1000);

  useEffect(() => {
    hydratedNoteIdRef.current = null;
    setIsHydrated(false);
    setHasUnsavedChanges(false);
  }, [id]);

  useEffect(() => {
    if (!noteQuery.data || hydratedNoteIdRef.current === id) return;

    let mounted = true;
    const serverValues: NoteFormValues = {
      title: noteQuery.data.title,
      content: noteQuery.data.content,
      categoryId: noteQuery.data.categoryId,
    };

    readNoteDraft(draftKey)
      .then((draft) => {
        if (!mounted) return;
        const values = draft ?? serverValues;
        setInitialValues(values);
        setDraftValues(toDraftValue(values));
      })
      .finally(() => {
        if (mounted) {
          hydratedNoteIdRef.current = id;
          setIsHydrated(true);
        }
      });

    return () => {
      mounted = false;
    };
  }, [draftKey, id, noteQuery.data]);

  useEffect(() => {
    if (!isHydrated) return;

    const timer = setTimeout(() => {
      void writeNoteDraft(draftKey, draftValues);
    }, 500);

    return () => {
      clearTimeout(timer);
    };
  }, [draftKey, draftValues, isHydrated]);

  usePreventRemove(hasUnsavedChanges && !allowNavigationRef.current, ({ data }) => {
    if (discardPromptVisibleRef.current) return;
    discardPromptVisibleRef.current = true;

    const message = 'You have unsaved changes. Discard them and leave this screen?';
    Alert.alert('Discard changes?', message, [
      {
        text: "Don't leave",
        style: 'cancel',
        onPress: () => {
          discardPromptVisibleRef.current = false;
        },
      },
      {
        text: 'Discard',
        style: 'destructive',
        onPress: () => {
          discardPromptVisibleRef.current = false;
          allowNavigationRef.current = true;
          navigation.dispatch(data.action);
        },
      },
    ], {
      cancelable: true,
      onDismiss: () => {
        discardPromptVisibleRef.current = false;
      },
    });
  });

  if (noteQuery.isLoading || (noteQuery.data && !isHydrated)) {
    return (
      <ThemedView style={styles.centered}>
        <ActivityIndicator size="large" color={tint} />
      </ThemedView>
    );
  }

  if (noteQuery.error || !noteQuery.data) {
    return (
      <ThemedView style={styles.centered}>
        <ThemedText>Failed to load note</ThemedText>
        <ThemedText style={[styles.errorText, { color: textSecondary }]}>
          {noteQuery.error?.message ?? 'Note not found'}
        </ThemedText>
      </ThemedView>
    );
  }

  const note = noteQuery.data;
  const isBusy =
    updateNote.isPending ||
    pinNote.isPending ||
    unpinNote.isPending ||
    archiveNote.isPending ||
    unarchiveNote.isPending;

  const exportText = `${draftValues.title || note.title}\n\n${draftValues.content || note.content}`;

  return (
    <ThemedView style={styles.container}>
      <View style={styles.actionsRow}>
        <Pressable
          onPress={() => {
            const action = note.isPinned ? unpinNote : pinNote;
            action.mutate(id, {
              onError: (error) => Alert.alert('Error', error.message),
            });
          }}
          style={[styles.actionChip, { borderColor: border, backgroundColor: surface }]}
          accessibilityRole="button"
          accessibilityLabel={note.isPinned ? 'Unpin note' : 'Pin note'}
        >
          <ThemedText>{note.isPinned ? 'Unpin' : 'Pin'}</ThemedText>
        </Pressable>

        <Pressable
          onPress={() => {
            const action = note.archivedAt ? unarchiveNote : archiveNote;
            action.mutate(id, {
              onError: (error) => Alert.alert('Error', error.message),
            });
          }}
          style={[styles.actionChip, { borderColor: border, backgroundColor: surface }]}
          accessibilityRole="button"
          accessibilityLabel={note.archivedAt ? 'Unarchive note' : 'Archive note'}
        >
          <ThemedText>{note.archivedAt ? 'Unarchive' : 'Archive'}</ThemedText>
        </Pressable>

        <Pressable
          onPress={() => {
            Clipboard.setString(exportText);
            Alert.alert('Copied', 'Note copied to clipboard.');
          }}
          style={[styles.actionChip, { borderColor: border, backgroundColor: surface }]}
          accessibilityRole="button"
          accessibilityLabel="Copy note text"
        >
          <ThemedText>Copy</ThemedText>
        </Pressable>

        <Pressable
          onPress={() => {
            Share.share({ message: exportText }).catch((error) =>
              Alert.alert('Error', error.message),
            );
          }}
          style={[styles.actionChip, { borderColor: border, backgroundColor: surface }]}
          accessibilityRole="button"
          accessibilityLabel="Share note"
        >
          <ThemedText>Share</ThemedText>
        </Pressable>
      </View>

      <NoteForm
        initialValues={initialValues}
        metaDate={note.updatedAt}
        submitLabel="Save Changes"
        submitting={isBusy}
        onDirtyChange={setHasUnsavedChanges}
        onValuesChange={(values) => setDraftValues(toDraftValue(values))}
        onSubmit={(values) => {
          updateNote.mutate(
            { id, data: values },
            {
              onSuccess: async () => {
                allowNavigationRef.current = true;
                await clearNoteDraft(draftKey);
                router.back();
              },
              onError: (error) => Alert.alert('Error', error.message),
            },
          );
        }}
        onDelete={() => {
          Alert.alert('Delete Note', `You can undo this for ${undoWindowSeconds} seconds from the notes list.`, [
            { text: 'Cancel', style: 'cancel' },
            {
              text: 'Delete',
              style: 'destructive',
              onPress: async () => {
                allowNavigationRef.current = true;
                await clearNoteDraft(draftKey);
                setPendingDelete(note, NOTE_DELETE_UNDO_WINDOW_MS);
                router.replace('/notes');
              },
            },
          ]);
        }}
      />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  errorText: {
    marginTop: 6,
    fontSize: 13,
  },
  actionsRow: {
    paddingTop: 12,
    paddingHorizontal: 16,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  actionChip: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 12,
    minHeight: 36,
    justifyContent: 'center',
  },
});
