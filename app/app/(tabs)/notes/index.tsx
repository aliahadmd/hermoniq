import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import {
  useArchiveNote,
  useDeleteNote,
  useNoteCategories,
  useNotes,
  usePinNote,
  useUnarchiveNote,
  useUnpinNote,
} from '@/hooks/use-notes';
import { useThemeColor } from '@/hooks/use-theme-color';
import { NOTE_DELETE_UNDO_WINDOW_MS, useNoteDeleteStore } from '@/stores/note-delete-store';

dayjs.extend(relativeTime);

type CategoryFilter = 'all' | string;
type ListMode = 'all' | 'pinned' | 'active' | 'archived';
type NoteSort = 'updated_desc' | 'title_asc';

const MODE_OPTIONS: { id: ListMode; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'pinned', label: 'Pinned' },
  { id: 'active', label: 'Active' },
  { id: 'archived', label: 'Archived' },
];

const SORT_OPTIONS: { id: NoteSort; label: string }[] = [
  { id: 'updated_desc', label: 'Recent' },
  { id: 'title_asc', label: 'A-Z' },
];

export default function NotesScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const text = useThemeColor({}, 'text');
  const textSecondary = useThemeColor({}, 'textSecondary');
  const border = useThemeColor({}, 'border');
  const surface = useThemeColor({}, 'surface');
  const card = useThemeColor({}, 'card');
  const tint = useThemeColor({}, 'tint');
  const danger = useThemeColor({}, 'danger');

  const [searchInput, setSearchInput] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<CategoryFilter>('all');
  const [listMode, setListMode] = useState<ListMode>('all');
  const [sort, setSort] = useState<NoteSort>('updated_desc');
  const [filtersVisible, setFiltersVisible] = useState(false);
  const [categorySearch, setCategorySearch] = useState('');
  const [clockMs, setClockMs] = useState(() => Date.now());

  const pendingNote = useNoteDeleteStore((state) => state.pendingNote);
  const deadlineAt = useNoteDeleteStore((state) => state.deadlineAt);
  const setPendingNote = useNoteDeleteStore((state) => state.setPendingNote);
  const clearPendingNote = useNoteDeleteStore((state) => state.clearPendingNote);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchInput.trim());
    }, 250);
    return () => clearTimeout(timer);
  }, [searchInput]);

  useEffect(() => {
    const interval = setInterval(() => {
      setClockMs(Date.now());
    }, 60_000);

    return () => clearInterval(interval);
  }, []);

  const includeArchived = listMode === 'all' || listMode === 'archived';
  const pinnedOnly = listMode === 'pinned';

  const categoriesQuery = useNoteCategories();
  const notesQuery = useNotes({
    q: debouncedSearch || undefined,
    categoryId: selectedCategory === 'all' ? undefined : selectedCategory,
    includeArchived,
    pinnedOnly,
    sort,
  });

  const deleteNote = useDeleteNote();
  const pinNote = usePinNote();
  const unpinNote = useUnpinNote();
  const archiveNote = useArchiveNote();
  const unarchiveNote = useUnarchiveNote();
  const deletingIdRef = useRef<string | null>(null);
  const refetchNotes = notesQuery.refetch;
  const refetchCategories = categoriesQuery.refetch;

  const categories = useMemo(() => categoriesQuery.data ?? [], [categoriesQuery.data]);
  const fetchedNotes = useMemo(() => notesQuery.data ?? [], [notesQuery.data]);

  const notesByMode = useMemo(() => {
    if (listMode === 'archived') {
      return fetchedNotes.filter((item) => !!item.archivedAt);
    }
    if (listMode === 'active' || listMode === 'pinned') {
      return fetchedNotes.filter((item) => !item.archivedAt);
    }
    return fetchedNotes;
  }, [fetchedNotes, listMode]);

  useFocusEffect(
    useCallback(() => {
      void refetchNotes();
      void refetchCategories();
    }, [refetchCategories, refetchNotes]),
  );

  const visibleNotes = useMemo(() => {
    if (!pendingNote) return notesByMode;
    return notesByMode.filter((item) => item.id !== pendingNote.id);
  }, [notesByMode, pendingNote]);

  const categoryFilters = useMemo(
    () => [{ id: 'all', name: 'All' }, ...categories.map((item) => ({ id: item.id, name: item.name }))],
    [categories],
  );

  const filteredCategoryOptions = useMemo(() => {
    const allOption = categoryFilters[0];
    const q = categorySearch.trim().toLowerCase();
    if (!q) {
      return categoryFilters;
    }
    const filtered = categoryFilters
      .slice(1)
      .filter((item) => item.name.toLowerCase().includes(q));
    return [allOption, ...filtered];
  }, [categoryFilters, categorySearch]);

  const selectedCategoryName = useMemo(() => {
    return categoryFilters.find((item) => item.id === selectedCategory)?.name ?? 'All';
  }, [categoryFilters, selectedCategory]);

  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (selectedCategory !== 'all') count += 1;
    if (sort !== 'updated_desc') count += 1;
    return count;
  }, [selectedCategory, sort]);

  useEffect(() => {
    if (selectedCategory === 'all') return;
    const exists = categories.some((item) => item.id === selectedCategory);
    if (!exists) {
      setSelectedCategory('all');
    }
  }, [categories, selectedCategory]);

  const flushPendingDelete = useCallback(
    (noteId: string) => {
      if (deletingIdRef.current === noteId) return;
      deletingIdRef.current = noteId;
      deleteNote.mutate(noteId, {
        onSuccess: () => {
          deletingIdRef.current = null;
          clearPendingNote();
        },
        onError: (error) => {
          deletingIdRef.current = null;
          clearPendingNote();
          Alert.alert('Delete failed', error.message);
        },
      });
    },
    [clearPendingNote, deleteNote],
  );

  useEffect(() => {
    if (!pendingNote || !deadlineAt) return;

    const remaining = deadlineAt - Date.now();
    if (remaining <= 0) {
      flushPendingDelete(pendingNote.id);
      return;
    }

    const timer = setTimeout(() => {
      flushPendingDelete(pendingNote.id);
    }, remaining);

    return () => {
      clearTimeout(timer);
    };
  }, [deadlineAt, flushPendingDelete, pendingNote]);

  const refreshing = notesQuery.isRefetching || categoriesQuery.isRefetching;

  const refreshAll = useCallback(() => {
    void refetchNotes();
    void refetchCategories();
  }, [refetchCategories, refetchNotes]);

  const initialLoading =
    (notesQuery.isLoading && !notesQuery.data) ||
    (categoriesQuery.isLoading && !categoriesQuery.data);

  if (initialLoading) {
    return (
      <ThemedView style={styles.container}>
        <SafeAreaView style={styles.centered} edges={['top']}>
          <ActivityIndicator size="large" color={tint} />
        </SafeAreaView>
      </ThemedView>
    );
  }

  const inlineError = notesQuery.error ?? categoriesQuery.error;

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.container} edges={['top']}>
        <FlatList
          data={visibleNotes}
          keyExtractor={(item) => item.id}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refreshAll} tintColor={tint} />}
          contentContainerStyle={styles.listContent}
          ListHeaderComponent={
            <View style={styles.headerBlock}>
              <View style={[styles.searchWrap, { borderColor: border, backgroundColor: surface }]}>
                <Ionicons name="search-outline" size={18} color={textSecondary} />
                <TextInput
                  value={searchInput}
                  onChangeText={setSearchInput}
                  placeholder="Search notes..."
                  placeholderTextColor={textSecondary}
                  style={[styles.searchInput, { color: text }]}
                  accessibilityLabel="Search notes"
                />
                {searchInput.length > 0 ? (
                  <Pressable
                    onPress={() => setSearchInput('')}
                    hitSlop={8}
                    accessibilityRole="button"
                    accessibilityLabel="Clear search"
                  >
                    <Ionicons name="close-circle" size={18} color={textSecondary} />
                  </Pressable>
                ) : null}
              </View>

              <View style={styles.controlsRow}>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.modeRow}
                  style={styles.modeScroll}
                >
                  {MODE_OPTIONS.map((option) => {
                    const selected = listMode === option.id;
                    return (
                      <Pressable
                        key={option.id}
                        onPress={() => setListMode(option.id)}
                        style={[
                          styles.filterChip,
                          {
                            borderColor: selected ? tint : border,
                            backgroundColor: selected ? `${tint}1F` : surface,
                          },
                        ]}
                        accessibilityRole="button"
                        accessibilityLabel={`Filter notes by ${option.label}`}
                      >
                        <ThemedText style={selected ? { color: tint } : undefined}>{option.label}</ThemedText>
                      </Pressable>
                    );
                  })}
                </ScrollView>

                <Pressable
                  onPress={() => setFiltersVisible(true)}
                  style={[styles.filtersButton, { borderColor: border, backgroundColor: surface }]}
                  accessibilityRole="button"
                  accessibilityLabel="Open filters"
                >
                  <Ionicons name="options-outline" size={16} color={textSecondary} />
                  <ThemedText style={{ color: textSecondary }}>
                    {activeFilterCount > 0 ? `Filters (${activeFilterCount})` : 'Filters'}
                  </ThemedText>
                </Pressable>
              </View>

              {activeFilterCount > 0 ? (
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.activeFiltersRow}
                >
                  {selectedCategory !== 'all' ? (
                    <View style={[styles.activeFilterChip, { borderColor: border, backgroundColor: surface }]}>
                      <ThemedText style={{ color: textSecondary }}>{`Category: ${selectedCategoryName}`}</ThemedText>
                    </View>
                  ) : null}
                  {sort !== 'updated_desc' ? (
                    <View style={[styles.activeFilterChip, { borderColor: border, backgroundColor: surface }]}>
                      <ThemedText style={{ color: textSecondary }}>Sort: A-Z</ThemedText>
                    </View>
                  ) : null}
                  <Pressable
                    onPress={() => {
                      setSelectedCategory('all');
                      setSort('updated_desc');
                    }}
                    style={[styles.clearChip, { borderColor: border, backgroundColor: surface }]}
                    accessibilityRole="button"
                    accessibilityLabel="Clear filters"
                  >
                    <ThemedText style={{ color: textSecondary }}>Clear</ThemedText>
                  </Pressable>
                </ScrollView>
              ) : null}

              {inlineError ? (
                <View style={[styles.inlineError, { borderColor: danger, backgroundColor: surface }]}>
                  <ThemedText style={{ color: danger }}>Failed to refresh notes</ThemedText>
                  <ThemedText style={{ color: textSecondary, marginTop: 2, fontSize: 12 }}>
                    {inlineError.message}
                  </ThemedText>
                  <Pressable
                    onPress={refreshAll}
                    style={[styles.retryButton, { borderColor: danger }]}
                    accessibilityRole="button"
                    accessibilityLabel="Retry loading notes"
                  >
                    <ThemedText style={{ color: danger }}>Retry</ThemedText>
                  </Pressable>
                </View>
              ) : null}
            </View>
          }
          renderItem={({ item }) => {
            const isArchived = !!item.archivedAt;
            const pinMutation = item.isPinned ? unpinNote : pinNote;
            const archiveMutation = isArchived ? unarchiveNote : archiveNote;
            const isActionPending =
              pinNote.isPending ||
              unpinNote.isPending ||
              archiveNote.isPending ||
              unarchiveNote.isPending ||
              deleteNote.isPending;

            return (
              <View style={[styles.noteCard, { backgroundColor: card, borderColor: border }]}>
                <Pressable onPress={() => router.push(`/notes/${item.id}/edit`)}>
                  <View style={styles.noteHeader}>
                    <ThemedText type="defaultSemiBold" numberOfLines={1} style={styles.noteTitle}>
                      {item.title}
                    </ThemedText>
                    <View style={[styles.categoryPill, { backgroundColor: surface }]}>
                      <ThemedText style={{ color: textSecondary, fontSize: 12 }}>
                        {item.categoryName ?? 'Uncategorized'}
                      </ThemedText>
                    </View>
                  </View>

                  <ThemedText style={{ color: textSecondary }} numberOfLines={2}>
                    {item.content || 'No content'}
                  </ThemedText>

                  <View style={styles.metaRow}>
                    <ThemedText style={[styles.timeText, { color: textSecondary }]}>
                      {dayjs(item.updatedAt).isValid() ? dayjs(item.updatedAt).from(dayjs(clockMs)) : 'Just now'}
                    </ThemedText>
                    {item.isPinned ? (
                      <ThemedText style={[styles.pinLabel, { color: tint }]}>Pinned</ThemedText>
                    ) : null}
                  </View>
                </Pressable>

                <View style={styles.cardActions}>
                  <Pressable
                    onPress={() =>
                      pinMutation.mutate(item.id, {
                        onError: (error) => Alert.alert('Error', error.message),
                      })
                    }
                    disabled={isActionPending}
                    style={styles.actionIconButton}
                    accessibilityRole="button"
                    accessibilityLabel={item.isPinned ? 'Unpin note' : 'Pin note'}
                  >
                    <Ionicons
                      name={item.isPinned ? 'pin' : 'pin-outline'}
                      size={16}
                      color={item.isPinned ? tint : textSecondary}
                    />
                  </Pressable>

                  <Pressable
                    onPress={() =>
                      archiveMutation.mutate(item.id, {
                        onError: (error) => Alert.alert('Error', error.message),
                      })
                    }
                    disabled={isActionPending}
                    style={styles.actionIconButton}
                    accessibilityRole="button"
                    accessibilityLabel={isArchived ? 'Unarchive note' : 'Archive note'}
                  >
                    <Ionicons
                      name={isArchived ? 'arrow-undo-outline' : 'archive-outline'}
                      size={16}
                      color={textSecondary}
                    />
                  </Pressable>

                  <Pressable
                    onPress={() => setPendingNote(item, NOTE_DELETE_UNDO_WINDOW_MS)}
                    disabled={isActionPending}
                    style={styles.actionIconButton}
                    accessibilityRole="button"
                    accessibilityLabel="Delete note"
                  >
                    <Ionicons name="trash-outline" size={16} color={danger} />
                  </Pressable>
                </View>
              </View>
            );
          }}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <ThemedText style={{ color: textSecondary }}>
                No notes found. Tap + to create one.
              </ThemedText>
            </View>
          }
        />

        <Pressable
          onPress={() => router.push('/notes/create')}
          style={[styles.fab, { backgroundColor: tint }]}
          accessibilityRole="button"
          accessibilityLabel="Create note"
        >
          <ThemedText style={styles.fabText}>+</ThemedText>
        </Pressable>

        {pendingNote ? (
          <View style={[styles.undoBar, { backgroundColor: card, borderColor: border }]}>
            <ThemedText numberOfLines={1} style={{ flex: 1 }}>
              {`Deleting "${pendingNote.title}"...`}
            </ThemedText>
            <Pressable
              onPress={clearPendingNote}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="Undo note delete"
            >
              <ThemedText style={{ color: tint }}>Undo</ThemedText>
            </Pressable>
          </View>
        ) : null}

        <Modal
          visible={filtersVisible}
          transparent
          animationType="fade"
          onRequestClose={() => setFiltersVisible(false)}
        >
          <Pressable style={styles.modalBackdrop} onPress={() => setFiltersVisible(false)}>
            <Pressable
              onPress={() => undefined}
              style={[
                styles.modalSheet,
                {
                  backgroundColor: card,
                  borderColor: border,
                  paddingBottom: Math.max(16, insets.bottom + 8),
                },
              ]}
            >
              <View style={styles.modalHeader}>
                <ThemedText type="defaultSemiBold">Filters</ThemedText>
                <Pressable
                  onPress={() => setFiltersVisible(false)}
                  hitSlop={8}
                  accessibilityRole="button"
                  accessibilityLabel="Close filters"
                >
                  <Ionicons name="close" size={20} color={textSecondary} />
                </Pressable>
              </View>

              <ThemedText style={[styles.modalLabel, { color: textSecondary }]}>Category</ThemedText>
              <View style={[styles.modalSearchWrap, { borderColor: border, backgroundColor: surface }]}>
                <Ionicons name="search-outline" size={16} color={textSecondary} />
                <TextInput
                  value={categorySearch}
                  onChangeText={setCategorySearch}
                  placeholder="Search categories..."
                  placeholderTextColor={textSecondary}
                  style={[styles.modalSearchInput, { color: text }]}
                  accessibilityLabel="Search categories"
                />
              </View>

              <ScrollView style={styles.categoryList} contentContainerStyle={styles.categoryListContent}>
                {filteredCategoryOptions.map((item) => {
                  const selected = selectedCategory === item.id;
                  return (
                    <Pressable
                      key={item.id}
                      onPress={() => setSelectedCategory(item.id)}
                      style={[
                        styles.categoryOption,
                        {
                          borderColor: selected ? tint : border,
                          backgroundColor: selected ? `${tint}1F` : surface,
                        },
                      ]}
                      accessibilityRole="button"
                      accessibilityLabel={`Set category filter to ${item.name}`}
                    >
                      <ThemedText style={selected ? { color: tint } : undefined}>{item.name}</ThemedText>
                      {selected ? <Ionicons name="checkmark" size={16} color={tint} /> : null}
                    </Pressable>
                  );
                })}
              </ScrollView>

              <ThemedText style={[styles.modalLabel, { color: textSecondary }]}>Sort</ThemedText>
              <View style={styles.modalSortRow}>
                {SORT_OPTIONS.map((option) => {
                  const selected = sort === option.id;
                  return (
                    <Pressable
                      key={option.id}
                      onPress={() => setSort(option.id)}
                      style={[
                        styles.modalSortChip,
                        {
                          borderColor: selected ? tint : border,
                          backgroundColor: selected ? `${tint}1F` : surface,
                        },
                      ]}
                      accessibilityRole="button"
                      accessibilityLabel={`Sort by ${option.label}`}
                    >
                      <ThemedText style={selected ? { color: tint } : undefined}>{option.label}</ThemedText>
                    </Pressable>
                  );
                })}
              </View>

              <View style={styles.modalActions}>
                <Pressable
                  onPress={() => {
                    setSelectedCategory('all');
                    setSort('updated_desc');
                    setCategorySearch('');
                  }}
                  style={[styles.modalActionButton, { borderColor: border, backgroundColor: surface }]}
                  accessibilityRole="button"
                  accessibilityLabel="Clear filter selections"
                >
                  <ThemedText style={{ color: textSecondary }}>Clear</ThemedText>
                </Pressable>

                <Pressable
                  onPress={() => setFiltersVisible(false)}
                  style={[styles.modalActionButton, { borderColor: tint, backgroundColor: `${tint}1F` }]}
                  accessibilityRole="button"
                  accessibilityLabel="Apply filters"
                >
                  <ThemedText style={{ color: tint }}>Done</ThemedText>
                </Pressable>
              </View>
            </Pressable>
          </Pressable>
        </Modal>
      </SafeAreaView>
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
  headerBlock: {
    paddingTop: 12,
    paddingBottom: 6,
  },
  searchWrap: {
    marginHorizontal: 16,
    borderWidth: 1,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
  },
  controlsRow: {
    marginTop: 10,
    marginHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  modeScroll: {
    flex: 1,
  },
  modeRow: {
    gap: 8,
  },
  filterChip: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 12,
    minHeight: 36,
    justifyContent: 'center',
  },
  filtersButton: {
    minHeight: 36,
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  activeFiltersRow: {
    paddingHorizontal: 16,
    paddingTop: 8,
    gap: 8,
  },
  activeFilterChip: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 12,
    minHeight: 32,
    justifyContent: 'center',
  },
  clearChip: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 12,
    minHeight: 32,
    justifyContent: 'center',
  },
  inlineError: {
    marginHorizontal: 16,
    marginTop: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 12,
    padding: 10,
  },
  retryButton: {
    marginTop: 8,
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  listContent: {
    paddingBottom: 160,
    gap: 10,
  },
  noteCard: {
    marginHorizontal: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 14,
    padding: 14,
    gap: 8,
  },
  noteHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  noteTitle: {
    flex: 1,
  },
  categoryPill: {
    borderRadius: 999,
    paddingHorizontal: 9,
    paddingVertical: 3,
  },
  metaRow: {
    marginTop: 2,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  timeText: {
    fontSize: 12,
  },
  pinLabel: {
    fontSize: 12,
    fontWeight: '600',
  },
  cardActions: {
    marginTop: 2,
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 2,
  },
  actionIconButton: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyState: {
    paddingTop: 56,
    alignItems: 'center',
    paddingHorizontal: 24,
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
    shadowColor: '#000000',
    shadowOpacity: 0.18,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 5,
  },
  fabText: {
    color: '#fff',
    fontSize: 28,
    fontWeight: '600',
    lineHeight: 30,
  },
  undoBar: {
    position: 'absolute',
    left: 16,
    right: 16,
    bottom: 92,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.25)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
    paddingTop: 12,
    paddingHorizontal: 16,
    maxHeight: '82%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  modalLabel: {
    fontSize: 13,
    marginBottom: 6,
  },
  modalSearchWrap: {
    borderWidth: 1,
    borderRadius: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  modalSearchInput: {
    flex: 1,
    fontSize: 15,
  },
  categoryList: {
    marginTop: 8,
    marginBottom: 12,
    maxHeight: 180,
  },
  categoryListContent: {
    gap: 8,
  },
  categoryOption: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    minHeight: 40,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  modalSortRow: {
    flexDirection: 'row',
    gap: 8,
  },
  modalSortChip: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 14,
    minHeight: 36,
    justifyContent: 'center',
  },
  modalActions: {
    marginTop: 14,
    flexDirection: 'row',
    gap: 10,
  },
  modalActionButton: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 10,
    minHeight: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
