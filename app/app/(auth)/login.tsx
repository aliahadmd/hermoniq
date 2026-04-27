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
import { signIn } from '@/lib/auth-client';
import { loginSchema, type LoginInput } from '@/lib/validators';

export default function LoginScreen() {
  const colorScheme = useColorScheme() ?? 'light';
  const theme = Colors[colorScheme];

  const {
    control,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' },
  });

  const onSubmit = async (data: LoginInput) => {
    try {
      const result = await signIn.email({
        email: data.email.trim(),
        password: data.password,
      });

      if (result.error) {
        const errorMessage = result.error.message ?? 'Login failed. Please try again.';

        if (
          result.error.code === 'EMAIL_NOT_VERIFIED' ||
          errorMessage.toLowerCase().includes('email is not verified') ||
          errorMessage.toLowerCase().includes('verify your email')
        ) {
          router.replace({
            pathname: '/(auth)/verify-email' as const,
            params: { email: data.email.trim() },
          } as never);
          return;
        }

        setError('root', { message: errorMessage });
      } else {
        // Login succeeded — navigate to main app
        router.replace('/(tabs)/assistant' as never);
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
              Welcome Back
            </ThemedText>
            <ThemedText style={[styles.subtitle, { color: theme.textSecondary }]}>
              Sign in to your account
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
                    placeholder="Enter your password"
                    placeholderTextColor={theme.textSecondary}
                    value={value}
                    onChangeText={onChange}
                    onBlur={onBlur}
                    secureTextEntry
                    autoCapitalize="none"
                    autoComplete="password"
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
                <ThemedText style={styles.buttonText}>Sign In</ThemedText>
              )}
            </Pressable>
          </View>

          <View style={styles.footer}>
            <ThemedText style={[styles.footerText, { color: theme.textSecondary }]}>
              {"Don't have an account? "}
            </ThemedText>
            <Link href={'/(auth)/register' as never} asChild>
              <Pressable>
                <ThemedText style={[styles.linkText, { color: theme.tint }]}>
                  Sign Up
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
