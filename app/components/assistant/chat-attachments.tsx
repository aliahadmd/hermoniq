import { Image, Modal, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { ThemedText } from '@/components/themed-text';
import { useThemeColor } from '@/hooks/use-theme-color';
import { resolveApiBaseUrl } from '@/lib/base-url';
import type { AiMessageAttachment } from '@/lib/types';

interface ChatAttachmentsProps {
  attachments: AiMessageAttachment[];
  cookieHeader?: string | null;
  removable?: boolean;
  onRemove?: (attachmentId: string) => void;
  onOpen?: (attachment: AiMessageAttachment) => void;
}

function toAbsoluteUrl(pathOrUrl: string): string {
  if (/^https?:\/\//i.test(pathOrUrl)) return pathOrUrl;
  const base = resolveApiBaseUrl(process.env.EXPO_PUBLIC_API_URL);
  return `${base}${pathOrUrl}`;
}

function buildSource(attachment: AiMessageAttachment, cookieHeader?: string | null) {
  const uri = toAbsoluteUrl(attachment.contentUrl);
  if (Platform.OS === 'web' || !cookieHeader) {
    return { uri };
  }
  return {
    uri,
    headers: {
      Cookie: cookieHeader,
    },
  };
}

export function ChatAttachments({
  attachments,
  cookieHeader,
  removable = false,
  onRemove,
  onOpen,
}: ChatAttachmentsProps) {
  const border = useThemeColor({}, 'border');
  const card = useThemeColor({}, 'card');
  const text = useThemeColor({}, 'text');

  if (attachments.length === 0) return null;

  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
      {attachments.map((attachment) => (
        <View key={attachment.id} style={[styles.thumbWrap, { borderColor: border, backgroundColor: card }]}>
          <Pressable onPress={() => onOpen?.(attachment)}>
            <Image source={buildSource(attachment, cookieHeader)} style={styles.thumb} resizeMode="cover" />
          </Pressable>
          {removable ? (
            <Pressable
              style={[styles.removeBadge, { backgroundColor: '#00000088' }]}
              onPress={() => onRemove?.(attachment.id)}
              accessibilityRole="button"
              accessibilityLabel={`Remove ${attachment.fileName}`}
            >
              <Ionicons name="close" size={14} color="#ffffff" />
            </Pressable>
          ) : null}
        </View>
      ))}
      {attachments.length > 0 ? (
        <ThemedText style={[styles.countText, { color: text }]}>
          {attachments.length} image{attachments.length > 1 ? 's' : ''}
        </ThemedText>
      ) : null}
    </ScrollView>
  );
}

interface AttachmentPreviewModalProps {
  attachment: AiMessageAttachment | null;
  cookieHeader?: string | null;
  onClose: () => void;
}

export function AttachmentPreviewModal({
  attachment,
  cookieHeader,
  onClose,
}: AttachmentPreviewModalProps) {
  return (
    <Modal
      visible={Boolean(attachment)}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <Pressable style={styles.previewBackdrop} onPress={onClose}>
        {attachment ? (
          <Image
            source={buildSource(attachment, cookieHeader)}
            style={styles.previewImage}
            resizeMode="contain"
          />
        ) : null}
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  row: {
    alignItems: 'center',
    gap: 8,
  },
  thumbWrap: {
    width: 64,
    height: 64,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  thumb: {
    width: '100%',
    height: '100%',
  },
  removeBadge: {
    position: 'absolute',
    top: 2,
    right: 2,
    width: 18,
    height: 18,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  countText: {
    fontSize: 12,
    marginLeft: 2,
  },
  previewBackdrop: {
    flex: 1,
    backgroundColor: '#000000D0',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  previewImage: {
    width: '100%',
    height: '100%',
  },
});
