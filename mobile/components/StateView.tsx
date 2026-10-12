import { View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../lib/useTheme';
import { Button, Loader, Txt } from './ui';

// Reusable loading / error / empty state.
export function StateView({
  variant,
  message,
  onRetry,
  icon,
  title,
}: {
  variant: 'loading' | 'error' | 'empty';
  message?: string;
  onRetry?: () => void;
  icon?: keyof typeof Ionicons.glyphMap;
  title?: string;
}) {
  const theme = useTheme();
  return (
    <View
      style={{
        flex: 1,
        backgroundColor: theme.background,
        alignItems: 'center',
        justifyContent: 'center',
        padding: 32,
        gap: 8,
      }}
    >
      {variant === 'loading' ? (
        <Loader size={120} />
      ) : (
        <>
          <Ionicons
            name={icon ?? (variant === 'error' ? 'cloud-offline-outline' : 'book-outline')}
            size={36}
            color={theme.textMuted}
          />
          {!!title && (
            <Txt variant="heading" style={{ marginTop: 8, textAlign: 'center' }}>
              {title}
            </Txt>
          )}
          {!!message && (
            <Txt variant="subhead" style={{ textAlign: 'center', maxWidth: 300 }}>
              {message}
            </Txt>
          )}
          {!!onRetry && (
            <Button title="Try again" variant="outline" onPress={onRetry} style={{ marginTop: 16 }} />
          )}
        </>
      )}
    </View>
  );
}
