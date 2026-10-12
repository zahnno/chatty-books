// A centred, on-brand dialog for confirmations and results: an icon medallion,
// an optional eyebrow, a title, a message and stacked actions. Same card and
// entrance as the Seeker bonus modal. Use instead of Alert.alert where the
// moment deserves more than a system popup.
import { useEffect, useRef, type ReactNode } from 'react';
import { Animated, Modal, Pressable, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Button, Txt } from './ui';
import { radii } from '../lib/theme';
import { useTheme } from '../lib/useTheme';

type IconName = keyof typeof Ionicons.glyphMap;

export type DialogAction = {
  label: string;
  onPress: () => void;
  // primary: solid ink · secondary: tinted · quiet: text only
  variant?: 'primary' | 'secondary' | 'quiet';
  icon?: IconName;
};

export function Dialog({
  visible,
  onClose,
  icon,
  eyebrow,
  title,
  message,
  children,
  actions,
}: {
  visible: boolean;
  onClose: () => void;
  icon?: IconName;
  eyebrow?: string;
  title: string;
  message?: string;
  children?: ReactNode;
  actions: DialogAction[];
}) {
  const theme = useTheme();
  const enter = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!visible) return;
    enter.setValue(0);
    Animated.spring(enter, { toValue: 1, friction: 7, tension: 70, useNativeDriver: true }).start();
  }, [visible]);

  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Close">
        <Animated.View
          // Taps on the card shouldn't fall through to the backdrop.
          onStartShouldSetResponder={() => true}
          style={[
            styles.card,
            { backgroundColor: theme.background, borderColor: theme.separator },
            { opacity: enter, transform: [{ scale: enter.interpolate({ inputRange: [0, 1], outputRange: [0.92, 1] }) }] },
          ]}
        >
          {!!icon && (
            <View style={[styles.medallion, { backgroundColor: theme.surface, borderColor: theme.separator }]}>
              <Ionicons name={icon} size={30} color={theme.accent} />
            </View>
          )}
          {!!eyebrow && (
            <Txt variant="caption" color={theme.accent} style={styles.eyebrow}>
              {eyebrow.toUpperCase()}
            </Txt>
          )}
          <Txt variant="title" style={styles.center}>
            {title}
          </Txt>
          {!!message && (
            <Txt variant="body" color={theme.textSecondary} style={[styles.center, { marginTop: 10 }]}>
              {message}
            </Txt>
          )}
          {children}
          <View style={styles.actions}>
            {actions.map((a) =>
              a.variant === 'quiet' ? (
                <Pressable key={a.label} onPress={a.onPress} accessibilityRole="button" style={styles.quiet}>
                  <Txt variant="bodyStrong" color={theme.textSecondary}>
                    {a.label}
                  </Txt>
                </Pressable>
              ) : (
                <Button
                  key={a.label}
                  title={a.label}
                  icon={a.icon}
                  variant={a.variant === 'secondary' ? 'outline' : 'primary'}
                  onPress={a.onPress}
                  style={styles.fullWidth}
                />
              ),
            )}
          </View>
        </Animated.View>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(10,9,8,0.72)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  card: {
    width: '100%',
    maxWidth: 380,
    alignItems: 'center',
    borderRadius: radii.lg,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 24,
    paddingTop: 28,
    paddingBottom: 16,
  },
  medallion: {
    width: 64,
    height: 64,
    borderRadius: 32,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  eyebrow: { letterSpacing: 1.6, fontWeight: '700', marginBottom: 6 },
  center: { textAlign: 'center' },
  actions: { alignSelf: 'stretch', alignItems: 'center', marginTop: 20 },
  fullWidth: { alignSelf: 'stretch' },
  quiet: { padding: 12, marginTop: 4 },
});
