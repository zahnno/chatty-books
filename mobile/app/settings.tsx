import { Linking, Pressable, ScrollView, View } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import Constants from 'expo-constants';
import { useQuery, useQueryClient } from '@tanstack/react-query';
// @ts-ignore - shared package is plain JS without type declarations
import { useAuth, thumbUrl } from '@talkingbook/shared';
import { logout } from '../lib/auth';
import { fetchSubscriptionDetails, PRIVACY_URL, TERMS_URL, WEB_BILLING_URL } from '../lib/subscription';
import { IS_SEEKER, STORE_PROVIDER } from '../lib/billingMode';
import { WalletRow } from '../components/SeekerWallet';
import { Button, IconButton, Initials, Row, Screen, Section, Txt } from '../components/ui';
import { useTheme } from '../lib/useTheme';
import { useAppearancePref, type AppearancePref } from '../lib/appearance';
import { FONT_SIZES, useReadingPrefs } from '../lib/readingPrefs';
import { readingThemes, type ReadingThemeKey } from '../lib/theme';
import { capitalize } from '../lib/profile';
import { useOpenSignIn } from '../components/SignIn';

const APPEARANCE_OPTIONS: { value: AppearancePref; label: string }[] = [
  { value: 'system', label: 'Match device' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
];

export default function Settings() {
  const theme = useTheme();
  const router = useRouter();
  const [appearance, setAppearance] = useAppearancePref();
  const [reading, setReading] = useReadingPrefs();
  const queryClient = useQueryClient();
  const openSignIn = useOpenSignIn();
  const { user, authenticate } = useAuth();
  // Same query key as the Subscription screen, so both share one cached request.
  const { data: details } = useQuery({
    queryKey: ['subscriptionDetails'],
    queryFn: fetchSubscriptionDetails,
    staleTime: 60 * 1000,
    enabled: !!user,
  });

  // Signed out, the app carries on as a guest: drop the account's cached data and go home.
  const onLogout = async () => {
    await logout();
    queryClient.clear();
    await authenticate();
    if (router.canDismiss()) router.dismissAll();
  };

  const displayName: string = user?.username || user?.email?.split('@')[0] || 'Reader';
  const chevron = <Ionicons name="chevron-forward" size={16} color={theme.textMuted} />;
  const sub = details?.subscription;
  const paidThrough = sub?.provider === 'solana' ? sub.solana?.paidUntil : null;
  const renewal = paidThrough
    ? `Prepaid through ${new Date(paidThrough).toLocaleDateString()}`
    : sub?.endDate
      ? `${sub.status === 'active' && sub.autoRenew !== false ? 'Renews' : 'Ends'} ${new Date(sub.endDate).toLocaleDateString()}`
      : null;
  const tags: string[] = [...(user?.characteristics || []), ...(user?.moods || [])];
  const stepFont = (d: number) =>
    setReading({
      fontSize: Math.max(FONT_SIZES.min, Math.min(FONT_SIZES.max, reading.fontSize + d * FONT_SIZES.step)),
    });

  return (
    <Screen>
      <ScrollView showsVerticalScrollIndicator={false} showsHorizontalScrollIndicator={false} contentContainerStyle={{ padding: 16, gap: 32, paddingBottom: 48 }}>
        {/* Guests get the reading settings; account sections appear once signed in. */}
        {!user ? (
          <View style={{ gap: 12 }}>
            <Txt variant="title">Your account</Txt>
            <Txt variant="subhead">
              Reading and listening are free without an account. Sign in to chat with characters, save books to your
              library and pick up where you left off on any device.
            </Txt>
            <View>
              <Button title="Create account" onPress={() => openSignIn('register')} />
              <Button title="Log in" variant="ghost" onPress={() => openSignIn('login')} />
            </View>
          </View>
        ) : (
          <>
            <Pressable
              onPress={() => router.push('/edit-profile')}
              accessibilityRole="button"
              accessibilityLabel="Edit profile"
              style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}
            >
              {user?.profileImage ? (
                <Image
                  source={{ uri: thumbUrl(user.profileImage, 56) }}
                  style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: theme.surfaceStrong }}
                />
              ) : (
                <Initials name={displayName} size={56} />
              )}
              <View style={{ flex: 1 }}>
                <Txt variant="title">{displayName}</Txt>
                {!!user?.email && <Txt variant="subhead">{user.email}</Txt>}
              </View>
            </Pressable>

            <Section title="Profile">
              <View>
                <Row onPress={() => router.push('/edit-profile')} last>
                  <View style={{ flex: 1, gap: 2 }}>
                    <Txt variant="body">Edit profile</Txt>
                    <Txt variant="subhead" numberOfLines={2}>
                      {user?.description ||
                        (tags.length
                          ? tags.map(capitalize).join(' · ')
                          : 'Tell characters about yourself so chats feel personal')}
                    </Txt>
                  </View>
                  {chevron}
                </Row>
              </View>
            </Section>

            <Section title="Account">
              <View>
                <Row onPress={() => router.push('/subscription')}>
                  <Txt variant="body" style={{ flex: 1 }}>
                    Tokens
                  </Txt>
                  <Txt variant="body" color={theme.textSecondary}>
                    {details?.tokenBalance != null ? details.tokenBalance.toLocaleString() : '—'}
                  </Txt>
                  {chevron}
                </Row>
                <Row onPress={() => router.push('/subscription')} last={!!STORE_PROVIDER}>
                  <View style={{ flex: 1, gap: 2 }}>
                    <Txt variant="body">Plan</Txt>
                    {!!renewal && <Txt variant="subhead">{renewal}</Txt>}
                  </View>
                  <Txt variant="body" color={theme.textSecondary}>
                    {sub?.plan?.name ?? 'Free'}
                  </Txt>
                  {chevron}
                </Row>
                {/* Store builds bill in-app; pointing to web purchasing breaks store rules. */}
                {!STORE_PROVIDER && (
                  <Row onPress={() => Linking.openURL(WEB_BILLING_URL)} last={!IS_SEEKER}>
                    <Txt variant="body" style={{ flex: 1 }}>
                      Manage billing on the web
                    </Txt>
                    <Ionicons name="open-outline" size={16} color={theme.textMuted} />
                  </Row>
                )}
                <WalletRow last={!IS_SEEKER} />
                {IS_SEEKER && (
                  <Row onPress={() => router.push('/publish')} last>
                    <View style={{ flex: 1, gap: 2 }}>
                      <Txt variant="body">Publish on Solana</Txt>
                      <Txt variant="subhead">Mint your book and earn when readers chat with its characters</Txt>
                    </View>
                    {chevron}
                  </Row>
                )}
              </View>
            </Section>
          </>
        )}

        <Section title="Appearance">
          <View>
            {APPEARANCE_OPTIONS.map((o, i) => {
              const selected = appearance === o.value;
              return (
                <Row
                  key={o.value}
                  onPress={() => setAppearance(o.value)}
                  last={i === APPEARANCE_OPTIONS.length - 1}
                  accessibilityLabel={`${o.label} appearance${selected ? ', selected' : ''}`}
                >
                  <Txt variant="body" style={{ flex: 1 }}>
                    {o.label}
                  </Txt>
                  {selected && <Ionicons name="checkmark" size={18} color={theme.accent} />}
                </Row>
              );
            })}
          </View>
        </Section>

        <Section title="Reading">
          <View>
            {(Object.keys(readingThemes) as ReadingThemeKey[]).map((k) => {
              const t = readingThemes[k];
              const selected = reading.theme === k;
              return (
                <Row
                  key={k}
                  onPress={() => setReading({ theme: k })}
                  accessibilityLabel={`${t.name} reading theme${selected ? ', selected' : ''}`}
                >
                  <View
                    style={{
                      width: 22,
                      height: 22,
                      borderRadius: 11,
                      backgroundColor: t.background,
                      borderWidth: 1,
                      borderColor: theme.separator,
                    }}
                  />
                  <Txt variant="body" style={{ flex: 1 }}>
                    {t.name}
                  </Txt>
                  {selected && <Ionicons name="checkmark" size={18} color={theme.accent} />}
                </Row>
              );
            })}
            <Row last>
              <Txt variant="body" style={{ flex: 1 }}>
                Text size
              </Txt>
              <IconButton
                icon="remove"
                label="Smaller text"
                size={20}
                onPress={() => stepFont(-1)}
                disabled={reading.fontSize <= FONT_SIZES.min}
              />
              <Txt variant="body" color={theme.textSecondary} style={{ minWidth: 44, textAlign: 'center' }}>
                {reading.fontSize} pt
              </Txt>
              <IconButton
                icon="add"
                label="Larger text"
                size={20}
                onPress={() => stepFont(1)}
                disabled={reading.fontSize >= FONT_SIZES.max}
              />
            </Row>
          </View>
        </Section>

        <Section title="Privacy & safety">
          <View>
            {!!user && (
              <Row onPress={() => router.push('/blocked-users')}>
                <Txt variant="body" style={{ flex: 1 }}>
                  Blocked readers
                </Txt>
                {chevron}
              </Row>
            )}
            <Row onPress={() => Linking.openURL(PRIVACY_URL)}>
              <Txt variant="body" style={{ flex: 1 }}>
                Privacy policy
              </Txt>
              <Ionicons name="open-outline" size={16} color={theme.textMuted} />
            </Row>
            <Row onPress={() => Linking.openURL(TERMS_URL)} last>
              <Txt variant="body" style={{ flex: 1 }}>
                Terms of use
              </Txt>
              <Ionicons name="open-outline" size={16} color={theme.textMuted} />
            </Row>
          </View>
        </Section>

        <Section title="About">
          <Row last>
            <Txt variant="body" style={{ flex: 1 }}>
              Version
            </Txt>
            <Txt variant="body" color={theme.textSecondary}>
              {Constants.expoConfig?.version ?? '—'}
            </Txt>
          </Row>
        </Section>

        {!!user && (
          <View>
            <Button title="Log out" variant="outline" onPress={onLogout} />
            <Button title="Delete account" variant="ghost" onPress={() => router.push('/delete-account')} />
          </View>
        )}
      </ScrollView>
    </Screen>
  );
}
