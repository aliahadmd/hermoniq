import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import {
  HABIT_CARD_HORIZONTAL_MARGIN,
  HABIT_CARD_HORIZONTAL_PADDING,
  HABIT_DAY_CELL_GAP,
  HABIT_DAY_CELL_SIZE,
  HABIT_INFO_COLUMN_WIDTH,
  HABIT_INFO_TO_DAYS_GAP,
  HabitRow,
} from '@/components/habit-tracker/habit-row';
import { HabitTypePicker } from '@/components/habit-tracker/habit-type-picker';
import { MeasurableLogModal } from '@/components/habit-tracker/measurable-log-modal';
import { YesNoLogModal } from '@/components/habit-tracker/yes-no-log-modal';
import {
  useDeleteHabitLog,
  useHabitPreferences,
  useHabitsList,
  useUpsertHabitLog,
} from '@/hooks/use-habits';
import { useThemeColor } from '@/hooks/use-theme-color';
import type { HabitListFilter, HabitListItem, HabitType } from '@/lib/types';

type MeasurableLogState = {
  visible: boolean;
  habit: HabitListItem | null;
  date: string;
  value: number | null;
  note: string;
  hasLog: boolean;
};

type YesNoLogState = {
  visible: boolean;
  habit: HabitListItem | null;
  date: string;
  completed: boolean;
  note: string;
  hasLog: boolean;
};

const FILTER_OPTIONS: { key: HabitListFilter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'due_today', label: 'Due Today' },
  { key: 'completed_today', label: 'Completed Today' },
];

