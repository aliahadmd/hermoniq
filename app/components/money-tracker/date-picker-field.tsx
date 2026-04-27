import { useMemo, useState } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';
import dayjs from 'dayjs';
import customParseFormat from 'dayjs/plugin/customParseFormat';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';

import { ThemedText } from '@/components/themed-text';
import { useThemeColor } from '@/hooks/use-theme-color';
import type { HabitWeekStart } from '@/lib/types';
import { getLeadingOffset, getWeekdayLabels } from '@/lib/week-start';

dayjs.extend(customParseFormat);
const CALENDAR_CELL_COUNT = 42;

interface DatePickerFieldProps {
  value: string;
  onChange: (date: string) => void;
  weekStartPreference?: HabitWeekStart;
}

function resolveDate(value: string): dayjs.Dayjs {
  const parsed = dayjs(value, 'YYYY-MM-DD', true);
  return parsed.isValid() ? parsed : dayjs();
}

export function DatePickerField({ value, onChange, weekStartPreference = 'device' }: DatePickerFieldProps) {
  const borderColor = useThemeColor({}, 'border');
  const cardBg = useThemeColor({}, 'card');
  const surface = useThemeColor({}, 'surface');
  const tint = useThemeColor({}, 'tint');
  const text = useThemeColor({}, 'text');
  const secondaryText = useThemeColor({}, 'textSecondary');

  const selectedDate = useMemo(() => resolveDate(value), [value]);
  const [isOpen, setIsOpen] = useState(false);
  const [displayMonth, setDisplayMonth] = useState(() => selectedDate.startOf('month'));

  const firstDayOfMonth = getLeadingOffset(displayMonth.startOf('month').day(), weekStartPreference);
  const daysInMonth = displayMonth.daysInMonth();
  const weekdayLabels = getWeekdayLabels(weekStartPreference);

  const dayCells = useMemo(() => {
    return Array.from({ length: CALENDAR_CELL_COUNT }, (_, index) => {
      const dayNumber = index - firstDayOfMonth + 1;
      if (dayNumber < 1 || dayNumber > daysInMonth) {
        return null;
      }

      const cellDate = displayMonth.date(dayNumber);
      const cellValue = cellDate.format('YYYY-MM-DD');

      return {
        label: String(dayNumber),
        value: cellValue,
        isSelected: selectedDate.isSame(cellDate, 'day'),
        isToday: dayjs().isSame(cellDate, 'day'),
      };
    });
  }, [daysInMonth, displayMonth, firstDayOfMonth, selectedDate]);

  const openCalendar = () => {
    Haptics.selectionAsync();
    setDisplayMonth(selectedDate.startOf('month'));
    setIsOpen(true);
  };

  const closeCalendar = () => {
    setIsOpen(false);
  };

  const selectDate = (date: string) => {
    Haptics.selectionAsync();
    onChange(date);
    closeCalendar();
  };

  const selectToday = () => {
    const today = dayjs().format('YYYY-MM-DD');
    selectDate(today);
  };

  return (
    <>
      <Pressable
        onPress={openCalendar}
        style={[styles.fieldButton, { borderColor, backgroundColor: surface }]}
      >
        <View style={styles.fieldTextWrap}>
          <ThemedText style={{ color: text }}>{selectedDate.format('MMMM D, YYYY')}</ThemedText>
          <ThemedText style={[styles.fieldHint, { color: secondaryText }]}>
            Tap to pick from calendar
          </ThemedText>
        </View>
        <Ionicons name="calendar-outline" size={20} color={tint} />
      </Pressable>

      <Modal visible={isOpen} transparent animationType="fade" onRequestClose={closeCalendar}>
        <View style={styles.overlay}>
          <View style={[styles.card, { backgroundColor: cardBg, borderColor }]}>
            <View style={styles.headerRow}>
              <Pressable
                onPress={() => setDisplayMonth((prev) => prev.subtract(1, 'month'))}
                style={styles.arrowButton}
                hitSlop={8}
              >
                <Ionicons name="chevron-back" size={20} color={tint} />
              </Pressable>
              <ThemedText type="defaultSemiBold">{displayMonth.format('MMMM YYYY')}</ThemedText>
              <Pressable
                onPress={() => setDisplayMonth((prev) => prev.add(1, 'month'))}
                style={styles.arrowButton}
                hitSlop={8}
              >
                <Ionicons name="chevron-forward" size={20} color={tint} />
              </Pressable>
            </View>

            <View style={styles.weekRow}>
              {weekdayLabels.map((label) => (
                <View key={label} style={styles.weekCell}>
                  <ThemedText style={[styles.weekLabel, { color: secondaryText }]}>
                    {label}
                  </ThemedText>
                </View>
              ))}
            </View>

            <View style={styles.grid}>
              {dayCells.map((cell, index) => {
                if (!cell) {
                  return <View key={`empty-${index}`} style={styles.dayCell} />;
                }

                return (
                  <Pressable
                    key={cell.value}
                    onPress={() => selectDate(cell.value)}
                    style={[
                      styles.dayCell,
                      cell.isSelected && { backgroundColor: tint },
                      cell.isToday && !cell.isSelected && { borderColor: tint, borderWidth: 1 },
                    ]}
                  >
                    <ThemedText style={[cell.isSelected && styles.selectedDayText]}>
                      {cell.label}
                    </ThemedText>
                  </Pressable>
                );
              })}
            </View>

            <View style={[styles.footerRow, { borderTopColor: borderColor }]}>
              <Pressable onPress={selectToday} style={styles.footerButton}>
                <ThemedText style={{ color: tint }}>Today</ThemedText>
              </Pressable>
              <Pressable onPress={closeCalendar} style={styles.footerButton}>
                <ThemedText style={{ color: secondaryText }}>Close</ThemedText>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  fieldButton: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  fieldTextWrap: {
    flex: 1,
  },
  fieldHint: {
    fontSize: 12,
    marginTop: 2,
  },
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.35)',
    justifyContent: 'center',
    padding: 20,
  },
  card: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 16,
    padding: 16,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  arrowButton: {
    padding: 6,
  },
  weekRow: {
    flexDirection: 'row',
    marginBottom: 8,
  },
  weekCell: {
    width: '14.285%',
    alignItems: 'center',
  },
  weekLabel: {
    fontSize: 12,
    fontWeight: '600',
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  dayCell: {
    width: '14.285%',
    aspectRatio: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    marginBottom: 2,
  },
  selectedDayText: {
    color: '#fff',
    fontWeight: '700',
  },
  footerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderTopWidth: StyleSheet.hairlineWidth,
    marginTop: 10,
    paddingTop: 10,
  },
  footerButton: {
    paddingVertical: 6,
    paddingHorizontal: 4,
  },
});
