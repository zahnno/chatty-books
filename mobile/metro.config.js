// Metro config for the Expo app inside the npm-workspaces monorepo.
// Lets Metro watch + transpile the shared workspace package and resolve hoisted
// dependencies from the repo-root node_modules.
const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const projectRoot = __dirname;
const monorepoRoot = path.resolve(projectRoot, '..');

const config = getDefaultConfig(projectRoot);

// 1. Watch the monorepo root so changes in packages/shared are picked up.
config.watchFolders = [...new Set([...config.watchFolders, monorepoRoot])];

// 2. Resolve modules from both the app's and the root's node_modules.
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(monorepoRoot, 'node_modules'),
];

// 3. The web client keeps React 18 at the repo root while the app uses React 19
//    from mobile/node_modules. Pin every React import to the app's copy so
//    hoisted libraries (expo-router, react-query, @talkingbook/shared) don't
//    pull in the web client's React.
const APP_REACT_PACKAGES = ['react', 'react-dom'];
config.resolver.resolveRequest = (context, moduleName, platform) => {
  const pkg = moduleName.startsWith('@') ? moduleName.split('/').slice(0, 2).join('/') : moduleName.split('/')[0];
  if (APP_REACT_PACKAGES.includes(pkg)) {
    return context.resolveRequest(
      { ...context, originModulePath: path.join(projectRoot, 'package.json') },
      moduleName,
      platform
    );
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
