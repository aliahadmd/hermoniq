import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useTheme } from '@react-navigation/native';
import dayjs from 'dayjs';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MonthYearPicker } from '@/components/money-tracker/month-year-picker';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useCategories } from '@/hooks/use-categories';
import { useAccounts } from '@/hooks/use-accounts';
import {
  useCreateMonthlyBudget,
  useDeleteMonthlyBudget,
  useMonthlyBudgetSummary,
} from '@/hooks/use-budgets';
import {
  formatMinorUnitAmountForInput,
  isValidAmountInput,
  parseAmountInput,
} from '@/lib/format-amount';
import { getCurrencySymbol } from '@/lib/currency';

function formatAmount(amount: number, currency: string): string {
  const symbol = getCurrencySymbol(currency);
  const absValue = Math.abs(amount) / 100;
  const prefix = amount < 0 ? '-' : '';
  return `${prefix}${symbol}${absValue.toFixed(2)}`;
}

export default function BudgetsScreen() {
  const { colors } = useTheme();
  const colorScheme = useColorScheme() ?? 'light';
  const theme = Colors[colorScheme];

  const [selectedMonth, setSelectedMonth] = useState(() => dayjs().format('YYYY-MM'));
  const [modalVisible, setModalVisible] = useState(false);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null);
  const [limitInput, setLimitInput] = useState('');

  const categoriesQuery = useCategories();
  const accountsQuery = useAccounts();
  const summaryQuery = useMonthlyBudgetSummary(selectedMonth);
  const createBudget = useCreateMonthlyBudget();
  const deleteBudget = useDeleteMonthlyBudget();

  const categories = useMemo(() => categoriesQuery.data ?? [], [categoriesQuery.data]);
  const availableAccounts = useMemo(() => accountsQuery.data ?? [], [accountsQuery.data]);

  const summary = summaryQuery.data ?? {
    month: selectedMonth,
    accountSummaries: [],
    items: [],
  };
  const refreshing =
    categoriesQuery.isRefetching || accountsQuery.isRefetching || summaryQuery.isRefetching;

  const budgetedCategoryIdsForAccount = useMemo(
    () =>
      new Set(
        summary.items
          .filter((item) => selectedAccountId !== null && item.accountId === selectedAccountId)
          .map((item) => item.categoryId),
      ),
    [summary.items, selectedAccountId]
  );

  const selectableCategories = useMemo(
    () =>
      categories.filter(
        (category) => !budgetedCategoryIdsForAccount.has(category.id),
      ),
    [categories, budgetedCategoryIdsForAccount]
  );

  const monthLabel = dayjs(`${selectedMonth}-01`).format('MMMM YYYY');
  const isLoading =
    categoriesQuery.isLoading || accountsQuery.isLoading || summaryQuery.isLoading;
  const error = categoriesQuery.error ?? accountsQuery.error ?? summaryQuery.error;

  const refreshAll = () => {
    categoriesQuery.refetch();
    accountsQuery.refetch();
    summaryQuery.refetch();
  };

  useEffect(() => {
    if (!modalVisible) return;
    if (!selectedCategoryId) {
      setSelectedCategoryId(selectableCategories[0]?.id ?? null);
      return;
    }

    const stillAvailable = selectableCategories.some(
      (category) => category.id === selectedCategoryId,
    );
    if (!stillAvailable) {
      setSelectedCategoryId(selectableCategories[0]?.id ?? null);
    }
  }, [modalVisible, selectableCategories, selectedCategoryId]);

  const openCreate = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setLimitInput('');
    const initialAccountId = availableAccounts[0]?.id ?? null;
    setSelectedAccountId(initialAccountId);
    const initialBudgetedCategoryIds = new Set(
      summary.items
        .filter((item) => item.accountId === initialAccountId)
        .map((item) => item.categoryId),
    );
    const initialCategory = categories.find(
      (category) => !initialBudgetedCategoryIds.has(category.id),
    );
    setSelectedCategoryId(initialCategory?.id ?? null);
    setModalVisible(true);
  };

  const closeModal = () => {
    setModalVisible(false);
    setLimitInput('');
    setSelectedCategoryId(null);
    setSelectedAccountId(null);
  };

  const submitBudget = () => {
    if (!selectedAccountId) {
      Alert.alert('Select account', 'Please select an account for this monthly budget.');
      return;
    }

    if (!selectedCategoryId) {
      Alert.alert('Select category', 'Please select a category for this monthly budget.');
      return;
    }

    const parsedLimit = parseAmountInput(limitInput);
    if (parsedLimit <= 0) {
      Alert.alert('Invalid limit', 'Please enter a valid monthly limit greater than 0.');
      return;
    }

    createBudget.mutate(
      {
        month: selectedMonth,
        categoryId: selectedCategoryId,
        accountId: selectedAccountId,
        limit: parsedLimit,
      },
      {
        onSuccess: () => {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          closeModal();
        },
        onError: (error) => {
          Alert.alert('Error', error.message);
        },
      },
    );
  };

  const onDeleteBudget = (budgetId: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    Alert.alert('Delete Budget', 'Remove this category budget for the selected month?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          deleteBudget.mutate(budgetId, {
            onError: (error) => Alert.alert('Error', error.message),
          });
        },
      },
    ]);
  };

  if (isLoading) {
    return (
      <ThemedView style={styles.centered}>
        <ActivityIndicator size="large" color={colors.primary} />
      </ThemedView>
    );
  }

  if (error) {
    return (
      <ThemedView style={styles.centered}>
        <ThemedText>Failed to load budgets</ThemedText>
        <ThemedText style={{ color: theme.textSecondary, fontSize: 13, marginTop: 4 }}>
          {error.message}
        </ThemedText>
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.container}>
      <FlatList
        data={summary.items}
        keyExtractor={(item) => item.id}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={refreshAll} tintColor={theme.tint} />
        }
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={
          <View>
            <View style={styles.monthPickerWrap}>
              <MonthYearPicker selectedMonth={selectedMonth} onMonthChange={setSelectedMonth} />
            </View>

            {summary.accountSummaries.length === 0 ? (
              <View style={[styles.summaryCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
                <ThemedText type="defaultSemiBold">Budget Summary ({monthLabel})</ThemedText>
                <ThemedText style={{ color: theme.textSecondary }}>
                  No budget summary yet.
                </ThemedText>
              </View>
            ) : (
              summary.accountSummaries.map((accountSummary) => {
                const cappedProgress = Math.min(
                  100,
                  Math.max(0, accountSummary.progressPercent),
                );
                const isOverBudget =
                  accountSummary.totalSpent > accountSummary.totalLimit &&
                  accountSummary.totalLimit > 0;

                return (
                  <View
                    key={accountSummary.accountId}
                    style={[styles.summaryCard, { backgroundColor: theme.card, borderColor: theme.border }]}
                  >
                    <ThemedText type="defaultSemiBold">
                      Budget Summary ({monthLabel}) - {accountSummary.accountName} ({accountSummary.accountCurrency})
                    </ThemedText>
                    <View style={styles.summaryRow}>
                      <ThemedText style={{ color: theme.textSecondary }}>Total Budget</ThemedText>
                      <ThemedText style={{ color: theme.tint }}>
                        {formatAmount(accountSummary.totalLimit, accountSummary.accountCurrency)}
                      </ThemedText>
                    </View>
                    <View style={styles.summaryRow}>
                      <ThemedText style={{ color: theme.textSecondary }}>Total Spent</ThemedText>
                      <ThemedText style={{ color: theme.danger }}>
                        {formatAmount(accountSummary.totalSpent, accountSummary.accountCurrency)}
                      </ThemedText>
                    </View>
                    <View style={styles.summaryRow}>
                      <ThemedText style={{ color: theme.textSecondary }}>Remaining</ThemedText>
                      <ThemedText
                        style={{
                          color:
                            accountSummary.totalRemaining >= 0
                              ? theme.success
                              : theme.danger,
                        }}
                      >
                        {formatAmount(accountSummary.totalRemaining, accountSummary.accountCurrency)}
                      </ThemedText>
                    </View>
                    <View style={[styles.progressTrack, { backgroundColor: theme.border }]}>
                      <View
                        style={[
                          styles.progressFill,
                          {
                            width: `${cappedProgress}%`,
                            backgroundColor: isOverBudget ? theme.danger : theme.tint,
                          },
                        ]}
                      />
                    </View>
                    <ThemedText style={[styles.progressCaption, { color: theme.textSecondary }]}>
                      {accountSummary.progressPercent}% of monthly total used
                    </ThemedText>
                  </View>
                );
              })
            )}

            {summary.items.length === 0 && (
              <View style={styles.emptyState}>
                <ThemedText style={{ color: theme.textSecondary }}>
                  No category budgets for {monthLabel}
                </ThemedText>
                <ThemedText style={{ color: theme.textSecondary, fontSize: 12, marginTop: 4 }}>
                  Tap + to set your first budget.
                </ThemedText>
              </View>
            )}
          </View>
        }
        renderItem={({ item }) => {
          const itemProgress = Math.min(100, Math.max(0, item.progressPercent));
          const itemOverBudget = item.spent > item.limit && item.limit > 0;

          return (
            <View style={[styles.itemCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
              <View style={styles.itemHeader}>
                <View style={styles.itemTitleWrap}>
                  <View style={[styles.categoryDot, { backgroundColor: item.categoryColor }]} />
                  <ThemedText type="defaultSemiBold">{item.categoryTitle}</ThemedText>
                </View>
                <Pressable onPress={() => onDeleteBudget(item.id)} hitSlop={8}>
                  <Ionicons name="trash-outline" size={18} color={theme.danger} />
                </Pressable>
              </View>

              <View style={styles.summaryRow}>
                <ThemedText style={{ color: theme.textSecondary }}>Limit</ThemedText>
                <ThemedText>{formatAmount(item.limit, item.accountCurrency)}</ThemedText>
              </View>
              <View style={styles.summaryRow}>
                <ThemedText style={{ color: theme.textSecondary }}>Spent</ThemedText>
                <ThemedText style={{ color: theme.danger }}>
                  {formatAmount(item.spent, item.accountCurrency)}
                </ThemedText>
              </View>
              <View style={styles.summaryRow}>
                <ThemedText style={{ color: theme.textSecondary }}>Remaining</ThemedText>
                <ThemedText style={{ color: item.remaining >= 0 ? theme.success : theme.danger }}>
                  {formatAmount(item.remaining, item.accountCurrency)}
                </ThemedText>
              </View>
              <View style={styles.summaryRow}>
                <ThemedText style={{ color: theme.textSecondary }}>Account</ThemedText>
                <ThemedText>
                  {item.accountName} ({item.accountCurrency})
                </ThemedText>
              </View>
              <View style={styles.summaryRow}>
                <ThemedText style={{ color: theme.textSecondary }}>Month</ThemedText>
                <ThemedText>{dayjs(`${item.month}-01`).format('MMM YYYY')}</ThemedText>
              </View>

              <View style={[styles.progressTrack, { backgroundColor: theme.border }]}>
                <View
                  style={[
                    styles.progressFill,
                    {
                      width: `${itemProgress}%`,
                      backgroundColor: itemOverBudget ? theme.danger : theme.tint,
                    },
                  ]}
                />
              </View>
            </View>
          );
        }}
      />

      <Pressable
        onPress={openCreate}
        style={[styles.fab, { backgroundColor: theme.tint }]}
      >
        <ThemedText style={styles.fabText}>+</ThemedText>
      </Pressable>

      <Modal visible={modalVisible} animationType="slide" transparent>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.modalOverlay}
        >
          <View style={[styles.modalContent, { backgroundColor: theme.card }]}>
            <ScrollView showsVerticalScrollIndicator={false}>
              <ThemedText type="subtitle" style={styles.modalTitle}>
                Set Monthly Budget
              </ThemedText>
              <ThemedText style={{ color: theme.textSecondary, marginBottom: 8 }}>
                Month: {monthLabel}
              </ThemedText>

              <ThemedText style={[styles.label, { color: theme.textSecondary }]}>Account</ThemedText>
              <View style={styles.chipRow}>
                {availableAccounts.length === 0 ? (
                  <ThemedText style={styles.errorText}>
                    Create an account first to set a budget.
                  </ThemedText>
                ) : (
                  availableAccounts.map((account) => {
                    const isSelected = selectedAccountId === account.id;
                    return (
                      <Pressable
                        key={account.id}
                        onPress={() => {
                          Haptics.selectionAsync();
                          setSelectedAccountId(account.id);
                        }}
                        style={[
                          styles.chip,
                          {
                            borderColor: isSelected ? theme.tint : theme.border,
                            backgroundColor: isSelected ? `${theme.tint}20` : theme.surface,
                          },
                        ]}
                      >
                        <ThemedText style={[styles.chipText, isSelected && { color: theme.tint }]}>
                          {account.name} ({account.currency})
                        </ThemedText>
                      </Pressable>
                    );
                  })
                )}
              </View>

              <ThemedText style={[styles.label, { color: theme.textSecondary }]}>Category</ThemedText>
              <View style={styles.chipRow}>
                {categories.map((category) => {
                  const alreadyBudgeted = budgetedCategoryIdsForAccount.has(category.id);
                  const isSelected = selectedCategoryId === category.id;
                  const disabled = alreadyBudgeted && !isSelected;

                  return (
                    <Pressable
                      key={category.id}
                      disabled={disabled}
                      onPress={() => {
                        Haptics.selectionAsync();
                        setSelectedCategoryId(category.id);
                      }}
                      style={[
                        styles.chip,
                        {
                          borderColor: isSelected ? category.color : theme.border,
                          backgroundColor: isSelected ? `${category.color}22` : theme.surface,
                          opacity: disabled ? 0.4 : 1,
                        },
                      ]}
                    >
                      <ThemedText style={[styles.chipText, isSelected && { color: category.color }]}>
                        {category.title}
                        {alreadyBudgeted && !isSelected ? ' (Added)' : ''}
                      </ThemedText>
                    </Pressable>
                  );
                })}
              </View>
              {selectableCategories.length === 0 && (
                <ThemedText style={styles.errorText}>
                  All categories already have budgets for this account and month.
                </ThemedText>
              )}

              <ThemedText style={[styles.label, { color: theme.textSecondary }]}>Limit</ThemedText>
              <TextInput
                style={[styles.input, { color: theme.text, borderColor: theme.border, backgroundColor: theme.surface }]}
                placeholder="e.g. 5000.00"
                placeholderTextColor={theme.textSecondary}
                keyboardType="decimal-pad"
                value={limitInput}
                onChangeText={(text) => {
                  const nextValue = text.trim();
                  if (!isValidAmountInput(nextValue)) {
                    return;
                  }
                  setLimitInput(nextValue);
                }}
                onBlur={() => {
                  if (!limitInput) return;
                  setLimitInput((prev) => formatMinorUnitAmountForInput(parseAmountInput(prev)));
                }}
              />

              <View style={styles.modalButtons}>
                <Pressable onPress={closeModal} style={[styles.btn, { borderColor: theme.border }]}>
                  <ThemedText>Cancel</ThemedText>
                </Pressable>
                <Pressable
                  disabled={
                    createBudget.isPending ||
                    selectableCategories.length === 0 ||
                    availableAccounts.length === 0 ||
                    !selectedAccountId
                  }
                  onPress={submitBudget}
                  style={[
                    styles.btn,
                    styles.btnPrimary,
                    {
                      backgroundColor:
                        createBudget.isPending ||
                        selectableCategories.length === 0 ||
                        availableAccounts.length === 0 ||
                        !selectedAccountId
                          ? theme.border
                          : theme.tint,
                    },
                  ]}
                >
                  <ThemedText style={{ color: '#fff' }}>
                    {createBudget.isPending ? 'Saving...' : 'Save'}
                  </ThemedText>
                </Pressable>
              </View>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>
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
  listContent: {
    paddingVertical: 12,
    paddingBottom: 100,
  },
  monthPickerWrap: {
    marginBottom: 12,
  },
  summaryCard: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 12,
    padding: 14,
    marginHorizontal: 16,
    marginBottom: 12,
    gap: 8,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  progressTrack: {
    height: 8,
    borderRadius: 99,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 99,
    minWidth: 2,
  },
  progressCaption: {
    fontSize: 12,
  },
  itemCard: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 12,
    padding: 14,
    marginHorizontal: 16,
    marginBottom: 10,
    gap: 8,
  },
  itemHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  itemTitleWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  categoryDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 18,
    marginBottom: 8,
  },
  fab: {
    position: 'absolute',
    right: 20,
    bottom: 24,
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
  },
  fabText: {
    color: '#fff',
    fontSize: 28,
    fontWeight: '600',
    lineHeight: 30,
  },
  modalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  modalContent: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 24,
    maxHeight: '85%',
  },
  modalTitle: {
    marginBottom: 8,
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    marginTop: 12,
    marginBottom: 6,
  },
  input: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
  },
  chipRow: {
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
  },
  chip: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  chipText: {
    fontSize: 14,
  },
  errorText: {
    color: '#d93025',
    fontSize: 12,
    marginTop: 6,
  },
  modalButtons: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12,
    marginTop: 24,
  },
  btn: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderColor: 'transparent',
  },
  btnPrimary: {
    borderWidth: 0,
  },
});
