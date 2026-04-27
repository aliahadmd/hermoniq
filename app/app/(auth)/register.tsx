import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { Link, router } from 'expo-router';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { signUp } from '@/lib/auth-client';
import { registerSchema, type RegisterInput } from '@/lib/validators';

export default function RegisterScreen() {
  const colorScheme = useColorScheme() ?? 'light';
  const theme = Colors[colorScheme];

  const {
    control,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<RegisterInput>({
    resolver: zodResolver(registerSchema),
    defaultValues: { name: '', email: '', password: '', confirmPassword: '' },
  });

  const onSubmit = async (data: RegisterInput) => {
    try {
      const result = await signUp.email({
        email: data.email.trim(),
        password: data.password,
        name: data.name.trim(),
      });

      if (result.error) {
        const msg = result.error.message ?? '';
        // If the error is about email verification, that means the user was
        // created successfully but needs to verify — navigate to OTP screen.
        if (
          result.error.code === 'EMAIL_NOT_VERIFIED' ||
          msg.toLowerCase().includes('email is not verified') ||
          msg.toLowerCase().includes('verify your email')
        ) {
          router.replace({
            pathname: '/(auth)/verify-email' as const,
            params: { email: data.email.trim(), password: data.password },
          } as never);
          return;
        }
        setError('root', {
          message: msg || 'Registration failed. Please try again.',
        });
      } else {
        // Registration succeeded — user needs to verify email via OTP
        router.replace({
          pathname: '/(auth)/verify-email' as const,
          params: { email: data.email.trim(), password: data.password },
        } as never);
      }
    } catch {
      setError('root', { message: 'Unable to connect to server. Please try again.' });
    }
  };

  return (
    <ThemedView style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardView}
      >
        <View style={styles.content}>
          <View style={styles.header}>
            <ThemedText type="title" style={styles.title}>
              Create Account
            </ThemedText>
            <ThemedText style={[styles.subtitle, { color: theme.textSecondary }]}>
              Sign up to get started
            </ThemedText>
          </View>

          {errors.root ? (
            <View style={[styles.errorContainer, { backgroundColor: theme.danger + '15' }]}>
              <ThemedText style={[styles.errorText, { color: theme.danger }]}>
                {errors.root.message}
              </ThemedText>
            </View>
          ) : null}

          <View style={styles.form}>
            <View style={styles.inputGroup}>
              <ThemedText style={[styles.label, { color: theme.textSecondary }]}>
                Name
              </ThemedText>
              <Controller
                control={control}
                name="name"
                render={({ field: { onChange, onBlur, value } }) => (
                  <TextInput
                    style={[
                      styles.input,
                      {
                        backgroundColor: theme.card,
                        borderColor: errors.name ? theme.danger : theme.border,
                        color: theme.text,
                      },
                    ]}
                    placeholder="Enter your name"
                    placeholderTextColor={theme.textSecondary}
                    value={value}
                    onChangeText={onChange}
                    onBlur={onBlur}
                    autoCapitalize="words"
                    autoCorrect={false}
                    autoComplete="name"
                    editable={!isSubmitting}
                  />
                )}
              />
              {errors.name ? (
                <ThemedText style={[styles.fieldError, { color: theme.danger }]}>
                  {errors.name.message}
                </ThemedText>
              ) : null}
            </View>

            <View style={styles.inputGroup}>
              <ThemedText style={[styles.label, { color: theme.textSecondary }]}>
                Email
              </ThemedText>
              <Controller
                control={control}
                name="email"
                render={({ field: { onChange, onBlur, value } }) => (
                  <TextInput
                    style={[
                      styles.input,
                      {
                        backgroundColor: theme.card,
                        borderColor: errors.email ? theme.danger : theme.border,
                        color: theme.text,
                      },
                    ]}
                    placeholder="Enter your email"
                    placeholderTextColor={theme.textSecondary}
                    value={value}
                    onChangeText={onChange}
                    onBlur={onBlur}
                    keyboardType="email-address"
                    autoCapitalize="none"
                    autoCorrect={false}
                    autoComplete="email"
                    editable={!isSubmitting}
                  />
                )}
              />
              {errors.email ? (
                <ThemedText style={[styles.fieldError, { color: theme.danger }]}>
                  {errors.email.message}
                </ThemedText>
              ) : null}
            </View>

            <View style={styles.inputGroup}>
              <ThemedText style={[styles.label, { color: theme.textSecondary }]}>
                Password
              </ThemedText>
              <Controller
                control={control}
                name="password"
                render={({ field: { onChange, onBlur, value } }) => (
                  <TextInput
                    style={[
                      styles.input,
                      {
                        backgroundColor: theme.card,
                        borderColor: errors.password ? theme.danger : theme.border,
                        color: theme.text,
                      },
                    ]}
                    placeholder="Create a password"
                    placeholderTextColor={theme.textSecondary}
                    value={value}
                    onChangeText={onChange}
                    onBlur={onBlur}
                    secureTextEntry
                    autoCapitalize="none"
                    autoComplete="new-password"
                    editable={!isSubmitting}
                  />
                )}
              />
              {errors.password ? (
                <ThemedText style={[styles.fieldError, { color: theme.danger }]}>
                  {errors.password.message}
                </ThemedText>
              ) : null}
            </View>

            <View style={styles.inputGroup}>
              <ThemedText style={[styles.label, { color: theme.textSecondary }]}>
                Confirm Password
              </ThemedText>
              <Controller
                control={control}
                name="confirmPassword"
                render={({ field: { onChange, onBlur, value } }) => (
                  <TextInput
                    style={[
                      styles.input,
                      {
                        backgroundColor: theme.card,
                        borderColor: errors.confirmPassword ? theme.danger : theme.border,
                        color: theme.text,
                      },
                    ]}
                    placeholder="Re-enter your password"
                    placeholderTextColor={theme.textSecondary}
                    value={value}
                    onChangeText={onChange}
                    onBlur={onBlur}
                    secureTextEntry
                    autoCapitalize="none"
                    autoComplete="new-password"
                    editable={!isSubmitting}
                  />
                )}
              />
              {errors.confirmPassword ? (
                <ThemedText style={[styles.fieldError, { color: theme.danger }]}>
                  {errors.confirmPassword.message}
                </ThemedText>
              ) : null}
            </View>

            <Pressable
              style={[
                styles.button,
                { backgroundColor: theme.tint },
                isSubmitting && styles.buttonDisabled,
              ]}
              onPress={handleSubmit(onSubmit)}
              disabled={isSubmitting}
            >
              {isSubmitting ? (
                <ActivityIndicator color="#ffffff" />
              ) : (
                <ThemedText style={styles.buttonText}>Sign Up</ThemedText>
              )}
            </Pressable>
          </View>

          <View style={styles.footer}>
            <ThemedText style={[styles.footerText, { color: theme.textSecondary }]}>
              Already have an account?{' '}
            </ThemedText>
            <Link href={'/(auth)/login' as never} asChild>
              <Pressable>
                <ThemedText style={[styles.linkText, { color: theme.tint }]}>
                  Sign In
                </ThemedText>
              </Pressable>
            </Link>
          </View>
        </View>
      </KeyboardAvoidingView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  keyboardView: {
    flex: 1,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  header: {
    marginBottom: 32,
  },
  title: {
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
  },
  errorContainer: {
    padding: 12,
    borderRadius: 8,
    marginBottom: 16,
  },
  errorText: {
    fontSize: 14,
    textAlign: 'center',
  },
  form: {
    gap: 16,
  },
  inputGroup: {
    gap: 6,
  },
  label: {
    fontSize: 14,
    fontWeight: '500',
  },
  input: {
    height: 48,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 14,
    fontSize: 16,
  },
  fieldError: {
    fontSize: 12,
    marginTop: 2,
  },
  button: {
    height: 48,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
  },
  buttonDisabled: {
    opacity: 0.7,
  },
  buttonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 24,
  },
  footerText: {
    fontSize: 14,
  },
  linkText: {
    fontSize: 14,
    fontWeight: '600',
  },
});
