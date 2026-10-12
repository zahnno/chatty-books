import { useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
// @ts-ignore - shared package is plain JS without type declarations
import { useBooks, thumbUrl } from '@talkingbook/shared';
import { BookRow } from '../../components/BookRow';
import { StateView } from '../../components/StateView';
import { Button, Screen, Txt } from '../../components/ui';
import { BOTTOM_CLEARANCE, radii, shadow } from '../../lib/theme';
import { useTheme } from '../../lib/useTheme';
import type { Book } from '../../lib/books';

type ReadBook = Book & { lastReadAt?: string | null };

const CATEGORY_ROWS = 4;
const MIN_ROW_BOOKS = 2;

export default function Home() {
  const { data, isLoading, error, refetch } = useBooks();

  // Every loaded book once, even if it sits on more than one shelf.
  const allBooks = useMemo<ReadBook[]>(() => {
    const seen = new Set<string>();
    return [...(data?.featured ?? []), ...(data?.popular ?? []), ...(data?.other ?? [])].filter(
      (b: ReadBook) => !seen.has(b._id) && seen.add(b._id)
    );
  }, [data]);

  // Most recently opened book across all shelves.
  const continueBook = useMemo<ReadBook | null>(
    () =>
      allBooks
        .filter((b) => b.lastReadAt && (b.currentPage ?? 0) > 0)
        .sort((a, b) => Date.parse(b.lastReadAt!) - Date.parse(a.lastReadAt!))[0] ?? null,
    [allBooks]
  );

  // A shelf for each of the most common categories.
  const categoryRows = useMemo(() => {
    const byCategory = new Map<string, ReadBook[]>();
    allBooks.forEach((b) =>
      b.categories?.forEach((c) => byCategory.set(c, [...(byCategory.get(c) ?? []), b]))
    );
    return [...byCategory.entries()]
      .filter(([, books]) => books.length >= MIN_ROW_BOOKS)
      .sort((a, b) => b[1].length - a[1].length)
      .slice(0, CATEGORY_ROWS);
  }, [allBooks]);

  if (isLoading) return <StateView variant="loading" />;
  if (error) {
    return <StateView variant="error" message="Couldn't reach the library." onRetry={() => refetch()} />;
  }

  return (
    <Screen>
      <ScrollView showsVerticalScrollIndicator={false} showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingTop: 8, paddingBottom: BOTTOM_CLEARANCE }}>
        {continueBook && <ContinueReading book={continueBook} />}
        <BookRow title="Featured" books={data?.featured ?? []} />
        <BookRow title="Popular" books={data?.popular ?? []} />
        {categoryRows.map(([category, books]) => (
          <BookRow key={category} title={category} books={books} />
        ))}
        <BookRow title="More to read" books={data?.other ?? []} />
      </ScrollView>
    </Screen>
  );
}

function ContinueReading({ book }: { book: ReadBook }) {
  const theme = useTheme();
  const router = useRouter();
  const page = book.currentPage ?? 1;

  return (
    <View
      style={{
        marginHorizontal: 16,
        marginBottom: 32,
        paddingBottom: 24,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: theme.separator,
      }}
    >
      <Txt variant="subhead" style={{ marginBottom: 12 }}>
        Continue reading
      </Txt>
      <Pressable
        onPress={() => router.push({ pathname: '/book/[bookId]', params: { bookId: book._id } })}
        accessibilityRole="button"
        accessibilityLabel={`${book.title}, page ${page}`}
        style={({ pressed }) => ({ flexDirection: 'row', gap: 16, opacity: pressed ? 0.7 : 1 })}
      >
        <View style={[{ borderRadius: radii.sm }, shadow]}>
          <Image
            source={{ uri: thumbUrl(book.image_url, 80) }}
            style={{ width: 80, height: 120, borderRadius: radii.sm, backgroundColor: theme.surfaceStrong }}
            contentFit="cover"
          />
        </View>
        <View style={{ flex: 1, justifyContent: 'center', gap: 4 }}>
          <Txt variant="title" numberOfLines={2}>
            {book.title}
          </Txt>
          {!!book.author && <Txt variant="subhead">{book.author}</Txt>}
          <Txt variant="caption" color={theme.accent} style={{ marginTop: 4 }}>
            Page {page}
          </Txt>
        </View>
      </Pressable>
      <View style={{ flexDirection: 'row', gap: 10, marginTop: 8 }}>
        <Button
          title="Resume"
          style={{ flex: 1 }}
          onPress={() =>
            router.push({
              pathname: '/book/[bookId]/read/[pageNumber]',
              params: { bookId: book._id, pageNumber: String(page) },
            })
          }
        />
        <Button
          title="Characters"
          variant="outline"
          style={{ flex: 1 }}
          onPress={() => router.push({ pathname: '/book/[bookId]/characters', params: { bookId: book._id } })}
        />
      </View>
    </View>
  );
}
