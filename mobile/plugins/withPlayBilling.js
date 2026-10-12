// react-native-iap 12.16.4 defaults to Play Billing Library 7, which Google Play
// no longer accepts for app updates. Pin v8 (the module's Kotlin is patched for
// the v8 API in /patches/react-native-iap+12.16.4.patch).
//
// Billing 8 ships Kotlin 2.1 metadata, so react-native-iap (the only module
// compiling against it) skips the metadata version check in case the SDK's
// Kotlin compiler is older. Drop that once the Expo SDK's Kotlin is 2.1+.
//
// The module reads `rootProject.ext.playBillingSdkVersion` first and otherwise
// its OWN gradle.properties (RNIap_playBillingSdkVersion=7.0.0), which shadows
// anything in the app's gradle.properties — so the version has to be set on the
// root project's ext. SDK 53's template has no buildscript.ext block, so it is
// set at the top level of the root build.gradle (evaluated before subprojects).
const { withProjectBuildGradle } = require('expo/config-plugins');

const PLAY_BILLING_VERSION = '8.0.0';
const VERSION_MARKER = '// @generated withPlayBilling: billing version';
const VERSION_BLOCK = `
${VERSION_MARKER}
ext.playBillingSdkVersion = findProperty('playBillingSdkVersion') ?: '${PLAY_BILLING_VERSION}'
`;
const METADATA_MARKER = '// @generated withPlayBilling: kotlin metadata';
const METADATA_BLOCK = `
${METADATA_MARKER}
subprojects { p ->
    if (p.name == 'react-native-iap') {
        p.tasks.withType(org.jetbrains.kotlin.gradle.tasks.KotlinCompile).configureEach {
            kotlinOptions.freeCompilerArgs += ['-Xskip-metadata-version-check']
        }
    }
}
`;

module.exports = function withPlayBilling(config) {
  return withProjectBuildGradle(config, (cfg) => {
    if (!cfg.modResults.contents.includes(VERSION_MARKER)) {
      cfg.modResults.contents += VERSION_BLOCK;
    }
    if (!cfg.modResults.contents.includes(METADATA_MARKER)) {
      cfg.modResults.contents += METADATA_BLOCK;
    }
    return cfg;
  });
};
