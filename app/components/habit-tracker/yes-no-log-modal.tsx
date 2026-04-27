import { useEffect, useState } from 'react';
import { Modal, Pressable, StyleSheet, Switch, TextInput, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import dayjs from 'dayjs';

import { ThemedText } from '@/components/themed-text';
import { useThemeColor } from '@/hooks/use-theme-color';

interface YesNoLogModalProps {
  visible: boolean;
  habitName: string;
  question: string;
  date: string;
  initialCompleted: boolean;
  initialNote?: string | null;
  requireNoteForCompletion?: boolean;
  onClose: () => void;
  onSave: (completed: boolean, note: string) => void;
  onClear?: () => void;
}

export function YesNoLogModal({
  visible,
  habitName,
  question,
  date,
  initialCompleted,
  initialNote,
  requireNoteForCompletion = false,
  onClose,
  onSave,
  onClear,
}: YesNoLogModalProps) {
  const cardBg = useThemeColor({}, 'card');
  const borderColor = useThemeColor({}, 'border');
  const surface = useThemeColor({}, 'surface');
  const tint = useThemeColor({}, 'tint');
  const danger = useThemeColor({}, 'danger');
  const text = useThemeColor({}, 'text');
  const textSecondary = useThemeColor({}, 'textSecondary');

  const [completed, setCompleted] = useState(initialCompleted);
  const [noteInput, setNoteInput] = useState(initialNote ?? '');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) return;
    setCompleted(initialCompleted);
    setNoteInput(initialNote ?? '');
    setErrorMessage(null);
  }, [initialCompleted, initialNote, visible]);

  const save = () => {
    const trimmedNote = noteInput.trim();
    if (requireNoteForCompletion && completed && trimmedNote.length === 0) {
      setErrorMessage('Please add a note for completed days.');
      return;
    }
    setErrorMessage(null);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    onSave(completed, trimmedNote);
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={[styles.card, { backgroundColor: cardBg, borderColor }]}>
          <ThemedText type="subtitle">Mark Habit</ThemedText>
          <ThemedText style={{ color: textSecondary, marginTop: 4 }}>
            {habitName}
          </ThemedText>
          <ThemedText style={{ color: textSecondary, fontSize: 13 }}>
            {dayjs(date).format('ddd, MMM D, YYYY')}
          </ThemedText>

          <View style={[styles.statusRow, { borderColor, backgroundColor: surface }]}>
            <View style={{ flex: 1 }}>
              <ThemedText type="defaultSemiBold">Achieved this day</ThemedText>
              <ThemedText style={{ color: textSecondary, fontSize: 12, marginTop: 2 }}>
                {question}
              </ThemedText>
            </View>
            <Switch
              value={completed}
              onValueChange={(next) => {
                Haptics.selectionAsync();
                setCompleted(next);
              }}
            />
          </View>

          <TextInput
            style={[styles.noteInput, { borderColor, backgroundColor: surface, color: text }]}
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
            {onClear ? (
              <Pressable onPress={onClear} style={[styles.button, { borderColor: danger }]}>
                <ThemedText style={{ color: danger }}>Clear</ThemedText>
              </Pressable>
            ) : null}
            <Pressable onPress={onClose} style={[styles.button, { borderColor }]}>
              <ThemedText style={{ color: textSecondary }}>Cancel</ThemedText>
            </Pressable>
            <Pressable onPress={save} style={[styles.button, styles.primaryButton, { backgroundColor: tint }]}>
              <ThemedText style={styles.primaryButtonText}>Save</ThemedText>
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
  statusRow: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  noteInput: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    minHeight: 80,
    textAlignVertical: 'top',
    fontSize: 16,
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
    marginTop: 4,
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
  primaryButtonText: {
    color: '#fff',
    fontWeight: '700',
  },
});
