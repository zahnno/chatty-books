import type { ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import { Image } from 'expo-image';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
// @ts-ignore - shared package is plain JS without type declarations
import { useBook, useBookCharacter, thumbUrl } from '@talkingbook/shared';
import { Button, Chip, Screen, Txt } from '../../../../../components/ui';
import { StateView } from '../../../../../components/StateView';
import { characterName, type Character } from '../../../../../lib/characters';
import { radii } from '../../../../../lib/theme';
import { useTheme } from '../../../../../lib/useTheme';

// Character profile, mirroring the web CharacterModal.
export default function CharacterDetail() {
  const theme = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { bookId, characterId } = useLocalSearchParams<{ bookId: string; characterId: string }>();
  const { data, isLoading, error, refetch } = useBookCharacter(bookId, characterId);
  const { data: book } = useBook(bookId);
  const character = data as Character | undefined;

  if (isLoading) return <StateView variant="loading" />;
  if (error || !character) {
    return <StateView variant="error" message="Couldn't load this character." onRetry={() => refetch()} />;
  }

  const name = characterName(character);
  const has = (list?: string[]) => !!list && list.length > 0;
  const portrait = Math.min(width - 32, 360);

  const openChat = () =>
    router.push({
      pathname: '/book/[bookId]/characters/[characterId]/chat',
      params: { bookId, characterId },
    });

  return (
    <Screen>
      <Stack.Screen options={{ title: name }} />

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 100, gap: 28 }}>
        <View style={{ gap: 14 }}>
          {character.image_url ? (
            <Image
              source={{ uri: thumbUrl(character.image_url, portrait) }}
              style={{ width: portrait, height: portrait, borderRadius: radii.lg, alignSelf: 'center', backgroundColor: theme.surfaceStrong }}
              contentFit="cover"
              transition={150}
            />
          ) : null}
          <View style={{ gap: 4 }}>
            <Txt variant="largeTitle">{name}</Txt>
            {!!book?.title && (
              <Pressable
                onPress={() => router.push({ pathname: '/book/[bookId]', params: { bookId } })}
                accessibilityRole="button"
                hitSlop={6}
              >
                <Txt variant="subhead" color={theme.accent}>
                  {book.title}
                </Txt>
              </Pressable>
            )}
          </View>
          {!!character.intro && (
            <View style={{ flexDirection: 'row', gap: 12 }}>
              <View style={{ width: 2, backgroundColor: theme.accent }} />
              <Txt variant="quote" style={{ flex: 1 }}>
                {character.intro}
              </Txt>
            </View>
          )}
        </View>

        {!!character.description && (
          <Part title="Who they are">
            <Body>{character.description}</Body>
          </Part>
        )}
        {!!character.appearance && (
          <Part title="Appearance">
            <Body>{character.appearance}</Body>
          </Part>
        )}
        {has(character.personalityTraits) && (
          <Part title="Personality">
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {character.personalityTraits!.map((t, i) => (
                <Chip key={i} label={t} />
              ))}
            </View>
          </Part>
        )}
        {has(character.strengths) && (
          <Part title="Strengths">
            <List items={character.strengths!} />
          </Part>
        )}
        {has(character.weaknesses) && (
          <Part title="Weaknesses">
            <List items={character.weaknesses!} />
          </Part>
        )}
        {has(character.goals) && (
          <Part title="Goals & motivations">
            <List items={character.goals!} />
          </Part>
        )}
      </ScrollView>

      <View
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 0,
          paddingHorizontal: 16,
          paddingTop: 4,
          paddingBottom: insets.bottom + 12,
          backgroundColor: theme.background,
          borderTopWidth: StyleSheet.hairlineWidth,
          borderTopColor: theme.separator,
        }}
      >
        <Button title={`Talk to ${character.firstName || name}`} icon="chatbubble-outline" onPress={openChat} />
      </View>
    </Screen>
  );
}

function Part({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View style={{ gap: 8 }}>
      <Txt variant="heading">{title}</Txt>
      {children}
    </View>
  );
}

function Body({ children }: { children: ReactNode }) {
  const theme = useTheme();
  return (
    <Txt variant="body" color={theme.textSecondary}>
      {children}
    </Txt>
  );
}

function List({ items }: { items: string[] }) {
  const theme = useTheme();
  return (
    <View style={{ gap: 6 }}>
      {items.map((t, i) => (
        <View key={i} style={{ flexDirection: 'row', gap: 10 }}>
          <Txt variant="body" color={theme.textMuted}>
            –
          </Txt>
          <Txt variant="body" color={theme.textSecondary} style={{ flex: 1 }}>
            {t}
          </Txt>
        </View>
      ))}
    </View>
  );
}

