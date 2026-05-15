import { authClient } from './auth-client';
import { Platform } from 'react-native';
import { resolveApiBaseUrl } from './base-url';

// Production backend URL — update this after running `wrangler deploy` in backend/
// To override for local development, set: EXPO_PUBLIC_API_URL=http://localhost:5173
export const API_BASE_URL = resolveApiBaseUrl(process.env.EXPO_PUBLIC_API_URL);

interface RequestOptions extends Omit<RequestInit, 'body'> {
  body?: unknown;
}

export async function apiFetch(path: string, options: RequestOptions = {}): Promise<Response> {
  const { body, headers, credentials, ...rest } = options;

  const isWeb = Platform.OS === 'web';
  const isFormData =
    typeof FormData !== 'undefined' &&
    body instanceof FormData;

  // Get the session cookie from Better Auth's SecureStore
  const cookies = authClient.getCookie();
  const requestHeaders = new Headers(headers);
  if (!isFormData && !requestHeaders.has('Content-Type')) {
    requestHeaders.set('Content-Type', 'application/json');
  }

  // On native, we manually forward cookies from SecureStore.
  // On web, rely on browser-managed cookies (manual Cookie header is restricted).
  if (!isWeb && cookies) {
    requestHeaders.set('Cookie', cookies);
  }

  return fetch(`${API_BASE_URL}${path}`, {
    headers: requestHeaders,
    body: body
      ? (isFormData ? (body as FormData) : JSON.stringify(body))
      : undefined,
    credentials: credentials ?? (isWeb ? 'include' : 'omit'),
    ...rest,
  });
}

export async function apiClient<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const res = await apiFetch(path, options);

  if (!res.ok) {
    const error = await res.json().catch(() => ({ error: 'Request failed' }));
    throw new Error((error as { error?: string }).error ?? `HTTP ${res.status}`);
  }

  return res.json() as Promise<T>;
}
