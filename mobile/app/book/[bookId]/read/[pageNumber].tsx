import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  BackHandler,
  Easing,
  FlatList,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
  useWindowDimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import { SystemBars } from 'react-native-edge-to-edge';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQueryClient } from '@tanstack/react-query';
// @ts-ignore - shared package is plain JS without type declarations
import { useBook, useBookPages, QUERY_KEYS } from '@talkingbook/shared';
import { StateView } from '../../../../components/StateView';
import { IconButton, Txt } from '../../../../components/ui';
import { saveReadingProgress } from '../../../../lib/books';
import { FONT_SIZES, useReadingPrefs } from '../../../../lib/readingPrefs';
import { fonts, radii, readingThemes, shadow, type ReadingThemeKey } from '../../../../lib/theme';
import { useTheme } from '../../../../lib/useTheme';

type Page = {
  _id?: string;
  pageNumber: number;
  pageText?: string;
};

// Page text is hard-wrapped plain text (often with \r\n). Like the web reader's
// Markdown rendering: blank lines separate paragraphs, single newlines are soft wraps.
function toParagraphs(text = ''): string[] {
  return text
    .replace(/\r\n?/g, '\n')
    .split(/\n\s*\n/)
    .map((p) => p.replace(/\s*\n\s*/g, ' ').trim())
    .filter(Boolean);
}

