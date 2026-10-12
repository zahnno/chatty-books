# @talkingbook/shared

Platform-agnostic core shared by the web client (`/client`) and the Expo mobile app
(`/mobile`). No DOM or React Native APIs live here — only logic that runs on both.

## Contents

- `src/apiClient.js` — `authFetch`, `catchError`, and a `configureApi({ serverUri, tokenStorage })`
  hook. Token storage and the server base URL are **injected per platform** at startup so
  the same fetch logic works against a cookie store (web) or SecureStore (mobile).
- `src/context/AuthContext.js` — `AuthProvider` / `useAuth`.
- `src/context/TokenContext.js` — `TokenProvider` / `useToken`.

`react` and `@tanstack/react-query` are **peer dependencies** — supplied by the consuming
app so there is only ever one copy of each.

## How each platform wires it

**Web** (`client/src/apiBootstrap.js`, imported first in `client/src/index.js`):
injects a `universal-cookie` token store + `REACT_APP_SERVER_URI`. The old module paths
(`client/src/utils.js`, `client/src/context/AuthContext.js`, `client/src/context/TokenContext.js`)
are now thin re-export shims, so no component imports changed.

**Mobile** (`/mobile`): injects an `expo-secure-store` token store + its own env URL.

## Monorepo setup

The repo root is an npm workspace (`package.json` → `workspaces`). After cloning:

```bash
npm install          # at the repo root — links @talkingbook/shared into consumers
```

### CRA (web) build notes — see `client/config-overrides.js`
CRA does not transpile `node_modules` and restricts imports to `src/`. The overrides:
1. add the shared package source to the app babel-loader `include` (RegExp, location-independent);
2. remove `ModuleScopePlugin` and alias `react` / `react-dom` / `@tanstack/react-query`
   to the client's single copy (robust to however npm hoists deps).

Verify the web app still builds after changes: `cd client && npm run build`.
