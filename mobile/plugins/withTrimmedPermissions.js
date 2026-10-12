// Strips Android permissions that libraries merge in but the app never uses, so
// store reviewers don't flag them (the Solana dApp Store rejected a build for
// "unnecessary permissions"). Each is removed from the merged manifest with
// tools:node="remove".
//
// - SYSTEM_ALERT_WINDOW: React Native's dev overlay, not needed in release.
// - READ/WRITE_EXTERNAL_STORAGE: the profile photo uses the system photo picker
//   (launchImageLibraryAsync), which needs no storage permission.
// - USE_BIOMETRIC/USE_FINGERPRINT: expo-secure-store adds them for
//   requireAuthentication, which we don't use.
//
// The Seeker build (EXPO_PUBLIC_BILLING_MODE=dappstore) also drops Play
// Billing's permissions: it has no Play Billing (see lib/billingMode.ts).
const { AndroidConfig } = require('expo/config-plugins');

const ALWAYS = [
  'android.permission.SYSTEM_ALERT_WINDOW',
  'android.permission.READ_EXTERNAL_STORAGE',
  'android.permission.WRITE_EXTERNAL_STORAGE',
  'android.permission.USE_BIOMETRIC',
  'android.permission.USE_FINGERPRINT',
];

const SEEKER_ONLY = [
  'com.android.vending.BILLING',
  'com.google.android.finsky.permission.BIND_GET_INSTALL_REFERRER_SERVICE',
];

module.exports = function withTrimmedPermissions(config) {
  const seeker = process.env.EXPO_PUBLIC_BILLING_MODE === 'dappstore';
  return AndroidConfig.Permissions.withBlockedPermissions(config, seeker ? [...ALWAYS, ...SEEKER_ONLY] : ALWAYS);
};
