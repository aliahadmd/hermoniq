import { Pressable, StyleSheet, View } from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { useThemeColor } from '@/hooks/use-theme-color';
import type { AiPendingAction } from '@/lib/types';

interface PendingActionAlertProps {
  action: AiPendingAction;
  accepting?: boolean;
  rejecting?: boolean;
  onAccept: () => void;
  onReject: () => void;
}

function actionTitle(type: AiPendingAction['type']): string {
  switch (type) {
    case 'money_create_transaction':
      return 'Request: Create transaction';
    case 'money_delete_transaction':
      return 'Request: Delete transaction';
    case 'habit_create':
      return 'Request: Create habit';
    case 'habit_update':
      return 'Request: Update habit';
    case 'habit_log_upsert':
      return 'Request: Update habit log';
    case 'note_update':
      return 'Request: Update note';
    case 'note_archive':
      return 'Request: Archive note';
    case 'event_create':
      return 'Request: Create event';
    case 'event_update':
      return 'Request: Update event';
    case 'event_delete':
      return 'Request: Delete event';
    case 'create_note':
    case 'note_create':
    default:
      return 'Request: Create note';
  }
}

function actionSummary(payload: AiPendingAction['payload']): string {
  if (!payload) return 'No payload provided.';
  const entries = Object.entries(payload).slice(0, 4);
  if (entries.length === 0) return 'No payload provided.';
  return entries.map(([key, value]) => `${key}: ${String(value)}`).join(' · ');
}

export function PendingActionAlert({
  action,
  accepting,
  rejecting,
  onAccept,
  onReject,
}: PendingActionAlertProps) {
  const border = useThemeColor({}, 'border');
  const surface = useThemeColor({}, 'surface');
  const textSecondary = useThemeColor({}, 'textSecondary');
  const tint = useThemeColor({}, 'tint');
  const danger = useThemeColor({}, 'danger');
  const isBusy = Boolean(accepting || rejecting);

  return (
    <View style={[styles.card, { borderColor: border, backgroundColor: surface }]}>
      <ThemedText type="defaultSemiBold">{actionTitle(action.type)}</ThemedText>
      <ThemedText style={{ color: textSecondary }} numberOfLines={3}>
        {actionSummary(action.payload)}
      </ThemedText>
      <View style={styles.actions}>
        <Pressable
          disabled={isBusy}
          onPress={onAccept}
          style={[styles.button, { backgroundColor: tint }]}
        >
          <ThemedText style={styles.buttonText}>
            {accepting ? 'Accepting...' : 'Accept'}
          </ThemedText>
        </Pressable>
        <Pressable
          disabled={isBusy}
          onPress={onReject}
          style={[styles.button, { backgroundColor: danger }]}
        >
          <ThemedText style={styles.buttonText}>
            {rejecting ? 'Rejecting...' : 'Reject'}
          </ThemedText>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginHorizontal: 14,
    marginBottom: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 12,
    padding: 12,
    gap: 8,
  },
  actions: {
    flexDirection: 'row',
    gap: 8,
  },
  button: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
  },
  buttonText: {
    color: '#ffffff',
    fontWeight: '700',
  },
});
