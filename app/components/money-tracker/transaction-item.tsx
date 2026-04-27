import { Alert, Pressable, StyleSheet, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';

import { ThemedText } from '@/components/themed-text';
import { useThemeColor } from '@/hooks/use-theme-color';
import { formatMinorUnitAmount } from '@/lib/currency';
import { formatTransactionDateLabel } from '@/lib/transaction-date';
import type { Transaction } from '@/lib/types';

interface TransactionItemProps {
  transaction: Transaction;
  onDelete: (transaction: Transaction) => void;
}

export function TransactionItem({ transaction, onDelete }: TransactionItemProps) {
  const cardBg = useThemeColor({}, 'card');
  const borderColor = useThemeColor({}, 'border');
  const secondaryText = useThemeColor({}, 'textSecondary');
  const successColor = useThemeColor({}, 'success');
  const dangerColor = useThemeColor({}, 'danger');

  const isIncome = transaction.type === 'income';
  const amountColor = isIncome ? successColor : dangerColor;
  const prefix = isIncome ? '+' : '-';

  const handleDelete = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    Alert.alert(
      'Delete Transaction',
      'Are you sure you want to delete this transaction? The account balance will be adjusted.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => onDelete(transaction),
        },
      ],
    );
  };

  return (
    <View style={[styles.card, { backgroundColor: cardBg, borderColor }]}>
      <View style={styles.row}>
        <View style={[styles.typeBadge, { backgroundColor: amountColor + '18' }]}>
          <Ionicons
            name={isIncome ? 'arrow-down-outline' : 'arrow-up-outline'}
            size={18}
            color={amountColor}
          />
        </View>
        <View style={styles.info}>
          <ThemedText type="defaultSemiBold" numberOfLines={1}>
            {transaction.description || (isIncome ? 'Income' : 'Expense')}
          </ThemedText>
          <ThemedText style={[styles.meta, { color: secondaryText }]}>
            {formatTransactionDateLabel(transaction.date)}
            {transaction.accountName ? ` · ${transaction.accountName}` : ''}
          </ThemedText>
        </View>
        <ThemedText style={[styles.amount, { color: amountColor }]}>
          {prefix}{formatMinorUnitAmount(transaction.amount, transaction.accountCurrency)}
        </ThemedText>
      </View>
      <View style={styles.actions}>
        <Pressable onPress={handleDelete} hitSlop={8} style={styles.actionBtn}>
          <Ionicons name="trash-outline" size={18} color={dangerColor} />
        </Pressable>
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
    marginVertical: 6,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  typeBadge: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  info: {
    flex: 1,
    marginHorizontal: 12,
  },
  meta: {
    fontSize: 13,
    marginTop: 2,
  },
  amount: {
    fontSize: 16,
    fontWeight: '700',
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: 8,
  },
  actionBtn: {
    padding: 4,
  },
});
