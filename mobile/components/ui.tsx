// Shared UI kit: type ramp, controls and grouped sections. Values come from lib/theme;
// screens compose these instead of styling from scratch.
import { useEffect, useState, type ReactNode } from 'react';
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TextInputProps,
  TextProps,
  View,
  ViewStyle,
  StyleProp,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { KeyboardAware } from './KeyboardAware';
import { fonts, radii, space } from '../lib/theme';
import { useTheme } from '../lib/useTheme';

type IconName = keyof typeof Ionicons.glyphMap;

// ─── Typography ──────────────────────────────────────────────────────────────

const variants = {
  largeTitle: { fontFamily: fonts.display, fontSize: 30, lineHeight: 36 },
  title: { fontFamily: fonts.display, fontSize: 23, lineHeight: 29 },
  heading: { fontFamily: fonts.display, fontSize: 19, lineHeight: 24 },
  body: { fontSize: 16, lineHeight: 23 },
  bodyStrong: { fontSize: 16, lineHeight: 23, fontWeight: '600' as const },
  subhead: { fontSize: 14, lineHeight: 20 },
  caption: { fontSize: 12.5, lineHeight: 17 },
  reading: { fontFamily: fonts.reading, fontSize: 18, lineHeight: 30 },
  quote: { fontFamily: fonts.readingItalic, fontSize: 17, lineHeight: 26 },
};

export type TxtVariant = keyof typeof variants;

export function Txt({
  variant = 'body',
  color,
  style,
  ...props
}: TextProps & { variant?: TxtVariant; color?: string }) {
  const theme = useTheme();
  const defaultColor =
    variant === 'caption' ? theme.textMuted : variant === 'subhead' ? theme.textSecondary : theme.textPrimary;
  return <Text {...props} style={[variants[variant], { color: color ?? defaultColor }, style]} />;
}

// ─── Layout ──────────────────────────────────────────────────────────────────

export function Screen({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const theme = useTheme();
  return <View style={[{ flex: 1, backgroundColor: theme.background }, style]}>{children}</View>;
}

// A titled group of rows separated by hairlines (no boxes).
export function Section({ title, children, style }: { title?: string; children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[{ gap: space.sm }, style]}>
      {!!title && <Txt variant="heading">{title}</Txt>}
      {children}
    </View>
  );
}

export function Row({
  children,
  onPress,
  last,
  accessibilityLabel,
}: {
  children: ReactNode;
  onPress?: () => void;
  last?: boolean;
  accessibilityLabel?: string;
}) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityLabel={accessibilityLabel}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: space.md,
        paddingVertical: space.md,
        borderBottomWidth: last ? 0 : StyleSheet.hairlineWidth,
        borderBottomColor: theme.separator,
        backgroundColor: pressed ? theme.surface : 'transparent',
      })}
    >
      {children}
    </Pressable>
  );
}

export function SectionHeader({
  title,
  action,
}: {
  title: string;
  action?: { label: string; onPress: () => void };
}) {
  const theme = useTheme();
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'baseline',
        justifyContent: 'space-between',
        paddingHorizontal: space.lg,
        marginBottom: space.md,
      }}
    >
      <Txt variant="heading">{title}</Txt>
      {!!action && (
        <Pressable onPress={action.onPress} hitSlop={8} accessibilityRole="button">
          <Txt variant="subhead" color={theme.accent}>
            {action.label}
          </Txt>
        </Pressable>
      )}
    </View>
  );
}

export function ProgressBar({ value, height = 3 }: { value: number; height?: number }) {
  const theme = useTheme();
  const pct = Math.max(0, Math.min(1, value || 0));
  return (
    <View style={{ height, borderRadius: height, backgroundColor: theme.separator, overflow: 'hidden' }}>
      <View style={{ width: `${pct * 100}%`, height, backgroundColor: theme.accent }} />
    </View>
  );
}