export default function HabitTrackerScreen() {
  const router = useRouter();
  const headerScrollRef = useRef<ScrollView>(null);
  const tint = useThemeColor({}, 'tint');
  const text = useThemeColor({}, 'text');
  const textSecondary = useThemeColor({}, 'textSecondary');
  const borderColor = useThemeColor({}, 'border');
  const surface = useThemeColor({}, 'surface');

  const preferencesQuery = useHabitPreferences();
  const preferences = preferencesQuery.data;
  const [filter, setFilter] = useState<HabitListFilter>('all');
  const [includeArchived, setIncludeArchived] = useState(false);
  const [initializedFromPreferences, setInitializedFromPreferences] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [typePickerVisible, setTypePickerVisible] = useState(false);
  const [dayScrollX, setDayScrollX] = useState(0);
  const [headerViewportWidth, setHeaderViewportWidth] = useState(0);
  const [yesNoLog, setYesNoLog] = useState<YesNoLogState>({
    visible: false,
    habit: null,
    date: '',
    completed: false,
    note: '',
    hasLog: false,
  });
  const [measurableLog, setMeasurableLog] = useState<MeasurableLogState>({
    visible: false,
    habit: null,
    date: '',
    value: null,
    note: '',
    hasLog: false,
  });

  const dayWindow = preferences?.timelineDays ?? 30;
  const requireNoteForCompletion = preferences?.requireNoteForCompletion ?? false;
  const listQuery = useHabitsList({ filter, includeArchived, days: dayWindow });
  const upsertLog = useUpsertHabitLog();
  const deleteLog = useDeleteHabitLog();

  const listData = listQuery.data;
  const items = listData?.items ?? [];

  const isBusy = useMemo(
    () => upsertLog.isPending || deleteLog.isPending,
    [deleteLog.isPending, upsertLog.isPending]
  );
  const refreshing = listQuery.isRefetching || preferencesQuery.isRefetching;

  const refreshAll = useCallback(() => {
    listQuery.refetch();
    preferencesQuery.refetch();
  }, [listQuery, preferencesQuery]);

  useEffect(() => {
    if (!preferences || initializedFromPreferences) return;
    setFilter(preferences.defaultFilter);
    setIncludeArchived(preferences.showArchivedByDefault);
    setInitializedFromPreferences(true);
  }, [initializedFromPreferences, preferences]);

  const handleTypeSelect = (type: HabitType) => {
    setTypePickerVisible(false);
    router.push({ pathname: '/habits/create', params: { type } });
  };

  const handleOpenYesNo = (
    item: HabitListItem,
    date: string,
    currentCompleted: boolean,
    currentNote: string,
    hasLog: boolean,
  ) => {
    setYesNoLog({
      visible: true,
      habit: item,
      date,
      completed: currentCompleted,
      note: currentNote,
      hasLog,
    });
  };

  const closeYesNo = () => {
    setYesNoLog({
      visible: false,
      habit: null,
      date: '',
      completed: false,
      note: '',
      hasLog: false,
    });
  };

  const saveYesNoLog = (completed: boolean, note: string) => {
    const habit = yesNoLog.habit;
    if (!habit) return;

    upsertLog.mutate(
      { id: habit.id, data: { date: yesNoLog.date, completed, note } },
      {
        onSuccess: closeYesNo,
        onError: (error) => Alert.alert('Error', error.message),
      },
    );
  };

  const clearYesNoLog = () => {
    const habit = yesNoLog.habit;
    if (!habit) return;

    deleteLog.mutate(
      { id: habit.id, date: yesNoLog.date },
      {
        onSuccess: closeYesNo,
        onError: (error) => Alert.alert('Error', error.message),
      },
    );
  };

  const handleOpenMeasurable = (
    item: HabitListItem,
    date: string,
    currentValue: number | null,
    currentNote: string,
    hasLog: boolean,
  ) => {
    setMeasurableLog({
      visible: true,
      habit: item,
      date,
      value: currentValue,
      note: currentNote,
      hasLog,
    });
  };

  const closeMeasurable = () => {
    setMeasurableLog({
      visible: false,
      habit: null,
      date: '',
      value: null,
      note: '',
      hasLog: false,
    });
  };

  const saveMeasurableValue = (value: number, note: string) => {
    const habit = measurableLog.habit;
    if (!habit) return;

    upsertLog.mutate(
      { id: habit.id, data: { date: measurableLog.date, value, note } },
      {
        onSuccess: closeMeasurable,
        onError: (error) => Alert.alert('Error', error.message),
      },
    );
  };

  const clearMeasurableValue = () => {
    const habit = measurableLog.habit;
    if (!habit) return;

    deleteLog.mutate(
      { id: habit.id, date: measurableLog.date },
      {
        onSuccess: closeMeasurable,
        onError: (error) => Alert.alert('Error', error.message),
      },
    );
  };

  const openHabitDetails = (item: HabitListItem) => {
    router.push(`/habits/${item.id}`);
  };

  const handlePressTodayDot = (item: HabitListItem) => {
    const todayCell = item.dayCells[item.dayCells.length - 1];
    if (!todayCell || !todayCell.scheduled) {
      Alert.alert('Not scheduled today', 'This habit is not scheduled for today.');
      return;
    }

    if (item.type === 'yes_no') {
      handleOpenYesNo(item, todayCell.date, todayCell.completed, todayCell.note, todayCell.hasLog);
      return;
    }

    handleOpenMeasurable(item, todayCell.date, todayCell.value, todayCell.note, todayCell.hasLog);
  };

  if (listQuery.isLoading) {
    return (
      <ThemedView style={styles.container}>
        <SafeAreaView style={styles.centered} edges={['top']}>
          <ActivityIndicator size="large" color={tint} />
        </SafeAreaView>
      </ThemedView>
    );
  }

  if (listQuery.error) {
    return (
      <ThemedView style={styles.container}>
        <SafeAreaView style={styles.centered} edges={['top']}>
          <ThemedText>Failed to load habits</ThemedText>
          <ThemedText style={{ color: textSecondary, marginTop: 4, fontSize: 13 }}>
            {listQuery.error.message}
          </ThemedText>
        </SafeAreaView>
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.header}>
          <View style={styles.headerActions}>
            <Pressable
              onPress={() => {
                Haptics.selectionAsync();
                setShowFilters((prev) => !prev);
              }}
              hitSlop={8}
              style={styles.iconButton}
            >
              <Ionicons name="funnel-outline" size={20} color={text} />
            </Pressable>
          </View>
        </View>

        <Pressable
          onPress={() => {
            Haptics.selectionAsync();
            setIncludeArchived((prev) => !prev);
          }}
          style={[styles.archiveNotice, { borderColor, backgroundColor: surface }]}
        >
          <ThemedText style={{ color: textSecondary, fontSize: 12 }}>
            Archived habits: {includeArchived ? 'Visible' : 'Hidden'} (tap to toggle)
          </ThemedText>
        </Pressable>

        {showFilters ? (
          <View style={styles.filterRow}>
            {FILTER_OPTIONS.map((option) => {
              const selected = filter === option.key;
              return (
                <Pressable
                  key={option.key}
                  onPress={() => {
                    Haptics.selectionAsync();
                    setFilter(option.key);
                  }}
                  style={[
                    styles.filterChip,
                    {
                      borderColor: selected ? tint : borderColor,
                      backgroundColor: selected ? `${tint}1F` : surface,
                    },
                  ]}
                >
                  <ThemedText style={selected ? { color: tint } : undefined}>
                    {option.label}
                  </ThemedText>
                </Pressable>
              );
            })}
          </View>
        ) : null}

        <View style={styles.daysHeaderWrap}>
          <View style={styles.daysHeaderSpacer} />
          <ScrollView
            horizontal
            ref={headerScrollRef}
            showsHorizontalScrollIndicator={false}
            onLayout={(event) => {
              setHeaderViewportWidth(event.nativeEvent.layout.width);
            }}
            onScroll={(event) => {
              setDayScrollX(event.nativeEvent.contentOffset.x);
            }}
            scrollEventThrottle={16}
            onContentSizeChange={(contentWidth) => {
              const maxX = Math.max(0, contentWidth - headerViewportWidth);
              setDayScrollX(maxX);
              headerScrollRef.current?.scrollTo({ x: maxX, animated: false });
            }}
            contentContainerStyle={styles.daysHeaderRow}
          >
            {(listData?.headers ?? []).map((header) => (
              <View key={header.date} style={styles.dayHeaderCell}>
                <ThemedText style={{ color: textSecondary, fontSize: 11 }}>{header.weekday}</ThemedText>
                <ThemedText style={{ color: textSecondary, fontSize: 11 }}>{header.dayOfMonth}</ThemedText>
              </View>
            ))}
          </ScrollView>
        </View>

        <FlatList
          data={items}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={refreshAll} tintColor={tint} />
          }
          renderItem={({ item }) => (
            <HabitRow
              item={item}
              dayScrollX={dayScrollX}
              onPressHabit={openHabitDetails}
              onPressTodayDot={handlePressTodayDot}
              onOpenYesNo={handleOpenYesNo}
              onOpenMeasurable={handleOpenMeasurable}
            />
          )}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <ThemedText style={{ color: textSecondary }}>
                No habits yet. Tap + to create your first one.
              </ThemedText>
            </View>
          }
        />

        <Pressable
          onPress={() => {
            Haptics.selectionAsync();
            setTypePickerVisible(true);
          }}
          style={[styles.fab, { backgroundColor: tint }]}
          accessibilityRole="button"
          accessibilityLabel="Create habit"
        >
          <ThemedText style={styles.fabText}>+</ThemedText>
        </Pressable>

        <HabitTypePicker
          visible={typePickerVisible}
          onClose={() => setTypePickerVisible(false)}
          onSelect={handleTypeSelect}
        />

        <YesNoLogModal
          visible={yesNoLog.visible}
          habitName={yesNoLog.habit?.name ?? ''}
          question={yesNoLog.habit?.question ?? ''}
          date={yesNoLog.date}
          initialCompleted={yesNoLog.completed}
          initialNote={yesNoLog.note}
          requireNoteForCompletion={requireNoteForCompletion}
          onClose={closeYesNo}
          onSave={saveYesNoLog}
          onClear={yesNoLog.hasLog ? clearYesNoLog : undefined}
        />

        <MeasurableLogModal
          visible={measurableLog.visible}
          habitName={measurableLog.habit?.name ?? ''}
          date={measurableLog.date}
          unit={measurableLog.habit?.unit}
          target={measurableLog.habit?.dailyTarget}
          initialValue={measurableLog.value}
          initialNote={measurableLog.note}
          requireNoteForCompletion={requireNoteForCompletion}
          onClose={closeMeasurable}
          onSave={saveMeasurableValue}
          onClear={measurableLog.hasLog ? clearMeasurableValue : undefined}
        />

        {isBusy ? (
          <View style={[styles.loadingOverlay, { backgroundColor: 'rgba(0,0,0,0.14)' }]}>
            <ActivityIndicator color={tint} />
          </View>
        ) : null}
      </SafeAreaView>
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
  header: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 8,
  },
  headerActions: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
  },
  iconButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  archiveNotice: {
    marginHorizontal: 16,
    marginBottom: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  filterRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    paddingHorizontal: 16,
    marginBottom: 10,
  },
  filterChip: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  daysHeaderWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: HABIT_CARD_HORIZONTAL_MARGIN + HABIT_CARD_HORIZONTAL_PADDING,
    marginBottom: 8,
  },
  daysHeaderSpacer: {
    width: HABIT_INFO_COLUMN_WIDTH + HABIT_INFO_TO_DAYS_GAP,
    flexShrink: 0,
  },
  daysHeaderRow: {
    flexDirection: 'row',
    gap: HABIT_DAY_CELL_GAP,
  },
  dayHeaderCell: {
    width: HABIT_DAY_CELL_SIZE,
    alignItems: 'center',
  },
  listContent: {
    paddingBottom: 120,
  },
  emptyState: {
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 40,
  },
  fab: {
    position: 'absolute',
    right: 20,
    bottom: 24,
    width: 56,
    height: 56,
    borderRadius: 28,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000000',
    shadowOpacity: 0.18,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 5,
  },
  fabText: {
    color: '#fff',
    fontSize: 28,
    fontWeight: '600',
    lineHeight: 30,
  },
  loadingOverlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
