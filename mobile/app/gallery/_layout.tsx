import { Stack } from 'expo-router';
import { StackRootBackButton, stackHeaderOptions } from '../../components/ui';
import { useTheme } from '../../lib/useTheme';

export default function GalleryLayout() {
  const theme = useTheme();
  return (
    <Stack screenOptions={{ ...stackHeaderOptions(theme), headerBackTitle: 'Gallery' }}>
      <Stack.Screen name="[imageId]" options={{ title: 'Scene', headerLeft: StackRootBackButton }} />
    </Stack>
  );
}
