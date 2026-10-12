import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';

// Create a client with optimized caching settings
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Data considered fresh for 5 minutes
      staleTime: 5 * 60 * 1000,
      // Cache data for 10 minutes
      cacheTime: 10 * 60 * 1000,
      // Retry failed requests 3 times
      retry: 3,
      // Refetch on window focus for critical data
      refetchOnWindowFocus: false,
      // Don't refetch on reconnect for performance
      refetchOnReconnect: false,
    },
    mutations: {
      // Retry failed mutations once
      retry: 1,
    },
  },
});

export const QueryProvider = ({ children }) => {
  // Check if dev tools should be enabled
  const showDevTools = 
    process.env.NODE_ENV === 'development' || 
    process.env.REACT_APP_SHOW_PERFORMANCE_TOOLS === 'true';

  return (
    <QueryClientProvider client={queryClient}>
      {children}
      {/* Only show devtools when monitoring is enabled */}
      {showDevTools && (
        <ReactQueryDevtools initialIsOpen={false} />
      )}
    </QueryClientProvider>
  );
};

export { queryClient }; 