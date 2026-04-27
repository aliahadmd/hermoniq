import { Alert, Pressable, StyleSheet, Switch, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useTheme } from '@react-navigation/native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useHabitPreferences } from '@/hooks/use-habits';
import { EVENT_REMINDER_OPTIONS } from '@/lib/planner-utils';
import { useAppStore } from '@/stores/app-store';
import { signOut } from '@/lib/auth-client';
import type { EventReminderMinutes } from '@/lib/types';

interface SectionHeaderProps {
  title: string;
}

function SectionHeader({ title }: SectionHeaderProps) {
  return (
    <ThemedText style={styles.sectionHeader}>{title}</ThemedText>
  );
}

interface SettingsRowProps {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  description?: string;
  onPress?: () => void;
  iconColor?: string;
  borderColor: string;
  textColor: string;
  comingSoon?: boolean;
}

function SettingsRow({
  icon,
  label,
  description,
  onPress,
  iconColor,
  borderColor,
  textColor,
  comingSoon,
}: SettingsRowProps) {
  return (
    <Pressable
      onPress={onPress}
      disabled={comingSoon}
      style={[styles.row, { borderBottomColor: borderColor }]}
    >
      <Ionicons name={icon} size={22} color={iconColor ?? textColor} style={styles.rowIcon} />
      {description ? (
        <View style={styles.rowText}>
          <ThemedText style={styles.rowLabel}>{label}</ThemedText>
          <ThemedText style={[styles.rowDescription, { color: textColor }]}>{description}</ThemedText>
        </View>
      ) : (
        <ThemedText style={styles.rowLabel}>{label}</ThemedText>
      )}
      {comingSoon ? (
        <View style={[styles.badge, { backgroundColor: borderColor }]}>
          <ThemedText style={[styles.badgeText, { color: textColor }]}>
            Coming Soon
          </ThemedText>
        </View>
      ) : (
        <Ionicons name="chevron-forward" size={18} color={textColor} />
      )}
    </Pressable>
  );
}

function formatEventReminderLabel(value: EventReminderMinutes | null): string {
  const found = EVENT_REMINDER_OPTIONS.find((option) => option.value === value);
  return found?.label ?? 'None';
}

export default function SettingsScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const colorScheme = useColorScheme() ?? 'light';
  const theme = Colors[colorScheme];
  const {
    themeOverride,
    setThemeOverride,
    expenseReminderEnabled,
    expenseReminderTime,
    expenseReminderWeekdaysOnly,
    habitReminderSmartInsightsEnabled,
    eventReminderEnabled,
    eventReminderDefaultMinutes,
    eventReminderWeekdaysOnly,
    eventReminderSmartInsightsEnabled,
  } = useAppStore();
  const habitPreferencesQuery = useHabitPreferences();

  const isDark = themeOverride === 'dark' || (themeOverride === null && colorScheme === 'dark');

  const toggleDarkMode = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setThemeOverride(isDark ? 'light' : 'dark');
  };

  const moneyReminderSummary = expenseReminderEnabled
    ? `Active at ${expenseReminderTime}${expenseReminderWeekdaysOnly ? ' • Weekdays only' : ''}`
    : 'Off';
  const habitPreferences = habitPreferencesQuery.data;
  const habitsReminderSummary = habitPreferences
    ? habitPreferences.reminderMasterEnabled
      ? `On${habitPreferences.defaultReminderEnabled ? ` • Default ${habitPreferences.defaultReminderTime ?? '21:00'}` : ''}${habitReminderSmartInsightsEnabled ? ' • Smart' : ''}`
      : 'Off'
    : 'Loading...';
  const plannerReminderSummary = eventReminderEnabled
    ? `On • Default ${formatEventReminderLabel(eventReminderDefaultMinutes)}${eventReminderSmartInsightsEnabled ? ' • Smart' : ''}${eventReminderWeekdaysOnly ? ' • Weekdays' : ''}`
    : 'Off';

  return (
    <ThemedView style={styles.container}>
      {/* General Section */}
      <SectionHeader title="General" />
      <View style={[styles.section, { backgroundColor: theme.card, borderColor: theme.border }]}>
        <View style={[styles.row, { borderBottomColor: theme.border }]}>
          <Ionicons name="moon-outline" size={22} color={theme.tint} style={styles.rowIcon} />
          <ThemedText style={styles.rowLabel}>Dark Mode</ThemedText>
          <Switch
            value={isDark}
            onValueChange={toggleDarkMode}
            trackColor={{ false: theme.border, true: theme.tint }}
            thumbColor={colors.card}
          />
        </View>
        <Pressable
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            Alert.alert('Log Out', 'Are you sure you want to log out?', [
              { text: 'Cancel', style: 'cancel' },
              {
                text: 'Log Out',
                style: 'destructive',
                onPress: async () => {
                  await signOut();
                },
              },
            ]);
          }}
          style={[styles.row, { borderBottomColor: 'transparent' }]}
        >
          <Ionicons name="log-out-outline" size={22} color={theme.danger} style={styles.rowIcon} />
          <ThemedText style={[styles.rowLabel, { color: theme.danger }]}>Log Out</ThemedText>
        </Pressable>
      </View>

      {/* Money Section */}
      <SectionHeader title="Money" />
      <View style={[styles.section, { backgroundColor: theme.card, borderColor: theme.border }]}>
        <SettingsRow
          icon="notifications-outline"
          label="Money reminders"
          description={moneyReminderSummary}
          iconColor={theme.tint}
          borderColor={theme.border}
          textColor={theme.textSecondary}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            router.push('/settings/money');
          }}
        />
        <SettingsRow
          icon="grid-outline"
          label="Categories"
          iconColor={theme.tint}
          borderColor="transparent"
          textColor={theme.textSecondary}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            router.push('/settings/categories');
          }}
        />
      </View>

      {/* Habits Section */}
      <SectionHeader title="Habits" />
      <View style={[styles.section, { backgroundColor: theme.card, borderColor: theme.border }]}>
        <SettingsRow
          icon="options-outline"
          label="Habit Settings"
          description={habitsReminderSummary}
          iconColor={theme.tint}
          borderColor="transparent"
          textColor={theme.textSecondary}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            router.push('/settings/habits');
          }}
        />
      </View>

      {/* Planner Section */}
      <SectionHeader title="Planner" />
      <View style={[styles.section, { backgroundColor: theme.card, borderColor: theme.border }]}>
        <SettingsRow
          icon="calendar-outline"
          label="Planner reminders"
          description={plannerReminderSummary}
          iconColor={theme.tint}
          borderColor="transparent"
          textColor={theme.textSecondary}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            router.push('/settings/planner');
          }}
        />
      </View>

      {/* Notes Section */}
      <SectionHeader title="Notes" />
      <View style={[styles.section, { backgroundColor: theme.card, borderColor: theme.border }]}>
        <SettingsRow
          icon="document-text-outline"
          label="Note Categories"
          iconColor={theme.tint}
          borderColor="transparent"
          textColor={theme.textSecondary}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            router.push('/settings/notes');
          }}
        />
      </View>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingTop: 16,
  },
  sectionHeader: {
    fontSize: 13,
    fontWeight: '600',
    textTransform: 'uppercase',
    marginHorizontal: 16,
    marginBottom: 6,
    opacity: 0.5,
  },
  section: {
    marginHorizontal: 16,
    marginBottom: 16,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  rowIcon: {
    marginRight: 12,
  },
  rowLabel: {
    flex: 1,
    fontSize: 16,
  },
  rowText: {
    flex: 1,
  },
  rowDescription: {
    fontSize: 12,
    marginTop: 2,
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '600',
  },
});
