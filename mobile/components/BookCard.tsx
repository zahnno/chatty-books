import { Pressable, View } from 'react-native';
import { Image } from 'expo-image';
import { thumbUrl } from '@talkingbook/shared';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { radii, shadow } from '../lib/theme';
import { useTheme } from '../lib/useTheme';
import type { Book } from '../lib/books';
import { Txt } from './ui';

const CARD_WIDTH = 124;

export function BookCard({ book, width = CARD_WIDTH }: { book: Book; width?: number }) {
  const theme = useTheme();
  const router = useRouter();
  const started = (book.currentPage ?? 0) > 1;

  return (
    <Pressable
      onPress={() => router.push({ pathname: '/book/[bookId]', params: { bookId: book._id } })}
      accessibilityRole="button"
      accessibilityLabel={`${book.title}${book.author ? `, ${book.author}` : ''}`}
      style={({ pressed }) => ({ width, opacity: pressed ? 0.7 : 1 })}
    >
      <View style={[{ borderRadius: radii.sm }, shadow]}>
        <Image
          source={{ uri: thumbUrl(book.image_url, width) }}
          style={{
            width,
            height: width * 1.5,
            borderRadius: radii.sm,
            backgroundColor: theme.surfaceStrong,
          }}
          contentFit="cover"
          transition={150}
          recyclingKey={book._id}
        />
      </View>
      <Txt variant="subhead" color={theme.textPrimary} numberOfLines={2} style={{ fontWeight: '600', marginTop: 8 }}>
        {book.title}
      </Txt>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 1 }}>
        {!!book.author && (
          <Txt variant="caption" numberOfLines={1} style={{ flexShrink: 1 }}>
            {book.author}
          </Txt>
        )}
        {book.hasAudio && <Ionicons name="headset-outline" size={12} color={theme.textMuted} />}
      </View>
      {started && (
        <Txt variant="caption" color={theme.accent} style={{ marginTop: 1 }}>
          Page {book.currentPage}
        </Txt>
      )}
    </Pressable>
  );
}

