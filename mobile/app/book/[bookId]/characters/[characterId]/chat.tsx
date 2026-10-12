import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  FlatList,
  Pressable,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
// @ts-ignore - shared package is plain JS without type declarations
import { useAuth, useBook, useBookCharacter, thumbUrl } from '@talkingbook/shared';
import { fetchChatHistory, sendChatMessage, type ChatMessage } from '../../../../../lib/chat';
import { MAX_RECORDING_SECONDS, hasMicAccess, useVoiceChat } from '../../../../../lib/voiceChat';
import { formatTime } from '../../../../../lib/formatTime';
import { StateView } from '../../../../../components/StateView';
import { KeyboardAware } from '../../../../../components/KeyboardAware';
import { Loader, Screen, Txt } from '../../../../../components/ui';
import { AiConsentPrompt, useAiConsent } from '../../../../../components/AiConsent';
import { SignInPrompt } from '../../../../../components/SignIn';
import { fonts, radii } from '../../../../../lib/theme';
import { useTheme } from '../../../../../lib/useTheme';

// Conversation openers when there's no history yet.
const STARTERS = ['Who are you, really?', 'What matters most to you?', 'Tell me about your world'];

// Chats use the account's tokens and keep history, so guests are asked to sign in. They
// go to AI providers, so the first one waits for the reader's one-time consent.
export default function CharacterChatScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const { consented } = useAiConsent();
  if (!user) {
    return (
      <SignInPrompt
        icon="chatbubbles-outline"
        title="Talk with the characters"
        message="Chats use your account’s monthly allowance and keep your conversation history, so they need an account. The free plan includes a starter allowance."
      />
    );
  }
  if (!consented) return <AiConsentPrompt onDecline={() => router.back()} />;
  return <CharacterChat />;
}

