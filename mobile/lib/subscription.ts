import { authFetch } from '@talkingbook/shared';

export type Plan = {
  _id: string;
  name: string;
  price?: number;
  tokensPerMonth?: number;
  displayFeatures?: string[];
  tier?: string;
  // In-app product ids; unset = not purchasable in the app.
  appleProductId?: string;
  playProductId?: string;
  playBasePlanId?: string;
};

export type SubscriptionDetails = {
  tokenBalance?: number;
  subscription?: {
    plan?: Plan;
    status?: string;
    endDate?: string;
    autoRenew?: boolean;
    // Who bills it: 'stripe' (web), 'apple', 'play' or 'solana' (a prepaid
    // crypto pass from the Seeker build). Unset on the free plan.
    provider?: 'stripe' | 'apple' | 'play' | 'solana' | null;
    play?: { purchaseToken?: string; productId?: string };
    // Solana passes: how far prepaid periods reach (≥ endDate).
    solana?: { paidUntil?: string };
  };
};

export const fetchSubscriptionDetails = (): Promise<SubscriptionDetails> =>
  authFetch({ path: '/subscription/details', method: 'GET' });

export const fetchPlans = (): Promise<Plan[]> =>
  authFetch({ path: '/subscriptions', method: 'GET', requireAuth: false });

export const WEB_URL = process.env.EXPO_PUBLIC_WEB_URL || 'https://www.chattybooks.com';

// Where users manage billing (the web app). Set EXPO_PUBLIC_WEB_URL in .env.
export const WEB_BILLING_URL = WEB_URL + '/#/settings';
export const TERMS_URL = WEB_URL + '/#/terms';
export const PRIVACY_URL = WEB_URL + '/#/privacy';
