import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import * as Haptics from 'expo-haptics';

import { ThemedText } from '@/components/themed-text';
import { useThemeColor } from '@/hooks/use-theme-color';
import type { LinkedAccount } from '@/lib/types';

interface AccountChartPickerProps {
  accounts: LinkedAccount[];
  selectedAccountId: string | null;
  onSelect: (accountId: string | null) => void;
}

export function AccountChartPicker({
  accounts,
  selectedAccountId,
  onSelect,
}: AccountChartPickerProps) {
  const tint = useThemeColor({}, 'tint');
  const borderColor = useThemeColor({}, 'border');
  const surface = useThemeColor({}, 'surface');

  const isAllSelected = selectedAccountId === null;

  return (
    <View style={styles.container}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.chipRow}
      >
        {/* "All" chip */}
        <Pressable
          onPress={() => {
            Haptics.selectionAsync();
            onSelect(null);
          }}
          style={[
            styles.chip,
            {
              borderColor: isAllSelected ? tint : borderColor,
              backgroundColor: isAllSelected ? tint + '20' : surface,
            },
          ]}
        >
          <ThemedText style={[styles.chipText, isAllSelected && { color: tint }]}>
            All
          </ThemedText>
        </Pressable>

        {/* One chip per account */}
        {accounts.map((account) => {
          const isSelected = selectedAccountId === account.id;
          return (
            <Pressable
              key={account.id}
              onPress={() => {
                Haptics.selectionAsync();
                onSelect(account.id);
              }}
              style={[
                styles.chip,
                {
                  borderColor: isSelected ? tint : borderColor,
                  backgroundColor: isSelected ? tint + '20' : surface,
                },
              ]}
            >
              <ThemedText style={[styles.chipText, isSelected && { color: tint }]}>
                {account.name} ({account.currency})
              </ThemedText>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginHorizontal: 16,
  },
  chipRow: {
    flexDirection: 'row',
    gap: 8,
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
});