function CharacterChat() {
  const theme = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ bookId: string; characterId: string; pageNumber?: string }>();
  const { bookId, characterId } = params;
  const { data: character } = useBookCharacter(bookId, characterId);
  const { data: book } = useBook(bookId);
  // The reader's page when opened from it; otherwise the saved reading progress.
  const pageNumber =
    Number(params.pageNumber) || (book?.currentPage && book.currentPage > 0 ? book.currentPage : 1);

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [sending, setSending] = useState(false);
  const [input, setInput] = useState('');
  const listRef = useRef<FlatList<ChatMessage>>(null);
  const contentHeight = useRef(0);

  const characterName =
    [character?.firstName, character?.lastName].filter(Boolean).join(' ') || 'Character';
  // Names from the book help the speech recogniser spell them right.
  const recognizerHints = useMemo(
    () => [character?.firstName, character?.lastName, book?.title].filter(Boolean) as string[],
    [character?.firstName, character?.lastName, book?.title]
  );
  const voice = useVoiceChat(bookId, characterId, recognizerHints);
  const avatar: string | undefined = character?.image_url;

  const loadInitial = useCallback(async () => {
    setLoading(true);
    setLoadError(false);
    try {
      const data = await fetchChatHistory(bookId, characterId, 1);
      setMessages(Array.isArray(data?.messages) ? data.messages : []);
      setHasMore(!!data?.pagination?.hasMore);
      setPage(data?.pagination?.page ?? 1);
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, [bookId, characterId]);

  useEffect(() => {
    loadInitial();
  }, [loadInitial]);

  const loadOlder = async () => {
    if (loadingOlder || !hasMore) return;
    setLoadingOlder(true);
    try {
      const next = page + 1;
      const data = await fetchChatHistory(bookId, characterId, next);
      const older = Array.isArray(data?.messages) ? data.messages : [];
      setMessages((cur) => [...older, ...cur]);
      setHasMore(!!data?.pagination?.hasMore);
      setPage(next);
    } catch {
      // ignore
    } finally {
      setLoadingOlder(false);
    }
  };

  const submit = async (text: string) => {
    const prompt = text.trim();
    if (!prompt || sending) return;
    setInput('');
    setMessages((cur) => [...cur, { userMessage: prompt, modelResponse: null }]);
    setSending(true);
    requestAnimationFrame(() => listRef.current?.scrollToEnd({ animated: true }));
    try {
      await sendChatMessage(bookId, characterId, prompt, pageNumber);
      await refreshLatest();
    } catch (err: any) {
      setMessages((cur) => cur.filter((m) => m.modelResponse !== null || m.userMessage !== prompt));
      Alert.alert(
        'Message failed',
        err?.message || 'Could not reach the character. You may be out of tokens.'
      );
    } finally {
      setSending(false);
      requestAnimationFrame(() => listRef.current?.scrollToEnd({ animated: true }));
    }
  };

  const refreshLatest = async () => {
    // Refetch page 1 to get the persisted pair (with suggestions).
    const data = await fetchChatHistory(bookId, characterId, 1);
    setMessages(Array.isArray(data?.messages) ? data.messages : []);
    setHasMore(!!data?.pagination?.hasMore);
    setPage(1);
  };

  // Explains the microphone before the system permission dialog appears (store
  // reviewers require a prominent disclosure for sensitive permissions).
  const startVoice = async () => {
    if (!(await hasMicAccess().catch(() => false))) {
      Alert.alert(
        'Talk to characters out loud',
        'Chatty Books listens through your microphone only after you tap Talk, until you send or cancel, so you can speak to the character instead of typing. ' +
          'Your phone turns your speech into text; on phones without speech recognition, the recording is sent to our servers to be transcribed and is not kept.',
        [
          { text: 'Not now', style: 'cancel' },
          { text: 'Continue', onPress: () => void listen() },
        ]
      );
      return;
    }
    await listen();
  };

  const listen = async () => {
    try {
      const started = await voice.startListening();
      if (!started) {
        Alert.alert('Microphone access needed', 'Allow microphone and speech recognition access in Settings to talk to characters.');
      }
    } catch {
      Alert.alert('Microphone unavailable', 'Could not start listening.');
    }
  };

  const cancelVoice = () => {
    voice.finishListening(false).catch(() => {});
  };

  // Replaces the in-progress voice turn (the last message) with `update`.
  const updateVoiceTurn = (update: ChatMessage) =>
    setMessages((cur) => cur.map((m) => (m.voiceTurn ? { ...m, ...update } : m)));

  // Sends what the reader said; the reply is shown and spoken as it streams in.
  const sendVoice = async () => {
    if (sending) return;
    setSending(true);
    setMessages((cur) => [...cur, { voiceTurn: true, voicePending: true, modelResponse: null }]);
    requestAnimationFrame(() => listRef.current?.scrollToEnd({ animated: true }));
    try {
      const transcript = await voice.finishListening(true);
      if (!transcript) {
        setMessages((cur) => cur.filter((m) => !m.voiceTurn));
        if (transcript === '') Alert.alert("Didn't catch that", 'Try again a little closer to the microphone.');
        return;
      }
      updateVoiceTurn({ voicePending: false, userMessage: transcript });
      const reply = await voice.sendTurn(transcript, pageNumber, (text) =>
        updateVoiceTurn({ modelResponse: text, streaming: true })
      );
      setMessages((cur) =>
        cur.map((m) =>
          m.voiceTurn ? { userMessage: transcript, modelResponse: reply.message, suggestions: reply.suggestions } : m
        )
      );
    } catch (err: any) {
      setMessages((cur) => cur.filter((m) => !m.voiceTurn));
      Alert.alert(
        'Voice message failed',
        err?.message || 'Could not reach the character. You may be out of tokens.'
      );
    } finally {
      setSending(false);
      requestAnimationFrame(() => listRef.current?.scrollToEnd({ animated: true }));
    }
  };

  // Sent automatically at the time limit, or when the recogniser stops by itself.
  useEffect(() => {
    if (voice.isListening && (voice.listenSeconds >= MAX_RECORDING_SECONDS || voice.endedOnItsOwn)) sendVoice();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [voice.isListening, voice.listenSeconds, voice.endedOnItsOwn]);

  const speak = (text: string) => {
    voice.toggleSpeak(text).catch((err: any) => {
      Alert.alert('Voice unavailable', err?.message || 'Could not play this message.');
    });
  };

  const speechProps = (text: string) => ({
    onSpeak: () => speak(text),
    speaking: voice.speakingText === text,
    loadingSpeech: voice.loadingText === text,
  });

  const lastSuggestions = (messages.length > 0 && messages[messages.length - 1].suggestions) || [];
  const suggestions = messages.length === 0 ? STARTERS : lastSuggestions;

  if (loading) return <StateView variant="loading" />;
  if (loadError) {
    return (
      <StateView variant="error" message="Couldn't load this conversation." onRetry={loadInitial} />
    );
  }

  const openProfile = () =>
    router.push({ pathname: '/book/[bookId]/characters/[characterId]', params: { bookId, characterId } });

  return (
    <Screen>
      <Stack.Screen
        options={{
          title: '',
          headerTitle: () => (
            <Pressable
              onPress={openProfile}
              accessibilityRole="button"
              accessibilityLabel={`About ${characterName}`}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}
            >
              <Avatar uri={avatar} size={32} />
              <View>
                <Txt variant="heading" numberOfLines={1} style={{ fontSize: 16, lineHeight: 20 }}>
                  {characterName}
                </Txt>
                {!!book?.title && (
                  <Txt variant="caption" numberOfLines={1}>
                    {book.title}
                  </Txt>
                )}
              </View>
            </Pressable>
          ),
          headerRight: () => (
            <Pressable onPress={openProfile} hitSlop={10} accessibilityRole="button" accessibilityLabel={`About ${characterName}`}>
              <Ionicons name="information-circle-outline" size={24} color={theme.textSecondary} />
            </Pressable>
          ),
        }}
      />

      <KeyboardAware>
        <FlatList
          ref={listRef}
          style={{ flex: 1 }}
          showsVerticalScrollIndicator={false}
          showsHorizontalScrollIndicator={false}
          data={messages}
          keyExtractor={(m, i) => String(m._id ?? i)}
          contentContainerStyle={{ padding: 16, gap: 14, flexGrow: 1 }}
          // Keep the newest message in view. scrollToEnd is unreliable on Android with
          // variable-height rows (the chat opened half way up), so scroll to the
          // measured content height on the next frame instead (Android clamps it).
          onContentSizeChange={(_, height) => {
            contentHeight.current = height;
            requestAnimationFrame(() => listRef.current?.scrollToOffset({ offset: height, animated: false }));
          }}
          onLayout={() =>
            requestAnimationFrame(() => listRef.current?.scrollToOffset({ offset: contentHeight.current, animated: false }))
          }
          keyboardDismissMode="interactive"
          ListHeaderComponent={
            <View style={{ gap: 14 }}>
              {hasMore ? (
                <Pressable onPress={loadOlder} accessibilityRole="button" style={{ alignItems: 'center', paddingVertical: 6 }}>
                  {loadingOlder ? <Loader /> : <Txt variant="subhead" color={theme.accent}>Earlier messages</Txt>}
                </Pressable>
              ) : (
                // Start of the conversation: the character introduces themself.
                !!character?.intro && (
                  <CharacterBubble text={character.intro} avatar={avatar} {...speechProps(character.intro)} />
                )
              )}
            </View>
          }
          renderItem={({ item }) => (
            <View style={{ gap: 14 }}>
              {item.voicePending ? (
                <UserBubble voicePending />
              ) : (
                !!item.userMessage && <UserBubble text={item.userMessage} />
              )}
              {item.modelResponse === null ? (
                <TypingBubble avatar={avatar} />
              ) : (
                !!item.modelResponse && (
                  <CharacterBubble
                    text={item.modelResponse}
                    avatar={avatar}
                    {...(item.streaming ? {} : speechProps(item.modelResponse))}
                    onReport={
                      item._id && !item.streaming
                        ? () => router.push({ pathname: '/report', params: { type: 'message', id: String(item._id) } })
                        : undefined
                    }
                  />
                )
              )}
            </View>
          )}
        />

        {suggestions.length > 0 && !sending && !voice.isListening && (
          <FlatList
            horizontal
            data={suggestions}
            keyExtractor={(s, i) => String(i)}
            showsHorizontalScrollIndicator={false}
            showsVerticalScrollIndicator={false}
            // Horizontal lists otherwise stretch to fill the column's leftover height,
            // and must not shrink either: a long conversation squeezed the chips flat.
            style={{ flexGrow: 0, flexShrink: 0 }}
            contentContainerStyle={{ paddingHorizontal: 12, gap: 8, paddingVertical: 8, alignItems: 'center' }}
            renderItem={({ item }) => <SuggestionChip label={item} onPress={() => submit(item)} />}
          />
        )}

        <View
          style={{
            flexDirection: 'row',
            alignItems: 'flex-end',
            gap: 10,
            paddingHorizontal: 12,
            paddingTop: 8,
            paddingBottom: insets.bottom + 10,
            borderTopWidth: StyleSheet.hairlineWidth,
            borderTopColor: theme.separator,
          }}
        >
          {voice.isListening ? (
            <RecordingBar
              seconds={voice.listenSeconds}
              transcript={voice.liveTranscript}
              onCancel={cancelVoice}
              onSend={sendVoice}
            />
          ) : (
            <>
              <TextInput
                value={input}
                onChangeText={setInput}
                placeholder={`Message ${character?.firstName || characterName}`}
                placeholderTextColor={theme.textMuted}
                multiline
                maxLength={500}
                style={{
                  flex: 1,
                  minHeight: 44,
                  maxHeight: 130,
                  backgroundColor: theme.surface,
                  color: theme.textPrimary,
                  borderRadius: 22,
                  paddingHorizontal: 16,
                  paddingTop: 12,
                  paddingBottom: 12,
                  fontSize: 16,
                }}
              />
              {!input.trim() && !sending ? (
                <RoundButton icon="mic" label={`Talk to ${character?.firstName || characterName}`} onPress={startVoice} />
              ) : (
                <RoundButton
                  icon="arrow-up"
                  label="Send message"
                  onPress={() => submit(input)}
                  disabled={sending || !input.trim()}
                  busy={sending}
                />
              )}
            </>
          )}
        </View>
      </KeyboardAware>
    </Screen>
  );
}

function Avatar({ uri, size }: { uri?: string; size: number }) {
  const theme = useTheme();
  return (
    <Image
      source={{ uri: thumbUrl(uri, size) }}
      style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: theme.surfaceStrong }}
      contentFit="cover"
    />
  );
}

