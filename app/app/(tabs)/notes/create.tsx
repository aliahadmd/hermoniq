import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, StyleSheet } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useNavigation, usePreventRemove } from '@react-navigation/native';

import { NoteForm, type NoteFormValues } from '@/components/notes/note-form';
import { ThemedView } from '@/components/themed-view';
import { useCreateNote } from '@/hooks/use-notes';
import {
  clearNoteDraft,
  readNoteDraft,
  type NoteDraftValue,
  writeNoteDraft,
} from '@/lib/note-drafts';
import { getNoteTemplateById, NOTE_TEMPLATES } from '@/lib/note-templates';
import { useThemeColor } from '@/hooks/use-theme-color';

const CREATE_DRAFT_KEY = 'notes.draft.create';

function readParam(value: string | string[] | undefined): string | undefined {
  if (!value) return undefined;
  return Array.isArray(value) ? value[0] : value;
}

function toDraftValue(values: Pick<NoteFormValues, 'title' | 'content' | 'categoryId'>): NoteDraftValue {
  return {
    title: values.title,
    content: values.content,
    categoryId: values.categoryId ?? null,
  };
}

export default function CreateNoteScreen() {
  const router = useRouter();
  const navigation = useNavigation();
  const params = useLocalSearchParams<{
    template?: string;
    prefillTitle?: string;
    prefillContent?: string;
  }>();
  const tint = useThemeColor({}, 'tint');
  const createNote = useCreateNote();

  const allowNavigationRef = useRef(false);
  const discardPromptVisibleRef = useRef(false);
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

  const defaultValues = useMemo<NoteFormValues>(() => {
    const template = getNoteTemplateById(readParam(params.template));
    const prefillTitle = readParam(params.prefillTitle) ?? '';
    const prefillContent = readParam(params.prefillContent) ?? '';
    const templateContent = template?.content ?? '';
    const content = [templateContent, prefillContent].filter((item) => item.length > 0).join('\n\n');

    return {
      title: prefillTitle || template?.title || '',
      content,
      categoryId: null,
    };
  }, [params.prefillContent, params.prefillTitle, params.template]);
  const hasExplicitPrefill = Boolean(
    readParam(params.template) || readParam(params.prefillTitle) || readParam(params.prefillContent),
  );

  useEffect(() => {
    if (hasExplicitPrefill) {
      setInitialValues(defaultValues);
      setDraftValues(toDraftValue(defaultValues));
      setIsHydrated(true);
      return;
    }

    let mounted = true;
    readNoteDraft(CREATE_DRAFT_KEY)
      .then((draft) => {
        if (!mounted) return;
        const values = draft ?? defaultValues;
        setInitialValues(values);
        setDraftValues(toDraftValue(values));
      })
      .finally(() => {
        if (mounted) {
          setIsHydrated(true);
        }
      });

    return () => {
      mounted = false;
    };
  }, [defaultValues, hasExplicitPrefill]);

  useEffect(() => {
    if (!isHydrated) return;

    const timer = setTimeout(() => {
      void writeNoteDraft(CREATE_DRAFT_KEY, draftValues);
    }, 500);

    return () => {
      clearTimeout(timer);
    };
  }, [draftValues, isHydrated]);

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

  if (!isHydrated) {
    return (
      <ThemedView style={styles.centered}>
        <ActivityIndicator size="large" color={tint} />
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.container}>
      <NoteForm
        initialValues={initialValues}
        submitLabel="Save Note"
        submitting={createNote.isPending}
        templates={NOTE_TEMPLATES}
        onDirtyChange={setHasUnsavedChanges}
        onValuesChange={(values) => setDraftValues(toDraftValue(values))}
        onSubmit={(values) => {
          createNote.mutate(values, {
            onSuccess: async () => {
              allowNavigationRef.current = true;
              await clearNoteDraft(CREATE_DRAFT_KEY);
              router.back();
            },
            onError: (error) => Alert.alert('Error', error.message),
          });
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
  },
});
