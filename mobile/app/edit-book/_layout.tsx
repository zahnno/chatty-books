import { Stack } from 'expo-router';
import { stackHeaderOptions } from '../../components/ui';
import { useTheme } from '../../lib/useTheme';

export default function EditBookLayout() {
  const theme = useTheme();
  return (
    <Stack screenOptions={{ ...stackHeaderOptions(theme), headerBackTitle: 'Back' }}>
      <Stack.Screen name="[bookId]/index" options={{ title: 'Edit book' }} />
      <Stack.Screen name="[bookId]/[characterId]" options={{ title: 'Character' }} />
    </Stack>
  );
}
