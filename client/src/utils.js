// Re-export shim. The real implementation now lives in @talkingbook/shared so it
// can be reused by the Expo mobile app. Web-specific configuration (cookie token
// store + server URL) is injected in ./apiBootstrap.js at startup.
export { authFetch, catchError, getToken } from '@talkingbook/shared';