// Immersive paged reader: one page per screen, swiped horizontally (mirrors the web
// HorizontalReader). Tapping the outer edges turns the page, tapping the middle shows/hides
// the top bar, and any scroll hides it again so it never sits over text being read. The
// page footer is laid out below the pages (not overlaid) so text never runs underneath it.
// Fixed page width lets initialScrollIndex open the saved page directly.
export default function Reader() {
  const theme = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const queryClient = useQueryClient();
  const { bookId, pageNumber } = useLocalSearchParams<{ bookId: string; pageNumber: string }>();
  const { data: book } = useBook(bookId);
  const { data, isLoading, error, refetch } = useBookPages(bookId);
  const [prefs, setPrefs] = useReadingPrefs();
  const rt = readingThemes[prefs.theme];

  const pages: Page[] = useMemo(
    () =>
      (Array.isArray(data) ? data : data?.pages ?? [])
        .slice()
        .sort((a: Page, b: Page) => a.pageNumber - b.pageNumber),
    [data]
  );

  const startIndex = Math.max(
    0,
    pages.findIndex((p) => p.pageNumber === (Number(pageNumber) || 1))
  );
  const [index, setIndex] = useState(startIndex);
  const listRef = useRef<FlatList<Page>>(null);
  const [chromeVisible, setChromeVisible] = useState(true);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const chrome = useRef(new Animated.Value(1)).current;

  useEffect(() => setIndex(startIndex), [startIndex]);

  useEffect(() => {
    Animated.timing(chrome, { toValue: chromeVisible ? 1 : 0, duration: 220, useNativeDriver: true }).start();
  }, [chromeVisible, chrome]);

  // Save progress when the visible page settles (debounced so quick swipes don't spam).
  const current = pages[index];
  useEffect(() => {
    if (!current) return;
    const t = setTimeout(() => {
      saveReadingProgress(bookId, current.pageNumber)
        // Refresh the book so "Continue reading" on the detail screen picks up the page.
        .then(() => queryClient.invalidateQueries({ queryKey: QUERY_KEYS.BOOK(bookId) }))
        .catch(() => {});
    }, 800);
    return () => clearTimeout(t);
  }, [bookId, current?.pageNumber]);

  const closeSettings = useCallback(() => setSettingsOpen(false), []);
  const hideChrome = useCallback(() => setChromeVisible(false), []);

  const goTo = (i: number) => {
    if (i < 0 || i >= pages.length) return;
    listRef.current?.scrollToIndex({ index: i, animated: true });
    setIndex(i);
  };

  if (isLoading) return <StateView variant="loading" />;
  if (error) {
    return (
      <StateView variant="error" message="Couldn't load this book's pages." onRetry={() => refetch()} />
    );
  }
  if (!pages.length) {
    return <StateView variant="empty" icon="book-outline" message="This book has no pages yet." />;
  }

  const lastPage = pages[pages.length - 1]?.pageNumber ?? pages.length;
  const isLight = prefs.theme !== 'night';
  const chromeStyle = {
    opacity: chrome,
    transform: [{ translateY: chrome.interpolate({ inputRange: [0, 1], outputRange: [-12, 0] }) }],
  };
  const progress = Math.max(0, Math.min(1, (current?.pageNumber ?? 1) / lastPage));

  // Outer fifths of the screen turn the page (like a paper book); the middle toggles the bar.
  const onPageTap = (x: number) => {
    if (x < width * 0.2) goTo(index - 1);
    else if (x > width * 0.8) goTo(index + 1);
    else setChromeVisible((v) => !v);
  };

  return (
    <View style={{ flex: 1, backgroundColor: rt.background }}>
      <Stack.Screen options={{ headerShown: false }} />
      {/* Hiding the chrome also hides both system bars for fully immersive reading. */}
      <SystemBars style={isLight ? 'dark' : 'light'} hidden={!chromeVisible} />

      <FlatList
        ref={listRef}
        showsVerticalScrollIndicator={false}
        data={pages}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        keyExtractor={(p) => String(p._id ?? p.pageNumber)}
        initialScrollIndex={startIndex}
        getItemLayout={(_, i) => ({ length: width, offset: width * i, index: i })}
        initialNumToRender={1}
        windowSize={3}
        extraData={prefs}
        style={{ flex: 1 }}
        onScrollBeginDrag={hideChrome}
        onMomentumScrollEnd={(e) => setIndex(Math.round(e.nativeEvent.contentOffset.x / width))}
        renderItem={({ item }) => (
          <ScrollView
            showsHorizontalScrollIndicator={false}
            style={{ width }}
            showsVerticalScrollIndicator={false}
            onScrollBeginDrag={hideChrome}
            contentContainerStyle={{
              flexGrow: 1,
              paddingHorizontal: 26,
              paddingTop: insets.top + 68,
              paddingBottom: 12,
            }}
          >
            <Pressable
              style={{ flex: 1 }}
              onPress={(e) => onPageTap(e.nativeEvent.pageX)}
              accessibilityActions={[
                { name: 'increment', label: 'Next page' },
                { name: 'decrement', label: 'Previous page' },
                { name: 'activate', label: 'Show or hide controls' },
              ]}
              onAccessibilityAction={(e) => {
                if (e.nativeEvent.actionName === 'increment') goTo(index + 1);
                else if (e.nativeEvent.actionName === 'decrement') goTo(index - 1);
                else setChromeVisible((v) => !v);
              }}
            >
              {toParagraphs(item.pageText).map((para, i) => (
                <Txt
                  key={i}
                  color={rt.text}
                  style={{
                    fontFamily: fonts.reading,
                    fontSize: prefs.fontSize,
                    lineHeight: Math.round(prefs.fontSize * 1.65),
                    marginBottom: Math.round(prefs.fontSize * 0.9),
                  }}
                >
                  {para}
                </Txt>
              ))}
            </Pressable>
          </ScrollView>
        )}
      />

      {/* Page footer: part of the layout, so page text always ends above it. The progress
          hairline only appears alongside the top bar. */}
      <View style={{ paddingHorizontal: 26, paddingTop: 6, paddingBottom: insets.bottom + 10, gap: 8 }}>
        <Animated.View
          style={{ height: 2, borderRadius: 1, backgroundColor: rt.separator, overflow: 'hidden', opacity: chrome }}
        >
          <View style={{ width: `${progress * 100}%`, height: 2, backgroundColor: rt.muted }} />
        </Animated.View>
        <Txt
          variant="caption"
          color={rt.muted}
          style={{ textAlign: 'center', fontVariant: ['tabular-nums'] }}
          accessibilityLabel={`Page ${current?.pageNumber ?? ''} of ${lastPage}`}
        >
          {current?.pageNumber ?? ''} of {lastPage}
        </Txt>
      </View>

      {/* Top chrome */}
      <Animated.View
        pointerEvents={chromeVisible ? 'box-none' : 'none'}
        style={[
          {
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            paddingTop: insets.top + 8,
            paddingHorizontal: 14,
            paddingBottom: 10,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 12,
            backgroundColor: rt.background,
          },
          chromeStyle,
        ]}
      >
        <IconButton icon="chevron-back" label="Back" onPress={() => router.back()} tint={rt.text} />
        <View style={{ flex: 1 }}>
          <Txt variant="bodyStrong" numberOfLines={1} color={rt.text} style={{ textAlign: 'center' }}>
            {book?.title ?? ''}
          </Txt>
          {!!book?.author && (
            <Txt variant="caption" numberOfLines={1} color={rt.muted} style={{ textAlign: 'center' }}>
              {book.author}
            </Txt>
          )}
        </View>
        <IconButton
          icon="chatbubbles-outline"
          label="Talk to the characters"
          onPress={() =>
            router.push({
              pathname: '/book/[bookId]/characters',
              params: { bookId, pageNumber: String(current?.pageNumber ?? 1) },
            })
          }
          tint={rt.text}
        />
        <IconButton icon="text" label="Reading settings" onPress={() => setSettingsOpen(true)} tint={rt.text} />
      </Animated.View>

      <ReadingSettings
        visible={settingsOpen}
        onClose={closeSettings}
        themeKey={prefs.theme}
        fontSize={prefs.fontSize}
        onTheme={(t) => setPrefs({ theme: t })}
        onFontSize={(s) => setPrefs({ fontSize: s })}
      />
    </View>
  );
}

