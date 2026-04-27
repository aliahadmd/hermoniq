import { StyleSheet, View } from 'react-native';
import { CartesianChart, BarGroup } from 'victory-native';
import { useFont } from '@shopify/react-native-skia';

import { ThemedText } from '@/components/themed-text';
import { useThemeColor } from '@/hooks/use-theme-color';
import type { ChartData } from '@/lib/types';

interface IncomeExpenseChartProps {
  data: ChartData[];
  currencySymbol?: string;
}

export function IncomeExpenseChart({ data, currencySymbol }: IncomeExpenseChartProps) {
  const cardBg = useThemeColor({}, 'card');
  const borderColor = useThemeColor({}, 'border');
  const secondaryText = useThemeColor({}, 'textSecondary');
  const successColor = useThemeColor({}, 'success');
  const dangerColor = useThemeColor({}, 'danger');
  const font = useFont(null, 11);

  if (data.length === 0) {
    return (
      <View style={[styles.card, { backgroundColor: cardBg, borderColor }]}>
        <ThemedText type="defaultSemiBold" style={styles.title}>
          Income vs Expense
        </ThemedText>
        <View style={styles.empty}>
          <ThemedText style={{ color: secondaryText }}>No data for this period</ThemedText>
        </View>
      </View>
    );
  }

  // Transform data: victory-native needs numeric xKey, so use index
  const chartData = data.map((d, i) => ({
    x: i,
    label: d.month,
    income: d.income / 100,
    expense: d.expense / 100,
  }));

  return (
    <View style={[styles.card, { backgroundColor: cardBg, borderColor }]}>
      <ThemedText type="defaultSemiBold" style={styles.title}>
        Income vs Expense
      </ThemedText>
      <View style={styles.legend}>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: successColor }]} />
          <ThemedText style={[styles.legendText, { color: secondaryText }]}>Income</ThemedText>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: dangerColor }]} />
          <ThemedText style={[styles.legendText, { color: secondaryText }]}>Expense</ThemedText>
        </View>
      </View>
      <View style={styles.chartContainer}>
        <CartesianChart
          data={chartData}
          xKey="x"
          yKeys={['income', 'expense']}
          domainPadding={{ left: 30, right: 30 }}
          axisOptions={{
            font,
            tickCount: { x: chartData.length, y: 4 },
            labelColor: secondaryText,
            formatXLabel: (val) => {
              const idx = Math.round(val as number);
              return chartData[idx]?.label ?? '';
            },
            formatYLabel: (val) => {
              const num = val as number;
              return currencySymbol ? `${currencySymbol}${num}` : `${num}`;
            },
          }}
        >
          {({ points, chartBounds }) => (
            <BarGroup chartBounds={chartBounds} betweenGroupPadding={0.3} withinGroupPadding={0.1}>
              <BarGroup.Bar points={points.income} color={successColor} />
              <BarGroup.Bar points={points.expense} color={dangerColor} />
            </BarGroup>
          )}
        </CartesianChart>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 16,
    marginHorizontal: 16,
  },
  title: {
    marginBottom: 8,
  },
  legend: {
    flexDirection: 'row',
    gap: 16,
    marginBottom: 12,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  legendDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  legendText: {
    fontSize: 12,
  },
  chartContainer: {
    height: 200,
  },
  empty: {
    alignItems: 'center',
    paddingVertical: 32,
  },
});
