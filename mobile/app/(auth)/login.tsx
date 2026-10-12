import { useState } from 'react';
import { Alert, Image, View, useColorScheme } from 'react-native';
import { Link, useNavigation, useRouter } from 'expo-router';
import { useAuth } from '@talkingbook/shared';
import { loginWithEmail } from '../../lib/auth';
import { useGoogleSignIn } from '../../lib/useGoogleSignIn';
import { IS_SEEKER } from '../../lib/billingMode';
import { isUserDeclined, signInWithWallet, walletErrorMessage } from '../../lib/solana';
import { LegalNote } from '../../components/LegalNote';
import { Button, Field, ScreenTitle, AuthScreen, OrDivider, Txt } from '../../components/ui';
import { useTheme } from '../../lib/useTheme';

export default function Login() {
  const theme = useTheme();
  const scheme = useColorScheme();
  const { authenticate } = useAuth();
  const { promptGoogle, googleAvailable, googleLoading } = useGoogleSignIn();
  const router = useRouter();
  const navigation = useNavigation();
  // Same as the header's close button: back to whatever the guest was doing.
  const keepBrowsing = () => (navigation.canGoBack() ? navigation.goBack() : router.replace('/(tabs)'));
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [walletLoading, setWalletLoading] = useState(false);
  // Seeker leads with the wallet; the email form is one tap away.
  const [showEmail, setShowEmail] = useState(!IS_SEEKER);

  const onLogin = async () => {
    if (!email || !password) {
      Alert.alert('Missing info', 'Enter your email and password.');
      return;
    }
    setLoading(true);
    try {
      await loginWithEmail(email.trim(), password);
      // Refresh the shared auth state; the gate in _layout redirects on success.
      await authenticate();
    } catch (err: any) {
      Alert.alert('Login failed', err?.message || 'Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const onWallet = async () => {
    setWalletLoading(true);
    try {
      await signInWithWallet();
      // SeekerBonusProvider offers the Genesis Token bonus once signed in.
      await authenticate();
    } catch (err: any) {
      if (!isUserDeclined(err)) Alert.alert('Wallet sign-in failed', walletErrorMessage(err));
    } finally {
      setWalletLoading(false);
    }
  };

  const googleButton = googleAvailable && (
    <Button
      icon="logo-google"
      title="Continue with Google"
      variant="outline"
      loading={googleLoading}
      onPress={promptGoogle}
    />
  );
  const legalNote = (googleAvailable || IS_SEEKER) && (
    <LegalNote
      action={
        googleAvailable && IS_SEEKER
          ? 'continuing with Google or a wallet'
          : googleAvailable
            ? 'continuing with Google'
            : 'continuing with a wallet'
      }
    />
  );

  return (
    <AuthScreen>
      <Image
        source={
          scheme === 'dark'
            ? require('../../assets/images/logo-name-dark.png')
            : require('../../assets/images/logo-name-light.png')
        }
        style={{
          // Explicit height: a bundled image's intrinsic size (1920x954)
          // overrides aspectRatio on RN <Image>.
          width: 220,
          height: Math.round((220 * 954) / 1920),
          alignSelf: 'center',
          marginBottom: 48,
          transform: [{ translateY: -20 }],
        }}
        resizeMode="contain"
        accessibilityLabel="Chatty Books"
      />
      <ScreenTitle subtitle="Log in to keep reading.">
        Welcome back
      </ScreenTitle>

      {/* Seeker: the wallet is the way in; email folds away behind a link. */}
      {IS_SEEKER && (
        <>
          <Button icon="wallet-outline" title="Continue with Solana wallet" loading={walletLoading} onPress={onWallet} />
          {googleButton}
          {legalNote}
          {!showEmail && (
            <Txt
              variant="bodyStrong"
              color={theme.accent}
              onPress={() => setShowEmail(true)}
              accessibilityRole="button"
              style={{ textAlign: 'center', marginTop: 28 }}
            >
              Use email instead
            </Txt>
          )}
          {showEmail && <OrDivider label="or use email" />}
        </>
      )}

      {showEmail && (
        <>
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
            textContentType="password"
            placeholder="••••••••"
          />

          <Button title="Log in" variant={IS_SEEKER ? 'outline' : 'primary'} onPress={onLogin} loading={loading} />
        </>
      )}

      {!IS_SEEKER && googleAvailable && <OrDivider />}
      {!IS_SEEKER && googleButton}
      {!IS_SEEKER && legalNote}

      {showEmail && (
        <View style={{ marginTop: 28, gap: 14, alignItems: 'center' }}>
          <Link href="/(auth)/forgot-password">
            <Txt variant="bodyStrong" color={theme.accent}>Forgot password?</Txt>
          </Link>
          <Link href="/(auth)/register">
            <Txt variant="body" color={theme.textSecondary}>
              New here? <Txt variant="bodyStrong" color={theme.accent}>Create an account</Txt>
            </Txt>
          </Link>
        </View>
      )}

      <Txt
        variant="body"
        color={theme.textSecondary}
        onPress={keepBrowsing}
        accessibilityRole="button"
        style={{ textAlign: 'center', marginTop: 28 }}
      >
        Not now, keep browsing
      </Txt>
    </AuthScreen>
  );
}
