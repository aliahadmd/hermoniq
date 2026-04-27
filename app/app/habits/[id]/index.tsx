import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import dayjs from 'dayjs';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { HabitScoreChart } from '@/components/habit-tracker/habit-score-chart';
import { HabitHistoryChart } from '@/components/habit-tracker/habit-history-chart';
import { HabitCalendar } from '@/components/habit-tracker/habit-calendar';
import { StreakBar } from '@/components/habit-tracker/streak-bar';
import { WeekdayFrequencyChart } from '@/components/habit-tracker/weekday-frequency-chart';
import { MeasurableLogModal } from '@/components/habit-tracker/measurable-log-modal';
import { YesNoLogModal } from '@/components/habit-tracker/yes-no-log-modal';
import {
  useArchiveHabit,
  useDeleteHabitLog,
  useHardDeleteHabit,
  useHabitPreferences,
  useHabitInsights,
  useRestoreHabit,
  useUpsertHabitLog,
} from '@/hooks/use-habits';
import { useThemeColor } from '@/hooks/use-theme-color';
import type { HabitCalendarDay, HabitInsightsRange } from '@/lib/types';

function resolveId(rawId: string | string[] | undefined): string {
  return Array.isArray(rawId) ? rawId[0] : (rawId ?? '');
}

const RANGE_OPTIONS: HabitInsightsRange[] = ['week', 'month', 'year'];
const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export default function HabitDetailScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string }>();
  const id = resolveId(params.id);

  const tint = useThemeColor({}, 'tint');
  const borderColor = useThemeColor({}, 'border');
  const surface = useThemeColor({}, 'surface');
  const textSecondary = useThemeColor({}, 'textSecondary');
  const danger = useThemeColor({}, 'danger');

  const [range, setRange] = useState<HabitInsightsRange>('week');
  const [calendarMonth, setCalendarMonth] = useState(() => dayjs().format('YYYY-MM'));
  const [yesNoState, setYesNoState] = useState<{
    visible: boolean;
    day: HabitCalendarDay | null;
  }>({ visible: false, day: null });
  const [measurableState, setMeasurableState] = useState<{
    visible: boolean;
    day: HabitCalendarDay | null;
  }>({ visible: false, day: null });

  const preferencesQuery = useHabitPreferences();
  const insightsQuery = useHabitInsights(id, range, calendarMonth);
  const upsertLog = useUpsertHabitLog();
  const deleteLog = useDeleteHabitLog();
  const archiveHabit = useArchiveHabit();
  const restoreHabit = useRestoreHabit();
  const hardDeleteHabit = useHardDeleteHabit();

  const insights = insightsQuery.data;
  const habit = insights?.habit;
  const weekStartPreference = preferencesQuery.data?.weekStart ?? 'device';
  const requireNoteForCompletion = preferencesQuery.data?.requireNoteForCompletion ?? false;
  const isBusy =
    upsertLog.isPending ||
    deleteLog.isPending ||
    archiveHabit.isPending ||
    restoreHabit.isPending ||
    hardDeleteHabit.isPending;

  const frequencySummary = useMemo(() => {
    if (!habit) return '';
    if (habit.frequencyType === 'daily') return 'Every day';
    const labels = habit.frequencyDays.map((day) => WEEKDAY_LABELS[day]).join(', ');
    return labels.length > 0 ? labels : 'Custom weekdays';
  }, [habit]);

  const reminderSummary = useMemo(() => {
    if (!habit) return '';
    if (!habit.reminderEnabled) return 'Reminder off';
    return habit.reminderTime ? `Reminder ${habit.reminderTime}` : 'Reminder enabled';
  }, [habit]);

  const handleDaySelect = (day: HabitCalendarDay) => {
    if (!habit || !day.scheduled) return;
    Haptics.selectionAsync();

    if (habit.type === 'yes_no') {
      setYesNoState({ visible: true, day });
      return;
    }

    setMeasurableState({ visible: true, day });
  };

  const openActions = () => {
    if (!habit) return;
    const archiveLabel = habit.archivedAt ? 'Restore Habit' : 'Archive Habit';

    Alert.alert('Habit Actions', 'Choose an action', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: archiveLabel,
        onPress: () => {
          if (habit.archivedAt) {
            restoreHabit.mutate(habit.id, {
              onError: (error) => Alert.alert('Error', error.message),
            });
            return;
          }

          archiveHabit.mutate(habit.id, {
            onSuccess: () => router.replace('/(tabs)/habit-tracker'),
            onError: (error) => Alert.alert('Error', error.message),
          });
        },
      },
      {
        text: 'Delete Permanently',
        style: 'destructive',
        onPress: () => {
          hardDeleteHabit.mutate(habit.id, {
            onSuccess: () => router.replace('/(tabs)/habit-tracker'),
            onError: (error) => Alert.alert('Error', error.message),
          });
        },
      },
    ]);
  };

  if (insightsQuery.isLoading) {
    return (
      <ThemedView style={styles.centered}>
        <ActivityIndicator size="large" color={tint} />
      </ThemedView>
    );
  }

  if (insightsQuery.error || !insights || !habit) {
    return (
      <ThemedView style={styles.centered}>
        <ThemedText>Failed to load habit details</ThemedText>
        <ThemedText style={{ color: textSecondary, marginTop: 4, fontSize: 13 }}>
          {insightsQuery.error?.message ?? 'Habit not found'}
        </ThemedText>
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={styles.topRow}>
          <View style={styles.titleWrap}>
            <ThemedText type="subtitle">{habit.name}</ThemedText>
            <ThemedText style={{ color: habit.color, marginTop: 4 }}>{habit.question}</ThemedText>
            <ThemedText style={{ color: textSecondary, fontSize: 13, marginTop: 4 }}>
              {frequencySummary} · {reminderSummary}
            </ThemedText>
          </View>
          <View style={styles.topActions}>
            <Pressable
              onPress={() => router.push(`/habits/${habit.id}/edit`)}
              hitSlop={8}
              style={styles.iconButton}
            >
              <Ionicons name="pencil-outline" size={20} color={tint} />
            </Pressable>
            <Pressable onPress={openActions} hitSlop={8} style={styles.iconButton}>
              <Ionicons name="ellipsis-vertical" size={20} color={tint} />
            </Pressable>
          </View>
        </View>

        <View style={[styles.overviewCard, { borderColor, backgroundColor: surface }]}>
          <ThemedText type="defaultSemiBold" style={{ marginBottom: 8 }}>
            Overview
          </ThemedText>
          <View style={styles.overviewGrid}>
            <View style={styles.overviewItem}>
              <ThemedText style={{ color: habit.color, fontSize: 22 }}>
                {insights.overview.scorePercent}%
              </ThemedText>
              <ThemedText style={{ color: textSecondary }}>Score</ThemedText>
            </View>
            <View style={styles.overviewItem}>
              <ThemedText style={{ color: habit.color, fontSize: 22 }}>
                +{insights.overview.monthPercent}%
              </ThemedText>
              <ThemedText style={{ color: textSecondary }}>Month</ThemedText>
            </View>
            <View style={styles.overviewItem}>
              <ThemedText style={{ color: habit.color, fontSize: 22 }}>
                +{insights.overview.yearPercent}%
              </ThemedText>
              <ThemedText style={{ color: textSecondary }}>Year</ThemedText>
            </View>
            <View style={styles.overviewItem}>
              <ThemedText style={{ color: habit.color, fontSize: 22 }}>
                {insights.overview.totalCompleted}
              </ThemedText>
              <ThemedText style={{ color: textSecondary }}>Total</ThemedText>
            </View>
          </View>
        </View>

        <View style={styles.rangeSelector}>
          {RANGE_OPTIONS.map((option) => {
            const selected = range === option;
            return (
              <Pressable
                key={option}
                onPress={() => {
                  Haptics.selectionAsync();
                  setRange(option);
                }}
                style={[
                  styles.rangeChip,
                  {
                    borderColor: selected ? habit.color : borderColor,
                    backgroundColor: selected ? `${habit.color}1F` : surface,
                  },
                ]}
              >
                <ThemedText style={selected ? { color: habit.color } : undefined}>
                  {option[0].toUpperCase() + option.slice(1)}
                </ThemedText>
              </Pressable>
            );
          })}
        </View>

        <HabitScoreChart data={insights.scoreSeries} color={habit.color} title="Score" />
        <HabitHistoryChart data={insights.historySeries} color={habit.color} title="History" />
        <HabitCalendar
          month={insights.calendar.month}
          days={insights.calendar.days}
          color={habit.color}
          weekStartPreference={weekStartPreference}
          onPrevMonth={() =>
            setCalendarMonth((current) => dayjs(`${current}-01`).subtract(1, 'month').format('YYYY-MM'))
          }
          onNextMonth={() =>
            setCalendarMonth((current) => dayjs(`${current}-01`).add(1, 'month').format('YYYY-MM'))
          }
          onSelectDay={handleDaySelect}
        />
        <StreakBar streak={insights.streak} color={habit.color} />
        <WeekdayFrequencyChart data={insights.weekdayFrequency} color={habit.color} />
      </ScrollView>

      <MeasurableLogModal
        visible={measurableState.visible}
        habitName={habit.name}
        date={measurableState.day?.date ?? ''}
        unit={habit.unit}
        target={habit.dailyTarget}
        initialValue={measurableState.day?.value ?? null}
        initialNote={measurableState.day?.note ?? ''}
        requireNoteForCompletion={requireNoteForCompletion}
        onClose={() => setMeasurableState({ visible: false, day: null })}
        onSave={(value, note) => {
          if (!measurableState.day) return;
          upsertLog.mutate(
            { id: habit.id, data: { date: measurableState.day.date, value, note } },
            {
              onSuccess: () => setMeasurableState({ visible: false, day: null }),
              onError: (error) => Alert.alert('Error', error.message),
            },
          );
        }}
        onClear={
          measurableState.day?.hasLog
            ? () => {
                if (!measurableState.day) return;
                deleteLog.mutate(
                  { id: habit.id, date: measurableState.day.date },
                  {
                    onSuccess: () => setMeasurableState({ visible: false, day: null }),
                    onError: (error) => Alert.alert('Error', error.message),
                  },
                );
              }
            : undefined
        }
      />

      <YesNoLogModal
        visible={yesNoState.visible}
        habitName={habit.name}
        question={habit.question}
        date={yesNoState.day?.date ?? ''}
        initialCompleted={yesNoState.day?.completed ?? false}
        initialNote={yesNoState.day?.note ?? ''}
        requireNoteForCompletion={requireNoteForCompletion}
        onClose={() => setYesNoState({ visible: false, day: null })}
        onSave={(completed, note) => {
          if (!yesNoState.day) return;
          upsertLog.mutate(
            { id: habit.id, data: { date: yesNoState.day.date, completed, note } },
            {
              onSuccess: () => setYesNoState({ visible: false, day: null }),
              onError: (error) => Alert.alert('Error', error.message),
            },
          );
        }}
        onClear={
          yesNoState.day?.hasLog
            ? () => {
                if (!yesNoState.day) return;
                deleteLog.mutate(
                  { id: habit.id, date: yesNoState.day.date },
                  {
                    onSuccess: () => setYesNoState({ visible: false, day: null }),
                    onError: (error) => Alert.alert('Error', error.message),
                  },
                );
              }
            : undefined
        }
      />

      {isBusy ? (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator color={tint} />
        </View>
      ) : null}

      {habit.archivedAt ? (
        <View style={[styles.archivedBanner, { borderColor: danger }]}>
          <ThemedText style={{ color: danger, fontSize: 12 }}>
            This habit is archived.
          </ThemedText>
        </View>
      ) : null}
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
    padding: 20,
  },
  scrollContent: {
    paddingVertical: 14,
    paddingBottom: 28,
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 10,
    paddingHorizontal: 16,
    marginBottom: 12,
  },
  titleWrap: {
    flex: 1,
  },
  topActions: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'flex-start',
  },
  iconButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  overviewCard: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 12,
    marginHorizontal: 16,
    marginBottom: 12,
    padding: 14,
  },
  overviewGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  overviewItem: {
    width: '50%',
    marginBottom: 8,
    gap: 2,
  },
  rangeSelector: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 16,
    marginBottom: 10,
  },
  rangeChip: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  loadingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.12)',
  },
  archivedBanner: {
    position: 'absolute',
    right: 12,
    top: 8,
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
});
