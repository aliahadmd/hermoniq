import { useEffect, useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { useThemeColor } from '@/hooks/use-theme-color';

interface CategoryQuickAddProps {
  visible: boolean;
  submitting?: boolean;
  errorMessage?: string | null;
  onClose: () => void;
  onCreate: (name: string) => void;
}

export function CategoryQuickAdd({
  visible,
  submitting = false,
  errorMessage,
  onClose,
  onCreate,
}: CategoryQuickAddProps) {
  const [name, setName] = useState('');
  const text = useThemeColor({}, 'text');
  const textSecondary = useThemeColor({}, 'textSecondary');
  const surface = useThemeColor({}, 'surface');
  const card = useThemeColor({}, 'card');
  const border = useThemeColor({}, 'border');
  const tint = useThemeColor({}, 'tint');
  const danger = useThemeColor({}, 'danger');

  useEffect(() => {
    if (!visible) {
      setName('');
    }
  }, [visible]);

  return (
    <Modal visible={visible} transparent animationType="fade">
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.overlay}
      >
        <View style={[styles.modalCard, { backgroundColor: card, borderColor: border }]}>
          <ThemedText type="subtitle">Add Category</ThemedText>
          <ThemedText style={[styles.description, { color: textSecondary }]}>
            Create a category to organize notes.
          </ThemedText>

          <TextInput
            value={name}
            onChangeText={setName}
            placeholder="Category name"
            placeholderTextColor={textSecondary}
            style={[
              styles.input,
              {
                color: text,
                borderColor: border,
                backgroundColor: surface,
              },
            ]}
            maxLength={40}
            autoCapitalize="words"
            autoCorrect={false}
          />

          {errorMessage ? (
            <ThemedText style={[styles.errorText, { color: danger }]}>{errorMessage}</ThemedText>
          ) : null}

          <View style={styles.actions}>
            <Pressable onPress={onClose} style={[styles.button, { borderColor: border }]}>
              <ThemedText>Cancel</ThemedText>
            </Pressable>
            <Pressable
              onPress={() => onCreate(name)}
              disabled={submitting}
              style={[
                styles.button,
                styles.primaryButton,
                { borderColor: tint, backgroundColor: `${tint}1F` },
              ]}
            >
              <ThemedText style={{ color: tint }}>{submitting ? 'Saving...' : 'Save'}</ThemedText>
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
    backgroundColor: 'rgba(0,0,0,0.2)',
  },
  modalCard: {
    width: '100%',
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 16,
  },
  description: {
    fontSize: 13,
    marginTop: 4,
    marginBottom: 12,
  },
  input: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
  },
  errorText: {
    marginTop: 8,
    fontSize: 13,
  },
  actions: {
    marginTop: 14,
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
  },
  button: {
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 14,
    minWidth: 84,
    alignItems: 'center',
  },
  primaryButton: {
    minWidth: 92,
  },
});
