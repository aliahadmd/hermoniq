import { useEffect } from 'react';
import dayjs from 'dayjs';
import { useMonthlyBudgetSummary } from '@/hooks/use-budgets';
import { useTransactions } from '@/hooks/use-transactions';
import { syncMoneyReminders } from '@/lib/money-reminders';
import { useAppStore } from '@/stores/app-store';

export function useMoneyReminderSync(isActive = true) {
  const expenseReminderEnabled = useAppStore((state) => state.expenseReminderEnabled);
  const expenseReminderTime = useAppStore((state) => state.expenseReminderTime);
  const expenseReminderSmartInsightsEnabled = useAppStore(
    (state) => state.expenseReminderSmartInsightsEnabled,
  );
  const expenseReminderWeekdaysOnly = useAppStore((state) => state.expenseReminderWeekdaysOnly);

  const shouldLoadSnapshot = isActive && expenseReminderEnabled;
  const month = dayjs().format('YYYY-MM');
  const transactionsQuery = useTransactions(shouldLoadSnapshot);
  const budgetQuery = useMonthlyBudgetSummary(month, shouldLoadSnapshot);

  useEffect(() => {
    if (!isActive) {
      return;
    }

    void syncMoneyReminders({
      settings: {
        enabled: expenseReminderEnabled,
        reminderTime: expenseReminderTime,
        smartInsightsEnabled: expenseReminderSmartInsightsEnabled,
        weekdaysOnly: expenseReminderWeekdaysOnly,
      },
      transactions: transactionsQuery.data ?? [],
      budgetSummary: budgetQuery.data ?? null,
    }).catch((error) => {
      console.error('Failed to sync money reminders', error);
    });
  }, [
    budgetQuery.data,
    expenseReminderEnabled,
    expenseReminderSmartInsightsEnabled,
    expenseReminderTime,
    expenseReminderWeekdaysOnly,
    isActive,
    transactionsQuery.data,
  ]);
}
