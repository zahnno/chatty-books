// Configures the shared API client for the mobile platform. Importing this module
// (done first in app/_layout.tsx) injects the SecureStore token store + server URL
// before any authFetch call runs.
import { Platform } from 'react-native';
import { configureApi } from '@talkingbook/shared';
import { secureTokenStorage } from './secureTokenStorage';

export const SERVER_URI =
  process.env.EXPO_PUBLIC_SERVER_URI || 'http://localhost:5001';

// Dev-only: EXPO_PUBLIC_DEV_AUTH_TOKEN (set in the gitignored .env.local) is used when
// no token is stored, so emulators/simulators can skip the login screen. Never
// applies to release builds. While it is set, logging out has no effect.
const DEV_AUTH_TOKEN = __DEV__ ? process.env.EXPO_PUBLIC_DEV_AUTH_TOKEN : undefined;

const tokenStorage = DEV_AUTH_TOKEN
  ? {
      ...secureTokenStorage,
      getToken: async () => (await secureTokenStorage.getToken()) ?? DEV_AUTH_TOKEN,
    }
  : secureTokenStorage;

configureApi({
  serverUri: SERVER_URI,
  tokenStorage,
  // Lets the server tell app traffic from the website, e.g. to keep the apps out
  // of web ad measurement (the apps declare no tracking).
  headers: { 'X-Chatty-Client': Platform.OS },
});
