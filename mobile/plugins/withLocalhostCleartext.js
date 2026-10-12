// Release Android builds block plain-HTTP requests. The app talks to a local API
// server during device testing (http://localhost:5001 via `adb reverse`, or
// 10.0.2.2 from the emulator), so allow cleartext for those hosts only; every other
// host still requires HTTPS. Debug builds get a permissive copy (debug resources
// override main) so a dev build can still load JS from Metro on a LAN IP.
const fs = require('fs');
const path = require('path');
const { withAndroidManifest, withDangerousMod } = require('expo/config-plugins');

const CONFIG_NAME = 'network_security_config';
const LOCAL_HOSTS = ['localhost', '127.0.0.1', '10.0.2.2'];

const debugXml = `<?xml version="1.0" encoding="utf-8"?>
<network-security-config>
  <base-config cleartextTrafficPermitted="true" />
</network-security-config>
`;

const releaseXml = `<?xml version="1.0" encoding="utf-8"?>
<network-security-config>
  <domain-config cleartextTrafficPermitted="true">
${LOCAL_HOSTS.map((h) => `    <domain includeSubdomains="false">${h}</domain>`).join('\n')}
  </domain-config>
</network-security-config>
`;

module.exports = function withLocalhostCleartext(config) {
  config = withDangerousMod(config, [
    'android',
    async (cfg) => {
      const appDir = path.join(cfg.modRequest.platformProjectRoot, 'app/src');
      for (const [sourceSet, xml] of [['main', releaseXml], ['debug', debugXml]]) {
        const dir = path.join(appDir, sourceSet, 'res/xml');
        fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(path.join(dir, `${CONFIG_NAME}.xml`), xml);
      }
      return cfg;
    },
  ]);
  return withAndroidManifest(config, (cfg) => {
    const app = cfg.modResults.manifest.application[0];
    app.$['android:networkSecurityConfig'] = `@xml/${CONFIG_NAME}`;
    return cfg;
  });
};
