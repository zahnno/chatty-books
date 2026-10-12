import { Redirect } from 'expo-router';

// The auth gate in _layout redirects unauthenticated users to login.
export default function Index() {
  return <Redirect href="/(tabs)" />;
}
