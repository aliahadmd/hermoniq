import { Alert, Pressable, StyleSheet, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';

import { ThemedText } from '@/components/themed-text';
import { useThemeColor } from '@/hooks/use-theme-color';
import { formatMinorUnitAmount } from '@/lib/currency';
import type { LinkedAccount } from '@/lib/types';

const TYPE_LABELS: Record<string, string> = {
  bank_account: 'Bank Account',
  card: 'Card',
  cash: 'Cash',
};

interface AccountCardProps {
  account: LinkedAccount;
  thisMonthSpend: number;
  onEdit: (account: LinkedAccount) => void;
  onDelete: (account: LinkedAccount) => void;
}

export function AccountCard({ account, thisMonthSpend, onEdit, onDelete }: AccountCardProps) {
  const cardBg = useThemeColor({}, 'card');
  const borderColor = useThemeColor({}, 'border');
  const secondaryText = useThemeColor({}, 'textSecondary');
  const tint = useThemeColor({}, 'tint');
  const dangerColor = useThemeColor({}, 'danger');

  const handleEdit = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onEdit(account);
  };

  const handleDelete = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    Alert.alert(
      'Delete Account',
      `Are you sure you want to delete "${account.name}"? All associated transactions will also be deleted.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => onDelete(account),
        },
      ],
    );
  };

  return (
    <View style={[styles.card, { backgroundColor: cardBg, borderColor }]}>
      <View style={styles.header}>
        <View style={styles.info}>
          <ThemedText type="defaultSemiBold">{account.name}</ThemedText>
          <ThemedText style={[styles.type, { color: secondaryText }]}>
            {TYPE_LABELS[account.type] ?? account.type} · {account.currency}
          </ThemedText>
        </View>
        <ThemedText style={[styles.balance, { color: tint }]}>
          {formatMinorUnitAmount(account.balance, account.currency)}
        </ThemedText>
      </View>
      <View style={[styles.totalsRow, { borderTopColor: borderColor }]}>
        <View style={styles.totalItem}>
          <ThemedText style={[styles.totalLabel, { color: secondaryText }]}>
            This Month Spend
          </ThemedText>
          <ThemedText type="defaultSemiBold" style={{ color: dangerColor }}>
            {formatMinorUnitAmount(thisMonthSpend, account.currency)}
          </ThemedText>
        </View>
      </View>
      <View style={styles.actions}>
        <Pressable onPress={handleEdit} hitSlop={8} style={styles.actionBtn}>
          <Ionicons name="pencil-outline" size={18} color={secondaryText} />
        </Pressable>
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
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  info: {
    flex: 1,
    marginRight: 12,
  },
  type: {
    fontSize: 13,
    marginTop: 2,
  },
  balance: {
    fontSize: 18,
    fontWeight: '700',
  },
  totalsRow: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: 12,
  },
  totalItem: {
    flex: 1,
  },
  totalLabel: {
    fontSize: 12,
    marginBottom: 4,
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 16,
    marginTop: 12,
  },
  actionBtn: {
    padding: 4,
  },
});
