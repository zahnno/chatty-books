import React, { createContext, useContext, useState, useCallback } from 'react';
import { authFetch, catchError } from '../apiClient.js';

const TokenContext = createContext();

export function TokenProvider({ children }) {
  const [tokenBalance, setTokenBalance] = useState(null);

  const fetchTokenBalance = useCallback(async () => {
    const [error, data] = await catchError(authFetch({
      path: '/subscription/details',
      method: 'GET',
    }));
    if (data && typeof data.tokenBalance === 'number') {
      setTokenBalance(data.tokenBalance);
    }
  }, []);

  const updateTokenBalance = useCallback((newBalance) => {
    setTokenBalance(newBalance);
  }, []);

  return (
    <TokenContext.Provider value={{ tokenBalance, fetchTokenBalance, updateTokenBalance }}>
      {children}
    </TokenContext.Provider>
  );
}

export function useToken() {
  const context = useContext(TokenContext);
  if (!context) {
    throw new Error('useToken must be used within a TokenProvider');
  }
  return context;
}
