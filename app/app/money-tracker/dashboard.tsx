import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import dayjs from 'dayjs';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BalanceSummary } from '@/components/money-tracker/balance-summary';
import { IncomeExpenseChart } from '@/components/money-tracker/income-expense-chart';
import { TransactionItem } from '@/components/money-tracker/transaction-item';
import { MonthYearPicker } from '@/components/money-tracker/month-year-picker';
import { AccountChartPicker } from '@/components/money-tracker/account-chart-picker';
import { useBalances, useChartData } from '@/hooks/use-dashboard';
import { useFilteredTransactions, useDeleteTransaction } from '@/hooks/use-transactions';
import { useAccounts } from '@/hooks/use-accounts';
import { useThemeColor } from '@/hooks/use-theme-color';
import { formatMinorUnitAmount, getCurrencySymbol } from '@/lib/currency';
import type { Currency, ChartData } from '@/lib/types';

interface CurrencyOverview {
  currency: Currency;
  income: number;
  expense: number;
  net: number;
}

export default function DashboardScreen() {
  const tint = useThemeColor({}, 'tint');
  const secondaryText = useThemeColor({}, 'textSecondary');
  const successColor = useThemeColor({}, 'success');
  const dangerColor = useThemeColor({}, 'danger');
  const cardBg = useThemeColor({}, 'card');
  const borderColor = useThemeColor({}, 'border');

  const [selectedMonth, setSelectedMonth] = useState(() => dayjs().format('YYYY-MM'));
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null);

  const from = useMemo(
    () => dayjs(`${selectedMonth}-01`).startOf('month').format('YYYY-MM-DD'),
    [selectedMonth]
  );
  const to = useMemo(
    () => dayjs(`${selectedMonth}-01`).endOf('month').format('YYYY-MM-DD'),
    [selectedMonth]
  );

  const monthLabel = dayjs(`${selectedMonth}-01`).format('MMMM YYYY');

  const balancesQuery = useBalances();
  const chartQuery = useChartData(from, to, selectedAccountId);
  const transactionsQuery = useFilteredTransactions(from, to);
  const accountsQuery = useAccounts();
  const deleteTransaction = useDeleteTransaction();
  const refreshing =
    balancesQuery.isRefetching ||
    chartQuery.isRefetching ||
    transactionsQuery.isRefetching ||
    accountsQuery.isRefetching;

  const refreshAll = useCallback(() => {
    balancesQuery.refetch();
    chartQuery.refetch();
    transactionsQuery.refetch();
    accountsQuery.refetch();
  }, [balancesQuery, chartQuery, transactionsQuery, accountsQuery]);

  const accounts = useMemo(() => accountsQuery.data ?? [], [accountsQuery.data]);
  const monthTransactions = useMemo(
    () => transactionsQuery.data ?? [],
    [transactionsQuery.data]
  );
  const filteredTransactions = useMemo(
    () =>
      selectedAccountId
        ? monthTransactions.filter((tx) => tx.accountId === selectedAccountId)
        : monthTransactions,
    [monthTransactions, selectedAccountId]
  );
  const chartData = chartQuery.data ?? [];

  const selectedAccount = selectedAccountId
    ? accounts.find((a) => a.id === selectedAccountId)
    : null;

  const currencyChartGroups = useMemo(() => {
    if (selectedAccountId !== null) {
      return null;
    }

    const currencySet = new Set<Currency>();
    for (const tx of filteredTransactions) {
      const currency = tx.accountCurrency ?? selectedAccount?.currency;
      if (currency) {
        currencySet.add(currency);
      }
    }

    if (currencySet.size <= 1) {
      return null;
    }

    const groups: { currency: Currency; data: ChartData[] }[] = [];

    for (const currency of currencySet) {
      const currencyTransactions = filteredTransactions.filter(
        (tx) => (tx.accountCurrency ?? selectedAccount?.currency) === currency
      );

      let income = 0;
      let expense = 0;
      for (const tx of currencyTransactions) {
        if (tx.type === 'income') {
          income += tx.amount;
        } else {
          expense += tx.amount;
        }
      }

      groups.push({
        currency,
        data: [{ month: selectedMonth, income, expense }],
      });
    }

    return groups;
  }, [selectedAccount?.currency, selectedAccountId, filteredTransactions, selectedMonth]);

  const monthlyOverviewByCurrency = useMemo<CurrencyOverview[]>(() => {
    const grouped = new Map<Currency, { income: number; expense: number }>();

    for (const tx of filteredTransactions) {
      const currency = tx.accountCurrency ?? selectedAccount?.currency;
      if (!currency) {
        continue;
      }

      const current = grouped.get(currency) ?? { income: 0, expense: 0 };
      if (tx.type === 'income') {
        current.income += tx.amount;
      } else {
        current.expense += tx.amount;
      }
      grouped.set(currency, current);
    }

    return Array.from(grouped.entries())
      .map(([currency, totals]) => ({
        currency,
        income: totals.income,
        expense: totals.expense,
        net: totals.income - totals.expense,
      }))
      .sort((a, b) => a.currency.localeCompare(b.currency));
  }, [filteredTransactions, selectedAccount?.currency]);

  const isLoading =
    balancesQuery.isLoading || chartQuery.isLoading || transactionsQuery.isLoading;

  if (isLoading) {
    return (
      <ThemedView style={styles.centered}>
        <ActivityIndicator size="large" color={tint} />
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={refreshAll} tintColor={tint} />
        }
      >
        <ThemedText type="defaultSemiBold" style={styles.sectionTitle}>
          Balances
        </ThemedText>
        <BalanceSummary groups={balancesQuery.data ?? []} />

        <View style={styles.sectionSpacing}>
          <MonthYearPicker selectedMonth={selectedMonth} onMonthChange={setSelectedMonth} />
        </View>

        <ThemedText
          type="defaultSemiBold"
          style={[styles.sectionTitle, styles.sectionSpacing]}
        >
          {monthLabel}
        </ThemedText>

        <View style={styles.pickerSpacing}>
          <AccountChartPicker
            accounts={accounts}
            selectedAccountId={selectedAccountId}
            onSelect={setSelectedAccountId}
          />
        </View>

        <ThemedText
          type="defaultSemiBold"
          style={[styles.sectionTitle, styles.sectionSpacing]}
        >
          Monthly Overview
        </ThemedText>
        {monthlyOverviewByCurrency.length === 0 ? (
          <View style={styles.emptySection}>
            <ThemedText style={{ color: secondaryText }}>No monthly insights yet</ThemedText>
          </View>
        ) : (
          <View style={styles.overviewGrid}>
            {monthlyOverviewByCurrency.map((item) => (
              <View
                key={item.currency}
                style={[styles.overviewCard, { backgroundColor: cardBg, borderColor }]}
              >
                <View style={styles.overviewHeader}>
                  <ThemedText type="defaultSemiBold">{item.currency}</ThemedText>
                  <ThemedText style={{ color: item.net >= 0 ? successColor : dangerColor }}>
                    {item.net >= 0 ? 'Surplus' : 'Deficit'}
                  </ThemedText>
                </View>
                <View style={styles.metricRow}>
                  <ThemedText style={{ color: secondaryText }}>Income</ThemedText>
                  <ThemedText style={{ color: successColor }}>
                    {formatMinorUnitAmount(item.income, item.currency)}
                  </ThemedText>
                </View>
                <View style={styles.metricRow}>
                  <ThemedText style={{ color: secondaryText }}>Expense</ThemedText>
                  <ThemedText style={{ color: dangerColor }}>
                    {formatMinorUnitAmount(item.expense, item.currency)}
                  </ThemedText>
                </View>
                <View style={styles.metricRow}>
                  <ThemedText style={{ color: secondaryText }}>Net</ThemedText>
                  <ThemedText style={{ color: item.net >= 0 ? successColor : dangerColor }}>
                    {formatMinorUnitAmount(item.net, item.currency)}
                  </ThemedText>
                </View>
              </View>
            ))}
          </View>
        )}

        {currencyChartGroups ? (
          currencyChartGroups.map((group) => (
            <View key={group.currency} style={styles.chartSpacing}>
              <ThemedText type="default" style={styles.currencyLabel}>
                {group.currency}
              </ThemedText>
              <IncomeExpenseChart
                data={group.data}
                currencySymbol={getCurrencySymbol(group.currency)}
              />
            </View>
          ))
        ) : (
          <IncomeExpenseChart
            data={chartData}
            currencySymbol={
              selectedAccount
                ? getCurrencySymbol(selectedAccount.currency)
                : undefined
            }
          />
        )}

        <ThemedText
          type="defaultSemiBold"
          style={[styles.sectionTitle, styles.sectionSpacing]}
        >
          Transactions
        </ThemedText>
        {filteredTransactions.length === 0 ? (
          <View style={styles.emptySection}>
            <ThemedText style={{ color: secondaryText }}>No transactions</ThemedText>
          </View>
        ) : (
          filteredTransactions.map((tx) => (
            <TransactionItem
              key={tx.id}
              transaction={tx}
              onDelete={(t) => deleteTransaction.mutate(t.id)}
            />
          ))
        )}
      </ScrollView>
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
  scroll: {
    paddingVertical: 16,
    paddingBottom: 32,
  },
  sectionTitle: {
    paddingHorizontal: 16,
    marginBottom: 8,
  },
  sectionSpacing: {
    marginTop: 24,
  },
  pickerSpacing: {
    marginBottom: 12,
  },
  chartSpacing: {
    marginBottom: 16,
  },
  overviewGrid: {
    gap: 10,
    paddingHorizontal: 16,
    marginBottom: 14,
  },
  overviewCard: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 12,
    padding: 12,
    gap: 6,
  },
  overviewHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  metricRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  currencyLabel: {
    paddingHorizontal: 16,
    marginBottom: 4,
    fontSize: 14,
    fontWeight: '600',
  },
  emptySection: {
    alignItems: 'center',
    paddingVertical: 24,
  },
});
