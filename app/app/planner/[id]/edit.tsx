import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  TextInput,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import dayjs from 'dayjs';
import { SafeAreaView } from 'react-native-safe-area-context';

import { DatePickerField } from '@/components/money-tracker/date-picker-field';
import { ReminderTimePickerField } from '@/components/habit-tracker/reminder-time-picker-field';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useDeleteEvent, useEvent, useUpdateEvent } from '@/hooks/use-events';
import { useThemeColor } from '@/hooks/use-theme-color';
import { ensureEventReminderPermissions } from '@/lib/event-reminders';
import {
  EVENT_REMINDER_OPTIONS,
  getDeviceTimezone,
  nowPlusHourDefaults,
  parseIsoToLocalParts,
  toAllDayRange,
  toIsoFromLocal,
} from '@/lib/planner-utils';
import type { EventReminderMinutes } from '@/lib/types';
import { updateEventSchema } from '@/lib/validators';

function resolveId(rawId: string | string[] | undefined): string {
  return Array.isArray(rawId) ? rawId[0] : (rawId ?? '');
}

export default function PlannerEditScreen() {
  const params = useLocalSearchParams<{ id?: string }>();
  const router = useRouter();
  const id = resolveId(params.id);

  const text = useThemeColor({}, 'text');
  const textSecondary = useThemeColor({}, 'textSecondary');
  const border = useThemeColor({}, 'border');
  const surface = useThemeColor({}, 'surface');
  const tint = useThemeColor({}, 'tint');
  const danger = useThemeColor({}, 'danger');

  const defaults = nowPlusHourDefaults();

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [location, setLocation] = useState('');
  const [timezone, setTimezone] = useState(getDeviceTimezone());
  const [isAllDay, setIsAllDay] = useState(false);
  const [startDate, setStartDate] = useState(defaults.startDate);
  const [startTime, setStartTime] = useState(defaults.startTime);
  const [endDate, setEndDate] = useState(defaults.endDate);
  const [endTime, setEndTime] = useState(defaults.endTime);
  const [reminderMinutes, setReminderMinutes] = useState<EventReminderMinutes | null>(null);

  const eventQuery = useEvent(id);
  const updateEvent = useUpdateEvent();
  const deleteEvent = useDeleteEvent();

  useEffect(() => {
    const event = eventQuery.data;
    if (!event) return;

    setTitle(event.title);
    setDescription(event.description);
    setLocation(event.location);
    setTimezone(event.timezone || getDeviceTimezone());
    setIsAllDay(event.isAllDay);
    setReminderMinutes(event.reminderMinutes);

    const start = parseIsoToLocalParts(event.startAt);
    setStartDate(start.date);
    setStartTime(start.time);

    if (event.isAllDay) {
      const displayEnd = dayjs(event.endAt).subtract(1, 'day').format('YYYY-MM-DD');
      setEndDate(displayEnd);
      setEndTime(start.time);
    } else {
      const end = parseIsoToLocalParts(event.endAt);
      setEndDate(end.date);
      setEndTime(end.time);
    }
  }, [eventQuery.data]);

  const submit = async () => {
    try {
      const range = isAllDay
        ? toAllDayRange(startDate, endDate)
        : {
            startAt: toIsoFromLocal(startDate, startTime),
            endAt: toIsoFromLocal(endDate, endTime),
          };

      if (reminderMinutes !== null) {
        const triggerAt = new Date(range.startAt).getTime() - reminderMinutes * 60_000;
        if (triggerAt <= Date.now()) {
          Alert.alert('Invalid reminder', 'Reminder time is in the past. Choose a different reminder or event time.');
          return;
        }
      }

      const payload = updateEventSchema.parse({
        title: title.trim(),
        description,
        location,
        timezone: timezone.trim() || getDeviceTimezone(),
        isAllDay,
        startAt: range.startAt,
        endAt: range.endAt,
        reminderMinutes,
      });

      await updateEvent.mutateAsync({ id, data: payload });

      if (payload.reminderMinutes !== null && payload.reminderMinutes !== undefined) {
        const granted = await ensureEventReminderPermissions();
        if (!granted) {
          Alert.alert('Reminder permission needed', 'Enable notifications to receive planner reminders on this device.');
        }
      }

      router.back();
    } catch (error) {
      Alert.alert('Unable to save event', error instanceof Error ? error.message : 'Request failed');
    }
  };

  const remove = () => {
    Alert.alert('Delete event', 'Delete this event permanently?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          deleteEvent.mutate(id, {
            onSuccess: () => router.back(),
            onError: (error) => Alert.alert('Unable to delete event', error.message),
          });
        },
      },
    ]);
  };

  if (eventQuery.isLoading && !eventQuery.data) {
    return (
      <ThemedView style={styles.container}>
        <SafeAreaView style={styles.centered} edges={['bottom']}>
          <ActivityIndicator size="large" color={tint} />
        </SafeAreaView>
      </ThemedView>
    );
  }

  if (eventQuery.error || !eventQuery.data) {
    return (
      <ThemedView style={styles.container}>
        <SafeAreaView style={styles.centered} edges={['bottom']}>
          <ThemedText>Unable to load event.</ThemedText>
        </SafeAreaView>
      </ThemedView>
    );
  }

  const isBusy = updateEvent.isPending || deleteEvent.isPending;

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.container} edges={['bottom']}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <View style={styles.section}>
            <ThemedText type="defaultSemiBold">Title</ThemedText>
            <TextInput
              value={title}
              onChangeText={setTitle}
              placeholder="Event title"
              placeholderTextColor={textSecondary}
              style={[styles.input, { borderColor: border, backgroundColor: surface, color: text }]}
            />
          </View>

          <View style={[styles.section, styles.switchRow]}>
            <View style={{ flex: 1 }}>
              <ThemedText type="defaultSemiBold">All day</ThemedText>
              <ThemedText style={{ color: textSecondary }}>Turn on for date-only events.</ThemedText>
            </View>
            <Switch value={isAllDay} onValueChange={setIsAllDay} />
          </View>

          <View style={styles.section}>
            <ThemedText type="defaultSemiBold">Start</ThemedText>
            <DatePickerField value={startDate} onChange={setStartDate} />
            {!isAllDay ? (
              <ReminderTimePickerField value={startTime} onChange={setStartTime} />
            ) : null}
          </View>

          <View style={styles.section}>
            <ThemedText type="defaultSemiBold">End</ThemedText>
            <DatePickerField value={endDate} onChange={setEndDate} />
            {!isAllDay ? (
              <ReminderTimePickerField value={endTime} onChange={setEndTime} />
            ) : null}
          </View>

          <View style={styles.section}>
            <ThemedText type="defaultSemiBold">Timezone</ThemedText>
            <TextInput
              value={timezone}
              onChangeText={setTimezone}
              placeholder="Timezone"
              placeholderTextColor={textSecondary}
              style={[styles.input, { borderColor: border, backgroundColor: surface, color: text }]}
            />
          </View>

          <View style={styles.section}>
            <ThemedText type="defaultSemiBold">Location</ThemedText>
            <TextInput
              value={location}
              onChangeText={setLocation}
              placeholder="Optional location"
              placeholderTextColor={textSecondary}
              style={[styles.input, { borderColor: border, backgroundColor: surface, color: text }]}
            />
          </View>

          <View style={styles.section}>
            <ThemedText type="defaultSemiBold">Description</ThemedText>
            <TextInput
              value={description}
              onChangeText={setDescription}
              placeholder="Optional details"
              placeholderTextColor={textSecondary}
              multiline
              style={[styles.textarea, { borderColor: border, backgroundColor: surface, color: text }]}
            />
          </View>

          <View style={styles.section}>
            <ThemedText type="defaultSemiBold">Reminder</ThemedText>
            <View style={styles.chipWrap}>
              {EVENT_REMINDER_OPTIONS.map((option) => {
                const selected = reminderMinutes === option.value;
                return (
                  <Pressable
                    key={option.label}
                    onPress={() => setReminderMinutes(option.value)}
                    style={[
                      styles.chip,
                      {
                        borderColor: selected ? tint : border,
                        backgroundColor: selected ? `${tint}1F` : surface,
                      },
                    ]}
                  >
                    <ThemedText style={selected ? { color: tint } : { color: textSecondary }}>
                      {option.label}
                    </ThemedText>
                  </Pressable>
                );
              })}
            </View>
          </View>

          <Pressable
            disabled={isBusy}
            onPress={submit}
            style={[styles.submitButton, { backgroundColor: tint, opacity: isBusy ? 0.7 : 1 }]}
          >
            {updateEvent.isPending ? (
              <ActivityIndicator color="#ffffff" />
            ) : (
              <ThemedText style={styles.submitText}>Save changes</ThemedText>
            )}
          </Pressable>

          <Pressable
            disabled={isBusy}
            onPress={remove}
            style={[styles.submitButton, { backgroundColor: danger, opacity: isBusy ? 0.7 : 1 }]}
          >
            {deleteEvent.isPending ? (
              <ActivityIndicator color="#ffffff" />
            ) : (
              <ThemedText style={styles.submitText}>Delete event</ThemedText>
            )}
          </Pressable>
        </ScrollView>
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
  content: {
    padding: 14,
    gap: 12,
    paddingBottom: 28,
  },
  section: {
    gap: 8,
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  input: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 10,
    minHeight: 44,
    paddingHorizontal: 12,
    fontSize: 15,
  },
  textarea: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 10,
    minHeight: 110,
    paddingHorizontal: 12,
    paddingVertical: 10,
    textAlignVertical: 'top',
    fontSize: 15,
  },
  chipWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  submitButton: {
    minHeight: 46,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
  },
  submitText: {
    color: '#ffffff',
    fontWeight: '700',
  },
});
