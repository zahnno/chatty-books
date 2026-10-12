import { useMemo, useState } from 'react';
import { Alert, FlatList, Platform, Pressable, ScrollView, Share, View } from 'react-native';
import { Image } from 'expo-image';
import { thumbUrl } from '@talkingbook/shared';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import {
  useAuth,
  useBook,
  useUserBooks,
  useBookAudioProfiles,
  useBookCharacters,
  QUERY_KEYS,
  // @ts-ignore - shared package is plain JS without type declarations
} from '@talkingbook/shared';
import { Button, Chip, IconButton, Screen, SectionHeader, Txt } from '../../../components/ui';
import { WEB_URL } from '../../../lib/subscription';
import { StateView } from '../../../components/StateView';
import { useRequireAccount } from '../../../components/SignIn';
import { addToLibrary, removeFromLibrary, type Book } from '../../../lib/books';
import { characterName, type Character } from '../../../lib/characters';
import { useAudiobookPlayer, type AudioProfile } from '../../../context/AudiobookPlayerContext';
import { BOTTOM_CLEARANCE, radii, shadow } from '../../../lib/theme';
import { useTheme } from '../../../lib/useTheme';

function readingTimeLabel(minutes?: number) {
  if (!minutes) return null;
  return minutes >= 60 ? `${Math.round(minutes / 60)} hr read` : `${minutes} min read`;
}

