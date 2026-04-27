import { useCallback, useMemo, useState } from 'react';
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
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import dayjs from 'dayjs';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { AccountCard } from '@/components/money-tracker/account-card';
import { useAccounts, useCreateAccount, useUpdateAccount, useDeleteAccount } from '@/hooks/use-accounts';
import { useTransactions } from '@/hooks/use-transactions';
import { createAccountSchema } from '@/lib/validators';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import {
  formatMinorUnitAmountForInput,
  isValidAmountInput,
  parseAmountInput,
} from '@/lib/format-amount';
import { getTransactionMonthKey } from '@/lib/transaction-date';
import type { LinkedAccount, AccountType, Currency } from '@/lib/types';
import type { z } from 'zod';

type CreateAccountForm = z.infer<typeof createAccountSchema>;

const CURRENCIES: Currency[] = ['BDT', 'USD', 'RMB'];
const ACCOUNT_TYPES: { value: AccountType; label: string }[] = [
  { value: 'bank_account', label: 'Bank Account' },
  { value: 'card', label: 'Card' },
  { value: 'cash', label: 'Cash' },
];

export default function AccountsScreen() {
  const { colors } = useTheme();
  const colorScheme = useColorScheme() ?? 'light';
  const theme = Colors[colorScheme];

  const accountsQuery = useAccounts();
  const transactionsQuery = useTransactions();
  const { data: accounts, isLoading, error } = accountsQuery;
  const { data: transactions } = transactionsQuery;
  const createAccount = useCreateAccount();
  const updateAccount = useUpdateAccount();
  const deleteAccount = useDeleteAccount();

  const refreshing = accountsQuery.isRefetching || transactionsQuery.isRefetching;

  const refreshAll = useCallback(() => {
    accountsQuery.refetch();
    transactionsQuery.refetch();
  }, [accountsQuery, transactionsQuery]);

  const [modalVisible, setModalVisible] = useState(false);
  const [editingAccount, setEditingAccount] = useState<LinkedAccount | null>(null);
  const [balanceInput, setBalanceInput] = useState('');

  const {
    control,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<CreateAccountForm>({
    resolver: zodResolver(createAccountSchema),
    defaultValues: { name: '', type: 'bank_account', currency: 'BDT', balance: 0 },
  });

  const accountMonthlySpend = useMemo(() => {
    const monthlySpendByAccount: Record<string, number> = {};
    const currentMonth = dayjs().format('YYYY-MM');

    for (const account of accounts ?? []) {
      monthlySpendByAccount[account.id] = 0;
    }

    for (const tx of transactions ?? []) {
      if (tx.type !== 'expense') continue;
      if (!(tx.accountId in monthlySpendByAccount)) continue;
      if (getTransactionMonthKey(tx.date) !== currentMonth) continue;

      monthlySpendByAccount[tx.accountId] += tx.amount;
    }

    return monthlySpendByAccount;
  }, [accounts, transactions]);

  const openCreate = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setEditingAccount(null);
    reset({ name: '', type: 'bank_account', currency: 'BDT', balance: 0 });
    setBalanceInput('');
    setModalVisible(true);
  };

  const openEdit = (account: LinkedAccount) => {
    setEditingAccount(account);
    reset({
      name: account.name,
      type: account.type,
      currency: account.currency,
      balance: account.balance,
    });
    setBalanceInput(formatMinorUnitAmountForInput(account.balance));
    setModalVisible(true);
  };

  const closeModal = () => {
    setModalVisible(false);
    setEditingAccount(null);
    setBalanceInput('');
  };

  const onSubmit = (data: CreateAccountForm) => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    if (editingAccount) {
      updateAccount.mutate(
        { id: editingAccount.id, data: { name: data.name, type: data.type, balance: data.balance } },
        { onSuccess: closeModal, onError: (e) => Alert.alert('Error', e.message) },
      );
    } else {
      createAccount.mutate(data, {
        onSuccess: closeModal,
        onError: (e) => Alert.alert('Error', e.message),
      });
    }
  };

  const handleDelete = (account: LinkedAccount) => {
    deleteAccount.mutate(account.id, {
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
        <ThemedText>Failed to load accounts</ThemedText>
        <ThemedText style={{ color: theme.textSecondary, fontSize: 13, marginTop: 4 }}>
          {error.message}
        </ThemedText>
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.container}>
      <FlatList
        data={accounts}
        keyExtractor={(item) => item.id}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={refreshAll} tintColor={theme.tint} />
        }
        renderItem={({ item }) => (
          <AccountCard
            account={item}
            thisMonthSpend={accountMonthlySpend[item.id] ?? 0}
            onEdit={openEdit}
            onDelete={handleDelete}
          />
        )}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <View style={styles.center}>
            <ThemedText style={{ color: theme.textSecondary }}>No accounts yet</ThemedText>
          </View>
        }
      />

      {/* FAB */}
      <Pressable
        onPress={openCreate}
        style={[styles.fab, { backgroundColor: theme.tint }]}
      >
        <ThemedText style={styles.fabText}>+</ThemedText>
      </Pressable>

      {/* Form Modal */}
      <Modal visible={modalVisible} animationType="slide" transparent>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.modalOverlay}
        >
          <View style={[styles.modalContent, { backgroundColor: theme.card }]}>
            <ScrollView showsVerticalScrollIndicator={false}>
              <ThemedText type="subtitle" style={styles.modalTitle}>
                {editingAccount ? 'Edit Account' : 'New Account'}
              </ThemedText>

              {/* Name */}
              <ThemedText style={[styles.label, { color: theme.textSecondary }]}>Name</ThemedText>
              <Controller
                control={control}
                name="name"
                render={({ field: { onChange, onBlur, value } }) => (
                  <TextInput
                    style={[styles.input, { color: theme.text, borderColor: theme.border, backgroundColor: theme.surface }]}
                    placeholder="Account name"
                    placeholderTextColor={theme.textSecondary}
                    value={value}
                    onChangeText={onChange}
                    onBlur={onBlur}
                  />
                )}
              />
              {errors.name && (
                <ThemedText style={styles.errorText}>{errors.name.message}</ThemedText>
              )}

              {/* Account Type */}
              <ThemedText style={[styles.label, { color: theme.textSecondary }]}>Type</ThemedText>
              <Controller
                control={control}
                name="type"
                render={({ field: { onChange, value } }) => (
                  <View style={styles.chipRow}>
                    {ACCOUNT_TYPES.map((t) => (
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

              {/* Currency (only on create) */}
              {!editingAccount && (
                <>
                  <ThemedText style={[styles.label, { color: theme.textSecondary }]}>Currency</ThemedText>
                  <Controller
                    control={control}
                    name="currency"
                    render={({ field: { onChange, value } }) => (
                      <View style={styles.chipRow}>
                        {CURRENCIES.map((c) => (
                          <Pressable
                            key={c}
                            onPress={() => {
                              Haptics.selectionAsync();
                              onChange(c);
                            }}
                            style={[
                              styles.chip,
                              {
                                borderColor: value === c ? theme.tint : theme.border,
                                backgroundColor: value === c ? theme.tint + '20' : theme.surface,
                              },
                            ]}
                          >
                            <ThemedText
                              style={[styles.chipText, value === c && { color: theme.tint }]}
                            >
                              {c}
                            </ThemedText>
                          </Pressable>
                        ))}
                      </View>
                    )}
                  />
                </>
              )}

              {/* Balance */}
              <ThemedText style={[styles.label, { color: theme.textSecondary }]}>
                Initial Balance
              </ThemedText>
              <Controller
                control={control}
                name="balance"
                render={({ field: { onChange, onBlur } }) => (
                  <TextInput
                    style={[styles.input, { color: theme.text, borderColor: theme.border, backgroundColor: theme.surface }]}
                    placeholder="0.00"
                    placeholderTextColor={theme.textSecondary}
                    keyboardType="decimal-pad"
                    value={balanceInput}
                    onChangeText={(text) => {
                      const nextValue = text.trim();
                      if (!isValidAmountInput(nextValue)) {
                        return;
                      }

                      setBalanceInput(nextValue);
                      onChange(parseAmountInput(nextValue));
                    }}
                    onBlur={() => {
                      onBlur();
                      if (!balanceInput) return;
                      setBalanceInput((prev) => formatMinorUnitAmountForInput(parseAmountInput(prev)));
                    }}
                  />
                )}
              />
              {errors.balance && (
                <ThemedText style={styles.errorText}>{errors.balance.message}</ThemedText>
              )}

              {/* Buttons */}
              <View style={styles.modalButtons}>
                <Pressable onPress={closeModal} style={[styles.btn, { borderColor: theme.border }]}>
                  <ThemedText>Cancel</ThemedText>
                </Pressable>
                <Pressable
                  onPress={handleSubmit(onSubmit)}
                  style={[styles.btn, styles.btnPrimary, { backgroundColor: theme.tint }]}
                >
                  <ThemedText style={{ color: '#fff' }}>
                    {editingAccount ? 'Save' : 'Create'}
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
