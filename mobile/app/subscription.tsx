import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Linking, ScrollView, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useToken } from '@talkingbook/shared';
import { Button, Chip, Row, Screen, Section, Txt } from '../components/ui';
import { StateView } from '../components/StateView';
import {
  fetchPlans,
  fetchSubscriptionDetails,
  PRIVACY_URL,
  TERMS_URL,
  WEB_BILLING_URL,
  type Plan,
} from '../lib/subscription';
import { IS_SEEKER, STORE_PROVIDER } from '../lib/billingMode';
import * as storeBilling from '../lib/storeBilling';
import { fetchQuotes, formatAmount, isUserDeclined, payForPlan, walletErrorMessage, type Currency } from '../lib/solana';
import { SeekerBonus, useSolanaConfig } from '../components/SeekerWallet';
import { useTheme } from '../lib/useTheme';

const STORE_NAME = { apple: 'the App Store', play: 'Google Play' } as const;
const STORE_ACCOUNT = { apple: 'Apple ID', play: 'Google Play account' } as const;
const LIVE = ['active', 'past_due'];
// Who bills purchases made in this build: the store, or crypto on Seeker.
const OWN_PROVIDER = STORE_PROVIDER ?? (IS_SEEKER ? 'solana' : null);

export default function Subscription() {
  const theme = useTheme();
  const queryClient = useQueryClient();
  const { fetchTokenBalance } = useToken();
  const { data: details, isLoading, error, refetch } = useQuery({
    queryKey: ['subscriptionDetails'],
    queryFn: fetchSubscriptionDetails,
    staleTime: 60 * 1000,
  });
  const { data: plansData } = useQuery({
    queryKey: ['plans'],
    queryFn: fetchPlans,
    staleTime: 10 * 60 * 1000,
  });
  const plans: Plan[] = Array.isArray(plansData) ? plansData : [];
  const paidPlans = plans.filter((p) => p.tier !== 'free' && storeBilling.productIdFor(p));

  // Localized prices from the store. Apple requires showing the store's price,
  // and a plan the store doesn't return can't be bought.
  const {
    data: offers,
    isLoading: offersLoading,
    error: offersError,
    refetch: refetchOffers,
    isRefetching: offersRefetching,
  } = useQuery({
    queryKey: ['storeOffers', STORE_PROVIDER, paidPlans.map((p) => p._id).join()],
    queryFn: () => storeBilling.getOffers(paidPlans),
    enabled: !!STORE_PROVIDER && paidPlans.length > 0,
    staleTime: 10 * 60 * 1000,
  });
  // The store returned none of our plans (or failed). Say so rather than quietly
  // listing only the free plan, which reads as subscriptions being broken.
  const storeUnavailable =
    !!STORE_PROVIDER &&
    paidPlans.length > 0 &&
    !offersLoading &&
    (!!offersError || !paidPlans.some((p) => offers?.[storeBilling.productIdFor(p) ?? '']));
  useEffect(() => {
    if (storeUnavailable) console.warn('[subscription] store returned no plans', offersError ?? offers);
  }, [storeUnavailable]);

  // Seeker: crypto prices per plan, in the currencies the server takes.
  const { data: solanaConfig } = useSolanaConfig();
  const { data: quotes } = useQuery({
    queryKey: ['solanaQuotes'],
    queryFn: fetchQuotes,
    enabled: IS_SEEKER,
    staleTime: 30 * 1000,
    refetchInterval: 60 * 1000,
  });
  const currencies = solanaConfig?.currencies ?? [];
  const [pickedCurrency, setCurrency] = useState<Currency | null>(null);
  const currency = pickedCurrency && currencies.includes(pickedCurrency) ? pickedCurrency : currencies[0];

  const [buyingPlanId, setBuyingPlanId] = useState<string | null>(null);
  const [restoring, setRestoring] = useState(false);

  if (isLoading) return <StateView variant="loading" />;
  if (error) {
    return <StateView variant="error" message="Couldn't load your subscription." onRetry={() => refetch()} />;
  }

  const sub = details?.subscription;
  const currentPlan = plans.find((p) => p._id === sub?.plan?._id);
  const live = !!sub?.status && LIVE.includes(sub.status);
  const provider = live ? sub?.provider : null;
  // A live subscription billed somewhere else must be changed there, or the
  // user would pay twice.
  const billedElsewhere = !!provider && provider !== OWN_PROVIDER && currentPlan?.tier !== 'free';
  const canBuy = !!OWN_PROVIDER && !billedElsewhere;
  // A live pass can be extended, but not switched to another tier until it ends.
  const passLive = provider === 'solana';

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['subscriptionDetails'] });
    fetchTokenBalance();
  };

  const cryptoQuote = (p: Plan) => (currency ? quotes?.[p._id]?.[currency] : undefined);

  const buyWithCrypto = (plan: Plan) => {
    const q = cryptoQuote(plan);
    if (!q || !currency) return;
    const price = formatAmount(q.amount, q.decimals, currency);
    const extending = passLive && plan._id === currentPlan?._id;
    Alert.alert(
      extending ? `Add 30 days of ${plan.name}?` : `${plan.name} for 30 days`,
      `Pay about ${price} from your wallet. The exact amount is shown in your wallet before you approve. Passes don't renew automatically.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Continue',
          onPress: async () => {
            setBuyingPlanId(plan._id);
            try {
              const result = await payForPlan(plan._id, currency);
              refresh();
              if (result.status === 'confirmed') {
                Alert.alert(
                  result.kind === 'extended' ? 'Pass extended' : 'Pass active',
                  result.kind === 'extended'
                    ? `30 more days of ${plan.name} were added. Your tokens refresh when the next month starts.`
                    : `Your ${plan.name} pass is active and its tokens are in your balance.`,
                );
              } else if (result.status === 'pending') {
                Alert.alert(
                  'Payment sent',
                  `Your ${plan.name} pass starts as soon as the payment confirms on Solana. This usually takes under a minute.`,
                );
              } else {
                Alert.alert('Payment not found', 'The payment did not go through. Nothing was charged.');
              }
            } catch (err: any) {
              if (!isUserDeclined(err)) Alert.alert('Payment not completed', walletErrorMessage(err));
            } finally {
              setBuyingPlanId(null);
            }
          },
        },
      ],
    );
  };

  const buy = async (plan: Plan) => {
    if (IS_SEEKER) return buyWithCrypto(plan);
    const productId = storeBilling.productIdFor(plan);
    const offer = productId ? offers?.[productId] : undefined;
    if (!offer) return;
    const playToken = sub?.play?.purchaseToken;
    const change =
      STORE_PROVIDER === 'play' && provider === 'play' && playToken
        ? { purchaseToken: playToken, isUpgrade: (plan.price ?? 0) > (currentPlan?.price ?? 0) }
        : undefined;
    setBuyingPlanId(plan._id);
    try {
      const result = await storeBilling.purchase(plan, offer, change);
      refresh();
      if (result.status === 'pending') {
        Alert.alert('Payment pending', `Your ${plan.name} plan starts once Google Play confirms the payment.`);
      }
    } catch (err: any) {
      if (!storeBilling.isUserCancelled(err)) {
        Alert.alert(
          'Purchase not completed',
          `${(err?.message || 'Something went wrong').replace(/\.?$/, '.')} If you were charged, the plan activates automatically next time you open the app.`,
        );
      }
    } finally {
      setBuyingPlanId(null);
    }
  };

  const restore = async () => {
    setRestoring(true);
    try {
      const restored = await storeBilling.restore(plans);
      refresh();
      Alert.alert(
        restored ? 'Purchases restored' : 'Nothing to restore',
        restored
          ? 'Your subscription is linked to this account.'
          : `No active subscription was found for this ${STORE_ACCOUNT[STORE_PROVIDER!]}.`,
      );
    } catch (err: any) {
      if (!storeBilling.isUserCancelled(err)) {
        Alert.alert('Restore failed', err?.message || 'Try again in a moment.');
      }
    } finally {
      setRestoring(false);
    }
  };

  const planPrice = (p: Plan) => {
    if (p.tier === 'free' || p.price === 0) return 'Free';
    if (IS_SEEKER) {
      const q = cryptoQuote(p);
      return q && currency ? formatAmount(q.amount, q.decimals, currency) : '';
    }
    if (STORE_PROVIDER) {
      const productId = storeBilling.productIdFor(p);
      const offer = productId ? offers?.[productId] : undefined;
      return offer ? `${offer.price}/mo` : '';
    }
    return typeof p.price === 'number' ? `$${p.price}/mo` : '';
  };

  const statusLine = () => {
    if (!sub) return '';
    if (!sub.endDate) return sub.status === 'active' ? 'Active' : sub.status ?? '—';
    const date = new Date(sub.endDate).toLocaleDateString();
    if (sub.provider === 'solana' && sub.status === 'active') {
      const through = new Date(sub.solana?.paidUntil || sub.endDate).toLocaleDateString();
      return sub.solana?.paidUntil && sub.solana.paidUntil > sub.endDate
        ? `Prepaid through ${through} · tokens refresh ${date}`
        : `Pass · ends ${date}`;
    }
    if (sub.status === 'past_due') return `Payment issue · update it with ${STORE_NAME[sub.provider as 'apple' | 'play'] ?? 'your billing provider'}`;
    if (sub.status !== 'active') return `${sub.status} · expired ${date}`;
    if (sub.autoRenew === false) return `Cancelled · access until ${date}`;
    return `Active · renews ${date}`;
  };

  // Plans offered for purchase in this build, in price order.
  const listed = STORE_PROVIDER
    ? plans.filter((p) => p.tier === 'free' || (offers && offers[storeBilling.productIdFor(p) ?? '']))
    : IS_SEEKER
      ? plans.filter((p) => p.tier === 'free' || quotes?.[p._id])
      : plans;

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ padding: 16, gap: 32, paddingBottom: 48 }}>
        <View style={{ gap: 4 }}>
          <Txt variant="subhead">Token balance</Txt>
          <Txt variant="largeTitle" style={{ fontSize: 44, lineHeight: 52 }}>
            {details?.tokenBalance != null ? details.tokenBalance.toLocaleString() : '—'}
          </Txt>
          <Txt variant="caption">Tokens are spent on character conversations and scene illustrations.</Txt>
        </View>

        <Section title="Your plan">
          {sub?.plan ? (
            <View style={{ gap: 8 }}>
              <Txt variant="title">{sub.plan.name}</Txt>
              <Txt variant="subhead">{statusLine()}</Txt>
              {!!sub.plan.displayFeatures?.length && (
                <View style={{ gap: 4, marginTop: 4 }}>
                  {sub.plan.displayFeatures.map((f) => (
                    <View key={f} style={{ flexDirection: 'row', gap: 10 }}>
                      <Txt variant="body" color={theme.textMuted}>
                        –
                      </Txt>
                      <Txt variant="body" color={theme.textSecondary} style={{ flex: 1 }}>
                        {f}
                      </Txt>
                    </View>
                  ))}
                </View>
              )}
              {billedElsewhere && (
                <Txt variant="caption" style={{ marginTop: 4 }}>
                  {provider === 'stripe'
                    ? 'This plan is billed on chattybooks.com. Change or cancel it there.'
                    : provider === 'solana'
                      ? 'This plan is a prepaid pass from the Seeker app. It ends on its own; choose a new plan here once it does.'
                      : `This plan is billed through ${STORE_NAME[provider as 'apple' | 'play']}. Change or cancel it on the device you subscribed from.`}
                </Txt>
              )}
            </View>
          ) : (
            <Txt variant="subhead">No active plan.</Txt>
          )}
          {!!STORE_PROVIDER && provider === STORE_PROVIDER && (
            <Button
              title="Manage subscription"
              variant="outline"
              style={{ marginTop: 8 }}
              onPress={() => storeBilling.openManageSubscriptions(currentPlan?.playProductId)}
            />
          )}
        </Section>

        {listed.length > 0 && (
          <Section title="Plans">
            {IS_SEEKER && currencies.length > 1 && (
              <View style={{ flexDirection: 'row', gap: 8 }} accessibilityRole="radiogroup">
                {currencies.map((c) => (
                  <Chip key={c} label={c} active={c === currency} onPress={() => setCurrency(c)} />
                ))}
              </View>
            )}
            <View>
              {listed.map((p, i) => {
                const current = p._id === currentPlan?._id && live;
                const purchasable =
                  canBuy &&
                  p.tier !== 'free' &&
                  (IS_SEEKER ? !passLive || current : !current);
                return (
                  <Row
                    key={p._id}
                    last={i === listed.length - 1}
                    onPress={purchasable && !buyingPlanId ? () => buy(p) : undefined}
                    accessibilityLabel={
                      purchasable ? `${IS_SEEKER ? 'Buy a 30-day pass for' : 'Subscribe to'} ${p.name}, ${planPrice(p)}` : undefined
                    }
                  >
                    <View style={{ flex: 1 }}>
                      <Txt variant="bodyStrong">{p.name}</Txt>
                      {typeof p.tokensPerMonth === 'number' && (
                        <Txt variant="caption">
                          {p.tokensPerMonth.toLocaleString()} tokens a month
                          {IS_SEEKER && current && passLive ? ' · tap to add 30 days' : ''}
                        </Txt>
                      )}
                    </View>
                    {buyingPlanId === p._id ? (
                      <ActivityIndicator color={theme.textSecondary} />
                    ) : (
                      <Txt variant="body" color={purchasable ? theme.accent : theme.textSecondary}>
                        {planPrice(p)}
                      </Txt>
                    )}
                    {current && (
                      <Ionicons name="checkmark" size={18} color={theme.accent} accessibilityLabel="Your plan" />
                    )}
                  </Row>
                );
              })}
            </View>
            {!!STORE_PROVIDER && offersLoading && <ActivityIndicator color={theme.textSecondary} />}
            {storeUnavailable && (
              <View style={{ gap: 8 }}>
                <Txt variant="subhead">
                  Plans couldn't be loaded from {STORE_NAME[STORE_PROVIDER!]} right now. Check your connection and try
                  again.
                </Txt>
                <Button
                  title="Try again"
                  variant="outline"
                  loading={offersRefetching}
                  onPress={() => refetchOffers()}
                />
              </View>
            )}
          </Section>
        )}

        <SeekerBonus />

        {STORE_PROVIDER ? (
          <View style={{ gap: 16 }}>
            <Txt variant="caption">
              Subscriptions renew monthly at the price shown until cancelled. Payment is charged to your{' '}
              {STORE_ACCOUNT[STORE_PROVIDER]} at confirmation. Cancel anytime in your {STORE_ACCOUNT[STORE_PROVIDER]}{' '}
              subscription settings at least 24 hours before the renewal date. Your token balance resets to the
              plan's monthly allowance on each renewal.
            </Txt>
            <Button title="Restore purchases" variant="ghost" loading={restoring} onPress={restore} />
            <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 24 }}>
              <Txt variant="caption" color={theme.accent} onPress={() => Linking.openURL(TERMS_URL)} accessibilityRole="link">
                Terms of Use
              </Txt>
              <Txt variant="caption" color={theme.accent} onPress={() => Linking.openURL(PRIVACY_URL)} accessibilityRole="link">
                Privacy Policy
              </Txt>
            </View>
          </View>
        ) : IS_SEEKER ? (
          <View style={{ gap: 16 }}>
            <Txt variant="caption">
              Plans are 30-day passes paid from your Solana wallet in USDC, SOL or SKR, priced from the plan's USD
              price at checkout. Passes don't renew automatically. Buying your current plan again adds 30 days; your
              token balance resets to the plan's monthly allowance at the start of each month. Payments on Solana are
              final.
            </Txt>
            <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 24 }}>
              <Txt variant="caption" color={theme.accent} onPress={() => Linking.openURL(TERMS_URL)} accessibilityRole="link">
                Terms of Use
              </Txt>
              <Txt variant="caption" color={theme.accent} onPress={() => Linking.openURL(PRIVACY_URL)} accessibilityRole="link">
                Privacy Policy
              </Txt>
            </View>
          </View>
        ) : (
          <View>
            <Button title="Change plan on the web" variant="outline" onPress={() => Linking.openURL(WEB_BILLING_URL)} />
            <Txt variant="caption" style={{ textAlign: 'center', marginTop: 10 }}>
              Purchases are managed on chattybooks.com for now.
            </Txt>
          </View>
        )}
      </ScrollView>
    </Screen>
  );
}
