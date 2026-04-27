import { createAuthClient } from "better-auth/react";
import { expoClient } from "@better-auth/expo/client";
import { emailOTPClient } from "better-auth/client/plugins";
import * as SecureStore from "expo-secure-store";
import { resolveApiBaseUrl } from "./base-url";

const BASE_URL = resolveApiBaseUrl(process.env.EXPO_PUBLIC_API_URL);

export const authClient = createAuthClient({
  baseURL: BASE_URL,
  plugins: [
    expoClient({
      scheme: "harmoniq",
      storagePrefix: "harmoniq-auth",
      storage: SecureStore,
    }),
    emailOTPClient(),
  ],
});

export const { signIn, signUp, signOut, useSession, emailOtp } = authClient;
