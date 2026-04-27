import { useEffect, useState } from 'react';
import { Modal, Pressable, StyleSheet, TextInput, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import dayjs from 'dayjs';

import { ThemedText } from '@/components/themed-text';
import { useThemeColor } from '@/hooks/use-theme-color';

interface MeasurableLogModalProps {
  visible: boolean;
  habitName: string;
  date: string;
  unit?: string | null;
  target?: number | null;
  initialValue?: number | null;
  initialNote?: string | null;
  requireNoteForCompletion?: boolean;
  onClose: () => void;
  onSave: (value: number, note: string) => void;
  onClear?: () => void;
}

export function MeasurableLogModal({
  visible,
  habitName,
  date,
  unit,
  target,
  initialValue,
  initialNote,
  requireNoteForCompletion = false,
  onClose,
  onSave,
  onClear,
}: MeasurableLogModalProps) {
  const cardBg = useThemeColor({}, 'card');
  const borderColor = useThemeColor({}, 'border');
  const surface = useThemeColor({}, 'surface');
  const tint = useThemeColor({}, 'tint');
  const danger = useThemeColor({}, 'danger');
  const text = useThemeColor({}, 'text');
  const textSecondary = useThemeColor({}, 'textSecondary');

  const [valueInput, setValueInput] = useState('');
  const [noteInput, setNoteInput] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) return;
    setValueInput(initialValue !== null && initialValue !== undefined ? String(initialValue) : '');
    setNoteInput(initialNote ?? '');
    setErrorMessage(null);
  }, [initialNote, initialValue, visible]);

  const save = () => {
    const trimmed = valueInput.trim();
    if (!/^\d+$/.test(trimmed)) return;
    const parsed = Number.parseInt(trimmed, 10);
    if (!Number.isFinite(parsed) || parsed < 0) return;
    const trimmedNote = noteInput.trim();
    const isCompletion = target !== null && target !== undefined ? parsed >= target : parsed > 0;
    if (requireNoteForCompletion && isCompletion && trimmedNote.length === 0) {
      setErrorMessage('Please add a note for completed days.');
      return;
    }
    setErrorMessage(null);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    onSave(parsed, trimmedNote);
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={[styles.card, { backgroundColor: cardBg, borderColor }]}>
          <ThemedText type="subtitle">Log Value</ThemedText>
          <ThemedText style={{ color: textSecondary, marginTop: 6 }}>
            {habitName}
          </ThemedText>
          <ThemedText style={{ color: textSecondary, fontSize: 13 }}>
            {dayjs(date).format('ddd, MMM D, YYYY')}
          </ThemedText>

          <View style={styles.metaRow}>
            <View style={styles.metaItem}>
              <ThemedText style={{ color: textSecondary, fontSize: 12 }}>Target</ThemedText>
              <ThemedText type="defaultSemiBold">
                {target ?? 0}
                {unit ? ` ${unit}` : ''}
              </ThemedText>
            </View>
            <View style={styles.metaItem}>
              <ThemedText style={{ color: textSecondary, fontSize: 12 }}>Unit</ThemedText>
              <ThemedText type="defaultSemiBold">{unit ?? '-'}</ThemedText>
            </View>
          </View>

          <TextInput
            style={[styles.input, { borderColor, backgroundColor: surface, color: text }]}
            placeholder="Enter value"
            placeholderTextColor={textSecondary}
            keyboardType="number-pad"
            value={valueInput}
            onChangeText={(next) => {
              if (!/^\d*$/.test(next)) return;
              setValueInput(next);
            }}
          />
          <TextInput
            style={[styles.input, styles.noteInput, { borderColor, backgroundColor: surface, color: text }]}
            placeholder="Add note (optional)"
            placeholderTextColor={textSecondary}
            value={noteInput}
            onChangeText={(next) => {
              setNoteInput(next);
              if (errorMessage) setErrorMessage(null);
            }}
            multiline
            maxLength={500}
          />
          {errorMessage ? (
            <ThemedText style={{ color: danger, fontSize: 12 }}>{errorMessage}</ThemedText>
          ) : null}

          <View style={styles.actions}>
            {onClear && initialValue !== null && initialValue !== undefined ? (
              <Pressable onPress={onClear} style={[styles.button, { borderColor: danger }]}>
                <ThemedText style={{ color: danger }}>Clear</ThemedText>
              </Pressable>
            ) : null}
            <Pressable onPress={onClose} style={[styles.button, { borderColor }]}>
              <ThemedText>Cancel</ThemedText>
            </Pressable>
            <Pressable onPress={save} style={[styles.button, styles.primaryButton, { backgroundColor: tint }]}>
              <ThemedText style={{ color: '#fff' }}>Save</ThemedText>
            </Pressable>
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
    gap: 10,
  },
  metaRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 6,
  },
  metaItem: {
    flex: 1,
    gap: 2,
  },
  input: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    marginTop: 4,
  },
  noteInput: {
    minHeight: 80,
    textAlignVertical: 'top',
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
    marginTop: 8,
  },
  button: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  primaryButton: {
    borderWidth: 0,
  },
});
