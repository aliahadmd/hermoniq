import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Switch, TextInput, View } from 'react-native';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as Haptics from 'expo-haptics';
import dayjs from 'dayjs';
import type { z } from 'zod';

import { ThemedText } from '@/components/themed-text';
import { DatePickerField } from '@/components/money-tracker/date-picker-field';
import { ReminderTimePickerField } from '@/components/habit-tracker/reminder-time-picker-field';
import { useHabitPreferences } from '@/hooks/use-habits';
import { useThemeColor } from '@/hooks/use-theme-color';
import type { HabitPreferences } from '@/lib/types';
import { createHabitSchema } from '@/lib/validators';

type HabitFormValues = z.input<typeof createHabitSchema>;
type HabitSubmitValues = z.infer<typeof createHabitSchema>;

interface HabitFormProps {
  initialValues?: Partial<HabitFormValues>;
  submitLabel?: string;
  submitting?: boolean;
  onSubmit: (values: HabitSubmitValues) => void;
}

const COLOR_OPTIONS = ['#e88795', '#5fa5db', '#65b68b', '#e0a84c', '#b67edb', '#ff7a5a'];
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function defaultValues(
  initial?: Partial<HabitFormValues>,
  preferences?: HabitPreferences,
): HabitFormValues {
  const reminderMasterEnabled = preferences?.reminderMasterEnabled ?? true;
  const defaultReminderEnabled = preferences?.defaultReminderEnabled ?? false;
  const defaultReminderTime = preferences?.defaultReminderTime ?? getDefaultReminderTime();
  const initialReminderEnabled = initial?.reminderEnabled;
  const reminderEnabled = reminderMasterEnabled
    ? (initialReminderEnabled ?? defaultReminderEnabled)
    : false;

  return {
    name: initial?.name ?? '',
    question: initial?.question ?? '',
    type: initial?.type ?? 'yes_no',
    color: initial?.color ?? '#e88795',
    unit: initial?.unit ?? null,
    dailyTarget: initial?.dailyTarget ?? null,
    frequencyType: initial?.frequencyType ?? 'daily',
    frequencyDays: initial?.frequencyDays ?? [],
    reminderEnabled,
    reminderTime: reminderEnabled
      ? (initial?.reminderTime ?? defaultReminderTime)
      : null,
    notes: initial?.notes ?? '',
    startDate: initial?.startDate ?? dayjs().format('YYYY-MM-DD'),
  };
}

function getDefaultReminderTime(): string {
  return dayjs().add(1, 'hour').minute(0).format('HH:mm');
}

