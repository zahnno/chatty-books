import { useState } from 'react';
import { Alert, View } from 'react-native';
import { Link, useRouter } from 'expo-router';
import { useAuth } from '@talkingbook/shared';
import { registerWithEmail } from '../../lib/auth';
import { Button, Field, ScreenTitle, AuthScreen, Txt } from '../../components/ui';
import { useTheme } from '../../lib/useTheme';
import { LegalNote } from '../../components/LegalNote';

export default function Register() {
  const theme = useTheme();
  const router = useRouter();
  const { authenticate } = useAuth();
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const onRegister = async () => {
    if (!username || !email || !password) {
      Alert.alert('Missing info', 'Fill in all fields.');
      return;
    }
    setLoading(true);
    try {
      const data = await registerWithEmail(username.trim(), email.trim(), password);
      if (data?.token) {
        await authenticate();
      } else {
        Alert.alert(
          'Verify your email',
          'We sent a verification link to your email. Verify, then log in.'
        );
        router.replace('/(auth)/login');
      }
    } catch (err: any) {
      Alert.alert('Sign up failed', err?.message || 'Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthScreen>
      <ScreenTitle subtitle="Read, listen to, and talk with the characters in your books.">
        Create your account
      </ScreenTitle>

      <Field label="Username" value={username} onChangeText={setUsername} placeholder="yourname" />
      <Field
        label="Email"
        value={email}
        onChangeText={setEmail}
        keyboardType="email-address"
        textContentType="emailAddress"
        placeholder="you@example.com"
      />
      <Field
        label="Password"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        textContentType="newPassword"
        placeholder="••••••••"
      />

      <Button title="Sign up" onPress={onRegister} loading={loading} />
      <LegalNote action="signing up" />

      <View style={{ marginTop: 28, alignItems: 'center' }}>
        <Link href="/(auth)/login">
          <Txt variant="body" color={theme.textSecondary}>
            Already a reader? <Txt variant="bodyStrong" color={theme.accent}>Log in</Txt>
          </Txt>
        </Link>
      </View>
    </AuthScreen>
  );
}
