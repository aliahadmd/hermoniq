import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { useThemeColor } from '@/hooks/use-theme-color';
import { formatMinorUnitAmount } from '@/lib/currency';
import type { CurrencyBalance } from '@/lib/types';

interface BalanceSummaryProps {
  groups: CurrencyBalance[];
}

export function BalanceSummary({ groups }: BalanceSummaryProps) {
  const cardBg = useThemeColor({}, 'card');
  const borderColor = useThemeColor({}, 'border');
  const tint = useThemeColor({}, 'tint');
  const secondaryText = useThemeColor({}, 'textSecondary');

  if (groups.length === 0) {
    return (
      <View style={styles.empty}>
        <ThemedText style={{ color: secondaryText }}>No accounts yet</ThemedText>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {groups.map((group) => (
        <View key={group.currency} style={[styles.card, { backgroundColor: cardBg, borderColor }]}>
          <View style={styles.groupHeader}>
            <ThemedText type="defaultSemiBold">{group.currency}</ThemedText>
            <ThemedText style={[styles.total, { color: tint }]}>
              {formatMinorUnitAmount(group.totalBalance, group.currency)}
            </ThemedText>
          </View>
          {group.accounts.map((acct) => (
            <View key={acct.id} style={[styles.accountRow, { borderTopColor: borderColor }]}>
              <ThemedText style={styles.accountName} numberOfLines={1}>
                {acct.name}
              </ThemedText>
              <ThemedText style={{ color: secondaryText }}>
                {formatMinorUnitAmount(acct.balance, group.currency)}
              </ThemedText>
            </View>
          ))}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 12,
    paddingHorizontal: 16,
  },
  card: {
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 16,
  },
  groupHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  total: {
    fontSize: 20,
    fontWeight: '700',
  },
  accountRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 8,
    marginTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  accountName: {
    flex: 1,
    marginRight: 12,
    fontSize: 14,
  },
  empty: {
    alignItems: 'center',
    paddingVertical: 24,
  },
});