export function HabitForm({
  initialValues,
  submitLabel = 'Save',
  submitting = false,
  onSubmit,
}: HabitFormProps) {
  const borderColor = useThemeColor({}, 'border');
  const surface = useThemeColor({}, 'surface');
  const text = useThemeColor({}, 'text');
  const tint = useThemeColor({}, 'tint');
  const textSecondary = useThemeColor({}, 'textSecondary');
  const danger = useThemeColor({}, 'danger');
  const preferences = useHabitPreferences().data;
  const reminderMasterEnabled = preferences?.reminderMasterEnabled ?? true;

  const [targetInput, setTargetInput] = useState(
    initialValues?.dailyTarget !== null && initialValues?.dailyTarget !== undefined
      ? String(initialValues.dailyTarget)
      : ''
  );

  const {
    control,
    watch,
    setValue,
    handleSubmit,
    reset,
    formState: { errors, isDirty },
  } = useForm<HabitFormValues>({
    resolver: zodResolver(createHabitSchema),
    defaultValues: defaultValues(initialValues, preferences),
  });

  useEffect(() => {
    if (isDirty) return;
    reset(defaultValues(initialValues, preferences));
    setTargetInput(
      initialValues?.dailyTarget !== null && initialValues?.dailyTarget !== undefined
        ? String(initialValues.dailyTarget)
        : ''
    );
  }, [initialValues, isDirty, preferences, reset]);

  useEffect(() => {
    if (reminderMasterEnabled) return;
    setValue('reminderEnabled', false, { shouldValidate: true });
    setValue('reminderTime', null, { shouldValidate: true });
  }, [reminderMasterEnabled, setValue]);

  const selectedType = watch('type');
  const selectedFrequency = watch('frequencyType');
  const reminderEnabled = watch('reminderEnabled');
  const reminderTime = watch('reminderTime');
  const selectedWeekdays = watch('frequencyDays') ?? [];

  return (
    <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
      <ThemedText style={[styles.label, { color: textSecondary }]}>Name</ThemedText>
      <Controller
        control={control}
        name="name"
        render={({ field: { onChange, value } }) => (
          <TextInput
            style={[styles.input, { borderColor, backgroundColor: surface, color: text }]}
            placeholder="e.g. Exercise"
            placeholderTextColor={textSecondary}
            value={value}
            onChangeText={onChange}
          />
        )}
      />
      {errors.name && <ThemedText style={[styles.errorText, { color: danger }]}>{errors.name.message}</ThemedText>}

      <ThemedText style={[styles.label, { color: textSecondary }]}>Question</ThemedText>
      <Controller
        control={control}
        name="question"
        render={({ field: { onChange, value } }) => (
          <TextInput
            style={[styles.input, styles.multilineInput, { borderColor, backgroundColor: surface, color: text }]}
            placeholder="e.g. Did you exercise today?"
            placeholderTextColor={textSecondary}
            value={value}
            onChangeText={onChange}
            multiline
          />
        )}
      />
      {errors.question && (
        <ThemedText style={[styles.errorText, { color: danger }]}>{errors.question.message}</ThemedText>
      )}

      <ThemedText style={[styles.label, { color: textSecondary }]}>Type</ThemedText>
      <Controller
        control={control}
        name="type"
        render={({ field: { onChange, value } }) => (
          <View style={styles.chipRow}>
            {([
              { value: 'yes_no' as const, label: 'Yes or No' },
              { value: 'measurable' as const, label: 'Measurable' },
            ]).map((option) => (
              <Pressable
                key={option.value}
                onPress={() => {
                  Haptics.selectionAsync();
                  onChange(option.value);
                }}
                style={[
                  styles.chip,
                  {
                    borderColor: value === option.value ? tint : borderColor,
                    backgroundColor: value === option.value ? `${tint}1F` : surface,
                  },
                ]}
              >
                <ThemedText style={value === option.value ? { color: tint } : undefined}>
                  {option.label}
                </ThemedText>
              </Pressable>
            ))}
          </View>
        )}
      />

      <ThemedText style={[styles.label, { color: textSecondary }]}>Color</ThemedText>
      <Controller
        control={control}
        name="color"
        render={({ field: { onChange, value } }) => (
          <View style={styles.colorRow}>
            {COLOR_OPTIONS.map((color) => (
              <Pressable
                key={color}
                onPress={() => {
                  Haptics.selectionAsync();
                  onChange(color);
                }}
                style={[
                  styles.colorSwatch,
                  { backgroundColor: color, borderColor: value === color ? tint : borderColor },
                  value === color && styles.colorSwatchSelected,
                ]}
              />
            ))}
          </View>
        )}
      />

      {selectedType === 'measurable' ? (
        <>
          <ThemedText style={[styles.label, { color: textSecondary }]}>Unit</ThemedText>
          <Controller
            control={control}
            name="unit"
            render={({ field: { onChange, value } }) => (
              <TextInput
                style={[styles.input, { borderColor, backgroundColor: surface, color: text }]}
                placeholder="e.g. km, pages, reps"
                placeholderTextColor={textSecondary}
                value={value ?? ''}
                onChangeText={(next) => onChange(next.length > 0 ? next : null)}
              />
            )}
          />

          <ThemedText style={[styles.label, { color: textSecondary }]}>Daily Target</ThemedText>
          <Controller
            control={control}
            name="dailyTarget"
            render={({ field: { onChange } }) => (
              <TextInput
                style={[styles.input, { borderColor, backgroundColor: surface, color: text }]}
                placeholder="e.g. 5"
                placeholderTextColor={textSecondary}
                keyboardType="number-pad"
                value={targetInput}
                onChangeText={(next) => {
                  if (!/^\d*$/.test(next)) return;
                  setTargetInput(next);
                  if (!next) {
                    onChange(null);
                    return;
                  }
                  onChange(Number.parseInt(next, 10));
                }}
              />
            )}
          />
          {errors.dailyTarget && (
            <ThemedText style={[styles.errorText, { color: danger }]}>{errors.dailyTarget.message}</ThemedText>
          )}
        </>
      ) : null}

      <ThemedText style={[styles.label, { color: textSecondary }]}>Frequency</ThemedText>
      <Controller
        control={control}
        name="frequencyType"
        render={({ field: { onChange, value } }) => (
          <View style={styles.chipRow}>
            {([
              { value: 'daily' as const, label: 'Every day' },
              { value: 'weekdays' as const, label: 'Select weekdays' },
            ]).map((option) => (
              <Pressable
                key={option.value}
                onPress={() => {
                  Haptics.selectionAsync();
                  onChange(option.value);
                }}
                style={[
                  styles.chip,
                  {
                    borderColor: value === option.value ? tint : borderColor,
                    backgroundColor: value === option.value ? `${tint}1F` : surface,
                  },
                ]}
              >
                <ThemedText style={value === option.value ? { color: tint } : undefined}>
                  {option.label}
                </ThemedText>
              </Pressable>
            ))}
          </View>
        )}
      />

      {selectedFrequency === 'weekdays' ? (
        <Controller
          control={control}
          name="frequencyDays"
          render={() => (
            <View style={styles.chipRow}>
              {WEEKDAYS.map((day, index) => {
                const selected = selectedWeekdays.includes(index);
                return (
                  <Pressable
                    key={day}
                    onPress={() => {
                      Haptics.selectionAsync();
                      const next = selected
                        ? selectedWeekdays.filter((value) => value !== index)
                        : [...selectedWeekdays, index].sort((a, b) => a - b);
                      setValue('frequencyDays', next, { shouldValidate: true });
                    }}
                    style={[
                      styles.dayChip,
                      {
                        borderColor: selected ? tint : borderColor,
                        backgroundColor: selected ? `${tint}1F` : surface,
                      },
                    ]}
                  >
                    <ThemedText style={selected ? { color: tint } : undefined}>{day}</ThemedText>
                  </Pressable>
                );
              })}
            </View>
          )}
        />
      ) : null}
      {errors.frequencyDays && (
        <ThemedText style={[styles.errorText, { color: danger }]}>{errors.frequencyDays.message}</ThemedText>
      )}

      <ThemedText style={[styles.label, { color: textSecondary }]}>Reminder</ThemedText>
      {reminderMasterEnabled ? (
        <>
          <Controller
            control={control}
            name="reminderEnabled"
            render={({ field: { value } }) => (
              <View style={[styles.switchRow, { borderColor, backgroundColor: surface }]}>
                <ThemedText>{value ? 'Enabled' : 'Off'}</ThemedText>
                <Switch
                  value={value}
                  onValueChange={(next) => {
                    Haptics.selectionAsync();
                    setValue('reminderEnabled', next, { shouldValidate: true });
                    if (next && !reminderTime) {
                      setValue('reminderTime', preferences?.defaultReminderTime ?? getDefaultReminderTime(), { shouldValidate: true });
                    }
                    if (!next) {
                      setValue('reminderTime', null, { shouldValidate: true });
                    }
                  }}
                />
              </View>
            )}
          />

          {reminderEnabled ? (
            <Controller
              control={control}
              name="reminderTime"
              render={({ field: { onChange, value } }) => (
                <ReminderTimePickerField value={value ?? null} onChange={onChange} />
              )}
            />
          ) : null}
          {errors.reminderTime && (
            <ThemedText style={[styles.errorText, { color: danger }]}>{errors.reminderTime.message}</ThemedText>
          )}
        </>
      ) : (
        <View style={[styles.switchRow, { borderColor, backgroundColor: surface }]}>
          <ThemedText style={{ color: textSecondary }}>
            Habit reminders are disabled in Settings.
          </ThemedText>
        </View>
      )}

      <ThemedText style={[styles.label, { color: textSecondary }]}>Start Date</ThemedText>
      <Controller
        control={control}
        name="startDate"
        render={({ field: { onChange, value } }) => (
          <DatePickerField
            value={value}
            onChange={onChange}
            weekStartPreference={preferences?.weekStart ?? 'device'}
          />
        )}
      />

      <ThemedText style={[styles.label, { color: textSecondary }]}>Notes</ThemedText>
      <Controller
        control={control}
        name="notes"
        render={({ field: { onChange, value } }) => (
          <TextInput
            style={[styles.input, styles.multilineInput, { borderColor, backgroundColor: surface, color: text }]}
            placeholder="Optional notes"
            placeholderTextColor={textSecondary}
            value={value}
            onChangeText={onChange}
            multiline
          />
        )}
      />

      <Pressable
        disabled={submitting}
        onPress={handleSubmit((values) => {
          const normalized: HabitSubmitValues = {
            ...values,
            unit: values.type === 'measurable' ? values.unit ?? null : null,
            dailyTarget:
              values.type === 'measurable'
                ? values.dailyTarget ?? null
                : null,
            frequencyDays: values.frequencyType === 'daily' ? undefined : values.frequencyDays ?? [],
            reminderEnabled: values.reminderEnabled ?? false,
            reminderTime: (values.reminderEnabled ?? false) ? values.reminderTime ?? null : null,
            notes: values.notes ?? '',
          };
          onSubmit(normalized);
        })}
        style={[
          styles.submitButton,
          {
            backgroundColor: submitting ? borderColor : tint,
          },
        ]}
      >
        <ThemedText style={styles.submitText}>
          {submitting ? 'Saving...' : submitLabel}
        </ThemedText>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    paddingBottom: 32,
  },
  label: {
    marginTop: 12,
    marginBottom: 6,
    fontSize: 13,
    fontWeight: '600',
  },
  input: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
  },
  multilineInput: {
    minHeight: 74,
    textAlignVertical: 'top',
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  dayChip: {
    borderWidth: 1,
    borderRadius: 8,
    minWidth: 46,
    alignItems: 'center',
    paddingVertical: 8,
  },
  colorRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  colorSwatch: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 1,
  },
  colorSwatchSelected: {
    transform: [{ scale: 1.08 }],
  },
  switchRow: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  submitButton: {
    marginTop: 22,
    borderRadius: 12,
    paddingVertical: 13,
    alignItems: 'center',
  },
  submitText: {
    color: '#fff',
    fontWeight: '700',
  },
  errorText: {
    fontSize: 12,
    marginTop: 4,
  },
});
