import { useEffect, useMemo, useState } from 'react';
import { FlatList, View, useWindowDimensions } from 'react-native';
import { useInfiniteQuery } from '@tanstack/react-query';
// @ts-ignore - shared package is plain JS without type declarations
import { useBooks } from '@talkingbook/shared';
import { BookCard } from '../../components/BookCard';
import { Chip, Loader, Screen, SearchField, Txt } from '../../components/ui';
import { searchBooks, type Book } from '../../lib/books';
import { BOTTOM_CLEARANCE } from '../../lib/theme';
import { useTheme } from '../../lib/useTheme';

const PADDING = 16;
const GAP = 14;

export default function Search() {
  const theme = useTheme();
  const { width } = useWindowDimensions();
  const cardWidth = Math.floor((width - PADDING * 2 - GAP * 2) / 3);
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');

  // Only search once typing pauses, not on every keystroke.
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(query.trim()), 300);
    return () => clearTimeout(t);
  }, [query]);

  const active = debouncedQuery.length > 1;

  // Search results while typing; otherwise page through the whole catalog.
  const { data, isLoading, isFetchingNextPage, hasNextPage, fetchNextPage, error } = useInfiniteQuery({
    queryKey: ['searchBooks', active ? debouncedQuery : ''],
    queryFn: ({ pageParam }) => searchBooks(active ? debouncedQuery : '', pageParam),
    initialPageParam: 1,
    getNextPageParam: (last) => (last?.hasMore ? last.page + 1 : undefined),
    staleTime: 60 * 1000,
  });

  // Topic suggestions from the categories of books already loaded on Discover.
  const { data: shelves } = useBooks();
  const topics = useMemo(() => {
    const counts = new Map<string, number>();
    [...(shelves?.featured ?? []), ...(shelves?.popular ?? []), ...(shelves?.other ?? [])].forEach(
      (b: Book) => b.categories?.forEach((c) => counts.set(c, (counts.get(c) ?? 0) + 1))
    );
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([c]) => c);
  }, [shelves]);

  // Flatten pages, dropping any book that shifted onto a later page between fetches.
  const books = useMemo(() => {
    const seen = new Set<string>();
    return (data?.pages ?? [])
      .flatMap((p) => p?.books ?? [])
      .filter((b) => !seen.has(b._id) && seen.add(b._id));
  }, [data]);

  const loadMore = () => {
    if (hasNextPage && !isFetchingNextPage) fetchNextPage();
  };

  const header = (
    <View>
      <View style={{ paddingHorizontal: PADDING, paddingTop: 8, marginBottom: 20 }}>
        <SearchField value={query} onChangeText={setQuery} placeholder="Title or author" />
      </View>
      {!active && topics.length > 0 && (
        <View style={{ paddingHorizontal: PADDING, gap: 12 }}>
          <Txt variant="subhead">Browse by subject</Txt>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {topics.map((t) => (
              <Chip key={t} label={t} onPress={() => setQuery(t)} />
            ))}
          </View>
        </View>
      )}
      {!active && books.length > 0 && (
        <Txt variant="subhead" style={{ paddingHorizontal: PADDING, marginTop: 28 }}>
          Explore our books
        </Txt>
      )}
      {isLoading && (
        <Loader style={{ marginTop: 12 }} />
      )}
    </View>
  );

  return (
    <Screen>
      <FlatList
        showsVerticalScrollIndicator={false}
        showsHorizontalScrollIndicator={false}
        data={books}
        keyExtractor={(b) => b._id}
        numColumns={3}
        columnWrapperStyle={{ gap: GAP, paddingHorizontal: PADDING }}
        contentContainerStyle={{ gap: 22, paddingBottom: BOTTOM_CLEARANCE }}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        ListHeaderComponent={header}
        renderItem={({ item }) => <BookCard book={item} width={cardWidth} />}
        onEndReached={loadMore}
        onEndReachedThreshold={0.6}
        ListFooterComponent={isFetchingNextPage ? <Loader style={{ marginVertical: 16 }} /> : null}
        ListEmptyComponent={
          active && !isLoading ? (
            <Txt
              variant="body"
              color={error ? theme.danger : theme.textSecondary}
              style={{ textAlign: 'center', marginTop: 32, paddingHorizontal: 32 }}
            >
              {error
                ? 'Search failed. Check your connection and try again.'
                : `Nothing found for “${debouncedQuery}”. Try an author’s name or a different title.`}
            </Txt>
          ) : null
        }
      />
    </Screen>
  );
}
