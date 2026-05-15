import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useNavigation } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';

import { AttachmentPreviewModal, ChatAttachments } from '@/components/assistant/chat-attachments';
import { PendingActionAlert } from '@/components/assistant/pending-action-alert';
import { ChatMarkdown } from '@/components/assistant/chat-markdown';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import {
  isAiStreamingSupported,
  sendAiMessageStream,
  useAiChats,
  useAiMessages,
  useConfirmAiAction,
  useDeleteAiAttachment,
  useRejectAiAction,
  useSendAiMessage,
  useUploadAiAttachment,
  useUpdateAiChat,
} from '@/hooks/use-ai-assistant';
import { useThemeColor } from '@/hooks/use-theme-color';
import { authClient } from '@/lib/auth-client';
import { getDeviceTimezone } from '@/lib/planner-utils';
import type { AiContexts, AiMessage, AiMessageAttachment } from '@/lib/types';

function resolveId(rawId: string | string[] | undefined): string {
  return Array.isArray(rawId) ? rawId[0] : (rawId ?? '');
}

function normalizeApprovalInput(input: string): string {
  return input.trim().toLowerCase();
}

function isAcceptInput(input: string): boolean {
  return ['accept', 'approve', 'confirm', 'yes', 'y', 'ok', 'okay'].includes(input);
}

function isRejectInput(input: string): boolean {
  return ['reject', 'decline', 'cancel', 'no', 'n'].includes(input);
}

function isExplicitActionCommand(input: string): boolean {
  return ['confirm', 'accept', 'approve', 'reject', 'decline', 'cancel'].includes(input);
}

const MAX_ATTACHMENTS = 4;

interface PendingUserDraft {
  id?: string;
  content: string;
  attachments: AiMessageAttachment[];
  createdAt: string;
}

