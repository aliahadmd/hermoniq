import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import {
  useCreateNoteCategory,
  useDeleteNoteCategory,
  useNoteCategories,
  useUpdateNoteCategory,
} from '@/hooks/use-notes';
import { useThemeColor } from '@/hooks/use-theme-color';
import type { NoteCategory } from '@/lib/types';

export default function NoteCategoriesScreen() {
  const text = useThemeColor({}, 'text');
  const textSecondary = useThemeColor({}, 'textSecondary');
  const border = useThemeColor({}, 'border');
  const surface = useThemeColor({}, 'surface');
  const tint = useThemeColor({}, 'tint');
  const danger = useThemeColor({}, 'danger');

  const categoriesQuery = useNoteCategories();
  const createCategory = useCreateNoteCategory();
  const updateCategory = useUpdateNoteCategory();
  const deleteCategory = useDeleteNoteCategory();

  const [modalVisible, setModalVisible] = useState(false);
  const [editingCategory, setEditingCategory] = useState<NoteCategory | null>(null);
  const [nameInput, setNameInput] = useState('');

  const openCreate = () => {
    setEditingCategory(null);
    setNameInput('');
    setModalVisible(true);
  };

  const openEdit = (category: NoteCategory) => {
    setEditingCategory(category);
    setNameInput(category.name);
    setModalVisible(true);
  };

  const closeModal = () => {
    setModalVisible(false);
    setEditingCategory(null);
    setNameInput('');
  };

  const saveCategory = () => {
    const name = nameInput.trim();
    if (!name) {
      Alert.alert('Missing name', 'Please enter a category name.');
      return;
    }

    if (editingCategory) {
      updateCategory.mutate(
        { id: editingCategory.id, data: { name } },
        {
          onSuccess: closeModal,
          onError: (error) => Alert.alert('Error', error.message),
        },
      );
      return;
    }

    createCategory.mutate(
      { name },
      {
        onSuccess: closeModal,
        onError: (error) => Alert.alert('Error', error.message),
      },
    );
  };

  const handleDelete = (category: NoteCategory) => {
    Alert.alert(
      'Delete Category',
      `Delete "${category.name}"? Notes in this category will become uncategorized.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () =>
            deleteCategory.mutate(category.id, {
              onError: (error) => Alert.alert('Error', error.message),
            }),
        },
      ],
    );
  };

  if (categoriesQuery.isLoading) {
    return (
      <ThemedView style={styles.centered}>
        <ActivityIndicator size="large" color={tint} />
      </ThemedView>
    );
  }

  if (categoriesQuery.error) {
    return (
      <ThemedView style={styles.centered}>
        <ThemedText>Failed to load note categories</ThemedText>
        <ThemedText style={{ color: textSecondary, marginTop: 6, fontSize: 13 }}>
          {categoriesQuery.error.message}
        </ThemedText>
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.container}>
      <FlatList
        data={categoriesQuery.data ?? []}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => (
          <Pressable
            onPress={() => openEdit(item)}
            style={[styles.row, { borderColor: border, backgroundColor: surface }]}
          >
            <ThemedText type="defaultSemiBold" style={styles.rowTitle}>
              {item.name}
            </ThemedText>
            <Pressable
              onPress={() => handleDelete(item)}
              hitSlop={8}
              style={styles.deleteButton}
            >
              <Ionicons name="trash-outline" size={18} color={danger} />
            </Pressable>
          </Pressable>
        )}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <ThemedText style={{ color: textSecondary }}>No note categories yet</ThemedText>
          </View>
        }
      />

      <Pressable onPress={openCreate} style={[styles.fab, { backgroundColor: tint }]}>
        <ThemedText style={styles.fabText}>+</ThemedText>
      </Pressable>

      <Modal visible={modalVisible} animationType="slide" transparent>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.modalOverlay}
        >
          <View style={[styles.modalCard, { borderColor: border, backgroundColor: surface }]}>
            <ScrollView keyboardShouldPersistTaps="handled">
              <ThemedText type="subtitle">
                {editingCategory ? 'Rename Category' : 'New Category'}
              </ThemedText>

              <ThemedText style={[styles.modalLabel, { color: textSecondary }]}>Name</ThemedText>
              <TextInput
                value={nameInput}
                onChangeText={setNameInput}
                placeholder="Category name"
                placeholderTextColor={textSecondary}
                style={[
                  styles.modalInput,
                  {
                    color: text,
                    borderColor: border,
                    backgroundColor: surface,
                  },
                ]}
                maxLength={40}
                autoCapitalize="words"
              />

              <View style={styles.modalActions}>
                <Pressable
                  onPress={closeModal}
                  style={[styles.modalButton, { borderColor: border }]}
                >
                  <ThemedText>Cancel</ThemedText>
                </Pressable>
                <Pressable
                  onPress={saveCategory}
                  style={[
                    styles.modalButton,
                    styles.primaryButton,
                    { borderColor: tint, backgroundColor: `${tint}1F` },
                  ]}
                >
                  <ThemedText style={{ color: tint }}>
                    {createCategory.isPending || updateCategory.isPending ? 'Saving...' : 'Save'}
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
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  list: {
    padding: 16,
    paddingBottom: 100,
    gap: 10,
  },
  row: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
  },
  rowTitle: {
    flex: 1,
  },
  deleteButton: {
    padding: 4,
  },
  emptyState: {
    alignItems: 'center',
    paddingTop: 48,
  },
  fab: {
    position: 'absolute',
    right: 20,
    bottom: 24,
    width: 56,
    height: 56,
    borderRadius: 28,
    justifyContent: 'center',
    alignItems: 'center',
  },
  fabText: {
    color: '#ffffff',
    fontSize: 28,
    lineHeight: 30,
  },
  modalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.22)',
  },
  modalCard: {
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 16,
    maxHeight: '70%',
  },
  modalLabel: {
    marginTop: 12,
    marginBottom: 6,
    fontSize: 13,
  },
  modalInput: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
  },
  modalActions: {
    marginTop: 16,
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
  },
  modalButton: {
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
