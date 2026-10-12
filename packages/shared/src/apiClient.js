// Platform-agnostic API client shared by the web client and the Expo mobile app.
//
// The only platform-specific concerns — where the JWT is stored and what the
// server base URL is — are injected once at startup via `configureApi`:
//   - Web injects a `universal-cookie` backed token store + REACT_APP_SERVER_URI.
//   - Mobile injects an `expo-secure-store` backed token store + its own env URL.
//
// `tokenStorage.getToken()` may return a string, null, or a Promise of either
// (SecureStore is async), so it is always awaited.

let config = {
  serverUri: '',
  headers: {},
  tokenStorage: {
    getToken: () => null,
    setToken: () => {},
    clearToken: () => {},
  },
};

/**
 * Configure the shared API client. Call once at app startup per platform.
 * @param {Object} opts
 * @param {string} opts.serverUri      Server base URL (no trailing slash).
 * @param {Object} opts.tokenStorage   { getToken, setToken, clearToken }.
 * @param {Object} [opts.headers]      Extra headers sent with every request.
 */
export const configureApi = ({ serverUri, tokenStorage, headers }) => {
  if (typeof serverUri === 'string') config.serverUri = serverUri;
  if (tokenStorage) config.tokenStorage = tokenStorage;
  if (headers) config.headers = headers;
};

export const getServerUri = () => config.serverUri;

export const getToken = async () => {
  try {
    const token = await config.tokenStorage.getToken();
    return token || null;
  } catch (error) {
    console.error('Error retrieving token:', error.message);
    return null;
  }
};

export const setToken = async (token) => config.tokenStorage.setToken(token);

export const clearToken = async () => config.tokenStorage.clearToken();

/**
 * @param {{ path: string, method?: string, body?: any, requireAuth?: boolean }} options
 */
export const authFetch = async ({ path, method = 'GET', body, requireAuth = true }) => {
  const url = `${config.serverUri}${path}`;
  const token = await getToken();
  let headers = { ...config.headers };

  // Add Authorization header if token exists
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  } else if (requireAuth) {
    throw new Error('Authentication required');
  }

  if ((method === 'POST' || method === 'PUT') && !(body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(body);
  }

  try {
    const response = await fetch(url, {
      method: method,
      body: body,
      headers: headers,
    });

    const contentType = response.headers.get('content-type') || '';
    const isJson = contentType.includes('application/json');

    if (!response.ok) {
      let errorData = {};
      if (isJson) {
        errorData = await response.json().catch(() => ({}));
      } else {
        await response.text(); // consume body
        errorData = { message: response.statusText || 'Request failed' };
      }
      const error = new Error(errorData?.message || 'Unknown Error Occurred');
      // Preserve additional error data for login gate detection
      Object.assign(error, errorData);
      throw error;
    }

    if (!isJson) {
      const text = await response.text();
      console.warn('authFetch: expected JSON, got', text?.slice(0, 100));
      throw new Error('Server returned non-JSON response');
    }
    return await response.json();
  } catch (error) {
    if (error.message.includes('413')) {
      console.error('Payload too large');
    } else {
      console.error('Fetch error:', error);
    }
    throw error;
  }
};

export const catchError = async (promise) => {
  try {
    const data = await promise;
    return [null, data];
  } catch (error) {
    return [error, null];
  }
};
