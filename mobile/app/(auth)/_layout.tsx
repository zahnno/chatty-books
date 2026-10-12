import { useEffect } from 'react';
import { Stack, useNavigation, useRouter } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
// @ts-ignore - shared package is plain JS without type declarations
import { useAuth } from '@talkingbook/shared';
import { IconButton } from '../../components/ui';
import { useTheme } from '../../lib/useTheme';

// Presented as a modal over whatever the guest was doing. Once signed in, close the whole
// group so they land back on that screen; a deep link with nothing beneath goes home.
// Signed-in users who reach it by link (verify or reset) are sent on the same way.
export default function AuthLayout() {
  const theme = useTheme();
  const router = useRouter();
  const navigation = useNavigation();
  const queryClient = useQueryClient();
  const { user } = useAuth();

  useEffect(() => {
    if (!user) return;
    // Screens browsed as a guest refetch with the account (progress, library, likes).
    queryClient.invalidateQueries();
    if (navigation.canGoBack()) navigation.goBack();
    else router.replace('/(tabs)');
  }, [user]);

  const close = () => (navigation.canGoBack() ? navigation.goBack() : router.replace('/(tabs)'));

  return (
    <Stack
      screenOptions={{
        headerShown: true,
        headerTransparent: true,
        headerTitle: '',
        headerShadowVisible: false,
        headerTintColor: theme.textPrimary,
        contentStyle: { backgroundColor: theme.background },
      }}
    >
      <Stack.Screen
        name="login"
        options={{ headerLeft: () => <IconButton icon="close" label="Close" onPress={close} /> }}
      />
    </Stack>
  );
}
