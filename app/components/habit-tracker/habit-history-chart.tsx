import { StyleSheet, View } from 'react-native';
import { CartesianChart, BarGroup } from 'victory-native';
import { useFont } from '@shopify/react-native-skia';
import dayjs from 'dayjs';

import { ThemedText } from '@/components/themed-text';
import { useThemeColor } from '@/hooks/use-theme-color';
import type { HabitChartPoint } from '@/lib/types';

interface HabitHistoryChartProps {
  data: HabitChartPoint[];
  color: string;
  title?: string;
}

function formatPointLabel(raw: string): string {
  if (/^\d{4}-\d{2}$/.test(raw)) {
    return dayjs(`${raw}-01`).format('MMM');
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    return dayjs(raw).format('D');
  }
  return raw;
}

export function HabitHistoryChart({ data, color, title = 'History' }: HabitHistoryChartProps) {
  const cardBg = useThemeColor({}, 'card');
  const borderColor = useThemeColor({}, 'border');
  const textSecondary = useThemeColor({}, 'textSecondary');
  const font = useFont(null, 11);

  if (data.length === 0) {
    return (
      <View style={[styles.card, { backgroundColor: cardBg, borderColor }]}>
        <ThemedText type="defaultSemiBold">{title}</ThemedText>
        <View style={styles.emptyWrap}>
          <ThemedText style={{ color: textSecondary }}>No history data yet</ThemedText>
        </View>
      </View>
    );
  }

  const chartData = data.map((point, index) => ({
    x: index,
    label: point.label,
    value: point.value,
  }));

  return (
    <View style={[styles.card, { backgroundColor: cardBg, borderColor }]}>
      <ThemedText type="defaultSemiBold">{title}</ThemedText>
      <View style={styles.chartWrap}>
        <CartesianChart
          data={chartData}
          xKey="x"
          yKeys={['value']}
          axisOptions={{
            font,
            tickCount: { x: Math.min(chartData.length, 6), y: 4 },
            labelColor: textSecondary,
            formatXLabel: (value) => {
              const index = Math.round(value as number);
              const point = chartData[index];
              return point ? formatPointLabel(point.label) : '';
            },
            formatYLabel: (value) => `${Math.round(value as number)}`,
          }}
        >
          {({ points, chartBounds }) => (
            <BarGroup chartBounds={chartBounds} betweenGroupPadding={0.38} withinGroupPadding={0}>
              {[<BarGroup.Bar key="history-bar" points={points.value} color={color} />]}
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
