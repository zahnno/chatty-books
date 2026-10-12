import { StyleSheet } from 'react-native';
import { Tabs, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { IconButton, stackHeaderOptions } from '../../components/ui';
import { useTheme } from '../../lib/useTheme';
import { useTabBarMetrics } from '../../lib/useTabBarMetrics';

type IconName = keyof typeof Ionicons.glyphMap;

const tabIcon =
  (on: IconName, off: IconName) =>
  ({ color, size, focused }: { color: string; size: number; focused: boolean }) => (
    <Ionicons name={focused ? on : off} color={color} size={size} />
  );

export default function TabsLayout() {
  const theme = useTheme();
  const router = useRouter();
  const header = stackHeaderOptions(theme);
  const tabBar = useTabBarMetrics();
  return (
    <Tabs
      screenOptions={{
        headerStyle: header.headerStyle,
        headerShadowVisible: false,
        headerTitleStyle: header.headerTitleStyle,
        headerTitleAlign: 'left',
        headerRight: () => (
          <IconButton icon="person-circle-outline" label="Settings" onPress={() => router.push('/settings')} size={26} />
        ),
        headerRightContainerStyle: { paddingRight: 10 },
        sceneStyle: { backgroundColor: theme.background },
        tabBarStyle: {
          backgroundColor: theme.background,
          borderTopColor: theme.separator,
          borderTopWidth: StyleSheet.hairlineWidth,
          height: tabBar.height,
          paddingBottom: tabBar.paddingBottom,
        },
        tabBarActiveTintColor: theme.textPrimary,
        tabBarInactiveTintColor: theme.textMuted,
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Discover', tabBarIcon: tabIcon('compass', 'compass-outline') }} />
      <Tabs.Screen name="library" options={{ title: 'Library', tabBarIcon: tabIcon('library', 'library-outline') }} />
      <Tabs.Screen name="search" options={{ title: 'Search', tabBarIcon: tabIcon('search', 'search-outline') }} />
      <Tabs.Screen name="characters" options={{ title: 'Characters', tabBarIcon: tabIcon('people', 'people-outline') }} />
      <Tabs.Screen name="gallery" options={{ title: 'Gallery', tabBarIcon: tabIcon('images', 'images-outline') }} />
    </Tabs>
  );
}
