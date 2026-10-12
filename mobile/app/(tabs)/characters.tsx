import { memo, useEffect, useMemo, useState } from 'react';
import { FlatList, Pressable, ScrollView, View, useWindowDimensions } from 'react-native';
import { Image } from 'expo-image';
import { thumbUrl } from '@talkingbook/shared';
import { useRouter } from 'expo-router';
import { useInfiniteQuery } from '@tanstack/react-query';
import { StateView } from '../../components/StateView';
import { Loader, Screen, SearchField, Txt } from '../../components/ui';
import {
  characterName,
  fetchCharactersByBook,
  type BookCharacters,
  type Character,
} from '../../lib/characters';
import { BOTTOM_CLEARANCE, radii, shadow } from '../../lib/theme';
import { useTheme } from '../../lib/useTheme';

const PADDING = 16;
const GAP = 12;

// Characters grouped by book (as on the web /characters page): each book's cover, title
// and blurb, then its cast most-talked-to first, three portraits in view and the rest a
// swipe away. The cover or title opens the book; a portrait opens the character.
export default function Characters() {
  const { width } = useWindowDimensions();
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');

  // Search once typing pauses.
  useEffect(() => {
    const t = setTimeout(() => setQuery(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);

  const { data, isLoading, error, refetch, isRefetching, isFetching, fetchNextPage, hasNextPage, isFetchingNextPage } =
    useInfiniteQuery({
      queryKey: ['characters', 'by-book', query],
      queryFn: ({ pageParam }) => fetchCharactersByBook(pageParam, query),
      initialPageParam: 1,
      getNextPageParam: (last) => (last.hasMore ? last.page + 1 : undefined),
      staleTime: 5 * 60 * 1000,
      placeholderData: (prev) => prev, // keep results on screen while a new search loads
    });

  const groups = useMemo(() => {
    const seen = new Set<string>();
    return (data?.pages ?? [])
      .flatMap((p) => p.books ?? [])
      .filter((g) => !seen.has(g.book._id) && !!seen.add(g.book._id));
  }, [data]);

  const tileWidth = (width - PADDING * 2 - GAP * 2) / 3;

  if (isLoading) return <StateView variant="loading" />;
  if (error && !groups.length) {
    return <StateView variant="error" message="Couldn't load characters." onRetry={() => refetch()} />;
  }

  return (
    <Screen>
      <FlatList
        showsVerticalScrollIndicator={false}
        showsHorizontalScrollIndicator={false}
        data={groups}
        keyExtractor={(g) => g.book._id}
        contentContainerStyle={{ gap: 32, paddingBottom: BOTTOM_CLEARANCE }}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        ListHeaderComponent={
          <View style={{ paddingHorizontal: PADDING, paddingTop: 8, gap: 12 }}>
            <SearchField value={search} onChangeText={setSearch} placeholder="Search by name or book" />
            {isFetching && !isFetchingNextPage && !isRefetching && <Loader />}
          </View>
        }
        onEndReached={() => {
          if (hasNextPage && !isFetchingNextPage) fetchNextPage();
        }}
        onEndReachedThreshold={0.6}
        onRefresh={() => refetch()}
        refreshing={isRefetching && !isFetchingNextPage}
        renderItem={({ item }) => <BookSection group={item} tileWidth={tileWidth} />}
        ListEmptyComponent={
          <Txt variant="subhead" style={{ textAlign: 'center', marginTop: 32 }}>
            {query ? `No characters match “${query}”.` : 'No characters yet.'}
          </Txt>
        }
        ListFooterComponent={isFetchingNextPage ? <Loader /> : null}
      />
    </Screen>
  );
}

const BookSection = memo(function BookSection({ group, tileWidth }: { group: BookCharacters; tileWidth: number }) {
  const theme = useTheme();
  const router = useRouter();
  const { book, characters } = group;
  const count = characters.length;

  const openBook = () => router.push({ pathname: '/book/[bookId]', params: { bookId: book._id } });
  const openCharacter = (c: Character) =>
    router.push({
      pathname: '/book/[bookId]/characters/[characterId]',
      params: { bookId: book._id, characterId: c._id },
    });

  return (
    <View style={{ gap: 14 }}>
      <View style={{ marginHorizontal: PADDING, height: 1, backgroundColor: theme.separator, marginBottom: 6 }} />

      <Pressable
        onPress={openBook}
        accessibilityRole="button"
        accessibilityLabel={`Open ${book.title}`}
        style={({ pressed }) => ({
          flexDirection: 'row',
          alignItems: 'center',
          gap: 14,
          paddingHorizontal: PADDING,
          opacity: pressed ? 0.7 : 1,
        })}
      >
        <View style={[shadow, { borderRadius: 4 }]}>
          <Image
            source={{ uri: thumbUrl(book.image_url, 44) }}
            style={{ width: 44, height: 66, borderRadius: 4, backgroundColor: theme.surfaceStrong }}
            contentFit="cover"
            transition={150}
            recyclingKey={book._id}
          />
        </View>
        <View style={{ flex: 1, gap: 3 }}>
          <Txt variant="heading" numberOfLines={2} style={{ fontSize: 17, lineHeight: 22 }}>
            {book.title}
          </Txt>
          <Txt variant="caption">
            {[book.author, `${count} character${count === 1 ? '' : 's'}`].filter(Boolean).join('  ·  ')}
          </Txt>
        </View>
      </Pressable>

      {!!book.description && <BookDescription text={book.description} />}

      <ScrollView
        showsVerticalScrollIndicator={false}
        horizontal
        showsHorizontalScrollIndicator={false}
        snapToInterval={tileWidth + GAP}
        decelerationRate="fast"
        contentContainerStyle={{ paddingHorizontal: PADDING, gap: GAP }}
      >
        {characters.map((c) => (
          <Pressable
            key={c._id}
            onPress={() => openCharacter(c)}
            accessibilityRole="button"
            accessibilityLabel={characterName(c)}
            style={({ pressed }) => ({ width: tileWidth, opacity: pressed ? 0.7 : 1 })}
          >
            <Image
              source={{ uri: thumbUrl(c.image_url, tileWidth) }}
              style={{
                width: tileWidth,
                height: tileWidth,
                borderRadius: radii.md,
                backgroundColor: theme.surfaceStrong,
                borderWidth: 1,
                borderColor: theme.separator,
              }}
              contentFit="cover"
              transition={150}
              recyclingKey={c._id}
            />
            <Txt variant="subhead" numberOfLines={1} style={{ fontSize: 13, fontWeight: '600', marginTop: 8 }}>
              {characterName(c)}
            </Txt>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
});

// Two lines of the blurb; "More" appears only when the text is actually cut off. An
// invisible full-length copy is measured to tell.
function BookDescription({ text }: { text: string }) {
  const theme = useTheme();
  const [expanded, setExpanded] = useState(false);
  const [clamped, setClamped] = useState(false);

  return (
    <View style={{ paddingHorizontal: PADDING }}>
      <Txt
        variant="subhead"
        style={{ position: 'absolute', left: PADDING, right: PADDING, opacity: 0 }}
        onTextLayout={(e) => setClamped(e.nativeEvent.lines.length > 2)}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        {text}
      </Txt>
      <Txt variant="subhead" numberOfLines={expanded ? undefined : 2}>
        {text}
      </Txt>
      {clamped && (
        <Pressable
          onPress={() => setExpanded((e) => !e)}
          accessibilityRole="button"
          accessibilityState={{ expanded }}
          hitSlop={8}
          style={{ alignSelf: 'flex-start', marginTop: 4 }}
        >
          <Txt variant="caption" color={theme.accent} style={{ fontWeight: '600', fontSize: 13 }}>
            {expanded ? 'Less' : 'More'}
          </Txt>
        </Pressable>
      )}
    </View>
  );
}
