import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  FlatList,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  TextInput,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import {
  useAiChatSearch,
  useAiChats,
  useDeleteAiChat,
  useResetAiChat,
  useUpdateAiChat,
} from '@/hooks/use-ai-assistant';
import { useThemeColor } from '@/hooks/use-theme-color';

function resolveId(rawId: string | string[] | undefined): string {
  return Array.isArray(rawId) ? rawId[0] : (rawId ?? '');
}

export default function AssistantChatSettingsScreen() {
  const params = useLocalSearchParams<{ id?: string }>();
  const router = useRouter();
  const id = resolveId(params.id);

  const text = useThemeColor({}, 'text');
  const textSecondary = useThemeColor({}, 'textSecondary');
  const border = useThemeColor({}, 'border');
  const surface = useThemeColor({}, 'surface');
  const tint = useThemeColor({}, 'tint');
  const danger = useThemeColor({}, 'danger');

  const chatsQuery = useAiChats();
  const updateChat = useUpdateAiChat();
  const resetChat = useResetAiChat();
  const deleteChat = useDeleteAiChat();
  const searchChat = useAiChatSearch(id);

  const chat = useMemo(
    () => chatsQuery.data?.find((item) => item.id === id),
    [chatsQuery.data, id],
  );

  const [title, setTitle] = useState('');
  const [customInstruction, setCustomInstruction] = useState('');
  const [pinned, setPinned] = useState(false);
  const [query, setQuery] = useState('');

  useEffect(() => {
    if (!chat) return;
    setTitle(chat.title);
    setCustomInstruction(chat.customInstruction ?? '');
    setPinned(chat.pinned);
  }, [chat]);

  const searchResults = searchChat.data?.results ?? [];
  const isSaving = updateChat.isPending || resetChat.isPending || deleteChat.isPending;

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.container} edges={['bottom']}>
        <ScrollView contentContainerStyle={styles.content}>
          <View style={[styles.section, { borderColor: border, backgroundColor: surface }]}>
            <ThemedText type="defaultSemiBold">Search chat content</ThemedText>
            <View style={styles.row}>
              <TextInput
                value={query}
                onChangeText={setQuery}
                placeholder="Search messages"
                placeholderTextColor={textSecondary}
                style={[styles.input, { borderColor: border, color: text }]}
              />
              <Pressable
                disabled={!query.trim() || searchChat.isPending}
                onPress={() => {
                  const nextQuery = query.trim();
                  if (!nextQuery) return;
                  searchChat.mutate(
                    { q: nextQuery, limit: 20 },
                    {
                      onError: (error) => Alert.alert('Search failed', error.message),
                    },
                  );
                }}
                style={[styles.primaryButton, { backgroundColor: tint }]}
              >
                <ThemedText style={styles.buttonText}>
                  {searchChat.isPending ? 'Searching...' : 'Search'}
                </ThemedText>
              </Pressable>
            </View>
            <FlatList
              data={searchResults}
              keyExtractor={(item) => item.id}
              scrollEnabled={false}
              ListEmptyComponent={
                <ThemedText style={{ color: textSecondary }}>
                  {query.trim() ? 'No matched messages yet.' : 'Run a search to inspect chat memory.'}
                </ThemedText>
              }
              renderItem={({ item }) => (
                <View style={[styles.resultRow, { borderColor: border }]}>
                  <ThemedText type="defaultSemiBold">{item.role}</ThemedText>
                  <ThemedText style={{ color: textSecondary }}>{item.snippet}</ThemedText>
                </View>
              )}
            />
          </View>

          <View style={[styles.section, { borderColor: border, backgroundColor: surface }]}>
            <ThemedText type="defaultSemiBold">Agent custom instruction</ThemedText>
            <TextInput
              value={customInstruction}
              onChangeText={setCustomInstruction}
              placeholder="Example: Focus on weekly budgeting with short answers."
              placeholderTextColor={textSecondary}
              multiline
              style={[
                styles.textarea,
                {
                  borderColor: border,
                  color: text,
                },
              ]}
            />
            <Pressable
              disabled={isSaving}
              onPress={() => {
                updateChat.mutate(
                  {
                    id,
                    data: { customInstruction: customInstruction.trim() },
                  },
                  {
                    onError: (error) =>
                      Alert.alert('Unable to save instruction', error.message),
                  },
                );
              }}
              style={[styles.primaryButton, { backgroundColor: tint }]}
            >
              <ThemedText style={styles.buttonText}>Save instruction</ThemedText>
            </Pressable>
          </View>

          <View style={[styles.section, { borderColor: border, backgroundColor: surface }]}>
            <ThemedText type="defaultSemiBold">Rename title</ThemedText>
            <View style={styles.row}>
              <TextInput
                value={title}
                onChangeText={setTitle}
                placeholder="Chat title"
                placeholderTextColor={textSecondary}
                style={[styles.input, { borderColor: border, color: text }]}
              />
              <Pressable
                disabled={isSaving || !title.trim()}
                onPress={() => {
                  updateChat.mutate(
                    {
                      id,
                      data: { title: title.trim() },
                    },
                    {
                      onError: (error) =>
                        Alert.alert('Unable to rename chat', error.message),
                    },
                  );
                }}
                style={[styles.primaryButton, { backgroundColor: tint }]}
              >
                <ThemedText style={styles.buttonText}>Save</ThemedText>
              </Pressable>
            </View>
          </View>

          <View style={[styles.section, { borderColor: border, backgroundColor: surface }]}>
            <View style={styles.switchRow}>
              <View style={{ flex: 1 }}>
                <ThemedText type="defaultSemiBold">Pinned chat</ThemedText>
                <ThemedText style={{ color: textSecondary }}>
                  Keep this chat in the pinned section.
                </ThemedText>
              </View>
              <Switch
                value={pinned}
                onValueChange={(next) => {
                  setPinned(next);
                  updateChat.mutate(
                    { id, data: { pinned: next } },
                    {
                      onError: (error) => {
                        setPinned((prev) => !prev);
                        Alert.alert('Unable to update pin', error.message);
                      },
                    },
                  );
                }}
              />
            </View>
          </View>

          <View style={[styles.section, { borderColor: border, backgroundColor: surface }]}>
            <ThemedText type="defaultSemiBold">Clear context</ThemedText>
            <ThemedText style={{ color: textSecondary }}>
              This removes the chat memory and starts a fresh topic in the same chat.
            </ThemedText>
            <Pressable
              disabled={isSaving}
              onPress={() => {
                Alert.alert(
                  'Clear chat context',
                  'This will permanently remove message and memory context for this chat.',
                  [
                    { text: 'Cancel', style: 'cancel' },
                    {
                      text: 'Clear',
                      style: 'destructive',
                      onPress: () => {
                        resetChat.mutate(id, {
                          onError: (error) =>
                            Alert.alert('Unable to clear context', error.message),
                        });
                      },
                    },
                  ],
                );
              }}
              style={[styles.primaryButton, { backgroundColor: danger }]}
            >
              <ThemedText style={styles.buttonText}>Clear context</ThemedText>
            </Pressable>
          </View>

          <View style={[styles.section, { borderColor: border, backgroundColor: surface }]}>
            <ThemedText type="defaultSemiBold">Delete chat</ThemedText>
            <ThemedText style={{ color: textSecondary }}>
              This permanently deletes this chat and all related memory.
            </ThemedText>
            <Pressable
              disabled={isSaving}
              onPress={() => {
                Alert.alert(
                  'Delete chat',
                  'This action cannot be undone. Delete this chat permanently?',
                  [
                    { text: 'Cancel', style: 'cancel' },
                    {
                      text: 'Delete',
                      style: 'destructive',
                      onPress: () => {
                        deleteChat.mutate(id, {
                          onSuccess: () => {
                            router.replace('/(tabs)/assistant');
                          },
                          onError: (error) =>
                            Alert.alert('Unable to delete chat', error.message),
                        });
                      },
                    },
                  ],
                );
              }}
              style={[styles.primaryButton, { backgroundColor: danger }]}
            >
              <ThemedText style={styles.buttonText}>
                {deleteChat.isPending ? 'Deleting...' : 'Delete chat'}
              </ThemedText>
            </Pressable>
          </View>
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    padding: 14,
    gap: 12,
  },
  section: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 12,
    padding: 12,
    gap: 10,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  input: {
    flex: 1,
    minHeight: 42,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 10,
    paddingHorizontal: 12,
    fontSize: 15,
  },
  textarea: {
    minHeight: 96,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    textAlignVertical: 'top',
    fontSize: 15,
  },
  primaryButton: {
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonText: {
    color: '#fff',
    fontWeight: '700',
  },
  resultRow: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingVertical: 8,
    gap: 4,
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
});
