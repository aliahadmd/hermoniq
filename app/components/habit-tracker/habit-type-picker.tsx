import { Modal, Pressable, StyleSheet, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';

import { ThemedText } from '@/components/themed-text';
import { useThemeColor } from '@/hooks/use-theme-color';
import type { HabitType } from '@/lib/types';

interface HabitTypePickerProps {
  visible: boolean;
  onClose: () => void;
  onSelect: (type: HabitType) => void;
}

const options: {
  type: HabitType;
  title: string;
  description: string;
  icon: keyof typeof Ionicons.glyphMap;
}[] = [
  {
    type: 'yes_no',
    title: 'Yes or No',
    description: 'Track actions with simple done or not done checks.',
    icon: 'checkmark-circle-outline',
  },
  {
    type: 'measurable',
    title: 'Measurable',
    description: 'Track numeric values against a daily target.',
    icon: 'bar-chart-outline',
  },
];

export function HabitTypePicker({ visible, onClose, onSelect }: HabitTypePickerProps) {
  const cardBg = useThemeColor({}, 'card');
  const borderColor = useThemeColor({}, 'border');
  const surface = useThemeColor({}, 'surface');
  const tint = useThemeColor({}, 'tint');
  const textSecondary = useThemeColor({}, 'textSecondary');

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={[styles.card, { backgroundColor: cardBg, borderColor }]}>
          <View style={styles.headerRow}>
            <ThemedText type="subtitle">Create Habit</ThemedText>
            <Pressable
              onPress={onClose}
              hitSlop={8}
              style={styles.closeButton}
            >
              <Ionicons name="close" size={20} color={textSecondary} />
            </Pressable>
          </View>

          <View style={styles.options}>
            {options.map((option) => (
              <Pressable
                key={option.type}
                onPress={() => {
                  Haptics.selectionAsync();
                  onSelect(option.type);
                }}
                style={[styles.optionCard, { backgroundColor: surface, borderColor }]}
              >
                <Ionicons name={option.icon} size={20} color={tint} />
                <View style={styles.optionText}>
                  <ThemedText type="defaultSemiBold">{option.title}</ThemedText>
                  <ThemedText style={{ color: textSecondary, fontSize: 13 }}>
                    {option.description}
                  </ThemedText>
                </View>
                <Ionicons name="chevron-forward" size={18} color={textSecondary} />
              </Pressable>
            ))}
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
    padding: 20,
  },
  card: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 16,
    padding: 16,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  closeButton: {
    padding: 4,
  },
  options: {
    gap: 10,
  },
  optionCard: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 12,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  optionText: {
    flex: 1,
    gap: 2,
  },
});
