import { useMemo } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import { useRouter } from 'expo-router';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useAiChats, useCreateAiChat } from '@/hooks/use-ai-assistant';
import { useThemeColor } from '@/hooks/use-theme-color';
import type { AiChat } from '@/lib/types';

dayjs.extend(relativeTime);

interface RowItem {
  type: 'header' | 'chat';
  id: string;
  label?: string;
  chat?: AiChat;
}

function toRowItems(pinned: AiChat[], recent: AiChat[]): RowItem[] {
  const rows: RowItem[] = [];
  if (pinned.length > 0) {
    rows.push({ type: 'header', id: 'header-pinned', label: 'Pinned' });
    for (const chat of pinned) rows.push({ type: 'chat', id: chat.id, chat });
  }
  rows.push({ type: 'header', id: 'header-recent', label: 'Recent' });
  for (const chat of recent) rows.push({ type: 'chat', id: chat.id, chat });
  return rows;
}

export default function AssistantTabScreen() {
  const router = useRouter();
  const text = useThemeColor({}, 'text');
  const textSecondary = useThemeColor({}, 'textSecondary');
  const border = useThemeColor({}, 'border');
  const card = useThemeColor({}, 'card');
  const surface = useThemeColor({}, 'surface');
  const tint = useThemeColor({}, 'tint');

  const chatsQuery = useAiChats();
  const createChat = useCreateAiChat();

  const chats = useMemo(() => chatsQuery.data ?? [], [chatsQuery.data]);
  const pinned = useMemo(
    () => chats.filter((chat) => chat.pinned).sort((a, b) => b.lastActiveAt.localeCompare(a.lastActiveAt)),
    [chats],
  );
  const recent = useMemo(
    () => chats.filter((chat) => !chat.pinned).sort((a, b) => b.lastActiveAt.localeCompare(a.lastActiveAt)),
    [chats],
  );
  const rows = useMemo(() => toRowItems(pinned, recent), [pinned, recent]);

  const createNewChat = () => {
    createChat.mutate(
      {
        contexts: {
          money: true,
          habits: true,
          notes: true,
          events: true,
        },
      },
      {
        onSuccess: (chat) => {
          router.push(`/assistant/${chat.id}`);
        },
        onError: (error) => {
          Alert.alert('Unable to create chat', error.message);
        },
      },
    );
  };

  if (chatsQuery.isLoading && chats.length === 0) {
    return (
      <ThemedView style={styles.container}>
        <SafeAreaView style={styles.centered} edges={['top']}>
          <ActivityIndicator size="large" color={tint} />
        </SafeAreaView>
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.container} edges={['top']}>
        <FlatList
          data={rows}
          keyExtractor={(item) => item.id}
          refreshControl={
            <RefreshControl
              refreshing={chatsQuery.isRefetching}
              onRefresh={() => chatsQuery.refetch()}
              tintColor={tint}
            />
          }
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={
            <View style={[styles.emptyState, { borderColor: border, backgroundColor: surface }]}>
              <ThemedText type="defaultSemiBold">No chats yet</ThemedText>
              <ThemedText style={{ color: textSecondary }}>
                Tap + to start an AI conversation with your own data.
              </ThemedText>
            </View>
          }
          renderItem={({ item }) => {
            if (item.type === 'header') {
              return (
                <ThemedText style={[styles.sectionHeader, { color: textSecondary }]}>
                  {item.label}
                </ThemedText>
              );
            }

            if (!item.chat) return null;
            const chat = item.chat;
            return (
              <Pressable
                onPress={() => router.push(`/assistant/${chat.id}`)}
                style={[styles.chatRow, { borderColor: border, backgroundColor: card }]}
              >
                <View style={styles.chatAvatar}>
                  <Ionicons name="sparkles-outline" size={18} color={tint} />
                </View>
                <View style={styles.chatMain}>
                  <View style={styles.chatTop}>
                    <ThemedText type="defaultSemiBold" numberOfLines={1} style={[styles.chatTitle, { color: text }]}>
                      {chat.title}
                    </ThemedText>
                    <ThemedText style={{ color: textSecondary }}>
                      {dayjs(chat.lastActiveAt).fromNow()}
                    </ThemedText>
                  </View>
                  <ThemedText numberOfLines={1} style={{ color: textSecondary }}>
                    {chat.lastMessagePreview || 'Start chatting with your data assistant'}
                  </ThemedText>
                </View>
              </Pressable>
            );
          }}
        />

        <Pressable
          onPress={createNewChat}
          disabled={createChat.isPending}
          style={[
            styles.fab,
            {
              backgroundColor: tint,
              opacity: createChat.isPending ? 0.7 : 1,
            },
          ]}
          accessibilityRole="button"
          accessibilityLabel="Create new chat"
        >
          {createChat.isPending ? (
            <ActivityIndicator color="#ffffff" />
          ) : (
            <ThemedText style={styles.fabText}>+</ThemedText>
          )}
        </Pressable>
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
  },
  listContent: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 110,
    gap: 8,
  },
  sectionHeader: {
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    marginTop: 8,
    marginBottom: 4,
  },
  chatRow: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 14,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  chatAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chatMain: {
    flex: 1,
    gap: 4,
  },
  chatTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  chatTitle: {
    flex: 1,
  },
  emptyState: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 14,
    padding: 14,
    gap: 6,
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
});
