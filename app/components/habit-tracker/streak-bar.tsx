import { StyleSheet, View } from 'react-native';
import dayjs from 'dayjs';

import { ThemedText } from '@/components/themed-text';
import { useThemeColor } from '@/hooks/use-theme-color';
import type { HabitStreak } from '@/lib/types';

interface StreakBarProps {
  streak: HabitStreak;
  color: string;
}

export function StreakBar({ streak, color }: StreakBarProps) {
  const cardBg = useThemeColor({}, 'card');
  const borderColor = useThemeColor({}, 'border');
  const textSecondary = useThemeColor({}, 'textSecondary');

  return (
    <View style={[styles.card, { backgroundColor: cardBg, borderColor }]}>
      <ThemedText type="defaultSemiBold">Best streak</ThemedText>

      {streak.best > 0 && streak.bestStartDate && streak.bestEndDate ? (
        <View style={styles.content}>
          <View style={styles.metaRow}>
            <ThemedText style={{ color: textSecondary, fontSize: 13 }}>
              {dayjs(streak.bestStartDate).format('MMM D, YYYY')}
            </ThemedText>
            <ThemedText type="defaultSemiBold">{streak.best} days</ThemedText>
            <ThemedText style={{ color: textSecondary, fontSize: 13 }}>
              {dayjs(streak.bestEndDate).format('MMM D, YYYY')}
            </ThemedText>
          </View>
          <View style={[styles.track, { borderColor }]}>
            <View style={[styles.fill, { backgroundColor: color, width: '100%' }]} />
          </View>
          <ThemedText style={{ color: textSecondary, fontSize: 13 }}>
            Current streak: {streak.current} day{streak.current === 1 ? '' : 's'}
          </ThemedText>
        </View>
      ) : (
        <View style={styles.emptyWrap}>
          <ThemedText style={{ color: textSecondary }}>
            No streak yet. Complete scheduled days to build momentum.
          </ThemedText>
        </View>
      )}
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
  content: {
    marginTop: 8,
    gap: 10,
  },
  metaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
  },
  track: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 8,
    height: 16,
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
  },
  emptyWrap: {
    marginTop: 8,
  },
});
