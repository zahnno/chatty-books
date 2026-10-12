// Configures the shared API client for the web platform.
// Imported first in index.js so the token store + server URL are set before any
// authFetch call runs. On web the JWT lives in a `token` cookie (written by the
// login/register flows via universal-cookie), so the adapter reads it from there.
import Cookies from 'universal-cookie';
import { configureApi } from '@talkingbook/shared';
import { SERVER_URI } from './constants.js';

const cookieTokenStorage = {
  getToken: () => {
    try {
      return new Cookies().get('token') || null;
    } catch (error) {
      console.error('Error retrieving token:', error.message);
      return null;
    }
  },
  setToken: (token) => {
    try {
      new Cookies().set('token', token, { path: '/' });
    } catch (error) {
      console.error('Error setting token:', error.message);
    }
  },
  clearToken: () => {
    try {
      new Cookies().remove('token', { path: '/' });
    } catch (error) {
      console.error('Error clearing token:', error.message);
    }
  },
};

configureApi({ serverUri: SERVER_URI, tokenStorage: cookieTokenStorage });
