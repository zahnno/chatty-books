// Seeker build only: the Seeker Genesis Token bonus, claimed through an in-app
// modal. SeekerBonusProvider offers it once after sign-in when the linked
// wallet holds an unclaimed SGT (until the reader claims or picks "Maybe
// later"), and useSeekerBonus().open() shows it on demand, e.g. from the
// Seeker perk card. Claiming plays a success animation: the medallion pops,
// sparks burst in Solana colours and the token count ticks up.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Animated, Easing, Modal, Pressable, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth, useToken } from '@talkingbook/shared';
import { Button, Txt } from './ui';
import { IS_SEEKER } from '../lib/billingMode';
import { checkSeekerBonus, claimSeekerBonus, type BonusEligibility } from '../lib/solana';
import { fonts, radii } from '../lib/theme';
import { useTheme } from '../lib/useTheme';

const SOLANA_GREEN = '#14F195';
const SOLANA_PURPLE = '#9945FF';
const DISMISSED_KEY = 'seekerBonusOfferDismissed';

const REASON_MESSAGES: Record<string, string> = {
  no_wallet: 'Connect your Solana wallet to claim the Seeker bonus.',
  already_claimed: 'You have already claimed your Seeker bonus.',
  no_sgt: 'No Seeker Genesis Token was found in this wallet. The bonus is for Seeker phone owners.',
  sgt_used: 'The bonus for this Seeker has already been claimed on another account.',
};

type Phase = 'checking' | 'offer' | 'claiming' | 'success' | 'error';

const SeekerBonusContext = createContext<{ open: () => void }>({ open: () => {} });

export const useSeekerBonus = () => useContext(SeekerBonusContext);

export function SeekerBonusProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [visible, setVisible] = useState(false);
  const [phase, setPhase] = useState<Phase>('checking');
  const [tokens, setTokens] = useState(0);
  const [message, setMessage] = useState('');

  const show = useCallback((eligibility: BonusEligibility) => {
    setTokens(eligibility.tokens);
    if (eligibility.eligible) {
      setPhase('offer');
    } else {
      setMessage(REASON_MESSAGES[eligibility.reason ?? ''] ?? 'The Seeker bonus is not available.');
      setPhase('error');
    }
    setVisible(true);
  }, []);

  // Offer it once after sign-in, if there's something to claim.
  useEffect(() => {
    if (!IS_SEEKER || !user?._id) return;
    let cancelled = false;
    (async () => {
      const dismissed = await AsyncStorage.getItem(DISMISSED_KEY).catch(() => null);
      if (dismissed === user._id) return;
      const eligibility = await checkSeekerBonus().catch(() => null);
      if (!cancelled && eligibility?.eligible) show(eligibility);
    })();
    return () => {
      cancelled = true;
    };
  }, [user?._id]);

  const open = useCallback(() => {
    setPhase('checking');
    setVisible(true);
    checkSeekerBonus()
      .then(show)
      .catch((err) => {
        setMessage(err?.message || 'Could not check for a Seeker Genesis Token.');
        setPhase('error');
      });
  }, [show]);

  const close = useCallback(() => {
    if (phase === 'offer' && user?._id) AsyncStorage.setItem(DISMISSED_KEY, user._id).catch(() => {});
    setVisible(false);
  }, [phase, user?._id]);

  const value = useMemo(() => ({ open }), [open]);

  return (
    <SeekerBonusContext.Provider value={value}>
      {children}
      {IS_SEEKER && (
        <SeekerBonusModal
          visible={visible}
          phase={phase}
          tokens={tokens}
          message={message}
          setPhase={setPhase}
          setMessage={setMessage}
          onClose={close}
        />
      )}
    </SeekerBonusContext.Provider>
  );
}

