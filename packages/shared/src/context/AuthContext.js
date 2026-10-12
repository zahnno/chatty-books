import React, { createContext, useState, useContext, useEffect } from 'react';
import { authFetch, catchError } from '../apiClient.js';

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const authenticate = async () => {
    setLoading(true);
    const [error, data] = await catchError(authFetch({ path: '/authenticate', method: 'GET' }));
    if (data) {
      setUser(data);
    } else {
      setUser(null);
    }
    setLoading(false);
  };

  useEffect(() => {
    authenticate();
  }, []);

  return (
    <AuthContext.Provider value={{ user, setUser, loading, authenticate }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
