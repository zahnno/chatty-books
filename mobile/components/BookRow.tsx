import { FlatList, View } from 'react-native';
import { BookCard } from './BookCard';
import { SectionHeader } from './ui';
import type { Book } from '../lib/books';

export function BookRow({ title, books }: { title: string; books: Book[] }) {
  if (!books?.length) return null;
  return (
    <View style={{ marginBottom: 32 }}>
      <SectionHeader title={title} />
      <FlatList
        horizontal
        data={books}
        keyExtractor={(b) => b._id}
        showsHorizontalScrollIndicator={false}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 16, gap: 14 }}
        renderItem={({ item }) => <BookCard book={item} />}
      />
    </View>
  );
}