function SeekerBonusModal({
  visible,
  phase,
  tokens,
  message,
  setPhase,
  setMessage,
  onClose,
}: {
  visible: boolean;
  phase: Phase;
  tokens: number;
  message: string;
  setPhase: (p: Phase) => void;
  setMessage: (m: string) => void;
  onClose: () => void;
}) {
  const theme = useTheme();
  const queryClient = useQueryClient();
  const { fetchTokenBalance } = useToken();

  // Card entrance.
  const enter = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!visible) return;
    enter.setValue(0);
    Animated.spring(enter, { toValue: 1, friction: 7, tension: 70, useNativeDriver: true }).start();
  }, [visible]);

  const claim = async () => {
    setPhase('claiming');
    try {
      await claimSeekerBonus();
      setPhase('success');
      queryClient.invalidateQueries({ queryKey: ['walletStatus'] });
      queryClient.invalidateQueries({ queryKey: ['subscriptionDetails'] });
      fetchTokenBalance();
    } catch (err: any) {
      setMessage(err?.reason ? REASON_MESSAGES[err.reason] ?? err.message : err?.message || 'Please try again.');
      setPhase('error');
    }
  };

  const amount = tokens.toLocaleString();

  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <Animated.View
          style={[
            styles.card,
            { backgroundColor: theme.background, borderColor: theme.separator },
            {
              opacity: enter,
              transform: [{ scale: enter.interpolate({ inputRange: [0, 1], outputRange: [0.9, 1] }) }],
            },
          ]}
        >
          {phase === 'success' ? (
            <Success tokens={tokens} onDone={onClose} />
          ) : (
            <>
              <Medallion pulsing={phase !== 'error'} icon={phase === 'error' ? 'alert' : 'sparkles'} />
              {phase === 'error' ? (
                <>
                  <Txt variant="title" style={styles.center}>
                    No bonus this time
                  </Txt>
                  <Txt variant="subhead" style={[styles.center, { marginTop: 8 }]}>
                    {message}
                  </Txt>
                  <Button title="Close" variant="outline" style={styles.fullWidth} onPress={onClose} />
                </>
              ) : (
                <>
                  <Txt variant="caption" color={SOLANA_PURPLE} style={styles.eyebrow}>
                    SEEKER GENESIS TOKEN
                  </Txt>
                  <Txt variant="largeTitle" style={styles.center}>
                    You're a Seeker
                  </Txt>
                  <Txt variant="body" color={theme.textSecondary} style={[styles.center, { marginTop: 10 }]}>
                    {phase === 'checking'
                      ? 'Checking your wallet for a Genesis Token…'
                      : `Your Genesis Token unlocks a one-time gift of ${amount} tokens for talking with characters and illustrating scenes.`}
                  </Txt>
                  <Button
                    title={`Claim ${amount} tokens`}
                    icon="gift"
                    loading={phase === 'claiming' || phase === 'checking'}
                    style={[styles.fullWidth, { marginTop: 24 }]}
                    onPress={claim}
                  />
                  <Pressable onPress={onClose} accessibilityRole="button" style={{ padding: 12, marginTop: 4 }}>
                    <Txt variant="bodyStrong" color={theme.textSecondary}>
                      Maybe later
                    </Txt>
                  </Pressable>
                </>
              )}
            </>
          )}
        </Animated.View>
      </View>
    </Modal>
  );
}

/** The round badge: Seeker mark in Solana-coloured rings, gently pulsing. */
function Medallion({ pulsing, icon, size = 96 }: { pulsing: boolean; icon: keyof typeof Ionicons.glyphMap; size?: number }) {
  const theme = useTheme();
  const pulse = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!pulsing) return;
    const loop = Animated.loop(
      Animated.timing(pulse, { toValue: 1, duration: 1800, easing: Easing.out(Easing.quad), useNativeDriver: true }),
    );
    loop.start();
    return () => loop.stop();
  }, [pulsing]);

  return (
    <View style={{ width: size * 1.6, height: size * 1.6, alignItems: 'center', justifyContent: 'center', marginBottom: 12 }}>
      {pulsing && (
        <Animated.View
          style={[
            styles.ring,
            {
              width: size,
              height: size,
              borderRadius: size / 2,
              borderColor: SOLANA_GREEN,
              opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.7, 0] }),
              transform: [{ scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.55] }) }],
            },
          ]}
        />
      )}
      <View
        style={{
          width: size,
          height: size,
          borderRadius: size / 2,
          borderWidth: 3,
          borderColor: SOLANA_PURPLE,
          padding: 4,
        }}
      >
        <View
          style={{
            flex: 1,
            borderRadius: size,
            borderWidth: 2,
            borderColor: SOLANA_GREEN,
            backgroundColor: theme.ink,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Ionicons name={icon} size={size * 0.42} color={theme.onInk} />
        </View>
      </View>
    </View>
  );
}

const SPARKS = Array.from({ length: 22 }, (_, i) => {
  const angle = (i / 22) * Math.PI * 2 + (i % 2 ? 0.12 : -0.12);
  const distance = 95 + ((i * 37) % 60);
  return {
    x: Math.cos(angle) * distance,
    y: Math.sin(angle) * distance,
    color: [SOLANA_GREEN, SOLANA_PURPLE, '#A33A2B', '#F5C542'][i % 4],
    glyph: i % 3 === 0 ? '•' : '✦',
    size: 12 + ((i * 7) % 12),
    spin: (i % 2 ? 1 : -1) * (90 + ((i * 29) % 180)),
  };
});

