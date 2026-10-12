import { Pressable, StyleSheet, View } from 'react-native';
import { Image } from 'expo-image';
import { thumbUrl } from '@talkingbook/shared';
import { usePathname, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAudiobookPlayer } from '../context/AudiobookPlayerContext';
import { useTheme } from '../lib/useTheme';
import { useTabBarMetrics } from '../lib/useTabBarMetrics';
import { IconButton, ProgressBar, Txt } from './ui';

const TAB_ROUTES = ['/', '/library', '/search', '/characters', '/gallery'];

// Docked "now playing" bar: sits on the tab bar on tab screens, at the bottom elsewhere.
export function AudiobookMiniPlayer() {
  const theme = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const tabBar = useTabBarMetrics();
  const pathname = usePathname();
  const { isVisible, currentBook, currentProfile, isPlaying, currentTime, duration, pause, resume, closePlayer } =
    useAudiobookPlayer();

  // Hidden where it would duplicate or cover controls: the full player, the reader's
  // bottom chrome, and chat composers.
  const hidden = pathname === '/player' || pathname.includes('/read/') || pathname.endsWith('/chat');
  if (!isVisible || !currentBook || hidden) return null;

  const onTabs = TAB_ROUTES.includes(pathname);
  const progress = duration > 0 ? Math.min(1, currentTime / duration) : 0;

  return (
    <View
      style={{
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: onTabs ? tabBar.height : 0,
        paddingBottom: onTabs ? 0 : insets.bottom,
        backgroundColor: theme.background,
        borderTopWidth: StyleSheet.hairlineWidth,
        borderTopColor: theme.separator,
      }}
    >
      <ProgressBar value={progress} height={2} />
      <Pressable
        onPress={() => router.push('/player')}
        accessibilityRole="button"
        accessibilityLabel={`Now playing ${currentBook.bookTitle ?? ''}. Open player`}
        style={({ pressed }) => ({
          flexDirection: 'row',
          alignItems: 'center',
          paddingHorizontal: 12,
          paddingVertical: 8,
          gap: 12,
          backgroundColor: pressed ? theme.surface : 'transparent',
        })}
      >
        <Image
          source={{ uri: thumbUrl(currentBook.bookCover, 34) }}
          style={{ width: 34, height: 50, borderRadius: 4, backgroundColor: theme.surfaceStrong }}
          contentFit="cover"
        />
        <View style={{ flex: 1 }}>
          <Txt variant="subhead" color={theme.textPrimary} numberOfLines={1} style={{ fontWeight: '600' }}>
            {currentBook.bookTitle}
          </Txt>
          <Txt variant="caption" numberOfLines={1}>
            {currentProfile?.voiceName ?? 'Audiobook'}
          </Txt>
        </View>
        <IconButton
          icon={isPlaying ? 'pause' : 'play'}
          label={isPlaying ? 'Pause' : 'Play'}
          onPress={() => (isPlaying ? pause() : resume())}
          size={26}
        />
        <IconButton icon="close" label="Stop and close" onPress={closePlayer} size={22} tint={theme.textMuted} />
      </Pressable>
    </View>
  );
}
