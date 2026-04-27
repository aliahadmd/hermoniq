import { Pressable, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import dayjs from 'dayjs';

import { ThemedText } from '@/components/themed-text';
import { useThemeColor } from '@/hooks/use-theme-color';
import type { HabitCalendarDay, HabitWeekStart } from '@/lib/types';
import { getLeadingOffset, getWeekdayLabels } from '@/lib/week-start';

interface HabitCalendarProps {
  month: string;
  days: HabitCalendarDay[];
  color: string;
  weekStartPreference?: HabitWeekStart;
  onPrevMonth: () => void;
  onNextMonth: () => void;
  onSelectDay: (day: HabitCalendarDay) => void;
}

export function HabitCalendar({
  month,
  days,
  color,
  weekStartPreference = 'sunday',
  onPrevMonth,
  onNextMonth,
  onSelectDay,
}: HabitCalendarProps) {
  const cardBg = useThemeColor({}, 'card');
  const borderColor = useThemeColor({}, 'border');
  const surface = useThemeColor({}, 'surface');
  const textSecondary = useThemeColor({}, 'textSecondary');

  const firstDayIndex = getLeadingOffset(dayjs(`${month}-01`).day(), weekStartPreference);
  const leading = Array.from({ length: firstDayIndex }, (_, index) => `blank-${index}`);
  const weekdayLabels = getWeekdayLabels(weekStartPreference);

  return (
    <View style={[styles.card, { backgroundColor: cardBg, borderColor }]}>
      <View style={styles.headerRow}>
        <ThemedText type="defaultSemiBold">Calendar</ThemedText>
        <View style={styles.monthControls}>
          <Pressable
            onPress={() => {
              Haptics.selectionAsync();
              onPrevMonth();
            }}
            style={styles.arrowBtn}
            hitSlop={8}
          >
            <Ionicons name="chevron-back" size={18} color={textSecondary} />
          </Pressable>
          <ThemedText style={{ color: textSecondary }}>{dayjs(`${month}-01`).format('MMMM YYYY')}</ThemedText>
          <Pressable
            onPress={() => {
              Haptics.selectionAsync();
              onNextMonth();
            }}
            style={styles.arrowBtn}
            hitSlop={8}
          >
            <Ionicons name="chevron-forward" size={18} color={textSecondary} />
          </Pressable>
        </View>
      </View>

      <View style={styles.weekHeader}>
        {weekdayLabels.map((weekday) => (
          <View key={weekday} style={styles.weekCell}>
            <ThemedText style={{ color: textSecondary, fontSize: 12 }}>{weekday}</ThemedText>
          </View>
        ))}
      </View>

      <View style={styles.grid}>
        {leading.map((key) => (
          <View key={key} style={styles.dayCell} />
        ))}
        {days.map((day) => (
          <Pressable
            key={day.date}
            disabled={!day.scheduled}
            onPress={() => onSelectDay(day)}
            style={[
              styles.dayCell,
              {
                borderColor,
                backgroundColor: day.scheduled ? surface : 'transparent',
                opacity: day.scheduled ? 1 : 0.28,
              },
              day.completed && {
                borderColor: color,
                backgroundColor: `${color}33`,
              },
              day.isToday && {
                borderColor: color,
                borderWidth: 1,
              },
            ]}
          >
            <ThemedText style={{ fontSize: 12 }}>{day.dayOfMonth}</ThemedText>
            {day.value !== null ? (
              <ThemedText style={{ fontSize: 9, color: textSecondary }}>{day.value}</ThemedText>
            ) : null}
            {day.note.length > 0 ? (
              <View style={[styles.noteDot, { backgroundColor: color }]} />
            ) : null}
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 12,
    marginHorizontal: 16,
    marginBottom: 12,
    padding: 14,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  monthControls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  arrowBtn: {
    padding: 4,
  },
  weekHeader: {
    flexDirection: 'row',
    marginBottom: 6,
  },
  weekCell: {
    width: `${100 / 7}%`,
    alignItems: 'center',
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  dayCell: {
    width: `${100 / 7}%`,
    aspectRatio: 1,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  noteDot: {
    position: 'absolute',
    right: 4,
    top: 4,
    width: 5,
    height: 5,
    borderRadius: 3,
  },
});