function RoundButton({
  icon,
  label,
  onPress,
  disabled,
  busy,
  color,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  disabled?: boolean;
  busy?: boolean;
  color?: string;
}) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => ({
        width: 44,
        height: 44,
        borderRadius: 22,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: color ?? theme.ink,
        opacity: disabled && !busy ? 0.3 : pressed ? 0.75 : 1,
      })}
    >
      {busy ? <ActivityIndicator color={theme.onInk} /> : <Ionicons name={icon} size={22} color={theme.onInk} />}
    </Pressable>
  );
}

// Replaces the composer while the microphone is live.
function RecordingBar({
  seconds,
  transcript,
  onCancel,
  onSend,
}: {
  seconds: number;
  transcript: string;
  onCancel: () => void;
  onSend: () => void;
}) {
  const theme = useTheme();
  const pulse = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 0.25, duration: 600, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1, duration: 600, useNativeDriver: true }),
      ])
    );
    anim.start();
    return () => anim.stop();
  }, [pulse]);
  const remaining = MAX_RECORDING_SECONDS - seconds;
  return (
    <>
      <Pressable
        onPress={onCancel}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel="Cancel recording"
        style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}
      >
        <Ionicons name="close" size={24} color={theme.textSecondary} />
      </Pressable>
      <View
        accessibilityLiveRegion="polite"
        style={{
          flex: 1,
          minHeight: 44,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 10,
          backgroundColor: theme.surface,
          borderRadius: 22,
          paddingHorizontal: 16,
        }}
      >
        <Animated.View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: theme.danger, opacity: pulse }} />
        <Txt variant="body" style={{ fontVariant: ['tabular-nums'] }}>
          {formatTime(seconds)}
        </Txt>
        {remaining <= 10 ? (
          <Txt variant="caption" style={{ marginLeft: 'auto' }}>
            {`Sending in ${Math.max(0, Math.ceil(remaining))}s`}
          </Txt>
        ) : (
          // What the reader has said so far, as they say it.
          <Txt variant="caption" numberOfLines={2} style={{ flex: 1, textAlign: transcript ? 'left' : 'right' }}>
            {transcript || 'Listening…'}
          </Txt>
        )}
      </View>
      <RoundButton icon="arrow-up" label="Send voice message" onPress={onSend} color={theme.accent} />
    </>
  );
}