function Success({ tokens, onDone }: { tokens: number; onDone: () => void }) {
  const theme = useTheme();
  const pop = useRef(new Animated.Value(0)).current;
  const burst = useRef(new Animated.Value(0)).current;
  const count = useRef(new Animated.Value(0)).current;
  const text = useRef(new Animated.Value(0)).current;
  const [shown, setShown] = useState(0);

  useEffect(() => {
    const id = count.addListener(({ value }) => setShown(Math.round(value)));
    Animated.sequence([
      Animated.parallel([
        Animated.spring(pop, { toValue: 1, friction: 4, tension: 90, useNativeDriver: true }),
        Animated.timing(burst, { toValue: 1, duration: 1100, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      ]),
    ]).start();
    Animated.timing(text, { toValue: 1, duration: 400, delay: 250, useNativeDriver: true }).start();
    Animated.timing(count, { toValue: tokens, duration: 1300, delay: 300, easing: Easing.out(Easing.cubic), useNativeDriver: false }).start();
    return () => count.removeListener(id);
  }, []);

  const size = 110;
  return (
    <>
      <View style={{ width: 260, height: 220, alignItems: 'center', justifyContent: 'center' }}>
        {SPARKS.map((s, i) => (
          <Animated.Text
            key={i}
            style={{
              position: 'absolute',
              color: s.color,
              fontSize: s.size,
              opacity: burst.interpolate({ inputRange: [0, 0.15, 0.75, 1], outputRange: [0, 1, 1, 0] }),
              transform: [
                { translateX: burst.interpolate({ inputRange: [0, 1], outputRange: [0, s.x] }) },
                { translateY: burst.interpolate({ inputRange: [0, 1], outputRange: [0, s.y] }) },
                { rotate: burst.interpolate({ inputRange: [0, 1], outputRange: ['0deg', `${s.spin}deg`] }) },
                { scale: burst.interpolate({ inputRange: [0, 0.3, 1], outputRange: [0.3, 1.2, 0.8] }) },
              ],
            }}
          >
            {s.glyph}
          </Animated.Text>
        ))}
        <Animated.View
          style={{
            transform: [
              { scale: pop.interpolate({ inputRange: [0, 1], outputRange: [0.3, 1] }) },
              { rotate: pop.interpolate({ inputRange: [0, 1], outputRange: ['-25deg', '0deg'] }) },
            ],
          }}
        >
          <View
            style={{
              width: size,
              height: size,
              borderRadius: size / 2,
              borderWidth: 3,
              borderColor: SOLANA_GREEN,
              padding: 5,
            }}
          >
            <View
              style={{
                flex: 1,
                borderRadius: size,
                backgroundColor: SOLANA_PURPLE,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Ionicons name="checkmark" size={size * 0.5} color="#FFFFFF" />
            </View>
          </View>
        </Animated.View>
      </View>

      <Animated.View
        style={{
          alignItems: 'center',
          opacity: text,
          transform: [{ translateY: text.interpolate({ inputRange: [0, 1], outputRange: [12, 0] }) }],
        }}
      >
        <Txt
          variant="largeTitle"
          color={theme.textPrimary}
          style={{ fontFamily: fonts.display, fontSize: 46, lineHeight: 54 }}
          accessibilityLabel={`${tokens.toLocaleString()} tokens added`}
        >
          +{shown.toLocaleString()}
        </Txt>
        <Txt variant="bodyStrong" color={SOLANA_PURPLE}>
          tokens added to your balance
        </Txt>
        <Txt variant="subhead" style={[styles.center, { marginTop: 10 }]}>
          Welcome, Seeker. Spend them on character chats and scene illustrations.
        </Txt>
      </Animated.View>
      <Button title="Start reading" style={[styles.fullWidth, { marginTop: 24 }]} onPress={onDone} />
    </>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(10,9,8,0.72)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  card: {
    width: '100%',
    maxWidth: 380,
    alignItems: 'center',
    borderRadius: radii.lg,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 24,
    paddingTop: 16,
    paddingBottom: 20,
  },
  ring: { position: 'absolute', borderWidth: 3 },
  eyebrow: { letterSpacing: 1.6, fontWeight: '700', marginBottom: 6 },
  center: { textAlign: 'center' },
  fullWidth: { alignSelf: 'stretch' },
});