export function Chip({
  label,
  icon,
  onPress,
  active,
}: {
  label: string;
  icon?: IconName;
  onPress?: () => void;
  active?: boolean;
}) {
  const theme = useTheme();
  const fg = active ? theme.onInk : theme.textSecondary;
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityState={onPress ? { selected: !!active } : undefined}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        paddingHorizontal: 12,
        paddingVertical: 7,
        borderRadius: radii.pill,
        backgroundColor: active ? theme.ink : pressed ? theme.surfaceStrong : theme.surface,
      })}
    >
      {!!icon && <Ionicons name={icon} size={14} color={fg} />}
      <Txt variant="subhead" color={fg} style={{ fontSize: 13.5, lineHeight: 18 }}>
        {label}
      </Txt>
    </Pressable>
  );
}

// Brand loader: the quill-and-book mark with sparkles rising off the pages. Frames come
// from a Privateer-generated clip pinned to the app icon as both first and last frame
// (so it loops seamlessly), keyed to alpha and packed into one sheet; we show one cell
// at a time. The sheet is black ink on alpha, tinted to the theme.
const LOADER_SHEET = require('../assets/images/loader-sheet.png');
const LOADER = { frames: 48, columns: 8, fps: 12 };

export function Loader({ size = 44, style }: { size?: number; style?: StyleProp<ViewStyle> }) {
  const theme = useTheme();
  const [frame, setFrame] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setFrame((f) => (f + 1) % LOADER.frames), 1000 / LOADER.fps);
    return () => clearInterval(t);
  }, []);
  const rows = Math.ceil(LOADER.frames / LOADER.columns);
  return (
    <View
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel="Loading"
      style={[{ width: size, height: size, overflow: 'hidden', alignSelf: 'center' }, style]}
    >
      <Image
        source={LOADER_SHEET}
        fadeDuration={0}
        style={{
          width: size * LOADER.columns,
          height: size * rows,
          tintColor: theme.textPrimary,
          transform: [
            { translateX: -(frame % LOADER.columns) * size },
            { translateY: -Math.floor(frame / LOADER.columns) * size },
          ],
        }}
      />
    </View>
  );
}

// ─── Controls ────────────────────────────────────────────────────────────────

export function Button({
  title,
  onPress,
  loading,
  variant = 'primary',
  disabled,
  icon,
  style,
}: {
  title: string;
  onPress: () => void;
  loading?: boolean;
  // primary: solid ink · outline: tinted fill (name kept for existing callers) · ghost: text
  variant?: 'primary' | 'outline' | 'ghost';
  disabled?: boolean;
  icon?: IconName;
  style?: StyleProp<ViewStyle>;
}) {
  const theme = useTheme();
  const bg = variant === 'primary' ? theme.ink : variant === 'outline' ? theme.surface : 'transparent';
  const fg = variant === 'primary' ? theme.onInk : variant === 'ghost' ? theme.accent : theme.textPrimary;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityState={{ disabled: !!(disabled || loading), busy: !!loading }}
      style={({ pressed }) => [
        {
          height: 50,
          borderRadius: radii.md,
          borderCurve: 'continuous',
          alignItems: 'center',
          justifyContent: 'center',
          flexDirection: 'row',
          gap: 8,
          paddingHorizontal: space.lg,
          marginTop: space.sm,
          backgroundColor: bg,
          opacity: disabled ? 0.4 : pressed ? 0.75 : 1,
        },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={fg} />
      ) : (
        <>
          {!!icon && <Ionicons name={icon} size={18} color={fg} />}
          <Txt variant="bodyStrong" color={fg}>
            {title}
          </Txt>
        </>
      )}
    </Pressable>
  );
}

export function IconButton({
  icon,
  onPress,
  label,
  size = 24,
  tint,
  disabled,
}: {
  icon: IconName;
  onPress: () => void;
  label: string;
  size?: number;
  tint?: string;
  disabled?: boolean;
}) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={10}
      style={({ pressed }) => ({ padding: 6, opacity: disabled ? 0.3 : pressed ? 0.5 : 1 })}
    >
      <Ionicons name={icon} size={size} color={tint ?? theme.textPrimary} />
    </Pressable>
  );
}

