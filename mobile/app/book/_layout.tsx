import { Stack } from 'expo-router';
import { StackRootBackButton, stackHeaderOptions } from '../../components/ui';
import { useTheme } from '../../lib/useTheme';

export default function BookLayout() {
  const theme = useTheme();
  return (
    <Stack screenOptions={{ ...stackHeaderOptions(theme), headerBackTitle: 'Back' }}>
      <Stack.Screen name="[bookId]/index" options={{ title: '', headerLeft: StackRootBackButton }} />
      <Stack.Screen name="[bookId]/read/[pageNumber]" options={{ headerShown: false }} />
      <Stack.Screen name="[bookId]/characters/index" options={{ title: 'Characters' }} />
      <Stack.Screen name="[bookId]/characters/[characterId]/index" options={{ title: '' }} />
      <Stack.Screen name="[bookId]/characters/[characterId]/chat" options={{ title: '' }} />
    </Stack>
  );
}
