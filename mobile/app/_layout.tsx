// Configure the shared API client (SecureStore token store + server URL) before
// anything else mounts and triggers an authFetch.
import '../lib/api';

import { useEffect, useState } from 'react';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import * as SystemUI from 'expo-system-ui';
import { SystemBars } from 'react-native-edge-to-edge';
import { QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import {
  useFonts,
  Literata_400Regular,
  Literata_400Regular_Italic,
  Literata_600SemiBold,
} from '@expo-google-fonts/literata';
import { AuthProvider, TokenProvider, useAuth, useToken } from '@talkingbook/shared';
import { queryClient } from '../lib/queryClient';
import { useTheme } from '../lib/useTheme';
import { loadAppearancePref } from '../lib/appearance';
import { stackHeaderOptions } from '../components/ui';
import { AudiobookPlayerProvider } from '../context/AudiobookPlayerContext';
import { AudiobookMiniPlayer } from '../components/AudiobookMiniPlayer';
import * as storeBilling from '../lib/storeBilling';
import { SeekerBonusProvider } from '../components/SeekerBonusModal';

// Keep the native splash (logo + name) up until fonts load and the auth check
// resolves, so launch goes straight from splash to home. Guests can read, listen and
// browse (App Store 5.1.1(v)); account-only features offer sign-in (components/SignIn).
SplashScreen.preventAutoHideAsync();

// While signed in, listen for store transactions that complete outside a
// purchase flow (Ask to Buy approvals, a validate that failed last launch) so
// they're bound to the account. Signing out disconnects.
function useStoreBilling(signedIn: boolean) {
  const queryClient = useQueryClient();
  const { fetchTokenBalance } = useToken();
  useEffect(() => {
    if (!signedIn) return;
    storeBilling
      .init(() => {
        queryClient.invalidateQueries({ queryKey: ['subscriptionDetails'] });
        fetchTokenBalance();
      })
      .catch((err) => console.warn('Store billing unavailable:', err?.message));
    return () => {
      storeBilling.teardown();
    };
  }, [signedIn]);
}

function RootNavigator({ fontsReady }: { fontsReady: boolean }) {
  const { user, loading } = useAuth();
  useStoreBilling(!!user);
  const theme = useTheme();

  // Root view color shows behind screen transitions.
  useEffect(() => {
    SystemUI.setBackgroundColorAsync(theme.background);
  }, [theme.background]);

  // Only the launch-time auth check holds the app on the splash. Later refreshes
  // (login, logout) must not unmount the navigator, or screens lose their state and any
  // navigation call in flight throws "navigate before mounting the Root Layout".
  const [booted, setBooted] = useState(false);
  const ready = booted || (fontsReady && !loading);
  useEffect(() => {
    if (ready) setBooted(true);
  }, [ready]);

  useEffect(() => {
    if (!ready || loading) return;
    SplashScreen.hideAsync();
  }, [ready, loading]);

  if (!ready) return null;

  return (
    <>
      <Stack
        screenOptions={{
          headerShown: false,
          // Otherwise screens pushed over the tabs show "(tabs)" as the back title.
          headerBackTitle: 'Back',
          contentStyle: { backgroundColor: theme.background },
        }}
      >
        {/* Sign-in opens over the current screen; (auth)/_layout closes it once signed in. */}
        <Stack.Screen name="(auth)" options={{ presentation: 'modal' }} />
        <Stack.Screen name="player" options={{ presentation: 'modal' }} />
        <Stack.Screen
          name="settings"
          options={{ ...stackHeaderOptions(theme), headerShown: true, title: 'Settings' }}
        />
        <Stack.Screen
          name="edit-profile"
          options={{ ...stackHeaderOptions(theme), headerShown: true, title: 'Edit profile' }}
        />
        <Stack.Screen
          name="subscription"
          options={{ ...stackHeaderOptions(theme), headerShown: true, title: 'Tokens & plans' }}
        />
        <Stack.Screen name="edit-book" options={{ headerShown: false }} />
        <Stack.Screen
          name="publish"
          options={{ ...stackHeaderOptions(theme), headerShown: true, title: 'Publish' }}
        />
        <Stack.Screen
          name="report"
          options={{ ...stackHeaderOptions(theme), headerShown: true, title: 'Report', presentation: 'modal' }}
        />
        <Stack.Screen
          name="blocked-users"
          options={{ ...stackHeaderOptions(theme), headerShown: true, title: 'Blocked readers' }}
        />
        <Stack.Screen
          name="delete-account"
          options={{ ...stackHeaderOptions(theme), headerShown: true, title: 'Delete account' }}
        />
      </Stack>
      <AudiobookMiniPlayer />
    </>
  );
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    Literata_400Regular,
    Literata_400Regular_Italic,
    Literata_600SemiBold,
  });
  // Apply the saved light/dark choice before the splash hides, so there's no flash.
  const [appearanceReady, setAppearanceReady] = useState(false);
  useEffect(() => {
    loadAppearancePref().finally(() => setAppearanceReady(true));
  }, []);

  return (
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <TokenProvider>
            <AudiobookPlayerProvider>
              {/* Edge-to-edge: transparent status + navigation bars; icons follow light/dark. */}
              <SystemBars style="auto" />
              {/* A font failure falls back to system fonts rather than blocking launch. */}
              <SeekerBonusProvider>
                <RootNavigator fontsReady={(fontsLoaded || !!fontError) && appearanceReady} />
              </SeekerBonusProvider>
            </AudiobookPlayerProvider>
          </TokenProvider>
        </AuthProvider>
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}
