import { useState } from 'react';
import { Alert, View } from 'react-native';
import { Link } from 'expo-router';
import { requestPasswordReset } from '../../lib/auth';
import { Button, Field, ScreenTitle, AuthScreen, Txt } from '../../components/ui';
import { useTheme } from '../../lib/useTheme';

export default function ForgotPassword() {
  const theme = useTheme();
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);

  const onSubmit = async () => {
    if (!email) {
      Alert.alert('Missing info', 'Enter your email.');
      return;
    }
    setLoading(true);
    try {
      await requestPasswordReset(email.trim());
      Alert.alert(
        'Check your email',
        'If an account exists for that address, a reset link is on its way.'
      );
    } catch (err: any) {
      Alert.alert('Request failed', err?.message || 'Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthScreen>
      <ScreenTitle subtitle="Enter your email and we’ll send you a reset link.">
        Forgot your password?
      </ScreenTitle>
      <Field
        label="Email"
        value={email}
        onChangeText={setEmail}
        keyboardType="email-address"
        textContentType="emailAddress"
        placeholder="you@example.com"
      />
      <Button title="Send reset link" onPress={onSubmit} loading={loading} />
      <View style={{ marginTop: 28, alignItems: 'center' }}>
        <Link href="/(auth)/login">
          <Txt variant="bodyStrong" color={theme.accent}>Back to login</Txt>
        </Link>
      </View>
    </AuthScreen>
  );
}
