import { Platform } from 'react-native';

// Which store bills subscriptions in this build.
//
// iOS always uses the App Store. Android uses Google Play, except the Solana
// dApp Store (Seeker) build, which sets EXPO_PUBLIC_BILLING_MODE=dappstore in
// eas.json: it has no Play Billing, so subscriptions stay on the web. An unset
// mode falls toward Play on purpose: a Play build must never lose store billing
// because a variable was missed. Web builds use the website's Stripe flow.
export type StoreProvider = 'apple' | 'play';

const DAPP_STORE = process.env.EXPO_PUBLIC_BILLING_MODE === 'dappstore';

// The Seeker build: Solana wallet sign-in, crypto plan passes and the Seeker
// Genesis Token bonus (lib/solana.ts). Never in store builds — Apple and Play
// don't allow crypto payment for digital goods.
export const IS_SEEKER = Platform.OS === 'android' && DAPP_STORE;

export const STORE_PROVIDER: StoreProvider | null =
  Platform.OS === 'ios' ? 'apple' : Platform.OS === 'android' && !DAPP_STORE ? 'play' : null;
