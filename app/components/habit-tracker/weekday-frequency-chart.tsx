import { StyleSheet, View } from 'react-native';
import { CartesianChart, BarGroup } from 'victory-native';
import { useFont } from '@shopify/react-native-skia';

import { ThemedText } from '@/components/themed-text';
import { useThemeColor } from '@/hooks/use-theme-color';
import type { HabitWeekdayFrequency } from '@/lib/types';

interface WeekdayFrequencyChartProps {
  data: HabitWeekdayFrequency[];
  color: string;
}

export function WeekdayFrequencyChart({ data, color }: WeekdayFrequencyChartProps) {
  const cardBg = useThemeColor({}, 'card');
  const borderColor = useThemeColor({}, 'border');
  const textSecondary = useThemeColor({}, 'textSecondary');
  const font = useFont(null, 11);

  if (data.length === 0) {
    return (
      <View style={[styles.card, { backgroundColor: cardBg, borderColor }]}>
        <ThemedText type="defaultSemiBold">Frequency</ThemedText>
        <View style={styles.emptyWrap}>
          <ThemedText style={{ color: textSecondary }}>No weekday data yet</ThemedText>
        </View>
      </View>
    );
  }

  const chartData = data.map((item, index) => ({
    x: index,
    label: item.weekday,
    rate: item.completionRate,
  }));

  return (
    <View style={[styles.card, { backgroundColor: cardBg, borderColor }]}>
      <ThemedText type="defaultSemiBold">Frequency</ThemedText>
      <View style={styles.chartWrap}>
        <CartesianChart
          data={chartData}
          xKey="x"
          yKeys={['rate']}
          domain={{ y: [0, 100] }}
          axisOptions={{
            font,
            tickCount: { x: 7, y: 5 },
            labelColor: textSecondary,
            formatXLabel: (value) => {
              const index = Math.round(value as number);
              return chartData[index]?.label ?? '';
            },
            formatYLabel: (value) => `${Math.round(value as number)}%`,
          }}
        >
          {({ points, chartBounds }) => (
            <BarGroup chartBounds={chartBounds} betweenGroupPadding={0.25} withinGroupPadding={0}>
              {[<BarGroup.Bar key="weekday-bar" points={points.rate} color={color} />]}
            </BarGroup>
          )}
        </CartesianChart>
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
  chartWrap: {
    height: 220,
    marginTop: 6,
  },
  emptyWrap: {
    alignItems: 'center',
    paddingVertical: 20,
  },
});