// Character replies are set in the book typeface — the story talking back.
function CharacterBubble({
  text,
  avatar,
  onSpeak,
  speaking,
  loadingSpeech,
  onReport,
}: {
  text: string;
  avatar?: string;
  onSpeak?: () => void;
  speaking?: boolean;
  loadingSpeech?: boolean;
  // Long-press to report an AI reply (store policy for AI-generated content).
  onReport?: () => void;
}) {
  const theme = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 8, maxWidth: '88%' }}>
      <Avatar uri={avatar} size={26} />
      <Pressable
        onLongPress={onReport}
        disabled={!onReport}
        accessibilityActions={onReport ? [{ name: 'report', label: 'Report this reply' }] : undefined}
        onAccessibilityAction={(e) => e.nativeEvent.actionName === 'report' && onReport?.()}
        style={({ pressed }) => ({
          flexShrink: 1,
          backgroundColor: theme.surface,
          borderRadius: radii.lg,
          borderBottomLeftRadius: 4,
          paddingHorizontal: 14,
          paddingVertical: 10,
          opacity: pressed && onReport ? 0.7 : 1,
        })}
      >
        <Txt style={{ fontFamily: fonts.reading, fontSize: 16.5, lineHeight: 25, color: theme.textPrimary }}>{text}</Txt>
      </Pressable>
      {!!onSpeak && (
        <Pressable
          onPress={onSpeak}
          disabled={loadingSpeech}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel={speaking ? 'Stop speaking' : 'Hear this in their voice'}
          style={{ width: 28, height: 28, alignItems: 'center', justifyContent: 'center' }}
        >
          {loadingSpeech ? (
            <ActivityIndicator size="small" color={theme.textMuted} />
          ) : (
            <Ionicons
              name={speaking ? 'stop-circle' : 'volume-medium-outline'}
              size={20}
              color={speaking ? theme.accent : theme.textMuted}
            />
          )}
        </Pressable>
      )}
    </View>
  );
}

