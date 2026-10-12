import { useState } from 'react';
import { Alert, View } from 'react-native';
import { Link, useLocalSearchParams, useRouter } from 'expo-router';
import { resetPassword } from '../../lib/auth';
import { Button, Field, ScreenTitle, AuthScreen, Txt } from '../../components/ui';
import { useTheme } from '../../lib/useTheme';

// Reached via deep link: talkingbook://reset-password?token=... (or the https
// universal link). The token is read from the route params.
export default function ResetPassword() {
  const theme = useTheme();
  const router = useRouter();
  const { token } = useLocalSearchParams<{ token?: string }>();
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const onSubmit = async () => {
    if (!token) {
      Alert.alert('Invalid link', 'This reset link is missing its token.');
      return;
    }
    if (!password) {
      Alert.alert('Missing info', 'Enter a new password.');
      return;
    }
    setLoading(true);
    try {
      await resetPassword(token, password);
      Alert.alert('Password updated', 'You can now log in.');
      router.replace('/(auth)/login');
    } catch (err: any) {
      Alert.alert('Reset failed', err?.message || 'The link may have expired.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthScreen>
      <ScreenTitle subtitle="Choose a new password for your account.">
        Set a new password
      </ScreenTitle>
      <Field
        label="New password"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        textContentType="newPassword"
        placeholder="••••••••"
      />
      <Button title="Update password" onPress={onSubmit} loading={loading} />
      <View style={{ marginTop: 28, alignItems: 'center' }}>
        <Link href="/(auth)/login">
          <Txt variant="bodyStrong" color={theme.accent}>Back to login</Txt>
        </Link>
      </View>
    </AuthScreen>
  );
}
