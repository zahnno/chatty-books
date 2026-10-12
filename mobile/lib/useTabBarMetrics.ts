import { Platform, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

// @react-navigation/bottom-tabs sizes the bar at a fixed 49dp (UIKit) + the bottom inset.
// On Android that clips: One UI ships a larger default font scale, so the labels overflow
// 49dp, and with gesture hints off the bottom inset is 0, so the labels sit on the
// rounded screen corner. Use Material's 56dp, grow it with the font scale, and keep a
// minimum bottom gap.
const BASE_HEIGHT = Platform.OS === 'android' ? 56 : 49;
const LABEL_LINE = 12;
const MIN_ANDROID_BOTTOM = 8;

export function useTabBarMetrics() {
  const insets = useSafeAreaInsets();
  const { fontScale } = useWindowDimensions();
  const paddingBottom =
    Platform.OS === 'android' ? Math.max(insets.bottom, MIN_ANDROID_BOTTOM) : insets.bottom;
  const content = Math.round(BASE_HEIGHT + Math.max(0, fontScale - 1) * LABEL_LINE);
  // `height` includes the bottom padding, matching how bottom-tabs measures it.
  return { height: content + paddingBottom, paddingBottom };
}
