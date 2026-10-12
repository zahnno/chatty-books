import { useEffect, useMemo, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, View, useWindowDimensions } from 'react-native';
import { Image } from 'expo-image';
import { thumbUrl } from '@talkingbook/shared';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useInfiniteQuery } from '@tanstack/react-query';
import { StateView } from '../../components/StateView';
import { Chip, Loader, Screen, SearchField, Txt } from '../../components/ui';
import { GalleryVideoPreview } from '../../components/GalleryVideo';
import { GALLERY_KEYS, fetchGalleryPage, isVideo, type GalleryImage } from '../../lib/gallery';
import { useGalleryLike } from '../../lib/useGalleryLike';
import { BOTTOM_CLEARANCE, radii } from '../../lib/theme';
import { useTheme } from '../../lib/useTheme';

type MediaFilter = 'all' | 'image' | 'video';
const MEDIA_FILTERS: { key: MediaFilter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'image', label: 'Images' },
  { key: 'video', label: 'Videos' },
];

const GAP = 10;
// Title + like row under each tile; counted when balancing the two columns.
const CAPTION_HEIGHT = 24;
const PADDING = 12;
// Varied tile heights (× tile width) give the wall a staggered, masonry rhythm like
// the web gallery's large/wide/tall spans.
const HEIGHTS = [1.3, 0.95, 1.1, 1.4, 0.85, 1.2, 1.0];

// Community gallery, mirroring the web Gallery: infinite wall of AI-generated book
// scenes with client-side search over the loaded images.
export default function Gallery() {
  const theme = useTheme();
  const router = useRouter();
  const { width } = useWindowDimensions();
  const toggleLike = useGalleryLike();
  const [search, setSearch] = useState('');
  const [media, setMedia] = useState<MediaFilter>('all');

  const { data, isLoading, error, refetch, isRefetching, fetchNextPage, hasNextPage, isFetchingNextPage } =
    useInfiniteQuery({
      queryKey: GALLERY_KEYS.LIST,
      queryFn: ({ pageParam }) => fetchGalleryPage(pageParam),
      initialPageParam: 1,
      getNextPageParam: (last) =>
        last.pagination?.hasMore ? last.pagination.page + 1 : undefined,
      staleTime: 5 * 60 * 1000,
    });

  const images = useMemo(() => {
    const seen = new Set<string>();
    return (data?.pages ?? [])
      .flatMap((p) => p.images ?? [])
      .filter((img) => !seen.has(img._id) && !!seen.add(img._id));
  }, [data]);

  const query = search.trim().toLowerCase();
  const filtered = useMemo(() => {
    return images.filter((img) => {
      if (media === 'video' && !isVideo(img)) return false;
      if (media === 'image' && isVideo(img)) return false;
      if (!query) return true;
      return [img.prompt, img.paragraphText, img.style, img.book?.title, img.book?.author]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(query);
    });
  }, [images, query, media]);

  // Filtering by media type only sees loaded pages, so load the rest to make the list
  // complete (videos are rare and can sit on any page).
  useEffect(() => {
    if (media !== 'all' && hasNextPage && !isFetchingNextPage) fetchNextPage();
  }, [media, hasNextPage, isFetchingNextPage]);

  const tileWidth = (width - PADDING * 2 - GAP) / 2;

  // Greedy masonry: each tile goes to the currently shorter column.
  const columns = useMemo(() => {
    const cols: { items: { img: GalleryImage; h: number }[]; height: number }[] = [
      { items: [], height: 0 },
      { items: [], height: 0 },
    ];
    filtered.forEach((img, i) => {
      const h = tileWidth * HEIGHTS[i % HEIGHTS.length];
      const col = cols[0].height <= cols[1].height ? cols[0] : cols[1];
      col.items.push({ img, h });
      col.height += h + GAP + CAPTION_HEIGHT;
    });
    return cols;
  }, [filtered, tileWidth]);

  if (isLoading) return <StateView variant="loading" />;
  if (error) {
    return <StateView variant="error" message="Couldn't load the gallery." onRetry={() => refetch()} />;
  }

  return (
    <Screen>
      <ScrollView
        showsVerticalScrollIndicator={false}
        showsHorizontalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        contentContainerStyle={{ paddingBottom: BOTTOM_CLEARANCE }}
        refreshControl={
          <RefreshControl
            refreshing={isRefetching && !isFetchingNextPage}
            onRefresh={() => refetch()}
            tintColor={theme.accent}
          />
        }
        scrollEventThrottle={200}
        onScroll={({ nativeEvent: { contentOffset, layoutMeasurement, contentSize } }) => {
          const nearEnd = contentOffset.y + layoutMeasurement.height > contentSize.height - 900;
          if (nearEnd && hasNextPage && !isFetchingNextPage && !query && media === 'all') fetchNextPage();
        }}
      >
        <View style={{ paddingHorizontal: PADDING + 4, paddingTop: 8, marginBottom: 16, gap: 10 }}>
          <Txt variant="subhead">Scenes from the books, illustrated by readers.</Txt>
          <SearchField value={search} onChangeText={setSearch} placeholder="Book, author, style, or prompt" />
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {MEDIA_FILTERS.map((f) => (
              <Chip key={f.key} label={f.label} active={media === f.key} onPress={() => setMedia(f.key)} />
            ))}
          </View>
          {(!!query || media !== 'all') && (
            <Txt variant="caption">
              {media === 'video' ? `${filtered.length} ${filtered.length === 1 ? 'video' : 'videos'}` : `${filtered.length} scenes`}
              {hasNextPage ? ' so far' : ''}
            </Txt>
          )}
        </View>

        {filtered.length === 0 ? (
          <Txt variant="subhead" style={{ textAlign: 'center', marginTop: 32 }}>
            {media === 'video' && !query
              ? isFetchingNextPage || hasNextPage
                ? 'Looking for videos…'
                : 'No videos yet.'
              : query
                ? 'No scenes match your search yet.'
                : 'No scenes yet.'}
          </Txt>
        ) : (
          <View style={{ flexDirection: 'row', gap: GAP, paddingHorizontal: PADDING }}>
            {columns.map((col, c) => (
              <View key={c} style={{ flex: 1, gap: GAP }}>
                {col.items.map(({ img, h }) => (
                  <Tile
                    key={img._id}
                    image={img}
                    width={tileWidth}
                    height={h}
                    onPress={() => router.push({ pathname: '/gallery/[imageId]', params: { imageId: img._id } })}
                    onLike={() => toggleLike(img)}
                  />
                ))}
              </View>
            ))}
          </View>
        )}

        {isFetchingNextPage && <Loader style={{ marginTop: 8 }} />}
        {!hasNextPage && images.length > 0 && !query && (
          <Txt variant="caption" style={{ textAlign: 'center', marginTop: 20 }}>
            That's every scene so far.
          </Txt>
        )}
      </ScrollView>
    </Screen>
  );
}

