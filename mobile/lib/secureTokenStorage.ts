// Mobile token store backed by the device keychain/keystore via expo-secure-store.
// Implements the TokenStorage shape consumed by @talkingbook/shared's configureApi.
import * as SecureStore from 'expo-secure-store';

const TOKEN_KEY = 'auth_token';

export const secureTokenStorage = {
  getToken: async (): Promise<string | null> => {
    try {
      return await SecureStore.getItemAsync(TOKEN_KEY);
    } catch (error) {
      console.error('SecureStore getToken error:', error);
      return null;
    }
  },
  setToken: async (token: string): Promise<void> => {
    try {
      await SecureStore.setItemAsync(TOKEN_KEY, token);
    } catch (error) {
      console.error('SecureStore setToken error:', error);
    }
  },
  clearToken: async (): Promise<void> => {
    try {
      await SecureStore.deleteItemAsync(TOKEN_KEY);
    } catch (error) {
      console.error('SecureStore clearToken error:', error);
    }
  },
};
