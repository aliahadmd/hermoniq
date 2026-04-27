import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Switch, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { useTheme } from '@react-navigation/native';
import dayjs from 'dayjs';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { ReminderTimePickerField } from '@/components/habit-tracker/reminder-time-picker-field';
import { useMonthlyBudgetSummary } from '@/hooks/use-budgets';
import { useTransactions } from '@/hooks/use-transactions';
import {
  cancelMoneyReminderNotifications,
  ensureMoneyReminderPermissions,
  hasMoneyReminderPermissions,
  sendMoneyReminderTest,
  syncMoneyReminders,
} from '@/lib/money-reminders';
import { useAppStore } from '@/stores/app-store';

interface SwitchRowProps {
  label: string;
  description?: string;
  value: boolean;
  onValueChange: (next: boolean) => void;
  borderColor: string;
  trackColorOn: string;
  thumbColor: string;
  disabled?: boolean;
}

function SwitchRow({
  label,
  description,
  value,
  onValueChange,
  borderColor,
  trackColorOn,
  thumbColor,
  disabled = false,
}: SwitchRowProps) {
  return (
    <View style={[styles.switchRow, { borderColor, opacity: disabled ? 0.55 : 1 }]}>
      <View style={styles.switchText}>
        <ThemedText>{label}</ThemedText>
        {description ? (
          <ThemedText style={styles.switchDescription}>{description}</ThemedText>
        ) : null}
      </View>
      <Switch
        value={value}
        disabled={disabled}
        onValueChange={(next) => {
          Haptics.selectionAsync();
          onValueChange(next);
        }}
        trackColor={{ false: borderColor, true: trackColorOn }}
        thumbColor={thumbColor}
      />
    </View>
  );
}

