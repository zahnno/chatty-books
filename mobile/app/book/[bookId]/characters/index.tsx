import { useMemo } from 'react';
import { FlatList, Pressable, View } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
// @ts-ignore - shared package is plain JS without type declarations
import { useBook, useBookCharacters, useBookPages, thumbUrl } from '@talkingbook/shared';
import { StateView } from '../../../../components/StateView';
import { Row, Screen, Txt } from '../../../../components/ui';
import {
  PRESENCE_LABELS,
  characterName,
  characterPresence,
  type Character,
  type Presence,
} from '../../../../lib/characters';
import { BOTTOM_CLEARANCE } from '../../../../lib/theme';
import { useTheme } from '../../../../lib/useTheme';

type PageText = { pageNumber: number; pageText?: string };

// A book's cast: tap a character to start talking (as on the web). Characters mentioned
// on the reader's current, last or next page are tagged and listed first. The page comes
// from the reader (pageNumber param) or, when opened elsewhere, the saved reading progress.
export default function CharacterSelect() {
  const theme = useTheme();
  const router = useRouter();
  const params = useLocalSearchParams<{ bookId: string; pageNumber?: string }>();
  const { bookId } = params;
  const { data: book } = useBook(bookId);
  const { data: pagesData } = useBookPages(bookId);
  const { data, isLoading, error, refetch } = useBookCharacters(bookId);

  const pageNumber = Number(params.pageNumber) || (book?.currentPage > 0 ? book.currentPage : 0);

  const characters = useMemo(() => {
    const list: Character[] = Array.isArray(data) ? data : data?.characters ?? [];
    const pages: PageText[] = Array.isArray(pagesData) ? pagesData : pagesData?.pages ?? [];
    if (!pageNumber || !pages.length) return list.map((c) => ({ ...c, presence: null as Presence | null }));

    const textOf = (n: number) => pages.find((p) => p.pageNumber === n)?.pageText;
    const around = { current: textOf(pageNumber), previous: textOf(pageNumber - 1), next: textOf(pageNumber + 1) };
    const rank = { current: 0, previous: 1, next: 2 };
    return list
      .map((c) => ({ ...c, presence: characterPresence(c, around) }))
      .sort((a, b) => (a.presence ? rank[a.presence] : 3) - (b.presence ? rank[b.presence] : 3));
  }, [data, pagesData, pageNumber]);
  const presentCount = characters.filter((c) => c.presence).length;

  if (isLoading) return <StateView variant="loading" />;
  if (error) {
    return <StateView variant="error" message="Couldn't load characters." onRetry={() => refetch()} />;
  }

  return (
    <Screen>
      <FlatList
        data={characters}
        keyExtractor={(c) => c._id}
        contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: BOTTOM_CLEARANCE, flexGrow: 1 }}
        ListHeaderComponent={
          <View style={{ gap: 20, marginBottom: 8 }}>
            {!!book && (
              <Pressable
                onPress={() => router.push({ pathname: '/book/[bookId]', params: { bookId } })}
                accessibilityRole="button"
                accessibilityLabel={`About ${book.title}`}
                style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, opacity: pressed ? 0.7 : 1 })}
              >
                <Image
                  source={{ uri: thumbUrl(book.image_url, 40) }}
                  style={{ width: 40, height: 60, borderRadius: 4, backgroundColor: theme.surfaceStrong }}
                  contentFit="cover"
                />
                <View style={{ flex: 1 }}>
                  <Txt variant="bodyStrong" numberOfLines={2}>
                    {book.title}
                  </Txt>
                  <Txt variant="caption">
                    {[book.author, characters.length ? `${characters.length} characters` : null]
                      .filter(Boolean)
                      .join('  ·  ')}
                  </Txt>
                </View>
              </Pressable>
            )}
            <View style={{ gap: 4 }}>
              <Txt variant="largeTitle">Who would you like to talk to?</Txt>
              {presentCount > 0 && (
                <Txt variant="subhead">
                  {presentCount === 1 ? '1 character is' : `${presentCount} characters are`} in the story around
                  page {pageNumber}.
                </Txt>
              )}
            </View>
          </View>
        }
        ListEmptyComponent={
          <StateView variant="empty" icon="people-outline" message="This book has no characters yet." />
        }
        renderItem={({ item, index }) => (
          <Row
            last={index === characters.length - 1}
            accessibilityLabel={`Talk to ${characterName(item)}${
              item.presence ? `, ${PRESENCE_LABELS[item.presence].toLowerCase()}` : ''
            }`}
            onPress={() =>
              router.push({
                pathname: '/book/[bookId]/characters/[characterId]/chat',
                params: { bookId, characterId: item._id, ...(pageNumber ? { pageNumber: String(pageNumber) } : {}) },
              })
            }
          >
            <Image
              source={{ uri: thumbUrl(item.image_url, 52) }}
              style={{ width: 52, height: 52, borderRadius: 26, backgroundColor: theme.surfaceStrong }}
              contentFit="cover"
            />
            <View style={{ flex: 1, gap: 2 }}>
              <Txt variant="heading" style={{ fontSize: 17 }}>
                {characterName(item)}
              </Txt>
              {!!item.presence && <PresenceTag presence={item.presence} />}
              {!!item.intro && (
                <Txt variant="subhead" numberOfLines={2}>
                  {item.intro}
                </Txt>
              )}
            </View>
            <Ionicons name="chevron-forward" size={18} color={theme.textMuted} />
          </Row>
        )}
      />
    </Screen>
  );
}

// Small inline tag: filled accent dot for the current page, hollow for the pages either side.
function PresenceTag({ presence }: { presence: Presence }) {
  const theme = useTheme();
  const current = presence === 'current';
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
      <View
        style={{
          width: 7,
          height: 7,
          borderRadius: 4,
          borderWidth: 1.5,
          borderColor: theme.accent,
          backgroundColor: current ? theme.accent : 'transparent',
        }}
      />
      <Txt
        variant="caption"
        color={current ? theme.accent : theme.textSecondary}
        style={{ fontWeight: '600', letterSpacing: 0.2 }}
      >
        {PRESENCE_LABELS[presence]}
      </Txt>
    </View>
  );
}
