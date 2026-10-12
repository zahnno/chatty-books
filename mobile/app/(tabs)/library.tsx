import { useMemo } from 'react';
import { FlatList, View, useWindowDimensions } from 'react-native';
import { useRouter } from 'expo-router';
// @ts-ignore - shared package is plain JS without type declarations
import { useAuth, useUserBooks } from '@talkingbook/shared';
import { BookCard } from '../../components/BookCard';
import { StateView } from '../../components/StateView';
import { SignInPrompt } from '../../components/SignIn';
import { Button, Screen, Txt } from '../../components/ui';
import { BOTTOM_CLEARANCE } from '../../lib/theme';
import type { Book } from '../../lib/books';

type ShelfBook = Book & { lastReadAt?: string | null };

const PADDING = 16;
const GAP = 14;

export default function Library() {
  const { user } = useAuth();
  if (!user) {
    return (
      <SignInPrompt
        icon="library-outline"
        title="Keep a library"
        message="Sign in to save books to your shelf and pick up where you left off on any device."
      />
    );
  }
  return <Shelf />;
}

function Shelf() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const { data, isLoading, error, refetch, isRefetching } = useUserBooks();
  const cardWidth = Math.floor((width - PADDING * 2 - GAP * 2) / 3);

  // Most recently read first; unread books keep their shelf order after.
  const books = useMemo<ShelfBook[]>(() => {
    const list: ShelfBook[] = Array.isArray(data) ? data : data?.books ?? [];
    return [...list].sort(
      (a, b) => (b.lastReadAt ? Date.parse(b.lastReadAt) : 0) - (a.lastReadAt ? Date.parse(a.lastReadAt) : 0)
    );
  }, [data]);

  if (isLoading) return <StateView variant="loading" />;
  if (error) {
    return <StateView variant="error" message="Couldn't load your library." onRetry={() => refetch()} />;
  }

  return (
    <Screen>
      <FlatList
        data={books}
        keyExtractor={(b) => b._id}
        numColumns={3}
        columnWrapperStyle={{ gap: GAP, paddingHorizontal: PADDING }}
        contentContainerStyle={{ gap: 22, paddingTop: 12, paddingBottom: BOTTOM_CLEARANCE, flexGrow: 1 }}
        onRefresh={() => refetch()}
        refreshing={isRefetching}
        ListHeaderComponent={
          books.length ? (
            <Txt variant="subhead" style={{ paddingHorizontal: PADDING }}>
              {books.length} {books.length === 1 ? 'book' : 'books'} · most recently read first
            </Txt>
          ) : null
        }
        renderItem={({ item }) => <BookCard book={item} width={cardWidth} />}
        ListEmptyComponent={
          <View style={{ flex: 1, minHeight: 420 }}>
            <StateView
              variant="empty"
              icon="library-outline"
              title="Your shelf is empty"
              message="Add books from Discover or Search and they'll appear here, ready to read, listen to, and talk with."
            />
            <View style={{ paddingHorizontal: 48 }}>
              <Button title="Discover books" onPress={() => router.navigate('/(tabs)')} />
            </View>
          </View>
        }
      />
    </Screen>
  );
}
