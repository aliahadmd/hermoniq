import { useEffect } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
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

const ABOUT_MAX_LENGTH = 100;

export default function EditProfileScreen() {
  const { colors } = useTheme();
  const colorScheme = useColorScheme() ?? 'light';
  const theme = Colors[colorScheme];

  const { data: profile, isLoading, error } = useProfile();
  const updateProfile = useUpdateProfile();

  const {
    control,
    handleSubmit,
    reset,
    watch,
    formState: { errors, isDirty },
  } = useForm<ProfileForm>({
    resolver: zodResolver(updateProfileSchema),
    defaultValues: {
      name: '',
      username: '',
      photoUrl: null,
      about: null,
      location: null,
      gender: null,
      website: null,
      workCompany: null,
      workPosition: null,
      workDescription: null,
      educationSchool: null,
      educationDegree: null,
      educationGraduated: null,
    },
  });

  const aboutValue = watch('about');
  const aboutLength = aboutValue?.length ?? 0;

  useEffect(() => {
    if (profile) {
      reset({
        name: profile.name,
        username: profile.username,
        photoUrl: profile.photoUrl,
        about: profile.about,
        location: profile.location,
        gender: profile.gender,
        website: profile.website,
        workCompany: profile.workCompany,
        workPosition: profile.workPosition,
        workDescription: profile.workDescription,
        educationSchool: profile.educationSchool,
        educationDegree: profile.educationDegree,
        educationGraduated: profile.educationGraduated,
      });
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

  const inputStyle = [
    styles.input,
    { color: theme.text, borderColor: theme.border, backgroundColor: theme.surface },
  ];

  const inputErrorStyle = [
    styles.input,
    { color: theme.text, borderColor: theme.danger, backgroundColor: theme.surface },
  ];

  return (
    <ThemedView style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.flex}
      >
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          {/* Basic Info Section */}
          <ThemedText type="defaultSemiBold" style={styles.sectionHeader}>
            Basic Info
          </ThemedText>

          {/* Name */}
          <ThemedText style={[styles.label, { color: theme.textSecondary }]}>Name</ThemedText>
          <Controller
            control={control}
            name="name"
            render={({ field: { onChange, onBlur, value } }) => (
              <TextInput
                style={errors.name ? inputErrorStyle : inputStyle}
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
            <ThemedText style={[styles.fieldError, { color: theme.danger }]}>
              {errors.name.message}
            </ThemedText>
          )}

          {/* Username */}
          <ThemedText style={[styles.label, { color: theme.textSecondary }]}>Username</ThemedText>
          <Controller
            control={control}
            name="username"
            render={({ field: { onChange, onBlur, value } }) => (
              <TextInput
                style={errors.username ? inputErrorStyle : inputStyle}
                placeholder="username"
                placeholderTextColor={theme.textSecondary}
                value={value ?? ''}
                onChangeText={onChange}
                onBlur={onBlur}
                autoCapitalize="none"
                autoCorrect={false}
              />
            )}
          />
          {errors.username && (
            <ThemedText style={[styles.fieldError, { color: theme.danger }]}>
              {errors.username.message}
            </ThemedText>
          )}

          {/* Photo URL */}
          <ThemedText style={[styles.label, { color: theme.textSecondary }]}>Photo URL</ThemedText>
          <Controller
            control={control}
            name="photoUrl"
            render={({ field: { onChange, onBlur, value } }) => (
              <TextInput
                style={errors.photoUrl ? inputErrorStyle : inputStyle}
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
            <ThemedText style={[styles.fieldError, { color: theme.danger }]}>
              {errors.photoUrl.message}
            </ThemedText>
          )}

          {/* About */}
          <View style={styles.labelRow}>
            <ThemedText style={[styles.label, { color: theme.textSecondary }]}>About</ThemedText>
            <ThemedText
              style={[
                styles.charCounter,
                { color: aboutLength > ABOUT_MAX_LENGTH ? theme.danger : theme.textSecondary },
              ]}
            >
              {aboutLength}/{ABOUT_MAX_LENGTH}
            </ThemedText>
          </View>
          <Controller
            control={control}
            name="about"
            render={({ field: { onChange, onBlur, value } }) => (
              <TextInput
                style={[
                  errors.about ? inputErrorStyle : inputStyle,
                  styles.multilineInput,
                ]}
                placeholder="Tell us about yourself"
                placeholderTextColor={theme.textSecondary}
                value={value ?? ''}
                onChangeText={(text) => onChange(text || null)}
                onBlur={onBlur}
                multiline
                numberOfLines={3}
                textAlignVertical="top"
              />
            )}
          />
          {errors.about && (
            <ThemedText style={[styles.fieldError, { color: theme.danger }]}>
              {errors.about.message}
            </ThemedText>
          )}

          {/* Personal Section */}
          <ThemedText type="defaultSemiBold" style={[styles.sectionHeader, styles.sectionSpacing]}>
            Personal
          </ThemedText>

          {/* Location */}
          <ThemedText style={[styles.label, { color: theme.textSecondary }]}>Location</ThemedText>
          <Controller
            control={control}
            name="location"
            render={({ field: { onChange, onBlur, value } }) => (
              <TextInput
                style={errors.location ? inputErrorStyle : inputStyle}
                placeholder="City, Country"
                placeholderTextColor={theme.textSecondary}
                value={value ?? ''}
                onChangeText={(text) => onChange(text || null)}
                onBlur={onBlur}
              />
            )}
          />
          {errors.location && (
            <ThemedText style={[styles.fieldError, { color: theme.danger }]}>
              {errors.location.message}
            </ThemedText>
          )}

          {/* Gender */}
          <ThemedText style={[styles.label, { color: theme.textSecondary }]}>Gender</ThemedText>
          <Controller
            control={control}
            name="gender"
            render={({ field: { onChange, onBlur, value } }) => (
              <TextInput
                style={errors.gender ? inputErrorStyle : inputStyle}
                placeholder="Gender"
                placeholderTextColor={theme.textSecondary}
                value={value ?? ''}
                onChangeText={(text) => onChange(text || null)}
                onBlur={onBlur}
              />
            )}
          />
          {errors.gender && (
            <ThemedText style={[styles.fieldError, { color: theme.danger }]}>
              {errors.gender.message}
            </ThemedText>
          )}

          {/* Website */}
          <ThemedText style={[styles.label, { color: theme.textSecondary }]}>Website</ThemedText>
          <Controller
            control={control}
            name="website"
            render={({ field: { onChange, onBlur, value } }) => (
              <TextInput
                style={errors.website ? inputErrorStyle : inputStyle}
                placeholder="https://yourwebsite.com"
                placeholderTextColor={theme.textSecondary}
                value={value ?? ''}
                onChangeText={(text) => onChange(text || null)}
                onBlur={onBlur}
                autoCapitalize="none"
                keyboardType="url"
              />
            )}
          />
          {errors.website && (
            <ThemedText style={[styles.fieldError, { color: theme.danger }]}>
              {errors.website.message}
            </ThemedText>
          )}

          {/* Work Section */}
          <ThemedText type="defaultSemiBold" style={[styles.sectionHeader, styles.sectionSpacing]}>
            Work
          </ThemedText>

          {/* Company */}
          <ThemedText style={[styles.label, { color: theme.textSecondary }]}>Company</ThemedText>
          <Controller
            control={control}
            name="workCompany"
            render={({ field: { onChange, onBlur, value } }) => (
              <TextInput
                style={errors.workCompany ? inputErrorStyle : inputStyle}
                placeholder="Company name"
                placeholderTextColor={theme.textSecondary}
                value={value ?? ''}
                onChangeText={(text) => onChange(text || null)}
                onBlur={onBlur}
              />
            )}
          />
          {errors.workCompany && (
            <ThemedText style={[styles.fieldError, { color: theme.danger }]}>
              {errors.workCompany.message}
            </ThemedText>
          )}

          {/* Position */}
          <ThemedText style={[styles.label, { color: theme.textSecondary }]}>Position</ThemedText>
          <Controller
            control={control}
            name="workPosition"
            render={({ field: { onChange, onBlur, value } }) => (
              <TextInput
                style={errors.workPosition ? inputErrorStyle : inputStyle}
                placeholder="Job title"
                placeholderTextColor={theme.textSecondary}
                value={value ?? ''}
                onChangeText={(text) => onChange(text || null)}
                onBlur={onBlur}
              />
            )}
          />
          {errors.workPosition && (
            <ThemedText style={[styles.fieldError, { color: theme.danger }]}>
              {errors.workPosition.message}
            </ThemedText>
          )}

          {/* Work Description */}
          <ThemedText style={[styles.label, { color: theme.textSecondary }]}>
            Description
          </ThemedText>
          <Controller
            control={control}
            name="workDescription"
            render={({ field: { onChange, onBlur, value } }) => (
              <TextInput
                style={[
                  errors.workDescription ? inputErrorStyle : inputStyle,
                  styles.multilineInput,
                ]}
                placeholder="What do you do?"
                placeholderTextColor={theme.textSecondary}
                value={value ?? ''}
                onChangeText={(text) => onChange(text || null)}
                onBlur={onBlur}
                multiline
                numberOfLines={3}
                textAlignVertical="top"
              />
            )}
          />
          {errors.workDescription && (
            <ThemedText style={[styles.fieldError, { color: theme.danger }]}>
              {errors.workDescription.message}
            </ThemedText>
          )}

          {/* Education Section */}
          <ThemedText type="defaultSemiBold" style={[styles.sectionHeader, styles.sectionSpacing]}>
            Education
          </ThemedText>

          {/* School */}
          <ThemedText style={[styles.label, { color: theme.textSecondary }]}>School</ThemedText>
          <Controller
            control={control}
            name="educationSchool"
            render={({ field: { onChange, onBlur, value } }) => (
              <TextInput
                style={errors.educationSchool ? inputErrorStyle : inputStyle}
                placeholder="School or university"
                placeholderTextColor={theme.textSecondary}
                value={value ?? ''}
                onChangeText={(text) => onChange(text || null)}
                onBlur={onBlur}
              />
            )}
          />
          {errors.educationSchool && (
            <ThemedText style={[styles.fieldError, { color: theme.danger }]}>
              {errors.educationSchool.message}
            </ThemedText>
          )}

          {/* Degree */}
          <ThemedText style={[styles.label, { color: theme.textSecondary }]}>Degree</ThemedText>
          <Controller
            control={control}
            name="educationDegree"
            render={({ field: { onChange, onBlur, value } }) => (
              <TextInput
                style={errors.educationDegree ? inputErrorStyle : inputStyle}
                placeholder="Degree or certification"
                placeholderTextColor={theme.textSecondary}
                value={value ?? ''}
                onChangeText={(text) => onChange(text || null)}
                onBlur={onBlur}
              />
            )}
          />
          {errors.educationDegree && (
            <ThemedText style={[styles.fieldError, { color: theme.danger }]}>
              {errors.educationDegree.message}
            </ThemedText>
          )}

          {/* Graduated */}
          <View style={styles.switchRow}>
            <ThemedText style={[styles.label, { color: theme.textSecondary, marginTop: 0, marginBottom: 0 }]}>
              Graduated
            </ThemedText>
            <Controller
              control={control}
              name="educationGraduated"
              render={({ field: { onChange, value } }) => (
                <Switch
                  value={value ?? false}
                  onValueChange={(val) => onChange(val)}
                  trackColor={{ false: theme.border, true: theme.tint }}
                  thumbColor={colors.card}
                />
              )}
            />
          </View>

          {/* Save Button */}
          <View style={styles.buttonRow}>
            <Pressable
              onPress={handleSubmit(onSubmit)}
              disabled={!isDirty || updateProfile.isPending}
              style={[
                styles.saveBtn,
                { backgroundColor: isDirty ? theme.tint : theme.border },
              ]}
            >
              {updateProfile.isPending ? (
                <ActivityIndicator color="#ffffff" size="small" />
              ) : (
                <ThemedText style={{ color: isDirty ? '#fff' : theme.textSecondary, fontWeight: '600' }}>
                  Save
                </ThemedText>
              )}
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
    paddingBottom: 48,
  },
  sectionHeader: {
    fontSize: 18,
    marginBottom: 4,
  },
  sectionSpacing: {
    marginTop: 28,
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    marginTop: 16,
    marginBottom: 6,
  },
  labelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 16,
    marginBottom: 6,
  },
  charCounter: {
    fontSize: 12,
  },
  input: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
  },
  multilineInput: {
    minHeight: 80,
    paddingTop: 12,
  },
  fieldError: {
    fontSize: 12,
    marginTop: 4,
  },
  switchRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 16,
    paddingVertical: 4,
  },
  buttonRow: {
    marginTop: 32,
    alignItems: 'flex-end',
  },
  saveBtn: {
    borderRadius: 10,
    paddingHorizontal: 28,
    paddingVertical: 12,
    minWidth: 100,
    alignItems: 'center',
  },
});
