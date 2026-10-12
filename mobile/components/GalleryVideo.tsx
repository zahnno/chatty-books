import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { useVideoPlayer, VideoView } from 'expo-video';

// A silent, looping preview of a gallery video (like the web gallery's autoplaying
// tiles). Taps pass through to the parent so the tile still opens the viewer.
export function GalleryVideoPreview({ uri, style }: { uri: string; style?: StyleProp<ViewStyle> }) {
  const player = useVideoPlayer(uri, (p) => {
    p.muted = true;
    p.loop = true;
    p.play();
  });
  return (
    <View pointerEvents="none" style={style}>
      <VideoView player={player} style={StyleSheet.absoluteFill} contentFit="cover" nativeControls={false} />
    </View>
  );
}

// Full playback with native controls and sound, for the gallery viewer.
export function GalleryVideoPlayer({ uri, style }: { uri: string; style?: StyleProp<ViewStyle> }) {
  const player = useVideoPlayer(uri, (p) => {
    p.loop = true;
    p.play();
  });
  return (
    <VideoView
      player={player}
      style={style}
      contentFit="contain"
      nativeControls
      allowsFullscreen
    />
  );
}
