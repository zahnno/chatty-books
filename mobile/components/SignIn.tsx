import { Alert, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
// @ts-ignore - shared package is plain JS without type declarations
import { useAuth } from '@talkingbook/shared';
import { Button, Screen, Txt } from './ui';
import { useTheme } from '../lib/useTheme';

// Reading, narration and browsing are open to everyone (App Store 5.1.1(v)); only
// account-based features ask for an account. Sign-in opens as a modal over the current
// screen and closes itself once signed in, so the reader lands back where they were.
export function useOpenSignIn() {
  const router = useRouter();
  return (screen: 'login' | 'register' = 'login') => router.push(`/(auth)/${screen}`);
}

// Returns a guard for account-only actions: true when signed in, otherwise offers
// sign-in and returns false.
export function useRequireAccount() {
  const { user } = useAuth();
  const openSignIn = useOpenSignIn();
  return (title: string, message: string) => {
    if (user) return true;
    Alert.alert(title, message, [
      { text: 'Not now', style: 'cancel' },
      { text: 'Create account', onPress: () => openSignIn('register') },
      { text: 'Log in', onPress: () => openSignIn('login') },
    ]);
    return false;
  };
}

// Full-screen stand-in for a screen that only works with an account.
export function SignInPrompt({
  icon,
  title,
  message,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  message: string;
}) {
  const theme = useTheme();
  const openSignIn = useOpenSignIn();
  return (
    <Screen style={{ justifyContent: 'center', padding: 32 }}>
      <View style={{ alignItems: 'center', gap: 8 }}>
        <Ionicons name={icon} size={36} color={theme.textMuted} />
        <Txt variant="heading" style={{ marginTop: 8, textAlign: 'center' }}>
          {title}
        </Txt>
        <Txt variant="subhead" style={{ textAlign: 'center', maxWidth: 300 }}>
          {message}
        </Txt>
      </View>
      <View style={{ marginTop: 24, paddingHorizontal: 16 }}>
        <Button title="Create account" onPress={() => openSignIn('register')} />
        <Button title="Log in" variant="ghost" onPress={() => openSignIn('login')} />
      </View>
    </Screen>
  );
}
