const webpack = require('webpack');
const path = require('path');

// Matches the @talkingbook/shared package source whether webpack resolves it via the
// real path (packages/shared/src) or through the workspace symlink in node_modules,
// so CRA's app-level babel-loader transpiles its JSX/ESM.
const SHARED_SRC_RE = /[\\/](packages|@talkingbook)[\\/]shared[\\/]src[\\/]/;

module.exports = function override(config) {
    config.ignoreWarnings = [/Failed to parse source map/];

    // Pin the shared package's peer deps to this app's single copy. This keeps the
    // build correct regardless of how `npm install` hoists deps across the monorepo
    // (e.g. if the mobile workspace pins a different React version, preventing a
    // root-level hoist). Aliasing to absolute node_modules paths requires removing
    // CRA's ModuleScopePlugin, which otherwise rejects imports outside src/.
    config.resolve.plugins = (config.resolve.plugins || []).filter(
        (plugin) => plugin.constructor.name !== 'ModuleScopePlugin'
    );
    // Resolve from this directory so it works whether npm installed the package in
    // client/node_modules or hoisted it to the workspace root.
    const pkgDir = (name) =>
        path.dirname(require.resolve(`${name}/package.json`, { paths: [__dirname] }));
    config.resolve.alias = Object.assign({}, config.resolve.alias, {
        react: pkgDir('react'),
        'react-dom': pkgDir('react-dom'),
        '@tanstack/react-query': pkgDir('@tanstack/react-query'),
    });

    // Let the app-level babel-loader also transpile the shared package source.
    const oneOfRule = config.module.rules.find((rule) => Array.isArray(rule.oneOf));
    if (oneOfRule) {
        const babelRule = oneOfRule.oneOf.find(
            (rule) => rule.loader && rule.loader.includes('babel-loader') && rule.include
        );
        if (babelRule) {
            babelRule.include = Array.isArray(babelRule.include)
                ? [...babelRule.include, SHARED_SRC_RE]
                : [babelRule.include, SHARED_SRC_RE];
        }
    }

    const fallback = config.resolve.fallback || {};
    Object.assign(fallback, {
        "crypto": require.resolve("crypto-browserify"),
        "stream": require.resolve("stream-browserify"),
        "assert": require.resolve("assert"),
        "http": require.resolve("stream-http"),
        "https": require.resolve("https-browserify"),
        "os": require.resolve("os-browserify"),
        "url": require.resolve("url"),
        "zlib": require.resolve("browserify-zlib"),
        "path": require.resolve("path-browserify")
    })
    config.resolve.fallback = fallback;
    config.plugins = (config.plugins || []).concat([
        new webpack.ProvidePlugin({
            process: 'process/browser',
            Buffer: ['buffer', 'Buffer']
        })
    ])
    return config;
}