function UserBubble({ text, voicePending }: { text?: string; voicePending?: boolean }) {
  const theme = useTheme();
  return (
    <View
      style={{
        alignSelf: 'flex-end',
        maxWidth: '80%',
        backgroundColor: theme.ink,
        borderRadius: radii.lg,
        borderBottomRightRadius: 4,
        paddingHorizontal: 14,
        paddingVertical: 10,
      }}
    >
      {voicePending ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }} accessibilityLabel="Sending voice message">
          <Ionicons name="mic" size={16} color={theme.onInk} />
          <Txt variant="body" color={theme.onInk} style={{ opacity: 0.8 }}>
            Voice message…
          </Txt>
        </View>
      ) : (
        <Txt variant="body" color={theme.onInk}>
          {text}
        </Txt>
      )}
    </View>
  );
}

function TypingBubble({ avatar }: { avatar?: string }) {
  const theme = useTheme();
  const dots = [useRef(new Animated.Value(0)).current, useRef(new Animated.Value(0)).current, useRef(new Animated.Value(0)).current];
  useEffect(() => {
    const anims = dots.map((d, i) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(i * 160),
          Animated.timing(d, { toValue: 1, duration: 320, useNativeDriver: true }),
          Animated.timing(d, { toValue: 0, duration: 320, useNativeDriver: true }),
          Animated.delay((2 - i) * 160),
        ])
      )
    );
    anims.forEach((a) => a.start());
    return () => anims.forEach((a) => a.stop());
  }, []);
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 8 }}>
      <Avatar uri={avatar} size={26} />
      <View
        accessibilityLabel="Typing"
        style={{
          flexDirection: 'row',
          gap: 5,
          backgroundColor: theme.surface,
          borderRadius: radii.lg,
          borderBottomLeftRadius: 4,
          paddingHorizontal: 14,
          paddingVertical: 15,
        }}
      >
        {dots.map((d, i) => (
          <Animated.View
            key={i}
            style={{
              width: 7,
              height: 7,
              borderRadius: 4,
              backgroundColor: theme.textMuted,
              opacity: d.interpolate({ inputRange: [0, 1], outputRange: [0.35, 1] }),
            }}
          />
        ))}
      </View>
    </View>
  );
}

// A suggested reply: at most two lines and a bounded width, so a long
// suggestion wraps instead of running off the screen.
function SuggestionChip({ label, onPress }: { label: string; onPress: () => void }) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => ({
        maxWidth: 260,
        paddingHorizontal: 14,
        paddingVertical: 8,
        borderRadius: 18,
        backgroundColor: pressed ? theme.surfaceStrong : theme.surface,
      })}
    >
      <Txt variant="subhead" numberOfLines={2} color={theme.textSecondary} style={{ fontSize: 13.5, lineHeight: 18 }}>
        {label}
      </Txt>
    </Pressable>
  );
}