function Tile({
  image,
  width,
  height,
  onPress,
  onLike,
}: {
  image: GalleryImage;
  width: number;
  height: number;
  onPress: () => void;
  onLike: () => void;
}) {
  const theme = useTheme();
  const liked = !!image.isLiked;
  return (
    <View style={{ width }}>
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={`${isVideo(image) ? 'Video' : 'Scene'} from ${image.book?.title ?? 'a book'}`}
        style={({ pressed }) => ({ opacity: pressed ? 0.75 : 1 })}
      >
        {isVideo(image) && image.videoUrl ? (
          <GalleryVideoPreview
            uri={image.videoUrl}
            style={{ width, height, borderRadius: radii.md, overflow: 'hidden', backgroundColor: theme.surfaceStrong }}
          />
        ) : (
          <Image
            source={{ uri: thumbUrl(image.imageUrl ?? image.book?.image_url, width) }}
            style={{ width, height, borderRadius: radii.md, backgroundColor: theme.surfaceStrong }}
            contentFit="cover"
            transition={150}
            recyclingKey={image._id}
          />
        )}
        {isVideo(image) && (
          <View style={{ position: 'absolute', top: 8, left: 8 }}>
            {/* White on purpose: it sits on the video, not on a themed surface. */}
            <Ionicons name="videocam" size={18} color="#fff" />
          </View>
        )}
      </Pressable>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6 }}>
        <Txt variant="caption" numberOfLines={1} style={{ flex: 1 }}>
          {image.book?.title ?? ''}
        </Txt>
        <Pressable
          onPress={onLike}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={liked ? 'Unlike' : 'Like'}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}
        >
          <Ionicons name={liked ? 'heart' : 'heart-outline'} size={14} color={liked ? theme.accent : theme.textMuted} />
          <Txt variant="caption">{image.likeCount || 0}</Txt>
        </Pressable>
      </View>
    </View>
  );
}
