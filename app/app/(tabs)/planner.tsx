import { useMemo, useState, useCallback } from 'react';
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
import dayjs from 'dayjs';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useEvents, useImportIcsEvents } from '@/hooks/use-events';
import { useThemeColor } from '@/hooks/use-theme-color';
import { getDeviceTimezone } from '@/lib/planner-utils';
import type { EventItem } from '@/lib/types';

function monthRange(date: dayjs.Dayjs) {
  const from = date.startOf('month').subtract(7, 'day').startOf('day').toDate().toISOString();
  const to = date.endOf('month').add(7, 'day').endOf('day').toDate().toISOString();
  return { from, to };
}

function formatEventTime(item: EventItem): string {
  if (item.isAllDay) return 'All day';
  const start = dayjs(item.startAt).format('h:mm A');
  const end = dayjs(item.endAt).format('h:mm A');
  return `${start} - ${end}`;
}

export default function PlannerIndexScreen() {
  const router = useRouter();

  const text = useThemeColor({}, 'text');
  const textSecondary = useThemeColor({}, 'textSecondary');
  const border = useThemeColor({}, 'border');
  const card = useThemeColor({}, 'card');
  const surface = useThemeColor({}, 'surface');
  const tint = useThemeColor({}, 'tint');
  const danger = useThemeColor({}, 'danger');

  const [selectedDate, setSelectedDate] = useState(() => dayjs());
  const [fabOpen, setFabOpen] = useState(false);

  const range = useMemo(() => monthRange(selectedDate), [selectedDate]);
  const eventsQuery = useEvents({ from: range.from, to: range.to });
  const importIcs = useImportIcsEvents();

  const allEvents = useMemo(() => eventsQuery.data ?? [], [eventsQuery.data]);

  const selectedDayStart = selectedDate.startOf('day');
  const selectedDayEnd = selectedDate.endOf('day');

  const eventsForDay = useMemo(() => {
    return allEvents
      .filter((item) => {
        const startsBeforeEnd = dayjs(item.startAt).isBefore(selectedDayEnd);
        const endsAfterStart = dayjs(item.endAt).isAfter(selectedDayStart);
        return startsBeforeEnd && endsAfterStart;
      })
      .sort((a, b) => a.startAt.localeCompare(b.startAt));
  }, [allEvents, selectedDayEnd, selectedDayStart]);

  const weekStart = selectedDate.startOf('week');
  const weekDays = useMemo(
    () => Array.from({ length: 7 }, (_, index) => weekStart.add(index, 'day')),
    [weekStart],
  );

  const refreshAll = useCallback(() => {
    eventsQuery.refetch();
  }, [eventsQuery]);

  const importFromIcs = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['text/calendar', 'text/x-vcalendar', 'application/octet-stream'],
        copyToCacheDirectory: true,
        multiple: false,
      });

      if (result.canceled) return;
      const asset = result.assets?.[0];
      if (!asset?.uri) {
        Alert.alert('Import failed', 'Unable to read selected file.');
        return;
      }

      const ics = await FileSystem.readAsStringAsync(asset.uri);
      const summary = await importIcs.mutateAsync({
        ics,
        timezone: getDeviceTimezone(),
      });

      await eventsQuery.refetch();

      const warningText = summary.warnings.length > 0 ? `\n\nWarnings:\n${summary.warnings.join('\n')}` : '';
      Alert.alert(
        'Import complete',
        `Created: ${summary.createdCount}\nUpdated: ${summary.updatedCount}\nSkipped recurring: ${summary.skippedRecurringCount}\nSkipped invalid: ${summary.skippedInvalidCount}${warningText}`,
      );
    } catch (error) {
      Alert.alert('Import failed', error instanceof Error ? error.message : 'Unable to import ICS');
    } finally {
      setFabOpen(false);
    }
  };

  if (eventsQuery.isLoading && allEvents.length === 0) {
    return (
      <ThemedView style={styles.container}>
        <SafeAreaView style={styles.centered} edges={['top', 'bottom']}>
          <ActivityIndicator size="large" color={tint} />
        </SafeAreaView>
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
        <FlatList
          data={eventsForDay}
          keyExtractor={(item) => item.id}
          refreshControl={
            <RefreshControl
              refreshing={eventsQuery.isRefetching}
              onRefresh={refreshAll}
              tintColor={tint}
            />
          }
          contentContainerStyle={styles.listContent}
          ListHeaderComponent={
            <View style={styles.headerWrap}>
              <View style={styles.monthYearRow}>
                <View style={[styles.selectorGroup, { borderColor: border, backgroundColor: surface }]}>
                  <Pressable
                    onPress={() => setSelectedDate((prev) => prev.subtract(1, 'month'))}
                    style={styles.arrowButton}
                  >
                    <Ionicons name="chevron-back" size={18} color={tint} />
                  </Pressable>
                  <ThemedText type="defaultSemiBold" style={styles.selectorLabel}>
                    {selectedDate.format('MMMM')}
                  </ThemedText>
                  <Pressable
                    onPress={() => setSelectedDate((prev) => prev.add(1, 'month'))}
                    style={styles.arrowButton}
                  >
                    <Ionicons name="chevron-forward" size={18} color={tint} />
                  </Pressable>
                </View>

                <View style={[styles.selectorGroup, { borderColor: border, backgroundColor: surface }]}>
                  <Pressable
                    onPress={() => setSelectedDate((prev) => prev.subtract(1, 'year'))}
                    style={styles.arrowButton}
                  >
                    <Ionicons name="chevron-back" size={18} color={tint} />
                  </Pressable>
                  <ThemedText type="defaultSemiBold" style={styles.selectorLabel}>
                    {selectedDate.format('YYYY')}
                  </ThemedText>
                  <Pressable
                    onPress={() => setSelectedDate((prev) => prev.add(1, 'year'))}
                    style={styles.arrowButton}
                  >
                    <Ionicons name="chevron-forward" size={18} color={tint} />
                  </Pressable>
                </View>
              </View>

              <View style={styles.weekRowWrap}>
                <Pressable
                  onPress={() => setSelectedDate((prev) => prev.subtract(7, 'day'))}
                  style={styles.weekArrow}
                >
                  <Ionicons name="chevron-back" size={20} color={tint} />
                </Pressable>

                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.weekRow}>
                  {weekDays.map((day) => {
                    const selected = day.isSame(selectedDate, 'day');
                    return (
                      <Pressable
                        key={day.format('YYYY-MM-DD')}
                        onPress={() => setSelectedDate(day)}
                        style={[
                          styles.dayChip,
                          {
                            borderColor: selected ? tint : border,
                            backgroundColor: selected ? `${tint}1F` : surface,
                          },
                        ]}
                      >
                        <ThemedText style={{ color: selected ? tint : textSecondary, fontSize: 12 }}>
                          {day.format('ddd')}
                        </ThemedText>
                        <ThemedText type="defaultSemiBold" style={{ color: selected ? tint : text }}>
                          {day.format('D')}
                        </ThemedText>
                      </Pressable>
                    );
                  })}
                </ScrollView>

                <Pressable
                  onPress={() => setSelectedDate((prev) => prev.add(7, 'day'))}
                  style={styles.weekArrow}
                >
                  <Ionicons name="chevron-forward" size={20} color={tint} />
                </Pressable>
              </View>

              <View style={[styles.selectedDayHeader, { borderColor: border, backgroundColor: surface }]}> 
                <ThemedText type="defaultSemiBold">{selectedDate.format('dddd, MMMM D')}</ThemedText>
                <ThemedText style={{ color: textSecondary }}>
                  {eventsForDay.length === 0
                    ? 'No events for this day'
                    : `${eventsForDay.length} event${eventsForDay.length > 1 ? 's' : ''}`}
                </ThemedText>
              </View>

              {eventsQuery.error ? (
                <View style={[styles.errorCard, { borderColor: danger, backgroundColor: surface }]}> 
                  <ThemedText style={{ color: danger }}>Unable to refresh planner data.</ThemedText>
                  <ThemedText style={{ color: textSecondary, marginTop: 2, fontSize: 12 }}>
                    {eventsQuery.error.message}
                  </ThemedText>
                </View>
              ) : null}
            </View>
          }
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <ThemedText style={{ color: textSecondary }}>
                No events found for this day.
              </ThemedText>
            </View>
          }
          renderItem={({ item }) => (
            <Pressable
              onPress={() => router.push(`/planner/${item.id}/edit`)}
              style={[styles.eventCard, { borderColor: border, backgroundColor: card }]}
            >
              <View style={styles.eventHeader}>
                <ThemedText type="defaultSemiBold" style={styles.eventTitle} numberOfLines={1}>
                  {item.title}
                </ThemedText>
                <View style={[styles.timeBadge, { backgroundColor: `${tint}1A` }]}>
                  <ThemedText style={{ color: tint, fontSize: 12 }}>{formatEventTime(item)}</ThemedText>
                </View>
              </View>

              {item.location ? (
                <ThemedText style={{ color: textSecondary }} numberOfLines={1}>
                  {item.location}
                </ThemedText>
              ) : null}
              {item.description ? (
                <ThemedText style={{ color: textSecondary }} numberOfLines={2}>
                  {item.description}
                </ThemedText>
              ) : null}
              {item.reminderMinutes !== null ? (
                <ThemedText style={{ color: textSecondary, fontSize: 12 }}>
                  Reminder: {item.reminderMinutes === 0 ? 'At event time' : `${item.reminderMinutes} min before`}
                </ThemedText>
              ) : null}
            </Pressable>
          )}
        />

        {fabOpen ? (
          <View style={[styles.fabMenu, { borderColor: border, backgroundColor: card }]}> 
            <Pressable
              onPress={() => {
                setFabOpen(false);
                router.push({ pathname: '/planner/create', params: { date: selectedDate.format('YYYY-MM-DD') } });
              }}
              style={styles.fabMenuItem}
            >
              <Ionicons name="add-circle-outline" size={18} color={tint} />
              <ThemedText>New Event</ThemedText>
            </Pressable>
            <Pressable
              onPress={importFromIcs}
              style={styles.fabMenuItem}
              disabled={importIcs.isPending}
            >
              {importIcs.isPending ? (
                <ActivityIndicator size="small" color={tint} />
              ) : (
                <Ionicons name="cloud-upload-outline" size={18} color={tint} />
              )}
              <ThemedText>{importIcs.isPending ? 'Importing...' : 'Import .ics'}</ThemedText>
            </Pressable>
          </View>
        ) : null}

        <Pressable
          onPress={() => setFabOpen((prev) => !prev)}
          style={[styles.fab, { backgroundColor: tint }]}
          accessibilityRole="button"
          accessibilityLabel="Open planner quick actions"
        >
          {fabOpen ? (
            <Ionicons name="close" size={28} color="#ffffff" />
          ) : (
            <ThemedText style={styles.fabText}>+</ThemedText>
          )}
        </Pressable>
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
  },
  listContent: {
    paddingHorizontal: 14,
    paddingBottom: 120,
    gap: 10,
  },
  headerWrap: {
    paddingTop: 10,
    gap: 10,
  },
  monthYearRow: {
    flexDirection: 'row',
    gap: 8,
  },
  selectorGroup: {
    flex: 1,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 44,
  },
  selectorLabel: {
    fontSize: 15,
  },
  arrowButton: {
    width: 34,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
  },
  weekRowWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  weekArrow: {
    width: 30,
    height: 30,
    alignItems: 'center',
    justifyContent: 'center',
  },
  weekRow: {
    gap: 8,
    paddingHorizontal: 2,
  },
  dayChip: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 12,
    width: 56,
    minHeight: 66,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  selectedDayHeader: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 2,
  },
  errorCard: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 24,
  },
  eventCard: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 14,
    padding: 12,
    gap: 6,
  },
  eventHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  eventTitle: {
    flex: 1,
  },
  timeBadge: {
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  fab: {
    position: 'absolute',
    right: 20,
    bottom: 22,
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
  },
  fabText: {
    color: '#fff',
    fontSize: 28,
    fontWeight: '600',
    lineHeight: 30,
  },
  fabMenu: {
    position: 'absolute',
    right: 20,
    bottom: 88,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 12,
    paddingVertical: 6,
    minWidth: 170,
  },
  fabMenuItem: {
    minHeight: 40,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
});
