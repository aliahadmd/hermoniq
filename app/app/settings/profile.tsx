import { useEffect } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { useTheme } from '@react-navigation/native';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useProfile, useUpdateProfile } from '@/hooks/use-profile';
import { updateProfileSchema } from '@/lib/validators';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import type { z } from 'zod';

type ProfileForm = z.infer<typeof updateProfileSchema>;

export default function ProfileScreen() {
  const { colors } = useTheme();
  const colorScheme = useColorScheme() ?? 'light';
  const theme = Colors[colorScheme];

  const { data: profile, isLoading, error } = useProfile();
  const updateProfile = useUpdateProfile();

  const {
    control,
    handleSubmit,
    reset,
    formState: { errors, isDirty },
  } = useForm<ProfileForm>({
    resolver: zodResolver(updateProfileSchema),
    defaultValues: { name: '', photoUrl: null },
  });

  useEffect(() => {
    if (profile) {
      reset({ name: profile.name, photoUrl: profile.photoUrl });
    }
  }, [profile, reset]);

  const onSubmit = (data: ProfileForm) => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    updateProfile.mutate(data, {
      onSuccess: () => Alert.alert('Saved', 'Profile updated successfully.'),
      onError: (e) => Alert.alert('Error', e.message),
    });
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
        <ThemedText>Failed to load profile</ThemedText>
        <ThemedText style={{ color: theme.textSecondary, fontSize: 13, marginTop: 4 }}>
          {error.message}
        </ThemedText>
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.flex}
      >
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <ThemedText style={[styles.label, { color: theme.textSecondary }]}>Name</ThemedText>
          <Controller
            control={control}
            name="name"
            render={({ field: { onChange, onBlur, value } }) => (
              <TextInput
                style={[styles.input, { color: theme.text, borderColor: theme.border, backgroundColor: theme.surface }]}
                placeholder="Your name"
                placeholderTextColor={theme.textSecondary}
                value={value}
                onChangeText={onChange}
                onBlur={onBlur}
                autoCapitalize="words"
              />
            )}
          />
          {errors.name && (
            <ThemedText style={styles.errorText}>{errors.name.message}</ThemedText>
          )}

          <ThemedText style={[styles.label, { color: theme.textSecondary }]}>Photo URL</ThemedText>
          <Controller
            control={control}
            name="photoUrl"
            render={({ field: { onChange, onBlur, value } }) => (
              <TextInput
                style={[styles.input, { color: theme.text, borderColor: theme.border, backgroundColor: theme.surface }]}
                placeholder="https://example.com/photo.jpg"
                placeholderTextColor={theme.textSecondary}
                value={value ?? ''}
                onChangeText={(text) => onChange(text || null)}
                onBlur={onBlur}
                autoCapitalize="none"
                keyboardType="url"
              />
            )}
          />
          {errors.photoUrl && (
            <ThemedText style={styles.errorText}>{errors.photoUrl.message}</ThemedText>
          )}

          <View style={styles.buttonRow}>
            <Pressable
              onPress={handleSubmit(onSubmit)}
              disabled={!isDirty || updateProfile.isPending}
              style={[
                styles.saveBtn,
                { backgroundColor: isDirty ? theme.tint : theme.border },
              ]}
            >
              <ThemedText style={{ color: isDirty ? '#fff' : theme.textSecondary }}>
                {updateProfile.isPending ? 'Saving…' : 'Save'}
              </ThemedText>
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  flex: {
    flex: 1,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  content: {
    padding: 24,
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    marginTop: 16,
    marginBottom: 6,
  },
  input: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
  },
  errorText: {
    color: '#d93025',
    fontSize: 12,
    marginTop: 4,
  },
  buttonRow: {
    marginTop: 32,
    alignItems: 'flex-end',
  },
  saveBtn: {
    borderRadius: 10,
    paddingHorizontal: 28,
    paddingVertical: 12,
  },
});
