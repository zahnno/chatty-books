import React, { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { getCacheSize, cleanupExpiredCache } from '../utils/cacheUtils';

const PerformanceMonitor = ({ children }) => {
  const location = useLocation();
  const [metrics, setMetrics] = useState({
    pageLoadTime: 0,
    cacheSize: 0,
    navigationCount: 0,
    errorCount: 0
  });

  // Check if performance monitoring should be enabled
  const isMonitoringEnabled = 
    process.env.NODE_ENV === 'development' || 
    process.env.REACT_APP_SHOW_PERFORMANCE_TOOLS === 'true';

  useEffect(() => {
    if (!isMonitoringEnabled) return;

    const startTime = performance.now();
    
    // Track page navigation
    setMetrics(prev => ({
      ...prev,
      navigationCount: prev.navigationCount + 1,
      cacheSize: getCacheSize()
    }));

    // Measure page load time
    const handleLoad = () => {
      const endTime = performance.now();
      const loadTime = endTime - startTime;
      
      setMetrics(prev => ({
        ...prev,
        pageLoadTime: loadTime
      }));

      // Log performance metrics when monitoring is enabled
      console.group('🚀 Performance Metrics');
      console.log(`Page: ${location.pathname}`);
      console.log(`Load Time: ${loadTime.toFixed(2)}ms`);
      console.log(`Cache Size: ${getCacheSize()} bytes`);
      console.log(`Navigation Count: ${metrics.navigationCount + 1}`);
      console.groupEnd();
    };

    // Track API performance
    const originalFetch = window.fetch;
    window.fetch = async (...args) => {
      const apiStartTime = performance.now();
      try {
        const response = await originalFetch(...args);
        const apiEndTime = performance.now();
        const apiDuration = apiEndTime - apiStartTime;

        // Log slow API calls when monitoring is enabled
        if (apiDuration > 1000 && isMonitoringEnabled) {
          console.warn(`🐌 Slow API call: ${args[0]} took ${apiDuration.toFixed(2)}ms`);
        }

        return response;
      } catch (error) {
        if (isMonitoringEnabled) {
          setMetrics(prev => ({
            ...prev,
            errorCount: prev.errorCount + 1
          }));
        }
        throw error;
      }
    };

    // Monitor memory usage
    if ('memory' in performance && isMonitoringEnabled) {
      const memoryInfo = performance.memory;
      console.log('Memory Usage:', {
        used: `${(memoryInfo.usedJSHeapSize / 1048576).toFixed(2)}MB`,
        total: `${(memoryInfo.totalJSHeapSize / 1048576).toFixed(2)}MB`,
        limit: `${(memoryInfo.jsHeapSizeLimit / 1048576).toFixed(2)}MB`
      });
    }

    handleLoad();

    // Cleanup on unmount
    return () => {
      window.fetch = originalFetch;
    };
  }, [location.pathname]);

  // Periodic cleanup
  useEffect(() => {
    if (!isMonitoringEnabled) return;

    const cleanup = setInterval(() => {
      cleanupExpiredCache();
      setMetrics(prev => ({
        ...prev,
        cacheSize: getCacheSize()
      }));
    }, 5 * 60 * 1000); // Every 5 minutes

    return () => clearInterval(cleanup);
  }, [isMonitoringEnabled]);

  // Monitor React Query cache
  useEffect(() => {
    if (!isMonitoringEnabled) return;

    if (window.__REACT_QUERY_DEVTOOLS__) {
      // React Query DevTools integration
      const queryClient = window.__REACT_QUERY_DEVTOOLS__.queryClient;
      if (queryClient) {
        const cache = queryClient.getQueryCache();
        const queryCount = cache.getAll().length;
        console.log(`📊 React Query cache has ${queryCount} queries`);
      }
    }
  }, [location.pathname, isMonitoringEnabled]);

  return (
    <>
      {children}
      {/* Performance overlay - only show when monitoring is enabled */}
      {isMonitoringEnabled && (
        <PerformanceOverlay metrics={metrics} />
      )}
    </>
  );
};

const PerformanceOverlay = ({ metrics }) => {
  const [isVisible, setIsVisible] = useState(false);

  return (
    <>
      <div 
        style={{
          position: 'fixed',
          top: '10px',
          right: '10px',
          zIndex: 9999,
          backgroundColor: 'rgba(0, 0, 0, 0.8)',
          color: 'white',
          padding: '5px 10px',
          borderRadius: '15px',
          fontSize: '12px',
          cursor: 'pointer',
          opacity: isVisible ? 1 : 0.3,
          transition: 'opacity 0.3s ease'
        }}
        onClick={() => setIsVisible(!isVisible)}
      >
        🚀 {metrics.pageLoadTime.toFixed(0)}ms
      </div>
      
      {isVisible && (
        <div 
          style={{
            position: 'fixed',
            top: '50px',
            right: '10px',
            zIndex: 9999,
            backgroundColor: 'rgba(0, 0, 0, 0.9)',
            color: 'white',
            padding: '10px',
            borderRadius: '8px',
            fontSize: '12px',
            minWidth: '200px',
            fontFamily: 'monospace'
          }}
        >
          <div><strong>Performance Metrics</strong></div>
          <div>Load Time: {metrics.pageLoadTime.toFixed(2)}ms</div>
          <div>Cache Size: {(metrics.cacheSize / 1024).toFixed(1)}KB</div>
          <div>Navigations: {metrics.navigationCount}</div>
          <div>Errors: {metrics.errorCount}</div>
          <div style={{ marginTop: '5px', fontSize: '10px', opacity: 0.7 }}>
            Click to hide
          </div>
        </div>
      )}
    </>
  );
};

// Hook for tracking component render performance
export const useRenderTracking = (componentName) => {
  useEffect(() => {
    const isMonitoringEnabled = 
      process.env.NODE_ENV === 'development' || 
      process.env.REACT_APP_SHOW_PERFORMANCE_TOOLS === 'true';

    if (!isMonitoringEnabled) return;

    const startTime = performance.now();
    return () => {
      const endTime = performance.now();
      const renderTime = endTime - startTime;
      
      if (renderTime > 16) {
        console.warn(`⚠️ ${componentName} render took ${renderTime.toFixed(2)}ms (>16ms)`);
      }
    };
  });
};

// Hook for tracking user interactions
export const useInteractionTracking = () => {
  useEffect(() => {
    const isMonitoringEnabled = 
      process.env.NODE_ENV === 'development' || 
      process.env.REACT_APP_SHOW_PERFORMANCE_TOOLS === 'true';

    if (!isMonitoringEnabled) return;

    const trackInteraction = (event) => {
      console.log(`User interaction: ${event.type} on ${event.target.tagName}`);
    };

    document.addEventListener('click', trackInteraction);
    document.addEventListener('scroll', trackInteraction);
    
    return () => {
      document.removeEventListener('click', trackInteraction);
      document.removeEventListener('scroll', trackInteraction);
    };
  }, []);
};

export default PerformanceMonitor; 