// Xcode 26's clang rejects fmt 11.0.2's consteval format strings (pulled in by
// React Native 0.79), failing Release/Archive builds with "Call to consteval
// function ... is not a constant expression". Patch fmt's base.h during
// `pod install` so FMT_USE_CONSTEVAL is always 0; this covers every pod that
// includes fmt, whatever C++ standard it compiles with.
const { withPodfile } = require('expo/config-plugins');

const MARKER = '# withFmtCxx17';
const SNIPPET = `
    ${MARKER}
    fmt_base = File.join(installer.sandbox.root, 'fmt', 'include', 'fmt', 'base.h')
    if File.exist?(fmt_base)
      contents = File.read(fmt_base)
      patched = contents.gsub('#  define FMT_USE_CONSTEVAL 1', '#  define FMT_USE_CONSTEVAL 0')
      if patched != contents
        File.chmod(0644, fmt_base)
        File.write(fmt_base, patched)
      end
    end
`;

module.exports = function withFmtCxx17(config) {
  return withPodfile(config, (cfg) => {
    const podfile = cfg.modResults.contents;
    if (!podfile.includes(MARKER)) {
      cfg.modResults.contents = podfile.replace(
        /(react_native_post_install\([\s\S]*?\n    \)\n)/,
        `$1${SNIPPET}`
      );
    }
    return cfg;
  });
};