export default function BookDetail() {
  const theme = useTheme();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { bookId } = useLocalSearchParams<{ bookId: string }>();

  const { data: book, isLoading, error, refetch } = useBook(bookId);
  const { user } = useAuth();
  const { data: userBooksData } = useUserBooks({ enabled: !!user });
  const { data: audioProfilesData } = useBookAudioProfiles(bookId);
  const { data: charactersData } = useBookCharacters(bookId);
  const { playProfile } = useAudiobookPlayer();
  const requireAccount = useRequireAccount();
  const [working, setWorking] = useState(false);
  const [aboutExpanded, setAboutExpanded] = useState(false);

  const audioProfiles: AudioProfile[] = (Array.isArray(audioProfilesData) ? audioProfilesData : []).filter(
    (p: AudioProfile) => p.status === 'completed' && p.audioUrl
  );
  const characters: Character[] = Array.isArray(charactersData) ? charactersData : [];

  const userBooks: Book[] = Array.isArray(userBooksData) ? userBooksData : userBooksData?.books ?? [];
  const inLibrary = useMemo(() => userBooks.some((b) => b._id === bookId), [userBooks, bookId]);

  if (isLoading) return <StateView variant="loading" />;
  if (error || !book) {
    return <StateView variant="error" message="Couldn't load this book." onRetry={() => refetch()} />;
  }

  const pageCount: number = book.totalPages ?? 0;
  const startPage = book.currentPage && book.currentPage > 0 ? book.currentPage : 1;
  const started = startPage > 1;
  const details = [
    pageCount > 0 ? `${pageCount} pages` : null,
    readingTimeLabel(book.readingTime),
    audioProfiles.length > 0 ? 'Audiobook' : null,
  ].filter(Boolean);

  const onToggleLibrary = async () => {
    if (!requireAccount('Save to your library', 'Sign in to keep books on your shelf, synced across your devices.')) return;
    setWorking(true);
    try {
      if (inLibrary) await removeFromLibrary(bookId);
      else await addToLibrary(bookId);
      queryClient.invalidateQueries({ queryKey: [QUERY_KEYS.USER_BOOKS] });
    } catch (err: any) {
      Alert.alert('Something went wrong', err?.message || 'Please try again.');
    } finally {
      setWorking(false);
    }
  };

  const onRead = () =>
    router.push({
      pathname: '/book/[bookId]/read/[pageNumber]',
      params: { bookId, pageNumber: String(startPage) },
    });
  const onChat = () => router.push({ pathname: '/book/[bookId]/characters', params: { bookId } });
  const onListen = () =>
    playProfile(audioProfiles[0], { bookId, bookTitle: book.title, bookCover: book.image_url }, startPage);

  return (
    <Screen>
      {/* Share link with a per-book preview card (server/routes/share.js). */}
      {book.is_public !== false && (
        <Stack.Screen
          options={{
            headerRight: () => (
              <IconButton
                icon="share-outline"
                label="Share this book"
                onPress={() => {
                  const url = `${WEB_URL}/b/${bookId}`;
                  const text = `Read ${book.title} and talk with its characters on Chatty Books`;
                  // iOS attaches `url` separately; Android only shares `message`.
                  Share.share(Platform.OS === 'ios' ? { message: text, url } : { message: `${text}: ${url}` }).catch(() => {});
                }}
              />
            ),
          }}
        />
      )}
      <ScrollView contentContainerStyle={{ paddingTop: 8, paddingBottom: BOTTOM_CLEARANCE }}>
        <View style={{ alignItems: 'center', paddingHorizontal: 24, gap: 6 }}>
          <View style={[{ borderRadius: radii.sm, marginBottom: 18 }, shadow]}>
            <Image
              source={{ uri: thumbUrl(book.image_url, 150) }}
              style={{ width: 150, height: 225, borderRadius: radii.sm, backgroundColor: theme.surfaceStrong }}
              contentFit="cover"
              transition={150}
            />
          </View>
          <Txt variant="largeTitle" style={{ textAlign: 'center' }}>
            {book.title}
          </Txt>
          {!!book.author && <Txt variant="subhead">{book.author}</Txt>}
          {details.length > 0 && (
            <Txt variant="caption" style={{ marginTop: 2 }}>
              {details.join('  ·  ')}
            </Txt>
          )}
        </View>

        <View style={{ paddingHorizontal: 16, marginTop: 20 }}>
          <Button title={started ? `Continue reading · p. ${startPage}` : 'Start reading'} onPress={onRead} />
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 0 }}>
            {audioProfiles.length > 0 && (
              <Button title="Listen" icon="headset-outline" variant="outline" style={{ flex: 1 }} onPress={onListen} />
            )}
            <Button title="Characters" icon="chatbubbles-outline" variant="outline" style={{ flex: 1 }} onPress={onChat} />
            <Button
              title={inLibrary ? 'Saved' : 'Save'}
              icon={inLibrary ? 'bookmark' : 'bookmark-outline'}
              variant="outline"
              loading={working}
              style={{ flex: 1 }}
              onPress={onToggleLibrary}
            />
          </View>
        </View>

        {characters.length > 0 && (
          <View style={{ marginTop: 32 }}>
            <SectionHeader title="Characters" action={{ label: 'See all', onPress: onChat }} />
            <FlatList
              horizontal
              data={characters}
              keyExtractor={(c) => c._id}
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ paddingHorizontal: 16, gap: 14 }}
              renderItem={({ item }) => (
                <Pressable
                  onPress={() =>
                    router.push({
                      pathname: '/book/[bookId]/characters/[characterId]',
                      params: { bookId, characterId: item._id },
                    })
                  }
                  accessibilityRole="button"
                  accessibilityLabel={characterName(item)}
                  style={({ pressed }) => ({ width: 72, alignItems: 'center', gap: 6, opacity: pressed ? 0.7 : 1 })}
                >
                  <Image
                    source={{ uri: thumbUrl(item.image_url, 64) }}
                    style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: theme.surfaceStrong }}
                    contentFit="cover"
                  />
                  <Txt variant="caption" numberOfLines={1} color={theme.textSecondary}>
                    {characterName(item).split(' ')[0]}
                  </Txt>
                </Pressable>
              )}
            />
          </View>
        )}

        {(!!book.tagline || !!book.description) && (
          <View style={{ marginTop: 32, paddingHorizontal: 16, gap: 10 }}>
            <Txt variant="heading">About this book</Txt>
            {!!book.tagline && <Txt variant="quote">{book.tagline}</Txt>}
            {!!book.description && (
              <Pressable onPress={() => setAboutExpanded((v) => !v)} accessibilityRole="button">
                <Txt variant="body" color={theme.textSecondary} numberOfLines={aboutExpanded ? undefined : 5}>
                  {book.description}
                </Txt>
                <Txt variant="subhead" color={theme.accent} style={{ marginTop: 6 }}>
                  {aboutExpanded ? 'Show less' : 'Read more'}
                </Txt>
              </Pressable>
            )}
          </View>
        )}

        {!!book.categories?.length && (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 20, paddingHorizontal: 16 }}>
            {book.categories.map((c: string) => (
              <Chip key={c} label={c} />
            ))}
          </View>
        )}
      </ScrollView>
    </Screen>
  );
}
