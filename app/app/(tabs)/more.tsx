import { Image, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useProfile } from '@/hooks/use-profile';

interface MenuItemProps {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress?: () => void;
  comingSoon?: boolean;
  theme: (typeof Colors)['light'];
}

function MenuItem({ icon, label, onPress, comingSoon, theme }: MenuItemProps) {
  return (
    <Pressable
      onPress={onPress}
      disabled={comingSoon}
      style={[styles.menuRow, { borderBottomColor: theme.border }]}
    >
      <Ionicons name={icon} size={22} color={theme.tint} style={styles.menuIcon} />
      <ThemedText style={styles.menuLabel}>{label}</ThemedText>
      {comingSoon ? (
        <View style={[styles.badge, { backgroundColor: theme.border }]}>
          <ThemedText style={[styles.badgeText, { color: theme.textSecondary }]}>
            Coming Soon
          </ThemedText>
        </View>
      ) : (
        <Ionicons name="chevron-forward" size={18} color={theme.textSecondary} />
      )}
    </Pressable>
  );
}

export default function MoreScreen() {
  const router = useRouter();
  const colorScheme = useColorScheme() ?? 'light';
  const theme = Colors[colorScheme];
  const { data: profile } = useProfile();

  const displayName = profile?.name ?? 'Loading...';
  const displayUsername = profile?.username ? `@${profile.username}` : '';

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.container} edges={['top']}>
        <ScrollView contentContainerStyle={styles.scrollContent}>
          {/* Profile Section */}
          <Pressable
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              router.push('/profile/edit');
            }}
            style={[styles.profileSection, { backgroundColor: theme.card, borderColor: theme.border }]}
          >
            {profile?.photoUrl ? (
              <Image source={{ uri: profile.photoUrl }} style={styles.avatar} />
            ) : (
              <View style={[styles.avatar, styles.avatarPlaceholder, { backgroundColor: theme.tint }]}>
                <ThemedText style={styles.avatarInitial}>
                  {displayName.charAt(0).toUpperCase()}
                </ThemedText>
              </View>
            )}
            <View style={styles.profileInfo}>
              <ThemedText type="subtitle" numberOfLines={1}>
                {displayName}
              </ThemedText>
              {displayUsername ? (
                <ThemedText style={[styles.username, { color: theme.textSecondary }]}>
                  {displayUsername}
                </ThemedText>
              ) : null}
            </View>
            <Ionicons name="chevron-forward" size={20} color={theme.textSecondary} />
          </Pressable>

          {/* Menu Items */}
          <View style={[styles.menuSection, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <MenuItem
              icon="calendar-outline"
              label="Events & Planner"
              theme={theme}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                router.push('/(tabs)/planner');
              }}
            />
            <MenuItem
              icon="document-text-outline"
              label="Notes"
              theme={theme}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                router.push('/notes');
              }}
            />
          </View>

          {/* Settings */}
          <View style={[styles.menuSection, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <MenuItem
              icon="settings-outline"
              label="Settings"
              theme={theme}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                router.push('/settings');
              }}
            />
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
  scrollContent: {
    paddingTop: 16,
    paddingBottom: 32,
  },
  profileSection: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    marginBottom: 16,
    padding: 16,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
  },
  avatar: {
    width: 60,
    height: 60,
    borderRadius: 30,
  },
  avatarPlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitial: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#ffffff',
  },
  profileInfo: {
    flex: 1,
    marginLeft: 14,
    marginRight: 8,
  },
  username: {
    fontSize: 14,
    marginTop: 2,
  },
  menuSection: {
    marginHorizontal: 16,
    marginBottom: 16,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  menuRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  menuIcon: {
    marginRight: 12,
  },
  menuLabel: {
    flex: 1,
    fontSize: 16,
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
