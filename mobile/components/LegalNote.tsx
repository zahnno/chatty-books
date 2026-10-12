import { Linking } from 'react-native';
import { Txt } from './ui';
import { useTheme } from '../lib/useTheme';
import { PRIVACY_URL, TERMS_URL } from '../lib/subscription';

// Shown wherever an account can be created (email sign-up, Google sign-in). App
// Store 1.2 requires users to agree to terms with community rules before posting.
export function LegalNote({ action = 'continuing' }: { action?: string }) {
  const theme = useTheme();
  const link = (label: string, url: string) => (
    <Txt variant="caption" color={theme.accent} onPress={() => Linking.openURL(url)} accessibilityRole="link">
      {label}
    </Txt>
  );
  return (
    <Txt variant="caption" style={{ textAlign: 'center', marginTop: 12 }}>
      By {action}, you agree to our {link('Terms of Service', TERMS_URL)} and {link('Privacy Policy', PRIVACY_URL)},
      including our community rules.
    </Txt>
  );
}