// Bottom sheet drawn inside the reader rather than in a native Modal: a Modal opens its
// own window, which on Android ignores edge-to-edge (wrong bottom inset, system bars
// reappear) and slides its dimmed backdrop up along with the sheet. Here the backdrop
// fades while only the sheet slides, and the sheet takes the current reading theme.
function ReadingSettings({
  visible,
  onClose,
  themeKey,
  fontSize,
  onTheme,
  onFontSize,
}: {
  visible: boolean;
  onClose: () => void;
  themeKey: ReadingThemeKey;
  fontSize: number;
  onTheme: (t: ReadingThemeKey) => void;
  onFontSize: (s: number) => void;
}) {
  const insets = useSafeAreaInsets();
  const rt = readingThemes[themeKey];
  const [mounted, setMounted] = useState(visible);
  const anim = useRef(new Animated.Value(0)).current;
  const [sheetHeight, setSheetHeight] = useState(400);

  useEffect(() => {
    if (visible) setMounted(true);
    Animated.timing(anim, {
      toValue: visible ? 1 : 0,
      duration: visible ? 260 : 200,
      easing: visible ? Easing.out(Easing.cubic) : Easing.in(Easing.cubic),
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished && !visible) setMounted(false);
    });
  }, [visible, anim]);

  // Android back closes the sheet before leaving the reader.
  useEffect(() => {
    if (!visible) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      onClose();
      return true;
    });
    return () => sub.remove();
  }, [visible, onClose]);

  if (!mounted) return null;

  const sizes: number[] = [];
  for (let s = FONT_SIZES.min; s <= FONT_SIZES.max; s += FONT_SIZES.step) sizes.push(s);
  const step = (d: number) =>
    onFontSize(Math.max(FONT_SIZES.min, Math.min(FONT_SIZES.max, fontSize + d * FONT_SIZES.step)));

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents={visible ? 'auto' : 'none'}>
      <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.45)', opacity: anim }]}>
        <Pressable style={{ flex: 1 }} onPress={onClose} accessibilityLabel="Close reading settings" />
      </Animated.View>
      <Animated.View
        onLayout={(e) => setSheetHeight(e.nativeEvent.layout.height)}
        accessibilityViewIsModal
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: rt.background,
          borderTopLeftRadius: radii.lg,
          borderTopRightRadius: radii.lg,
          padding: 22,
          paddingBottom: insets.bottom + 22,
          gap: 22,
          ...shadow,
          transform: [{ translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [sheetHeight, 0] }) }],
        }}
      >
        <View style={{ alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: rt.separator }} />
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <Txt variant="heading" color={rt.text}>
            Reading
          </Txt>
          <IconButton icon="close" label="Close" onPress={onClose} tint={rt.muted} size={22} />
        </View>

        <View style={{ gap: 12 }}>
          <Txt variant="subhead" color={rt.muted}>
            Theme
          </Txt>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            {(Object.keys(readingThemes) as ReadingThemeKey[]).map((k) => {
              const t = readingThemes[k];
              const active = k === themeKey;
              return (
                <Pressable
                  key={k}
                  onPress={() => onTheme(k)}
                  accessibilityRole="button"
                  accessibilityLabel={`${t.name} theme`}
                  accessibilityState={{ selected: active }}
                  style={{
                    flex: 1,
                    height: 76,
                    borderRadius: radii.md,
                    backgroundColor: t.background,
                    borderWidth: active ? 2 : 1,
                    borderColor: active ? rt.text : rt.separator,
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 2,
                  }}
                >
                  <Txt style={{ fontFamily: fonts.reading, fontSize: 22, lineHeight: 28, color: t.text }}>Aa</Txt>
                  <Txt variant="caption" color={t.muted}>
                    {t.name}
                  </Txt>
                </Pressable>
              );
            })}
          </View>
        </View>

        <View style={{ gap: 12 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <Txt variant="subhead" color={rt.muted}>
              Text size
            </Txt>
            <Txt variant="subhead" color={rt.muted}>
              {fontSize} pt
            </Txt>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <IconButton
              icon="remove"
              label="Smaller text"
              onPress={() => step(-1)}
              tint={rt.text}
              disabled={fontSize <= FONT_SIZES.min}
            />
            <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              {sizes.map((s) => (
                <Pressable
                  key={s}
                  onPress={() => onFontSize(s)}
                  hitSlop={8}
                  accessibilityRole="button"
                  accessibilityLabel={`Text size ${s}`}
                  accessibilityState={{ selected: s === fontSize }}
                  style={{
                    width: s === fontSize ? 14 : 8,
                    height: s === fontSize ? 14 : 8,
                    borderRadius: 7,
                    backgroundColor: s <= fontSize ? rt.text : rt.separator,
                  }}
                />
              ))}
            </View>
            <IconButton
              icon="add"
              label="Larger text"
              onPress={() => step(1)}
              tint={rt.text}
              disabled={fontSize >= FONT_SIZES.max}
            />
          </View>
          <Txt
            numberOfLines={2}
            style={{ fontFamily: fonts.reading, fontSize, lineHeight: Math.round(fontSize * 1.5), color: rt.text }}
          >
            It is a truth universally acknowledged…
          </Txt>
        </View>
      </Animated.View>
    </View>
  );
}
