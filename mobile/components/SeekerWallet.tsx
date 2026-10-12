// Seeker build only: the linked Solana wallet and the Seeker Genesis Token
// bonus. The bonus needs a wallet proven with Sign In With Solana, so claiming
// without one links it first.
import { useState } from 'react';
import { Alert, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button, Row, Section, Txt } from './ui';
import { useSeekerBonus } from './SeekerBonusModal';
import { IS_SEEKER } from '../lib/billingMode';
import {
  fetchSolanaConfig,
  fetchWalletStatus,
  isUserDeclined,
  linkWallet,
  shortAddress,
  unlinkWallet,
  walletErrorMessage,
} from '../lib/solana';
import { useTheme } from '../lib/useTheme';

export function useWalletStatus() {
  return useQuery({ queryKey: ['walletStatus'], queryFn: fetchWalletStatus, enabled: IS_SEEKER, staleTime: 60 * 1000 });
}

export function useSolanaConfig() {
  return useQuery({ queryKey: ['solanaConfig'], queryFn: fetchSolanaConfig, enabled: IS_SEEKER, staleTime: 5 * 60 * 1000 });
}

/** "Seeker perk" section: claim the SGT bonus (linking a wallet if needed). */
export function SeekerBonus() {
  const theme = useTheme();
  const queryClient = useQueryClient();
  const { open: openBonus } = useSeekerBonus();
  const { data: wallet } = useWalletStatus();
  const { data: config } = useSolanaConfig();
  const [busy, setBusy] = useState(false);

  if (!IS_SEEKER || !wallet || !config) return null;
  const tokens = config.seekerBonusTokens.toLocaleString();

  // Links the wallet first if needed, then hands off to the claim modal.
  const claim = async () => {
    setBusy(true);
    try {
      if (!wallet.walletAddress) {
        await linkWallet();
        queryClient.invalidateQueries({ queryKey: ['walletStatus'] });
      }
      openBonus();
    } catch (err: any) {
      if (!isUserDeclined(err)) Alert.alert('Could not connect wallet', walletErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Section title="Seeker perk">
      {wallet.seekerBonus ? (
        <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}>
          <Ionicons name="checkmark-circle" size={18} color={theme.accent} />
          <Txt variant="body" style={{ flex: 1 }}>
            {wallet.seekerBonus.tokens.toLocaleString()} bonus tokens claimed{' '}
            {new Date(wallet.seekerBonus.claimedAt).toLocaleDateString()}
          </Txt>
        </View>
      ) : (
        <View>
          <Txt variant="subhead">
            Own a Seeker? Claim {tokens} bonus tokens with the Seeker Genesis Token in your wallet. One bonus per
            Seeker. Bonus tokens are added to this month's balance.
          </Txt>
          <Button
            title={wallet.walletAddress ? `Claim ${tokens} tokens` : 'Connect wallet to claim'}
            icon="gift-outline"
            variant="outline"
            loading={busy}
            onPress={claim}
          />
        </View>
      )}
    </Section>
  );
}

/** Settings row: the linked wallet, or connect one. */
export function WalletRow({ last }: { last?: boolean }) {
  const theme = useTheme();
  const queryClient = useQueryClient();
  const { data: wallet } = useWalletStatus();
  if (!IS_SEEKER || !wallet) return null;

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['walletStatus'] });

  const connect = async () => {
    try {
      await linkWallet();
    } catch (err: any) {
      if (!isUserDeclined(err)) Alert.alert('Could not connect wallet', walletErrorMessage(err));
    } finally {
      refresh();
    }
  };

  const manage = () => {
    if (!wallet.canUnlink) {
      Alert.alert('Solana wallet', `${wallet.walletAddress}\n\nYou sign in with this wallet.`);
      return;
    }
    Alert.alert('Solana wallet', wallet.walletAddress!, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Disconnect',
        style: 'destructive',
        onPress: async () => {
          try {
            await unlinkWallet();
          } catch (err: any) {
            Alert.alert('Could not disconnect', err?.message || 'Try again in a moment.');
          } finally {
            refresh();
          }
        },
      },
    ]);
  };

  return (
    <Row onPress={wallet.walletAddress ? manage : connect} last={last}>
      <Txt variant="body" style={{ flex: 1 }}>
        Solana wallet
      </Txt>
      <Txt variant="body" color={wallet.walletAddress ? theme.textSecondary : theme.accent}>
        {wallet.walletAddress ? shortAddress(wallet.walletAddress) : 'Connect'}
      </Txt>
    </Row>
  );
}
