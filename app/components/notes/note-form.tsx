import { useEffect, useMemo, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import dayjs from 'dayjs';
import type { z } from 'zod';

import { CategoryQuickAdd } from '@/components/notes/category-quick-add';
import { ThemedText } from '@/components/themed-text';
import { useCreateNoteCategory, useNoteCategories } from '@/hooks/use-notes';
import { useThemeColor } from '@/hooks/use-theme-color';
import { createNoteSchema } from '@/lib/validators';

type NoteFormInput = z.input<typeof createNoteSchema>;
type NoteFormOutput = z.output<typeof createNoteSchema>;

export interface NoteTemplatePreset {
  id: string;
  label: string;
  title: string;
  content: string;
}

export type NoteFormValues = Pick<NoteFormOutput, 'title' | 'content' | 'categoryId'>;

interface NoteFormProps {
  initialValues?: Partial<NoteFormOutput>;
  submitLabel: string;
  submitting?: boolean;
  metaDate?: string;
  templates?: NoteTemplatePreset[];
  onSubmit: (values: NoteFormOutput) => void;
  onDelete?: () => void;
  onDirtyChange?: (dirty: boolean) => void;
  onValuesChange?: (values: NoteFormValues) => void;
}

function buildNormalizedValues(input: Partial<NoteFormOutput> | undefined): NoteFormValues {
  return {
    title: input?.title ?? '',
    content: input?.content ?? '',
    categoryId: input?.categoryId ?? null,
  };
}

export function NoteForm({
  initialValues,
  submitLabel,
  submitting = false,
  metaDate,
  templates,
  onSubmit,
  onDelete,
  onDirtyChange,
  onValuesChange,
}: NoteFormProps) {
  const text = useThemeColor({}, 'text');
  const textSecondary = useThemeColor({}, 'textSecondary');
  const border = useThemeColor({}, 'border');
  const surface = useThemeColor({}, 'surface');
  const card = useThemeColor({}, 'card');
  const tint = useThemeColor({}, 'tint');
  const danger = useThemeColor({}, 'danger');

  const categoryQuery = useNoteCategories();
  const createCategory = useCreateNoteCategory();
  const [quickAddVisible, setQuickAddVisible] = useState(false);
  const [quickAddError, setQuickAddError] = useState<string | null>(null);

  const categories = useMemo(() => categoryQuery.data ?? [], [categoryQuery.data]);
  const normalizedInitialValues = useMemo(
    () => buildNormalizedValues(initialValues),
    [initialValues],
  );

  const {
    control,
    handleSubmit,
    watch,
    setValue,
    reset,
    formState: { errors, isDirty },
  } = useForm<NoteFormInput, undefined, NoteFormOutput>({
    resolver: zodResolver(createNoteSchema),
    defaultValues: normalizedInitialValues,
  });

  useEffect(() => {
    reset(normalizedInitialValues);
  }, [normalizedInitialValues, reset]);

  useEffect(() => {
    onDirtyChange?.(isDirty);
  }, [isDirty, onDirtyChange]);

  useEffect(() => {
    const subscription = watch((value) => {
      if (!onValuesChange) return;
      onValuesChange({
        title: value.title ?? '',
        content: value.content ?? '',
        categoryId: value.categoryId ?? null,
      });
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [onValuesChange, watch]);

  const selectedCategoryId = watch('categoryId');
  const parsedMetaDate = metaDate ? dayjs(metaDate) : null;
  const detailDate = parsedMetaDate?.isValid()
    ? parsedMetaDate.format('MMM D, YYYY • h:mm A')
    : dayjs().format('MMM D, YYYY • h:mm A');

  const submit = (values: NoteFormOutput) => {
    onSubmit({
      ...values,
      title: values.title.trim(),
      content: values.content ?? '',
      categoryId: values.categoryId ?? null,
    });
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={styles.container}
    >
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <ThemedText style={[styles.meta, { color: textSecondary }]}>{detailDate}</ThemedText>

        {templates && templates.length > 0 ? (
          <View style={styles.templatesWrap}>
            <ThemedText style={[styles.label, { color: textSecondary }]}>Templates</ThemedText>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.templatesRow}
            >
              {templates.map((template) => (
                <Pressable
                  key={template.id}
                  onPress={() => {
                    setValue('title', template.title, { shouldDirty: true });
                    setValue('content', template.content, { shouldDirty: true });
                  }}
                  style={[styles.templateChip, { borderColor: border, backgroundColor: surface }]}
                  accessibilityRole="button"
                  accessibilityLabel={`Use ${template.label} template`}
                >
                  <ThemedText>{template.label}</ThemedText>
                </Pressable>
              ))}
            </ScrollView>
          </View>
        ) : null}

        <ThemedText style={[styles.label, { color: textSecondary }]}>Title</ThemedText>
        <Controller
          control={control}
          name="title"
          render={({ field: { onChange, onBlur, value } }) => (
            <TextInput
              value={value}
              onChangeText={onChange}
              onBlur={onBlur}
              placeholder="Enter note title"
              placeholderTextColor={textSecondary}
              scrollEnabled={false}
              style={[
                styles.input,
                {
                  color: text,
                  borderColor: border,
                  backgroundColor: surface,
                },
              ]}
              autoCapitalize="sentences"
              accessibilityLabel="Note title"
            />
          )}
        />
        {errors.title ? <ThemedText style={[styles.error, { color: danger }]}>{errors.title.message}</ThemedText> : null}

        <ThemedText style={[styles.label, styles.spacingTop, { color: textSecondary }]}>Note</ThemedText>
        <Controller
          control={control}
          name="content"
          render={({ field: { onChange, onBlur, value } }) => (
            <TextInput
              value={value}
              onChangeText={onChange}
              onBlur={onBlur}
              placeholder="Start typing your note..."
              placeholderTextColor={textSecondary}
              style={[
                styles.input,
                styles.contentInput,
                {
                  color: text,
                  borderColor: border,
                  backgroundColor: surface,
                },
              ]}
              multiline
              textAlignVertical="top"
              accessibilityLabel="Note content"
            />
          )}
        />
        {errors.content ? <ThemedText style={[styles.error, { color: danger }]}>{errors.content.message}</ThemedText> : null}

        <View style={[styles.categoryCard, { borderColor: border, backgroundColor: card }]}>
          <View style={styles.categoryHeader}>
            <ThemedText type="defaultSemiBold">Category</ThemedText>
            <Pressable
              onPress={() => {
                setQuickAddError(null);
                setQuickAddVisible(true);
              }}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="Add new note category"
            >
              <ThemedText style={{ color: tint }}>Add New</ThemedText>
            </Pressable>
          </View>

          <View style={styles.chipsRow}>
            <Pressable
              onPress={() => setValue('categoryId', null, { shouldDirty: true })}
              style={[
                styles.chip,
                {
                  borderColor: selectedCategoryId === null ? tint : border,
                  backgroundColor: selectedCategoryId === null ? `${tint}1F` : surface,
                },
              ]}
              accessibilityRole="button"
              accessibilityLabel="Set category to none"
            >
              <ThemedText style={selectedCategoryId === null ? { color: tint } : undefined}>None</ThemedText>
            </Pressable>

            {categories.map((category) => {
              const selected = selectedCategoryId === category.id;
              return (
                <Pressable
                  key={category.id}
                  onPress={() => setValue('categoryId', category.id, { shouldDirty: true })}
                  style={[
                    styles.chip,
                    {
                      borderColor: selected ? tint : border,
                      backgroundColor: selected ? `${tint}1F` : surface,
                    },
                  ]}
                  accessibilityRole="button"
                  accessibilityLabel={`Set category to ${category.name}`}
                >
                  <ThemedText style={selected ? { color: tint } : undefined}>{category.name}</ThemedText>
                </Pressable>
              );
            })}
          </View>
        </View>

        <Pressable
          onPress={handleSubmit(submit)}
          disabled={submitting}
          style={[styles.submitButton, { backgroundColor: tint }]}
          accessibilityRole="button"
          accessibilityLabel={submitLabel}
        >
          <ThemedText style={styles.submitText}>{submitting ? 'Saving...' : submitLabel}</ThemedText>
        </Pressable>

        {onDelete ? (
          <Pressable
            onPress={onDelete}
            disabled={submitting}
            style={[styles.deleteButton, { borderColor: danger }]}
            accessibilityRole="button"
            accessibilityLabel="Delete note"
          >
            <ThemedText style={{ color: danger }}>Delete Note</ThemedText>
          </Pressable>
        ) : null}
      </ScrollView>

      <CategoryQuickAdd
        visible={quickAddVisible}
        submitting={createCategory.isPending}
        errorMessage={quickAddError}
        onClose={() => {
          setQuickAddVisible(false);
          setQuickAddError(null);
        }}
        onCreate={(name) => {
          const trimmed = name.trim();
          if (!trimmed) {
            setQuickAddError('Category name is required');
            return;
          }

          createCategory.mutate(
            { name: trimmed },
            {
              onSuccess: (created) => {
                setQuickAddVisible(false);
                setQuickAddError(null);
                setValue('categoryId', created.id, { shouldDirty: true });
              },
              onError: (error) => {
                setQuickAddError(error.message);
              },
            },
          );
        }}
      />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    padding: 16,
    paddingBottom: 32,
  },
  meta: {
    fontSize: 13,
    marginBottom: 10,
  },
  templatesWrap: {
    marginBottom: 6,
  },
  templatesRow: {
    paddingTop: 4,
    paddingBottom: 2,
    gap: 8,
  },
  templateChip: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 12,
    minHeight: 36,
    justifyContent: 'center',
  },
  label: {
    fontSize: 13,
    marginBottom: 6,
  },
  spacingTop: {
    marginTop: 12,
  },
  input: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 11,
    fontSize: 16,
  },
  contentInput: {
    minHeight: 260,
  },
  error: {
    marginTop: 6,
    fontSize: 12,
  },
  categoryCard: {
    marginTop: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 12,
    padding: 12,
  },
  categoryHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  chipsRow: {
    marginTop: 10,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 12,
    minHeight: 36,
    justifyContent: 'center',
  },
  submitButton: {
    marginTop: 16,
    borderRadius: 12,
    alignItems: 'center',
    paddingVertical: 12,
    minHeight: 44,
    justifyContent: 'center',
  },
  submitText: {
    color: '#ffffff',
    fontWeight: '600',
  },
  deleteButton: {
    marginTop: 10,
    borderWidth: 1,
    borderRadius: 12,
    alignItems: 'center',
    paddingVertical: 12,
    minHeight: 44,
    justifyContent: 'center',
  },
});