export function Field({ label, ...props }: { label: string } & TextInputProps) {
  const theme = useTheme();
  const [focused, setFocused] = useState(false);
  return (
    <View style={{ marginBottom: space.lg, gap: 6 }}>
      <Txt variant="subhead" style={{ fontWeight: '500' }}>
        {label}
      </Txt>
      <TextInput
        placeholderTextColor={theme.textMuted}
        autoCapitalize="none"
        {...props}
        onFocus={(e) => {
          setFocused(true);
          props.onFocus?.(e);
        }}
        onBlur={(e) => {
          setFocused(false);
          props.onBlur?.(e);
        }}
        style={[
          {
            height: 50,
            borderRadius: radii.md,
            borderCurve: 'continuous',
            backgroundColor: theme.surface,
            borderWidth: 1.5,
            borderColor: focused ? theme.textPrimary : 'transparent',
            color: theme.textPrimary,
            paddingHorizontal: 14,
            fontSize: 16,
          },
          props.style,
        ]}
      />
    </View>
  );
}

export function SearchField({
  value,
  onChangeText,
  placeholder,
}: {
  value: string;
  onChangeText: (t: string) => void;
  placeholder: string;
}) {
  const theme = useTheme();
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        height: 44,
        paddingHorizontal: 12,
        borderRadius: radii.md,
        borderCurve: 'continuous',
        backgroundColor: theme.surface,
      }}
    >
      <Ionicons name="search" size={18} color={theme.textMuted} />
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={theme.textMuted}
        autoCapitalize="none"
        autoCorrect={false}
        returnKeyType="search"
        style={{ flex: 1, color: theme.textPrimary, fontSize: 16 }}
      />
      {!!value && (
        <Pressable onPress={() => onChangeText('')} hitSlop={8} accessibilityLabel="Clear search">
          <Ionicons name="close-circle" size={18} color={theme.textMuted} />
        </Pressable>
      )}
    </View>
  );
}

export function OrDivider({ label = 'or' }: { label?: string }) {
  const theme = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginVertical: 14 }}>
      <View style={{ flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: theme.separator }} />
      <Txt variant="caption">{label}</Txt>
      <View style={{ flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: theme.separator }} />
    </View>
  );
}

// Initial-letter avatar for people without a photo.
export function Initials({ name, size = 34 }: { name: string; size?: number }) {
  const theme = useTheme();
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: theme.surfaceStrong,
      }}
    >
      <Txt variant="heading" style={{ fontSize: size * 0.45, lineHeight: size * 0.6 }}>
        {name.slice(0, 1).toUpperCase()}
      </Txt>
    </View>
  );
}

// ─── Headers ─────────────────────────────────────────────────────────────────

// Native stack/tab header options matching the kit.
export const stackHeaderOptions = (theme: ReturnType<typeof useTheme>) => ({
  headerStyle: { backgroundColor: theme.background },
  headerShadowVisible: false,
  headerTitleStyle: { color: theme.textPrimary, fontFamily: fonts.display, fontSize: 18 },
  headerTintColor: theme.textPrimary,
  contentStyle: { backgroundColor: theme.background },
});

// headerLeft for the first screen of a nested stack (book, gallery scene), which gets
// no native back button. A shared link can open it with nothing behind it.
export function StackRootBackButton() {
  const router = useRouter();
  return (
    <IconButton
      icon="chevron-back"
      label="Back"
      onPress={() => (router.canGoBack() ? router.back() : router.replace('/(tabs)'))}
    />
  );
}

export function ScreenTitle({ children, subtitle }: { children: ReactNode; subtitle?: string }) {
  return (
    <View style={{ marginBottom: space.xl, gap: 6 }}>
      <Txt variant="largeTitle">{children}</Txt>
      {!!subtitle && <Txt variant="subhead">{subtitle}</Txt>}
    </View>
  );
}

// Full-screen form wrapper for the auth screens: respects the notch, keeps the form
// above the keyboard (see KeyboardAware), and scrolls instead of pushing content
// off-screen.
export function AuthScreen({ children }: { children: ReactNode }) {
  const theme = useTheme();
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.background }}>
      <KeyboardAware headerOffset={false}>
        <ScrollView contentContainerStyle={screenStyles.scrollContent} keyboardShouldPersistTaps="handled">
          {children}
        </ScrollView>
      </KeyboardAware>
    </SafeAreaView>
  );
}

export const screenStyles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 24,
    justifyContent: 'center',
  },
  scrollContent: {
    flexGrow: 1,
    padding: 24,
    justifyContent: 'center',
  },
});
