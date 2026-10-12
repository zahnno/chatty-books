import { useEffect, useState, type ReactNode } from 'react';
import { Dimensions, Keyboard, KeyboardAvoidingView, Platform, View, type StyleProp, type ViewStyle } from 'react-native';
import { useHeaderHeight } from '@react-navigation/elements';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

// Keeps bottom-anchored inputs (chat composers, forms) directly above the keyboard.
//
// Android: with edge-to-edge (react-native-edge-to-edge) the window no longer resizes for
// the keyboard, and RN's KeyboardAvoidingView measures from layout frames + a header
// offset in a coordinate space edge-to-edge shifts — on a Seeker it overshot by ~550px and
// left the composer mid-screen. Instead pad by pure geometry: the root spans the whole
// screen, so the space the keyboard takes is screen height − keyboard top (`screenY`).
// The bottom safe-area inset is subtracted because callers already pad their bottom edge
// by it. (`endCoordinates.height` is avoided: on Android it already excludes the gesture
// bar, which made the inset get subtracted twice.)
//
// iOS: the standard KeyboardAvoidingView is correct there.
export function KeyboardAware({
  children,
  style,
  headerOffset = true,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  // Whether a navigation header sits above this view (iOS offset only).
  headerOffset?: boolean;
}) {
  const insets = useSafeAreaInsets();
  const headerHeight = useSafeHeaderHeight();
  const [keyboardTop, setKeyboardTop] = useState<number | null>(null);

  useEffect(() => {
    if (Platform.OS !== 'android') return;
    const show = Keyboard.addListener('keyboardDidShow', (e) => setKeyboardTop(e.endCoordinates.screenY));
    const hide = Keyboard.addListener('keyboardDidHide', () => setKeyboardTop(null));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  if (Platform.OS === 'android') {
    const padding =
      keyboardTop != null ? Math.max(0, Dimensions.get('screen').height - keyboardTop - insets.bottom) : 0;
    return <View style={[{ flex: 1, paddingBottom: padding }, style]}>{children}</View>;
  }

  return (
    <KeyboardAvoidingView
      behavior="padding"
      keyboardVerticalOffset={headerOffset ? headerHeight : 0}
      style={[{ flex: 1 }, style]}
    >
      {children}
    </KeyboardAvoidingView>
  );
}

// useHeaderHeight throws outside a navigator (e.g. auth screens without a header).
function useSafeHeaderHeight() {
  try {
    return useHeaderHeight();
  } catch {
    return 0;
  }
}
