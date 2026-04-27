import { useCallback, useState } from 'react';
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
import * as Haptics from 'expo-haptics';
import { useTheme } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import dayjs from 'dayjs';
import customParseFormat from 'dayjs/plugin/customParseFormat';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { TransactionItem } from '@/components/money-tracker/transaction-item';
import { DatePickerField } from '@/components/money-tracker/date-picker-field';
import { useTransactions, useCreateTransaction, useDeleteTransaction } from '@/hooks/use-transactions';
import { useAccounts } from '@/hooks/use-accounts';
import { useCategories } from '@/hooks/use-categories';
import { createTransactionSchema } from '@/lib/validators';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import {
  formatMinorUnitAmountForInput,
  isValidAmountInput,
  parseAmountInput,
} from '@/lib/format-amount';
import type { Transaction, TransactionType } from '@/lib/types';

dayjs.extend(customParseFormat);

interface CreateTransactionForm {
  amount: number;
  type: 'income' | 'expense';
  date: string;
  description?: string;
  categoryId?: string | null;
  accountId: string;
}

const TRANSACTION_TYPES: { value: TransactionType; label: string }[] = [
  { value: 'income', label: 'Income' },
  { value: 'expense', label: 'Expense' },
];

export default function TransactionsScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const colorScheme = useColorScheme() ?? 'light';
  const theme = Colors[colorScheme];

  const transactionsQuery = useTransactions();
  const accountsQuery = useAccounts();
  const categoriesQuery = useCategories();
  const { data: transactions, isLoading, error } = transactionsQuery;
  const { data: accounts } = accountsQuery;
  const { data: categories } = categoriesQuery;
  const createTransaction = useCreateTransaction();
  const deleteTransaction = useDeleteTransaction();

  const refreshing =
    transactionsQuery.isRefetching || accountsQuery.isRefetching || categoriesQuery.isRefetching;

  const refreshAll = useCallback(() => {
    transactionsQuery.refetch();
    accountsQuery.refetch();
    categoriesQuery.refetch();
  }, [transactionsQuery, accountsQuery, categoriesQuery]);

  const [modalVisible, setModalVisible] = useState(false);
  const [amountInput, setAmountInput] = useState('');

  const {
    control,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<CreateTransactionForm>({
    resolver: zodResolver(createTransactionSchema),
    defaultValues: {
      amount: 0,
      type: 'expense',
      date: dayjs().format('YYYY-MM-DD'),
      description: '',
      categoryId: null,
      accountId: '',
    },
  });

  const openCreate = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    reset({
      amount: 0,
      type: 'expense',
      date: dayjs().format('YYYY-MM-DD'),
      description: '',
      categoryId: null,
      accountId: accounts?.[0]?.id ?? '',
    });
    setAmountInput('');
    setModalVisible(true);
  };

  const closeModal = () => {
    setModalVisible(false);
    setAmountInput('');
  };

  const onSubmit = (data: CreateTransactionForm) => {
    const parsedDate = dayjs(data.date, 'YYYY-MM-DD', true);
    if (!parsedDate.isValid()) {
      Alert.alert('Invalid date', 'Please select a valid date from the calendar.');
      return;
    }

    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    const payload = {
      ...data,
      description: data.description ?? '',
      date: parsedDate.format('YYYY-MM-DD'),
    };
    createTransaction.mutate(payload, {
      onSuccess: closeModal,
      onError: (e) => Alert.alert('Error', e.message),
    });
  };

  const handleDelete = (transaction: Transaction) => {
    deleteTransaction.mutate(transaction.id, {
      onError: (e) => Alert.alert('Error', e.message),
    });
  };

  if (isLoading) {
    return (
      <ThemedView style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
      </ThemedView>
    );
  }

  if (error) {
    return (
      <ThemedView style={styles.center}>
        <ThemedText>Failed to load transactions</ThemedText>
        <ThemedText style={{ color: theme.textSecondary, fontSize: 13, marginTop: 4 }}>
          {error.message}
        </ThemedText>
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.container}>
      <FlatList
        data={transactions}
        keyExtractor={(item) => item.id}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={refreshAll} tintColor={theme.tint} />
        }
        renderItem={({ item }) => (
          <TransactionItem transaction={item} onDelete={handleDelete} />
        )}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <View style={styles.center}>
            <ThemedText style={{ color: theme.textSecondary }}>No transactions yet</ThemedText>
          </View>
        }
      />

      {/* FAB */}
      <Pressable
        onPress={() =>
          router.push({
            pathname: '/notes/create',
            params: {
              template: 'checklist',
              prefillTitle: `Transaction Notes - ${dayjs().format('MMM D, YYYY')}`,
            },
          })
        }
        style={[styles.noteFab, { backgroundColor: theme.card, borderColor: theme.border }]}
        accessibilityRole="button"
        accessibilityLabel="Quick note for transactions"
      >
        <Ionicons name="document-text-outline" size={20} color={theme.tint} />
      </Pressable>

      <Pressable
        onPress={openCreate}
        style={[styles.fab, { backgroundColor: theme.tint }]}
      >
        <ThemedText style={styles.fabText}>+</ThemedText>
      </Pressable>

      {/* Create Transaction Modal */}
      <Modal visible={modalVisible} animationType="slide" transparent>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.modalOverlay}
        >
          <View style={[styles.modalContent, { backgroundColor: theme.card }]}>
            <ScrollView showsVerticalScrollIndicator={false}>
              <ThemedText type="subtitle" style={styles.modalTitle}>
                New Transaction
              </ThemedText>

              {/* Transaction Type */}
              <ThemedText style={[styles.label, { color: theme.textSecondary }]}>Type</ThemedText>
              <Controller
                control={control}
                name="type"
                render={({ field: { onChange, value } }) => (
                  <View style={styles.chipRow}>
                    {TRANSACTION_TYPES.map((t) => (
                      <Pressable
                        key={t.value}
                        onPress={() => {
                          Haptics.selectionAsync();
                          onChange(t.value);
                        }}
                        style={[
                          styles.chip,
                          {
                            borderColor: value === t.value ? theme.tint : theme.border,
                            backgroundColor: value === t.value ? theme.tint + '20' : theme.surface,
                          },
                        ]}
                      >
                        <ThemedText
                          style={[styles.chipText, value === t.value && { color: theme.tint }]}
                        >
                          {t.label}
                        </ThemedText>
                      </Pressable>
                    ))}
                  </View>
                )}
              />

              {/* Amount */}
              <ThemedText style={[styles.label, { color: theme.textSecondary }]}>
                Amount
              </ThemedText>
              <Controller
                control={control}
                name="amount"
                render={({ field: { onChange, onBlur } }) => (
                  <TextInput
                    style={[styles.input, { color: theme.text, borderColor: theme.border, backgroundColor: theme.surface }]}
                    placeholder="e.g. 80.00"
                    placeholderTextColor={theme.textSecondary}
                    keyboardType="decimal-pad"
                    value={amountInput}
                    onChangeText={(text) => {
                      const nextValue = text.trim();
                      if (!isValidAmountInput(nextValue)) {
                        return;
                      }
                      setAmountInput(nextValue);
                      onChange(parseAmountInput(nextValue));
                    }}
                    onBlur={() => {
                      onBlur();
                      if (!amountInput) return;
                      setAmountInput((prev) => formatMinorUnitAmountForInput(parseAmountInput(prev)));
                    }}
                  />
                )}
              />
              {errors.amount && (
                <ThemedText style={styles.errorText}>{errors.amount.message}</ThemedText>
              )}

              {/* Account Picker */}
              <ThemedText style={[styles.label, { color: theme.textSecondary }]}>Account</ThemedText>
              <Controller
                control={control}
                name="accountId"
                render={({ field: { onChange, value } }) => (
                  <View style={styles.chipRow}>
                    {(accounts ?? []).map((acc) => (
                      <Pressable
                        key={acc.id}
                        onPress={() => {
                          Haptics.selectionAsync();
                          onChange(acc.id);
                        }}
                        style={[
                          styles.chip,
                          {
                            borderColor: value === acc.id ? theme.tint : theme.border,
                            backgroundColor: value === acc.id ? theme.tint + '20' : theme.surface,
                          },
                        ]}
                      >
                        <ThemedText
                          style={[styles.chipText, value === acc.id && { color: theme.tint }]}
                        >
                          {acc.name} ({acc.currency})
                        </ThemedText>
                      </Pressable>
                    ))}
                  </View>
                )}
              />
              {errors.accountId && (
                <ThemedText style={styles.errorText}>{errors.accountId.message}</ThemedText>
              )}

              {/* Category Picker */}
              <ThemedText style={[styles.label, { color: theme.textSecondary }]}>
                Category (optional)
              </ThemedText>
              <Controller
                control={control}
                name="categoryId"
                render={({ field: { onChange, value } }) => (
                  <View style={styles.chipRow}>
                    <Pressable
                      onPress={() => {
                        Haptics.selectionAsync();
                        onChange(null);
                      }}
                      style={[
                        styles.chip,
                        {
                          borderColor: value === null || value === undefined ? theme.tint : theme.border,
                          backgroundColor: value === null || value === undefined ? theme.tint + '20' : theme.surface,
                        },
                      ]}
                    >
                      <ThemedText
                        style={[styles.chipText, (value === null || value === undefined) && { color: theme.tint }]}
                      >
                        None
                      </ThemedText>
                    </Pressable>
                    {(categories ?? []).map((cat) => (
                      <Pressable
                        key={cat.id}
                        onPress={() => {
                          Haptics.selectionAsync();
                          onChange(cat.id);
                        }}
                        style={[
                          styles.chip,
                          {
                            borderColor: value === cat.id ? cat.color : theme.border,
                            backgroundColor: value === cat.id ? cat.color + '20' : theme.surface,
                          },
                        ]}
                      >
                        <ThemedText
                          style={[styles.chipText, value === cat.id && { color: cat.color }]}
                        >
                          {cat.title}
                        </ThemedText>
                      </Pressable>
                    ))}
                  </View>
                )}
              />

              {/* Date */}
              <ThemedText style={[styles.label, { color: theme.textSecondary }]}>Date</ThemedText>
              <Controller
                control={control}
                name="date"
                render={({ field: { onChange, value } }) => (
                  <DatePickerField
                    value={value}
                    onChange={onChange}
                  />
                )}
              />
              {errors.date && (
                <ThemedText style={styles.errorText}>{errors.date.message}</ThemedText>
              )}

              {/* Description */}
              <ThemedText style={[styles.label, { color: theme.textSecondary }]}>
                Description (optional)
              </ThemedText>
              <Controller
                control={control}
                name="description"
                render={({ field: { onChange, onBlur, value } }) => (
                  <TextInput
                    style={[styles.input, { color: theme.text, borderColor: theme.border, backgroundColor: theme.surface }]}
                    placeholder="What was this for?"
                    placeholderTextColor={theme.textSecondary}
                    value={value}
                    onChangeText={onChange}
                    onBlur={onBlur}
                  />
                )}
              />

              {/* Buttons */}
              <View style={styles.modalButtons}>
                <Pressable onPress={closeModal} style={[styles.btn, { borderColor: theme.border }]}>
                  <ThemedText>Cancel</ThemedText>
                </Pressable>
                <Pressable
                  onPress={handleSubmit(onSubmit)}
                  style={[styles.btn, styles.btnPrimary, { backgroundColor: theme.tint }]}
                >
                  <ThemedText style={{ color: '#fff' }}>Create</ThemedText>
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
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  list: {
    paddingVertical: 12,
    flexGrow: 1,
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
  noteFab: {
    position: 'absolute',
    right: 24,
    bottom: 94,
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.15,
    shadowRadius: 3,
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
    marginBottom: 16,
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
    marginTop: 4,
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