export default function MoneySettingsScreen() {
  const { colors } = useTheme();

  const expenseReminderEnabled = useAppStore((state) => state.expenseReminderEnabled);
  const setExpenseReminderEnabled = useAppStore((state) => state.setExpenseReminderEnabled);
  const expenseReminderTime = useAppStore((state) => state.expenseReminderTime);
  const setExpenseReminderTime = useAppStore((state) => state.setExpenseReminderTime);
  const expenseReminderSmartInsightsEnabled = useAppStore(
    (state) => state.expenseReminderSmartInsightsEnabled,
  );
  const setExpenseReminderSmartInsightsEnabled = useAppStore(
    (state) => state.setExpenseReminderSmartInsightsEnabled,
  );
  const expenseReminderWeekdaysOnly = useAppStore((state) => state.expenseReminderWeekdaysOnly);
  const setExpenseReminderWeekdaysOnly = useAppStore((state) => state.setExpenseReminderWeekdaysOnly);

  const month = dayjs().format('YYYY-MM');
  const transactionsQuery = useTransactions(expenseReminderEnabled);
  const budgetSummaryQuery = useMonthlyBudgetSummary(month, expenseReminderEnabled);

  const [busy, setBusy] = useState(false);
  const [permissionGranted, setPermissionGranted] = useState<boolean | null>(null);

  const transactions = transactionsQuery.data ?? [];
  const budgetSummary = budgetSummaryQuery.data ?? null;

  const reminderSettings = useMemo(
    () => ({
      enabled: expenseReminderEnabled,
      reminderTime: expenseReminderTime,
      smartInsightsEnabled: expenseReminderSmartInsightsEnabled,
      weekdaysOnly: expenseReminderWeekdaysOnly,
    }),
    [
      expenseReminderEnabled,
      expenseReminderSmartInsightsEnabled,
      expenseReminderTime,
      expenseReminderWeekdaysOnly,
    ],
  );

  useEffect(() => {
    void hasMoneyReminderPermissions()
      .then(setPermissionGranted)
      .catch(() => setPermissionGranted(false));
  }, []);

  const syncWithSnapshot = async (overrides?: Partial<typeof reminderSettings>) => {
    const merged = { ...reminderSettings, ...overrides };
    await syncMoneyReminders({
      settings: merged,
      transactions,
      budgetSummary,
    });
  };

  const handleToggleEnabled = async (next: boolean) => {
    setBusy(true);
    try {
      if (next) {
        const granted = await ensureMoneyReminderPermissions();
        setPermissionGranted(granted);
        if (!granted) {
          setExpenseReminderEnabled(false);
          Alert.alert(
            'Permission needed',
            'Enable notifications in system settings to receive money reminders.',
          );
          return;
        }
      }

      setExpenseReminderEnabled(next);
      if (!next) {
        await cancelMoneyReminderNotifications();
      } else {
        await syncWithSnapshot({ enabled: next });
      }
    } catch (error) {
      Alert.alert('Unable to update reminders', error instanceof Error ? error.message : 'Request failed');
    } finally {
      setBusy(false);
    }
  };

  const handleToggleSmart = async (next: boolean) => {
    setExpenseReminderSmartInsightsEnabled(next);
    if (!expenseReminderEnabled) return;
    void syncWithSnapshot({ smartInsightsEnabled: next }).catch((error) => {
      console.error('Failed to sync smart money reminders', error);
    });
  };

  const handleToggleWeekdaysOnly = async (next: boolean) => {
    setExpenseReminderWeekdaysOnly(next);
    if (!expenseReminderEnabled) return;
    void syncWithSnapshot({ weekdaysOnly: next }).catch((error) => {
      console.error('Failed to sync weekday money reminders', error);
    });
  };

  const handleChangeTime = (time: string | null) => {
    if (!time) return;
    setExpenseReminderTime(time);
    if (!expenseReminderEnabled) return;
    void syncWithSnapshot({ reminderTime: time }).catch((error) => {
      console.error('Failed to sync reminder time', error);
    });
  };

  const sendTest = async () => {
    setBusy(true);
    try {
      if (!(await ensureMoneyReminderPermissions())) {
        setPermissionGranted(false);
        Alert.alert('Permission needed', 'Notifications are currently disabled for this app.');
        return;
      }

      setPermissionGranted(true);
      await sendMoneyReminderTest(reminderSettings, transactions, budgetSummary);
      Alert.alert('Test sent', 'A money reminder test notification was queued on this device.');
    } catch (error) {
      Alert.alert('Unable to send test', error instanceof Error ? error.message : 'Request failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <ThemedView style={styles.container}>
      <View style={[styles.card, { borderColor: colors.border, backgroundColor: colors.card }]}>
        <ThemedText type="defaultSemiBold" style={styles.sectionTitle}>
          Money Reminder Preferences
        </ThemedText>

        <SwitchRow
          label="Enable reminders"
          description="Get a daily prompt to review and log money activity."
          value={expenseReminderEnabled}
          onValueChange={handleToggleEnabled}
          borderColor={colors.border}
          trackColorOn={colors.primary}
          thumbColor={colors.background}
          disabled={busy}
        />

        <SwitchRow
          label="Smart insights"
          description="Use your recent logging and budget status to adapt reminder timing and copy."
          value={expenseReminderSmartInsightsEnabled}
          onValueChange={handleToggleSmart}
          borderColor={colors.border}
          trackColorOn={colors.primary}
          thumbColor={colors.background}
          disabled={!expenseReminderEnabled || busy}
        />

        <SwitchRow
          label="Weekdays only"
          description="Schedule reminders Monday to Friday only."
          value={expenseReminderWeekdaysOnly}
          onValueChange={handleToggleWeekdaysOnly}
          borderColor={colors.border}
          trackColorOn={colors.primary}
          thumbColor={colors.background}
          disabled={!expenseReminderEnabled || busy}
        />

        <View style={styles.timeRow}>
          <ThemedText style={styles.groupLabel}>Reminder Time</ThemedText>
          <View style={!expenseReminderEnabled || busy ? styles.disabledSection : undefined}>
            <ReminderTimePickerField
              value={expenseReminderTime}
              onChange={(time) => {
                if (!expenseReminderEnabled || busy) {
                  return;
                }
                handleChangeTime(time);
              }}
            />
          </View>
        </View>
      </View>

      <View style={[styles.card, { borderColor: colors.border, backgroundColor: colors.card }]}>
        <ThemedText type="defaultSemiBold" style={styles.sectionTitle}>
          Diagnostics
        </ThemedText>
        <ThemedText style={styles.statusText}>
          Notification permission: {permissionGranted === null ? 'Checking...' : permissionGranted ? 'Granted' : 'Denied'}
        </ThemedText>
        <ThemedText style={styles.statusText}>
          Snapshot source: {transactions.length} transaction(s), {budgetSummary?.items.length ?? 0} budget item(s).
        </ThemedText>

        <Pressable
          onPress={sendTest}
          disabled={busy}
          style={[
            styles.testButton,
            {
              borderColor: colors.border,
              backgroundColor: busy ? colors.border : `${colors.primary}22`,
            },
          ]}
        >
          {busy ? (
            <ActivityIndicator size="small" color={colors.primary} />
          ) : (
            <ThemedText style={{ color: colors.primary, fontWeight: '600' }}>
              Send test reminder
            </ThemedText>
          )}
        </Pressable>
      </View>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingTop: 16,
    paddingHorizontal: 16,
    gap: 14,
  },
  card: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 12,
    padding: 12,
    gap: 12,
  },
  sectionTitle: {
    marginBottom: 2,
  },
  switchRow: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  switchText: {
    flex: 1,
  },
  switchDescription: {
    marginTop: 2,
    fontSize: 12,
    opacity: 0.7,
  },
  timeRow: {
    gap: 8,
  },
  groupLabel: {
    fontSize: 13,
    fontWeight: '600',
    opacity: 0.75,
  },
  statusText: {
    fontSize: 13,
    opacity: 0.8,
  },
  testButton: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 42,
  },
  disabledSection: {
    opacity: 0.55,
  },
});
