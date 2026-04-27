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
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@react-navigation/native';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import {
  useCategories,
  useCreateCategory,
  useUpdateCategory,
  useDeleteCategory,
} from '@/hooks/use-categories';
import { createCategorySchema } from '@/lib/validators';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import type { Category } from '@/lib/types';
import type { z } from 'zod';

type CategoryFormInput = z.input<typeof createCategorySchema>;
type CategoryFormOutput = z.output<typeof createCategorySchema>;

const PRESET_COLORS = [
  '#d93025', '#e8710a', '#f9ab00', '#0d904f',
  '#1a73e8', '#9334e6', '#e91e8f', '#5f6368',
  '#00897b', '#c47f17', '#6d4c41', '#546e7a',
];

const PRESET_ICONS: { name: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { name: 'cart', icon: 'cart-outline' },
  { name: 'restaurant', icon: 'restaurant-outline' },
  { name: 'car', icon: 'car-outline' },
  { name: 'home', icon: 'home-outline' },
  { name: 'medkit', icon: 'medkit-outline' },
  { name: 'school', icon: 'school-outline' },
  { name: 'gift', icon: 'gift-outline' },
  { name: 'airplane', icon: 'airplane-outline' },
  { name: 'fitness', icon: 'fitness-outline' },
  { name: 'game-controller', icon: 'game-controller-outline' },
  { name: 'musical-notes', icon: 'musical-notes-outline' },
  { name: 'pricetag', icon: 'pricetag-outline' },
  { name: 'wallet', icon: 'wallet-outline' },
  { name: 'briefcase', icon: 'briefcase-outline' },
  { name: 'cash', icon: 'cash-outline' },
  { name: 'ellipsis-horizontal', icon: 'ellipsis-horizontal-circle-outline' },
];

