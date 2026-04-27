import { Pressable, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import dayjs from 'dayjs';

import { ThemedText } from '@/components/themed-text';
import { useThemeColor } from '@/hooks/use-theme-color';

interface MonthYearPickerProps {
  selectedMonth: string; // "YYYY-MM" format
  onMonthChange: (month: string) => void;
}

const MONTH_KEY_REGEX = /^\d{4}-(0[1-9]|1[0-2])$/;

function resolveMonth(selectedMonth: string) {
  if (!MONTH_KEY_REGEX.test(selectedMonth)) {
    return dayjs().startOf('month');
  }

  const parsed = dayjs(`${selectedMonth}-01`);
  return parsed.isValid() ? parsed.startOf('month') : dayjs().startOf('month');
}

export function MonthYearPicker({ selectedMonth, onMonthChange }: MonthYearPickerProps) {
  const tint = useThemeColor({}, 'tint');
  const cardBg = useThemeColor({}, 'card');
  const borderColor = useThemeColor({}, 'border');

  const current = resolveMonth(selectedMonth);
  const label = current.format('MMMM YYYY');

  const goToPrevious = () => {
    const prev = current.subtract(1, 'month').format('YYYY-MM');
    onMonthChange(prev);
  };

  const goToNext = () => {
    const next = current.add(1, 'month').format('YYYY-MM');
    onMonthChange(next);
  };

  return (
    <View style={[styles.container, { backgroundColor: cardBg, borderColor }]}>
      <Pressable onPress={goToPrevious} hitSlop={8} style={styles.arrowButton}>
        <Ionicons name="chevron-back" size={22} color={tint} />
      </Pressable>
      <ThemedText type="defaultSemiBold" style={styles.label}>
        {label}
      </ThemedText>
      <Pressable onPress={goToNext} hitSlop={8} style={styles.arrowButton}>
        <Ionicons name="chevron-forward" size={22} color={tint} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginHorizontal: 16,
  },
  arrowButton: {
    padding: 4,
  },
  label: {
    fontSize: 16,
    textAlign: 'center',
  },
});
