// Root postinstall: apply patches/ with patch-package when it's available.
// Server-only installs (e.g. Render) may not have it, and don't need the
// patches anyway (they target mobile packages), so skip instead of failing.
const { execFileSync } = require('child_process');

let bin;
try {
  bin = require.resolve('patch-package/index.js');
} catch {
  console.log('patch-package not installed; skipping patches');
  process.exit(0);
}

// The patched packages install under mobile/node_modules when npm can't hoist
// them (the app's React Native differs from the root), so patch there too.
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const patchDir = path.join(root, 'patches');
for (const dir of [root, path.join(root, 'mobile')]) {
  const patches = fs.readdirSync(patchDir).filter((f) => {
    const pkg = f.replace(/\+[^+]+\.patch$/, '').replace(/\+/g, '/');
    return fs.existsSync(path.join(dir, 'node_modules', pkg, 'package.json'));
  });
  if (!patches.length) continue;
  execFileSync(process.execPath, [bin, '--patch-dir', path.relative(dir, patchDir)], { cwd: dir, stdio: 'inherit' });
}