export default function AssistantChatScreen() {
  const params = useLocalSearchParams<{ id?: string }>();
  const navigation = useNavigation();
  const router = useRouter();
  const id = resolveId(params.id);

  const tint = useThemeColor({}, 'tint');
  const text = useThemeColor({}, 'text');
  const textSecondary = useThemeColor({}, 'textSecondary');
  const border = useThemeColor({}, 'border');
  const surface = useThemeColor({}, 'surface');
  const card = useThemeColor({}, 'card');

  const chatsQuery = useAiChats();
  const chat = chatsQuery.data?.find((item) => item.id === id);

  const messagesQuery = useAiMessages(id);
  const sendMessage = useSendAiMessage(id);
  const uploadAttachment = useUploadAiAttachment(id);
  const deleteAttachment = useDeleteAiAttachment(id);
  const confirmAction = useConfirmAiAction(id);
  const rejectAction = useRejectAiAction(id);
  const updateChat = useUpdateAiChat();
  const cookieHeader = authClient.getCookie();
  const deviceTimezone = getDeviceTimezone();

  const [input, setInput] = useState('');
  const [contexts, setContexts] = useState<AiContexts>({
    money: true,
    habits: true,
    notes: true,
    events: true,
  });
  const [pendingUserMessage, setPendingUserMessage] = useState<PendingUserDraft | null>(null);
  const [composerAttachments, setComposerAttachments] = useState<AiMessageAttachment[]>([]);
  const [previewAttachment, setPreviewAttachment] = useState<AiMessageAttachment | null>(null);
  const [draftAssistant, setDraftAssistant] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const streamAbortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    return () => {
      streamAbortRef.current?.abort();
    };
  }, []);

  useEffect(() => {
    setComposerAttachments([]);
    setPreviewAttachment(null);
    setPendingUserMessage(null);
    setDraftAssistant('');
  }, [id]);

  useEffect(() => {
    if (!chat) return;
    setContexts(chat.contexts);
    navigation.setOptions({
      title: chat.title,
      headerRight: () => (
        <Pressable
          onPress={() => router.push(`/assistant/settings/${id}`)}
          style={styles.headerButton}
          accessibilityRole="button"
          accessibilityLabel="Open chat settings"
        >
          <Ionicons name="ellipsis-horizontal" size={20} color={tint} />
        </Pressable>
      ),
    });
  }, [chat, id, navigation, router, tint]);

  const messages = useMemo(
    () => messagesQuery.data?.messages ?? [],
    [messagesQuery.data?.messages],
  );
  const pendingAction = useMemo(
    () => messagesQuery.data?.pendingActions?.[0] ?? null,
    [messagesQuery.data?.pendingActions],
  );

  const renderedMessages = useMemo(() => {
    const next: AiMessage[] = [...messages];
    const hasPersistedPendingUserMessage = pendingUserMessage
      ? messages.some((message) => {
          if (message.role !== 'user') return false;
          if (pendingUserMessage.id && message.id === pendingUserMessage.id) return true;
          if (message.content !== pendingUserMessage.content) return false;

          const messageTime = new Date(message.createdAt).getTime();
          const pendingTime = new Date(pendingUserMessage.createdAt).getTime();
          if (Number.isFinite(messageTime) && Number.isFinite(pendingTime) && messageTime < pendingTime - 5_000) {
            return false;
          }

          const messageAttachmentIds = new Set((message.attachments ?? []).map((attachment) => attachment.id));
          return pendingUserMessage.attachments.every((attachment) => messageAttachmentIds.has(attachment.id));
        })
      : false;

    if (pendingUserMessage && !hasPersistedPendingUserMessage) {
      next.push({
        id: pendingUserMessage.id ?? 'temp-user',
        role: 'user',
        content: pendingUserMessage.content,
        attachments: pendingUserMessage.attachments,
        createdAt: pendingUserMessage.createdAt,
      });
    }
    if (draftAssistant) {
      next.push({
        id: 'temp-assistant',
        role: 'assistant',
        content: draftAssistant,
        createdAt: new Date().toISOString(),
      });
    }
    return next;
  }, [messages, pendingUserMessage, draftAssistant]);

  const isBusy =
    isStreaming ||
    sendMessage.isPending ||
    uploadAttachment.isPending ||
    deleteAttachment.isPending ||
    confirmAction.isPending ||
    rejectAction.isPending ||
    updateChat.isPending;

  const syncAfterMessage = async () => {
    await Promise.all([messagesQuery.refetch(), chatsQuery.refetch()]);
  };

  const compressImage = async (asset: ImagePicker.ImagePickerAsset) => {
    if (Platform.OS === 'web') {
      return {
        uri: asset.uri,
        fileName: asset.fileName ?? `image-${Date.now()}.jpg`,
        mimeType: asset.mimeType ?? 'image/jpeg',
        width: asset.width,
        height: asset.height,
      };
    }

    const manipulated = await ImageManipulator.manipulateAsync(asset.uri, [], {
      compress: 0.78,
      format: ImageManipulator.SaveFormat.JPEG,
    });

    const baseName = (asset.fileName ?? `image-${Date.now()}`).replace(/\.[^.]+$/, '');
    return {
      uri: manipulated.uri,
      fileName: `${baseName}.jpg`,
      mimeType: 'image/jpeg',
      width: manipulated.width,
      height: manipulated.height,
    };
  };

  const uploadAssets = async (assets: ImagePicker.ImagePickerAsset[]) => {
    if (assets.length === 0) return;
    const remaining = MAX_ATTACHMENTS - composerAttachments.length;
    if (remaining <= 0) {
      Alert.alert('Attachment limit', `You can attach up to ${MAX_ATTACHMENTS} images.`);
      return;
    }

    const selected = assets.slice(0, remaining);
    const uploaded: AiMessageAttachment[] = [];
    for (const asset of selected) {
      const prepared = await compressImage(asset);
      const response = await uploadAttachment.mutateAsync(prepared);
      uploaded.push(response.attachment);
    }
    setComposerAttachments((prev) => [...prev, ...uploaded]);
  };

  const pickFromLibrary = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Permission required', 'Photo library access is required to attach images.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: false,
      allowsMultipleSelection: true,
      selectionLimit: MAX_ATTACHMENTS,
      quality: 1,
    });
    if (result.canceled) return;

    try {
      await uploadAssets(result.assets ?? []);
    } catch (error) {
      Alert.alert('Image upload failed', error instanceof Error ? error.message : 'Unable to upload images');
    }
  };

  const takePhoto = async () => {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Permission required', 'Camera access is required to capture an image.');
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      quality: 1,
    });
    if (result.canceled) return;

    try {
      await uploadAssets(result.assets ?? []);
    } catch (error) {
      Alert.alert('Image upload failed', error instanceof Error ? error.message : 'Unable to upload image');
    }
  };

  const openAttachmentPicker = () => {
    Alert.alert('Add image', 'Choose image source', [
      { text: 'Take Photo', onPress: () => void takePhoto() },
      { text: 'Choose from Library', onPress: () => void pickFromLibrary() },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  const removeComposerAttachment = async (attachmentId: string) => {
    const previous = composerAttachments;
    setComposerAttachments((prev) => prev.filter((item) => item.id !== attachmentId));
    try {
      await deleteAttachment.mutateAsync(attachmentId);
    } catch (error) {
      setComposerAttachments(previous);
      Alert.alert('Could not remove image', error instanceof Error ? error.message : 'Request failed');
    }
  };

  const handleSend = async () => {
    const textValue = input.trim();
    if ((textValue.length === 0 && composerAttachments.length === 0) || isBusy) return;

    const decision = normalizeApprovalInput(textValue);
    if (!pendingAction && isExplicitActionCommand(decision)) {
      Alert.alert(
        'No pending request',
        'There is no pending action to confirm or reject yet. Ask me to prepare the change first.',
      );
      return;
    }

    if (pendingAction) {
      if (isAcceptInput(decision)) {
        setInput('');
        try {
          await confirmAction.mutateAsync(pendingAction.id);
          await syncAfterMessage();
        } catch (error) {
          setInput(textValue);
          Alert.alert(
            'Could not accept action',
            error instanceof Error ? error.message : 'Request failed',
          );
        }
        return;
      }

      if (isRejectInput(decision)) {
        setInput('');
        try {
          await rejectAction.mutateAsync(pendingAction.id);
          await syncAfterMessage();
        } catch (error) {
          setInput(textValue);
          Alert.alert(
            'Could not reject action',
            error instanceof Error ? error.message : 'Request failed',
          );
        }
        return;
      }
    }

    const sendingAttachments = [...composerAttachments];
    const attachmentIds = sendingAttachments.map((attachment) => attachment.id);
    setInput('');
    setPendingUserMessage({
      content: textValue,
      attachments: sendingAttachments,
      createdAt: new Date().toISOString(),
    });
    setComposerAttachments([]);
    setDraftAssistant('');
    setIsStreaming(true);

    if (!isAiStreamingSupported()) {
      try {
        await sendMessage.mutateAsync({
          message: textValue.length > 0 ? textValue : undefined,
          attachmentIds,
          contexts,
          timezone: deviceTimezone,
        });
        setPendingUserMessage(null);
        setDraftAssistant('');
        setIsStreaming(false);
        await syncAfterMessage();
      } catch (error) {
        setPendingUserMessage(null);
        setDraftAssistant('');
        setIsStreaming(false);
        setInput(textValue);
        setComposerAttachments(sendingAttachments);
        Alert.alert('Unable to send message', error instanceof Error ? error.message : 'Request failed');
      }
      return;
    }

    const abortController = new AbortController();
    streamAbortRef.current = abortController;

    let streamError: string | null = null;
    let sawStreamStart = false;

    try {
      await sendAiMessageStream(
        id,
        {
          message: textValue.length > 0 ? textValue : undefined,
          attachmentIds,
          contexts,
          timezone: deviceTimezone,
        },
        {
          signal: abortController.signal,
          onStart: (event) => {
            sawStreamStart = true;
            setPendingUserMessage((current) => current
              ? {
                  ...current,
                  id: event.userMessage.id,
                  createdAt: event.userMessage.createdAt,
                }
              : current);
          },
          onDelta: (chunk) => {
            setDraftAssistant((prev) => `${prev}${chunk}`);
          },
          onError: (event) => {
            streamError = event.message;
          },
        },
      );

      if (streamError) {
        if (sawStreamStart) {
          setPendingUserMessage(null);
          setDraftAssistant('');
          setIsStreaming(false);
          await syncAfterMessage();
          Alert.alert('Unable to send message', streamError);
          return;
        }
        throw new Error(streamError);
      }

      setPendingUserMessage(null);
      setDraftAssistant('');
      setIsStreaming(false);
      await syncAfterMessage();
      return;
    } catch {
      if (abortController.signal.aborted) {
        setPendingUserMessage(null);
        setDraftAssistant('');
        setIsStreaming(false);
        setComposerAttachments(sendingAttachments);
        return;
      }
      setDraftAssistant('');
      setIsStreaming(false);
      try {
        await sendMessage.mutateAsync({
          message: textValue.length > 0 ? textValue : undefined,
          attachmentIds,
          contexts,
          timezone: deviceTimezone,
        });
        setPendingUserMessage(null);
        await syncAfterMessage();
      } catch (error) {
        setPendingUserMessage(null);
        setInput(textValue);
        setComposerAttachments(sendingAttachments);
        Alert.alert('Unable to send message', error instanceof Error ? error.message : 'Request failed');
      }
    }
  };

  if (messagesQuery.isLoading && messages.length === 0) {
    return (
      <ThemedView style={styles.container}>
        <SafeAreaView style={styles.centered} edges={['bottom']}>
          <ActivityIndicator size="large" color={tint} />
        </SafeAreaView>
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.container} edges={['bottom']}>
        <KeyboardAvoidingView
          style={styles.container}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <FlatList
            data={renderedMessages}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.messageList}
            ListEmptyComponent={
              <View style={[styles.emptyState, { borderColor: border, backgroundColor: surface }]}>
                <ThemedText type="defaultSemiBold">New AI chat</ThemedText>
                <ThemedText style={{ color: textSecondary }}>
                  Ask about your money, habits, notes, and events. Each chat keeps isolated memory.
                </ThemedText>
              </View>
            }
            renderItem={({ item }) => {
              const isUser = item.role === 'user';
              const hasAttachments = (item.attachments?.length ?? 0) > 0;
              const hasText = item.content.trim().length > 0;
              return (
                <View style={[styles.bubbleWrap, isUser ? styles.bubbleWrapUser : styles.bubbleWrapAssistant]}>
                  <View
                    style={[
                      styles.bubble,
                      {
                        backgroundColor: isUser ? tint : card,
                        borderColor: border,
                      },
                    ]}
                  >
                    {hasAttachments ? (
                      <ChatAttachments
                        attachments={item.attachments ?? []}
                        cookieHeader={cookieHeader}
                        onOpen={setPreviewAttachment}
                      />
                    ) : null}
                    {isUser ? (
                      hasText ? (
                        <ThemedText style={[styles.bubbleText, { color: '#ffffff' }]}>
                          {item.content}
                        </ThemedText>
                      ) : null
                    ) : hasText ? (
                      <ChatMarkdown content={item.content} />
                    ) : (
                      <ThemedText style={[styles.bubbleText, { color: textSecondary }]}>
                        I reviewed your image.
                      </ThemedText>
                    )}
                  </View>
                </View>
              );
            }}
          />

          {pendingAction ? (
            <PendingActionAlert
              action={pendingAction}
              accepting={confirmAction.isPending}
              rejecting={rejectAction.isPending}
              onAccept={() => {
                confirmAction.mutate(pendingAction.id, {
                  onSuccess: () => {
                    void syncAfterMessage();
                  },
                  onError: (error) => Alert.alert('Could not accept action', error.message),
                });
              }}
              onReject={() => {
                rejectAction.mutate(pendingAction.id, {
                  onSuccess: () => {
                    void syncAfterMessage();
                  },
                  onError: (error) => Alert.alert('Could not reject action', error.message),
                });
              }}
            />
          ) : null}

          <View style={[styles.contextRow, { borderTopColor: border, backgroundColor: card }]}>
            <ThemedText style={[styles.contextLabel, { color: textSecondary }]}>Context:</ThemedText>
            {(['money', 'habits', 'notes', 'events'] as const).map((key) => {
              const enabled = contexts[key];
              return (
                <Pressable
                  key={key}
                  disabled={isBusy}
                  onPress={() => {
                    const previousContexts = contexts;
                    const nextContexts = { ...contexts, [key]: !enabled };
                    setContexts(nextContexts);
                    updateChat.mutate(
                      {
                        id,
                        data: { contexts: nextContexts },
                      },
                      {
                        onError: (error) => {
                          setContexts(previousContexts);
                          Alert.alert('Could not update context', error.message);
                        },
                      },
                    );
                  }}
                  style={[
                    styles.contextChip,
                    {
                      borderColor: enabled ? tint : border,
                      backgroundColor: enabled ? `${tint}1F` : surface,
                    },
                  ]}
                >
                  <ThemedText style={{ color: enabled ? tint : textSecondary }}>
                    {key[0].toUpperCase() + key.slice(1)}
                  </ThemedText>
                </Pressable>
              );
            })}
          </View>

          <View style={[styles.composer, { borderTopColor: border, backgroundColor: card }]}> 
            {composerAttachments.length > 0 ? (
              <View style={styles.composerAttachmentRow}>
                <ChatAttachments
                  attachments={composerAttachments}
                  cookieHeader={cookieHeader}
                  removable
                  onRemove={(attachmentId) => {
                    void removeComposerAttachment(attachmentId);
                  }}
                  onOpen={setPreviewAttachment}
                />
              </View>
            ) : null}
            <View style={styles.inputRow}>
              <Pressable
                onPress={openAttachmentPicker}
                disabled={isBusy || composerAttachments.length >= MAX_ATTACHMENTS}
                style={[
                  styles.attachButton,
                  {
                    borderColor: border,
                    backgroundColor: surface,
                    opacity: isBusy || composerAttachments.length >= MAX_ATTACHMENTS ? 0.6 : 1,
                  },
                ]}
                accessibilityRole="button"
                accessibilityLabel="Add image attachment"
              >
                {uploadAttachment.isPending ? (
                  <ActivityIndicator size="small" color={tint} />
                ) : (
                  <Ionicons name="add" size={18} color={tint} />
                )}
              </Pressable>
            <TextInput
              value={input}
              onChangeText={setInput}
              placeholder="Ask your assistant..."
              placeholderTextColor={textSecondary}
              editable={!isBusy}
              multiline
              style={[
                styles.input,
                {
                  borderColor: border,
                  backgroundColor: surface,
                  color: text,
                },
              ]}
            />
            <Pressable
              disabled={isBusy || (input.trim().length === 0 && composerAttachments.length === 0)}
              onPress={handleSend}
              style={[
                styles.sendButton,
                {
                  backgroundColor:
                    isBusy || (input.trim().length === 0 && composerAttachments.length === 0) ? `${tint}66` : tint,
                },
              ]}
            >
              {isBusy ? (
                <ActivityIndicator color="#ffffff" />
              ) : (
                <Ionicons name="arrow-up" size={18} color="#ffffff" />
              )}
            </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
        <AttachmentPreviewModal
          attachment={previewAttachment}
          cookieHeader={cookieHeader}
          onClose={() => setPreviewAttachment(null)}
        />
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
  headerButton: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  messageList: {
    paddingHorizontal: 14,
    paddingTop: 16,
    paddingBottom: 16,
    gap: 10,
  },
  bubbleWrap: {
    flexDirection: 'row',
  },
  bubbleWrapUser: {
    justifyContent: 'flex-end',
  },
  bubbleWrapAssistant: {
    justifyContent: 'flex-start',
  },
  bubble: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
    maxWidth: '84%',
  },
  bubbleText: {
    fontSize: 15,
    lineHeight: 21,
  },
  emptyState: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 14,
    padding: 14,
    gap: 6,
  },
  contextRow: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 8,
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 8,
  },
  contextLabel: {
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  contextChip: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  composer: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  composerAttachmentRow: {
    marginBottom: 8,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
  },
  attachButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 2,
  },
  input: {
    flex: 1,
    minHeight: 44,
    maxHeight: 140,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 18,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
  },
  sendButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
