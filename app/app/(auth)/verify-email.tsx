import { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { emailOtp, signIn } from '@/lib/auth-client';
import { verifyEmailSchema, type VerifyEmailInput } from '@/lib/validators';

export default function VerifyEmailScreen() {
  const colorScheme = useColorScheme() ?? 'light';
  const theme = Colors[colorScheme];
  const { email, password: registrationPassword } = useLocalSearchParams<{ email: string; password?: string }>();

  const [resending, setResending] = useState(false);
  const [resendSuccess, setResendSuccess] = useState('');

  const {
    control,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<VerifyEmailInput>({
    resolver: zodResolver(verifyEmailSchema),
    defaultValues: { otp: '' },
  });

  const onSubmit = async (data: VerifyEmailInput) => {
    setResendSuccess('');

    if (!email) {
      setError('root', { message: 'Email address is missing. Please go back and try again.' });
      return;
    }

    try {
      const result = await emailOtp.verifyEmail({ email, otp: data.otp.trim() });

      if (result.error) {
        setError('root', {
          message: result.error.message ?? 'Invalid verification code. Please try again.',
        });
      } else {
        // Email verified — try auto-login if we have the password from registration
        if (registrationPassword) {
          try {
            const loginResult = await signIn.email({ email, password: registrationPassword });
            if (!loginResult.error) {
              // Session is now active — go directly to assistant tab.
              router.replace('/(tabs)/assistant' as never);
              return;
            }
          } catch {
            // Auto-login failed, fall through to login screen
          }
        }
        // No password available or auto-login failed — go to login
        router.replace('/(auth)/login' as never);
      }
    } catch {
      setError('root', { message: 'Unable to connect to server. Please try again.' });
    }
  };

  const handleResendCode = async () => {
    setResendSuccess('');

    if (!email) {
      setError('root', { message: 'Email address is missing. Please go back and try again.' });
      return;
    }

    setResending(true);

    try {
      const result = await emailOtp.sendVerificationOtp({
        email,
        type: 'email-verification',
      });

      if (result.error) {
        setError('root', {
          message: result.error.message ?? 'Failed to resend code. Please try again.',
        });
      } else {
        setResendSuccess('A new verification code has been sent to your email.');
      }
    } catch {
      setError('root', { message: 'Unable to connect to server. Please try again.' });
    } finally {
      setResending(false);
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
              Verify Your Email
            </ThemedText>
            <ThemedText style={[styles.subtitle, { color: theme.textSecondary }]}>
              Enter the verification code sent to
            </ThemedText>
            <ThemedText style={[styles.emailText, { color: theme.tint }]}>
              {email ?? 'your email'}
            </ThemedText>
          </View>

          {errors.root ? (
            <View style={[styles.errorContainer, { backgroundColor: theme.danger + '15' }]}>
              <ThemedText style={[styles.errorText, { color: theme.danger }]}>
                {errors.root.message}
              </ThemedText>
            </View>
          ) : null}

          {resendSuccess ? (
            <View style={[styles.successContainer, { backgroundColor: theme.success + '15' }]}>
              <ThemedText style={[styles.successText, { color: theme.success }]}>
                {resendSuccess}
              </ThemedText>
            </View>
          ) : null}

          <View style={styles.form}>
            <View style={styles.inputGroup}>
              <ThemedText style={[styles.label, { color: theme.textSecondary }]}>
                Verification Code
              </ThemedText>
              <Controller
                control={control}
                name="otp"
                render={({ field: { onChange, onBlur, value } }) => (
                  <TextInput
                    style={[
                      styles.input,
                      {
                        backgroundColor: theme.card,
                        borderColor: errors.otp ? theme.danger : theme.border,
                        color: theme.text,
                      },
                    ]}
                    placeholder="Enter 4-6 digit code"
                    placeholderTextColor={theme.textSecondary}
                    value={value}
                    onChangeText={onChange}
                    onBlur={onBlur}
                    keyboardType="number-pad"
                    maxLength={6}
                    autoFocus
                    editable={!isSubmitting}
                  />
                )}
              />
              {errors.otp ? (
                <ThemedText style={[styles.fieldError, { color: theme.danger }]}>
                  {errors.otp.message}
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
                <ThemedText style={styles.buttonText}>Verify Email</ThemedText>
              )}
            </Pressable>
          </View>

          <View style={styles.footer}>
            <ThemedText style={[styles.footerText, { color: theme.textSecondary }]}>
              {"Didn't receive the code? "}
            </ThemedText>
            <Pressable onPress={handleResendCode} disabled={resending}>
              {resending ? (
                <ActivityIndicator size="small" color={theme.tint} />
              ) : (
                <ThemedText style={[styles.linkText, { color: theme.tint }]}>
                  Resend Code
                </ThemedText>
              )}
            </Pressable>
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
  emailText: {
    fontSize: 16,
    fontWeight: '600',
    marginTop: 4,
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
  successContainer: {
    padding: 12,
    borderRadius: 8,
    marginBottom: 16,
  },
  successText: {
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
