import { useState } from 'react';
import { Alert, ScrollView, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
// @ts-ignore - shared package is plain JS without type declarations
import { useAuth } from '@talkingbook/shared';
import { Button, Screen, Txt } from '../components/ui';
import { useTheme } from '../lib/useTheme';
import { logout } from '../lib/auth';
import { deleteAccount } from '../lib/moderation';
import { fetchSubscriptionDetails } from '../lib/subscription';
import { openManageSubscriptions } from '../lib/storeBilling';
import { STORE_PROVIDER } from '../lib/billingMode';

const STORE_NAME = { apple: 'the App Store', play: 'Google Play' } as const;

// Permanent account deletion, required by the App Store and Google Play.
export default function DeleteAccount() {
  const theme = useTheme();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { authenticate } = useAuth();
  const [deleting, setDeleting] = useState(false);
  const { data: details } = useQuery({
    queryKey: ['subscriptionDetails'],
    queryFn: fetchSubscriptionDetails,
    staleTime: 60 * 1000,
  });

  const sub = details?.subscription;
  const paid = sub?.status === 'active' && sub?.plan?.tier !== 'free';
  const storeBilled = paid && (sub?.provider === 'apple' || sub?.provider === 'play') ? sub.provider : null;

  const finish = async (storeProvider: 'apple' | 'play' | null) => {
    await logout();
    queryClient.clear();
    await authenticate(); // clears the user; the app carries on as a guest
    if (router.canDismiss()) router.dismissAll();
    Alert.alert(
      'Account deleted',
      storeProvider
        ? `Your account and data are gone. Your subscription is billed by ${STORE_NAME[storeProvider]}, so cancel it there to stop future charges.`
        : 'Your account and data are gone. Thanks for reading with us.'
    );
  };

  const confirm = () =>
    Alert.alert('Delete your account?', 'This permanently deletes your account and data. It can’t be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          setDeleting(true);
          try {
            const res = await deleteAccount();
            await finish(res?.storeProvider ?? null);
          } catch (err: any) {
            setDeleting(false);
            Alert.alert("Couldn't delete your account", err?.message || 'Please try again.');
          }
        },
      },
    ]);

  return (
    <Screen>
      <ScrollView showsVerticalScrollIndicator={false} showsHorizontalScrollIndicator={false} contentContainerStyle={{ padding: 16, gap: 20, paddingBottom: 48 }}>
        <Txt variant="body">
          Deleting your account permanently removes everything tied to it:
        </Txt>
        <View style={{ gap: 8 }}>
          {[
            'Your profile, email and sign-in',
            'Your library and reading progress',
            'All of your character conversations',
            'Scenes and comments you posted to the gallery',
            'Any remaining tokens',
          ].map((line) => (
            <Txt key={line} variant="body" color={theme.textSecondary}>
              •  {line}
            </Txt>
          ))}
        </View>
        <Txt variant="body">This can’t be undone.</Txt>

        {storeBilled ? (
          <View style={{ gap: 4, padding: 14, borderRadius: 12, backgroundColor: theme.surface }}>
            <Txt variant="bodyStrong">Cancel your subscription first</Txt>
            <Txt variant="subhead">
              Your plan is billed by {STORE_NAME[storeBilled]}. Deleting your account doesn’t cancel it, so cancel it
              there to stop future charges.
            </Txt>
            {storeBilled === STORE_PROVIDER && (
              <Button title="Manage subscription" variant="outline" onPress={() => openManageSubscriptions()} />
            )}
          </View>
        ) : (
          paid &&
          sub?.provider === 'stripe' && (
            <Txt variant="subhead">Your web subscription will be cancelled when your account is deleted.</Txt>
          )
        )}

        <Button title="Delete my account" onPress={confirm} loading={deleting} style={{ backgroundColor: theme.danger }} />
      </ScrollView>
    </Screen>
  );
}
