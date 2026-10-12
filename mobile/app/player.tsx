import { Pressable, ScrollView, View, useWindowDimensions } from 'react-native';
import { Image } from 'expo-image';
import Slider from '@react-native-community/slider';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
// @ts-ignore - shared package is plain JS without type declarations
import { useBookAudioProfiles, thumbUrl } from '@talkingbook/shared';
import { useAudiobookPlayer, type AudioProfile } from '../context/AudiobookPlayerContext';
import { Button, Chip, IconButton, Screen, Txt } from '../components/ui';
import { StateView } from '../components/StateView';
import { formatTime } from '../lib/formatTime';
import { radii, shadow } from '../lib/theme';
import { useTheme } from '../lib/useTheme';

export default function PlayerModal() {
  const theme = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const {
    currentBook,
    currentProfile,
    currentPage,
    isPlaying,
    currentTime,
    duration,
    pause,
    resume,
    seek,
    playProfile,
  } = useAudiobookPlayer();

  const { data: profilesData } = useBookAudioProfiles(currentBook?.bookId);
  const profiles: AudioProfile[] = (Array.isArray(profilesData) ? profilesData : []).filter(
    (p: AudioProfile) => p.status === 'completed' && p.audioUrl
  );

  if (!currentBook) {
    return <StateView variant="empty" icon="headset-outline" message="Nothing is playing right now." />;
  }

  const coverWidth = Math.min(width - 112, 260);

  return (
    <Screen>
      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: 24,
          paddingTop: insets.top + 8,
          paddingBottom: insets.bottom + 32,
          alignItems: 'center',
        }}
      >
        <View style={{ alignSelf: 'stretch', flexDirection: 'row', marginBottom: 16 }}>
          <IconButton icon="chevron-down" label="Close player" onPress={() => router.back()} size={28} />
        </View>

        <View style={[{ borderRadius: radii.sm }, shadow]}>
          <Image
            source={{ uri: thumbUrl(currentBook.bookCover, coverWidth) }}
            style={{
              width: coverWidth,
              height: coverWidth * 1.5,
              borderRadius: radii.sm,
              backgroundColor: theme.surfaceStrong,
            }}
            contentFit="cover"
          />
        </View>

        <Txt variant="title" style={{ textAlign: 'center', marginTop: 28 }}>
          {currentBook.bookTitle}
        </Txt>
        <Txt variant="subhead" style={{ marginTop: 4 }}>
          {[currentProfile?.voiceName ?? 'Narrator', currentPage != null ? `page ${currentPage}` : null]
            .filter(Boolean)
            .join('  ·  ')}
        </Txt>

        <Slider
          style={{ width: '100%', marginTop: 20 }}
          minimumValue={0}
          maximumValue={duration || 1}
          value={currentTime}
          onSlidingComplete={seek}
          minimumTrackTintColor={theme.textPrimary}
          maximumTrackTintColor={theme.separator}
          thumbTintColor={theme.textPrimary}
        />
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', width: '100%', paddingHorizontal: 4 }}>
          <Txt variant="caption">{formatTime(currentTime)}</Txt>
          <Txt variant="caption">-{formatTime(Math.max(0, duration - currentTime))}</Txt>
        </View>

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 40, marginTop: 20 }}>
          <IconButton icon="play-back" label="Back 15 seconds" onPress={() => seek(Math.max(0, currentTime - 15))} size={30} />
          <Pressable
            onPress={() => (isPlaying ? pause() : resume())}
            accessibilityRole="button"
            accessibilityLabel={isPlaying ? 'Pause' : 'Play'}
            style={({ pressed }) => ({
              width: 76,
              height: 76,
              borderRadius: 38,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: theme.ink,
              opacity: pressed ? 0.8 : 1,
            })}
          >
            <Ionicons name={isPlaying ? 'pause' : 'play'} size={34} color={theme.onInk} style={{ marginLeft: isPlaying ? 0 : 4 }} />
          </Pressable>
          <IconButton
            icon="play-forward"
            label="Forward 30 seconds"
            onPress={() => seek(Math.min(duration, currentTime + 30))}
            size={30}
          />
        </View>

        {currentPage != null && (
          <Button
            title="Read along"
            icon="book-outline"
            variant="ghost"
            style={{ marginTop: 16 }}
            onPress={() =>
              router.push({
                pathname: '/book/[bookId]/read/[pageNumber]',
                params: { bookId: currentBook.bookId, pageNumber: String(currentPage) },
              })
            }
          />
        )}

        {profiles.length > 1 && (
          <View style={{ width: '100%', marginTop: 24, gap: 10 }}>
            <Txt variant="heading">Narrator</Txt>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {profiles.map((p) => {
                const active = p._id === currentProfile?._id;
                return (
                  <Chip
                    key={p._id}
                    label={p.voiceName ?? 'Voice'}
                    active={active}
                    onPress={() => !active && playProfile(p, currentBook, null)}
                  />
                );
              })}
            </View>
          </View>
        )}
      </ScrollView>
    </Screen>
  );
}
