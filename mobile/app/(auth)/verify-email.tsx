import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Link, useLocalSearchParams } from 'expo-router';
import { verifyEmail } from '../../lib/auth';
import { AuthScreen, Loader, ScreenTitle, Txt } from '../../components/ui';
import { useTheme } from '../../lib/useTheme';

// Reached via deep link: talkingbook://verify-email?token=...
export default function VerifyEmail() {
  const theme = useTheme();
  const { token } = useLocalSearchParams<{ token?: string }>();
  const [status, setStatus] = useState<'pending' | 'ok' | 'error'>('pending');
  const [message, setMessage] = useState('Verifying your email…');

  useEffect(() => {
    if (!token) {
      setStatus('error');
      setMessage('This verification link is missing its token.');
      return;
    }
    (async () => {
      try {
        await verifyEmail(token);
        setStatus('ok');
        setMessage('Your email is verified. You can now log in.');
      } catch (err: any) {
        setStatus('error');
        setMessage(err?.message || 'Verification failed or the link expired.');
      }
    })();
  }, [token]);

  return (
    <AuthScreen>
      <View style={{ alignItems: 'center', marginBottom: 20 }}>
        {status === 'pending' ? (
          <Loader size={96} />
        ) : (
          <Ionicons
            name={status === 'ok' ? 'checkmark-circle-outline' : 'alert-circle-outline'}
            size={48}
            color={status === 'ok' ? theme.success : theme.danger}
          />
        )}
      </View>
      <ScreenTitle subtitle={message}>
        {status === 'ok' ? 'You’re verified' : status === 'error' ? 'Link didn’t work' : 'Checking your link'}
      </ScreenTitle>
      <Link href="/(auth)/login">
        <Txt variant="bodyStrong" color={theme.accent}>
          Go to login
        </Txt>
      </Link>
    </AuthScreen>
  );
}