export default function CategoriesScreen() {
  const { colors } = useTheme();
  const colorScheme = useColorScheme() ?? 'light';
  const theme = Colors[colorScheme];

  const { data: categories, isLoading, error } = useCategories();
  const createCategory = useCreateCategory();
  const updateCategory = useUpdateCategory();
  const deleteCategory = useDeleteCategory();

  const [modalVisible, setModalVisible] = useState(false);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);

  const {
    control,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<CategoryFormInput, undefined, CategoryFormOutput>({
    resolver: zodResolver(createCategorySchema),
    defaultValues: { title: '', details: '', color: PRESET_COLORS[0], icon: PRESET_ICONS[0].name },
  });

  const openCreate = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setEditingCategory(null);
    reset({ title: '', details: '', color: PRESET_COLORS[0], icon: PRESET_ICONS[0].name });
    setModalVisible(true);
  };

  const openEdit = (category: Category) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setEditingCategory(category);
    reset({
      title: category.title,
      details: category.details,
      color: category.color,
      icon: category.icon,
    });
    setModalVisible(true);
  };

  const closeModal = () => {
    setModalVisible(false);
    setEditingCategory(null);
  };

  const onSubmit = (data: CategoryFormOutput) => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    if (editingCategory) {
      updateCategory.mutate(
        { id: editingCategory.id, data },
        { onSuccess: closeModal, onError: (e) => Alert.alert('Error', e.message) },
      );
    } else {
      createCategory.mutate(data, {
        onSuccess: closeModal,
        onError: (e) => Alert.alert('Error', e.message),
      });
    }
  };

  const handleDelete = (category: Category) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    Alert.alert(
      'Delete Category',
      `Are you sure you want to delete "${category.title}"? Transactions using this category will become uncategorized.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () =>
            deleteCategory.mutate(category.id, {
              onError: (e) => Alert.alert('Error', e.message),
            }),
        },
      ],
    );
  };

  const resolveIcon = (iconName: string): keyof typeof Ionicons.glyphMap => {
    const match = PRESET_ICONS.find((p) => p.name === iconName);
    return match?.icon ?? 'ellipsis-horizontal-circle-outline';
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
        <ThemedText>Failed to load categories</ThemedText>
        <ThemedText style={{ color: theme.textSecondary, fontSize: 13, marginTop: 4 }}>
          {error.message}
        </ThemedText>
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.container}>
      <FlatList
        data={categories}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <Pressable
            onPress={() => openEdit(item)}
            style={[styles.categoryRow, { borderColor: theme.border }]}
          >
            <View style={[styles.colorDot, { backgroundColor: item.color }]}>
              <Ionicons name={resolveIcon(item.icon)} size={18} color="#fff" />
            </View>
            <View style={styles.categoryInfo}>
              <ThemedText type="defaultSemiBold">{item.title}</ThemedText>
              {item.details ? (
                <ThemedText style={[styles.details, { color: theme.textSecondary }]} numberOfLines={1}>
                  {item.details}
                </ThemedText>
              ) : null}
            </View>
            <Pressable
              onPress={() => handleDelete(item)}
              hitSlop={8}
              style={styles.deleteBtn}
            >
              <Ionicons name="trash-outline" size={18} color={theme.danger} />
            </Pressable>
          </Pressable>
        )}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <View style={styles.center}>
            <ThemedText style={{ color: theme.textSecondary }}>No categories yet</ThemedText>
          </View>
        }
      />

      {/* FAB */}
      <Pressable onPress={openCreate} style={[styles.fab, { backgroundColor: theme.tint }]}>
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
                {editingCategory ? 'Edit Category' : 'New Category'}
              </ThemedText>

              {/* Title */}
              <ThemedText style={[styles.label, { color: theme.textSecondary }]}>Title</ThemedText>
              <Controller
                control={control}
                name="title"
                render={({ field: { onChange, onBlur, value } }) => (
                  <TextInput
                    style={[styles.input, { color: theme.text, borderColor: theme.border, backgroundColor: theme.surface }]}
                    placeholder="Category name"
                    placeholderTextColor={theme.textSecondary}
                    value={value}
                    onChangeText={onChange}
                    onBlur={onBlur}
                  />
                )}
              />
              {errors.title && (
                <ThemedText style={styles.errorText}>{errors.title.message}</ThemedText>
              )}

              {/* Details */}
              <ThemedText style={[styles.label, { color: theme.textSecondary }]}>Details</ThemedText>
              <Controller
                control={control}
                name="details"
                render={({ field: { onChange, onBlur, value } }) => (
                  <TextInput
                    style={[styles.input, styles.textArea, { color: theme.text, borderColor: theme.border, backgroundColor: theme.surface }]}
                    placeholder="Optional description"
                    placeholderTextColor={theme.textSecondary}
                    value={value}
                    onChangeText={onChange}
                    onBlur={onBlur}
                    multiline
                    numberOfLines={3}
                  />
                )}
              />

              {/* Color Picker */}
              <ThemedText style={[styles.label, { color: theme.textSecondary }]}>Color</ThemedText>
              <Controller
                control={control}
                name="color"
                render={({ field: { onChange, value } }) => (
                  <View style={styles.colorGrid}>
                    {PRESET_COLORS.map((c) => (
                      <Pressable
                        key={c}
                        onPress={() => {
                          Haptics.selectionAsync();
                          onChange(c);
                        }}
                        style={[
                          styles.colorSwatch,
                          { backgroundColor: c },
                          value === c && styles.colorSwatchSelected,
                        ]}
                      >
                        {value === c && <Ionicons name="checkmark" size={16} color="#fff" />}
                      </Pressable>
                    ))}
                  </View>
                )}
              />
              {errors.color && (
                <ThemedText style={styles.errorText}>{errors.color.message}</ThemedText>
              )}

              {/* Icon Selector */}
              <ThemedText style={[styles.label, { color: theme.textSecondary }]}>Icon</ThemedText>
              <Controller
                control={control}
                name="icon"
                render={({ field: { onChange, value } }) => (
                  <View style={styles.iconGrid}>
                    {PRESET_ICONS.map((item) => (
                      <Pressable
                        key={item.name}
                        onPress={() => {
                          Haptics.selectionAsync();
                          onChange(item.name);
                        }}
                        style={[
                          styles.iconCell,
                          {
                            borderColor: value === item.name ? theme.tint : theme.border,
                            backgroundColor: value === item.name ? theme.tint + '20' : theme.surface,
                          },
                        ]}
                      >
                        <Ionicons
                          name={item.icon}
                          size={22}
                          color={value === item.name ? theme.tint : theme.icon}
                        />
                      </Pressable>
                    ))}
                  </View>
                )}
              />

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
                    {editingCategory ? 'Save' : 'Create'}
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
  categoryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  colorDot: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  categoryInfo: {
    flex: 1,
    marginLeft: 12,
  },
  details: {
    fontSize: 13,
    marginTop: 2,
  },
  deleteBtn: {
    padding: 4,
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
  textArea: {
    minHeight: 72,
    textAlignVertical: 'top',
  },
  colorGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  colorSwatch: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  colorSwatchSelected: {
    borderWidth: 2,
    borderColor: '#fff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.3,
    shadowRadius: 2,
    elevation: 3,
  },
  iconGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  iconCell: {
    width: 44,
    height: 44,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
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
