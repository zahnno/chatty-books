// Auth actions for the mobile app. These hit the same endpoints the web client uses
// and persist the returned JWT via the shared SecureStore-backed token store.
import { authFetch, setToken, clearToken } from '@talkingbook/shared';

export type LoginResult = { token?: string; [key: string]: any };

export async function loginWithEmail(email: string, password: string): Promise<LoginResult> {
  const data = await authFetch({
    path: '/login',
    method: 'POST',
    body: { email, password },
    requireAuth: false,
  });
  if (data?.token) await setToken(data.token);
  return data;
}

export async function registerWithEmail(
  username: string,
  email: string,
  password: string
): Promise<LoginResult> {
  const data = await authFetch({
    path: '/register',
    method: 'POST',
    body: { username, email, password },
    requireAuth: false,
  });
  // /register may require email verification before a token is issued; persist if present.
  if (data?.token) await setToken(data.token);
  return data;
}

export async function requestPasswordReset(email: string) {
  return authFetch({
    path: '/auth/forgot-password',
    method: 'POST',
    body: { email },
    requireAuth: false,
  });
}

export async function resetPassword(token: string, password: string) {
  return authFetch({
    path: '/auth/reset-password',
    method: 'POST',
    body: { token, password },
    requireAuth: false,
  });
}

export async function verifyEmail(token: string) {
  return authFetch({
    path: '/auth/verify-email',
    method: 'POST',
    body: { token },
    requireAuth: false,
  });
}

// Exchange a Google ID token for an app JWT (same endpoint the web uses).
export async function loginWithGoogleIdToken(idToken: string): Promise<LoginResult> {
  const data = await authFetch({
    path: '/auth/google/verify',
    method: 'POST',
    body: { credential: idToken },
    requireAuth: false,
  });
  if (data?.token) await setToken(data.token);
  return data;
}

export async function logout() {
  await clearToken();
}
