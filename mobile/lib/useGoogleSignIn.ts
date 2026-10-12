// Google Sign-In via Expo AuthSession. Returns an ID token which is exchanged for an
// app JWT at /auth/google/verify (same as the web client). The button is only shown
// when this platform's client ID is configured (see .env.example).
//
// NOTE: For standalone builds you must also register the iOS URL scheme / Android
// SHA-1 in Google Cloud Console. The plan calls for @react-native-google-signin in
// production; AuthSession is used here so the scaffold works in a dev client without
// extra native setup.
import { useEffect, useState } from 'react';
import { Alert, Platform } from 'react-native';
import * as Google from 'expo-auth-session/providers/google';
import * as WebBrowser from 'expo-web-browser';
import { useAuth } from '@talkingbook/shared';
import { loginWithGoogleIdToken } from './auth';

// Required by expo-auth-session to dismiss the auth popup after redirect.
WebBrowser.maybeCompleteAuthSession();

const IOS_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID;
const ANDROID_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID;
const WEB_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID;

// useIdTokenAuthRequest throws during render if the current platform's client ID is
// missing, so only use it when that ID is configured.
//
// Off on iOS: App Store guideline 4.8 requires Sign in with Apple alongside any
// third-party login, and the app doesn't offer it. Add Sign in with Apple before
// turning this back on.
const PLATFORM_CLIENT_ID = Platform.select({
  ios: undefined,
  android: ANDROID_CLIENT_ID,
  default: WEB_CLIENT_ID,
});

function useGoogleSignInEnabled() {
  const { authenticate } = useAuth();
  const [googleLoading, setGoogleLoading] = useState(false);

  const [request, response, promptAsync] = Google.useIdTokenAuthRequest({
    iosClientId: IOS_CLIENT_ID,
    androidClientId: ANDROID_CLIENT_ID,
    webClientId: WEB_CLIENT_ID,
  });

  useEffect(() => {
    if (response?.type !== 'success') return;
    const idToken = response.params?.id_token;
    if (!idToken) return;
    (async () => {
      setGoogleLoading(true);
      try {
        await loginWithGoogleIdToken(idToken);
        await authenticate();
      } catch (err: any) {
        Alert.alert('Google sign-in failed', err?.message || 'Please try again.');
      } finally {
        setGoogleLoading(false);
      }
    })();
  }, [response]);

  return {
    googleAvailable: true,
    googleLoading,
    promptGoogle: () => promptAsync(),
    googleRequestReady: Boolean(request),
  };
}

function useGoogleSignInDisabled() {
  return {
    googleAvailable: false,
    googleLoading: false,
    promptGoogle: async () => {},
    googleRequestReady: false,
  };
}

// Chosen once at module load, so hook order is stable across renders.
export const useGoogleSignIn = PLATFORM_CLIENT_ID
  ? useGoogleSignInEnabled
  : useGoogleSignInDisabled;
