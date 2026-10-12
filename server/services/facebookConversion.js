const axios = require('axios');
const crypto = require('crypto');
const { isAppRequest } = require('./requestContext');

// Meta requires customer data SHA-256 hashed after trimming and lower-casing.
const sha256 = (value) => crypto.createHash('sha256').update(String(value).trim().toLowerCase()).digest('hex');

const sendFacebookEvent = async (eventData) => {
  // Web ad measurement only. The iOS/Android apps declare no tracking (App Store
  // privacy label, Play data safety), so their activity is never sent to Meta.
  if (isAppRequest()) return null;
  try {
    // Log environment variables (masking sensitive data)
    console.log('Facebook API Configuration:', {
      apiVersion: process.env.META_API_VERSION,
      pixelId: process.env.META_PIXEL_ID ? '[REDACTED]' : 'undefined',
      accessToken: process.env.META_ACCESS_TOKEN ? '[REDACTED]' : 'undefined',
      clientUrl: process.env.CLIENT_URL
    });

    const url = `https://graph.facebook.com/${process.env.META_API_VERSION}/${process.env.META_PIXEL_ID}/events?access_token=${process.env.META_ACCESS_TOKEN}`;
    
    // Format the request body according to Facebook's requirements
    const requestBody = {
      data: [{
        ...eventData,
        // Add event_id for deduplication
        event_id: `${eventData.event_name}_${Date.now()}`,
        // Ensure user_data is properly formatted
        user_data: {
          ...eventData.user_data,
          // Add client IP address if available
          client_ip_address: eventData.user_data.client_ip_address || '127.0.0.1',
          // Ensure proper formatting of hashed data
          em: eventData.user_data.em ? [eventData.user_data.em] : undefined,
          external_id: eventData.user_data.external_id ? [eventData.user_data.external_id] : undefined
        }
      }],
      // Add test_event_code if in development
      test_event_code: process.env.NODE_ENV === 'development' ? 'TEST12345' : undefined
    };

    console.log('Sending request to:', url);
    console.log('Request body:', JSON.stringify(requestBody, null, 2));

    const response = await axios.post(url, requestBody);
    console.log('Response:', JSON.stringify(response.data, null, 2));
    return response.data;
  } catch (error) {
    // Create a safe version of the error response without sensitive data
    const safeError = {
      status: error.response?.status,
      statusText: error.response?.statusText,
      data: error.response?.data ? {
        ...error.response.data,
        error: error.response.data.error ? {
          message: error.response.data.error.message,
          type: error.response.data.error.type,
          code: error.response.data.error.code,
          error_subcode: error.response.data.error.error_subcode,
          fbtrace_id: error.response.data.error.fbtrace_id
        } : undefined
      } : undefined,
      requestData: error.config?.data ? {
        data: JSON.parse(error.config.data).data.map(event => ({
          event_name: event.event_name,
          event_time: event.event_time,
          event_source_url: event.event_source_url,
          action_source: event.action_source,
          user_data: event.user_data ? {
            client_user_agent: event.user_data.client_user_agent,
            client_ip_address: event.user_data.client_ip_address,
            em: event.user_data.em ? '[REDACTED]' : undefined,
            external_id: event.user_data.external_id ? '[REDACTED]' : undefined
          } : undefined,
          custom_data: event.custom_data
        }))
      } : undefined
    };

    console.error('Error sending Facebook event:', JSON.stringify(safeError, null, 2));
    
    // Log the full error for debugging (in development only)
    if (process.env.NODE_ENV === 'development') {
      console.error('Full error details:', {
        message: error.message,
        stack: error.stack,
        config: {
          ...error.config,
          url: error.config?.url,
          headers: error.config?.headers,
          data: error.config?.data
        }
      });
    }
    
    return null;
  }
};

const createEventData = (eventName, userData, customData = {}) => {
  return {
    event_name: eventName,
    event_time: Math.floor(Date.now() / 1000),
    event_source_url: process.env.CLIENT_URL + userData.sourceUrl,
    action_source: 'website',
    user_data: {
      client_user_agent: userData.userAgent,
      client_ip_address: userData.clientIpAddress || '127.0.0.1',
      em: userData.email ? sha256(userData.email) : undefined,
      external_id: userData.userId ? sha256(userData.userId) : undefined
    },
    custom_data: customData
  };
};

module.exports = {
  sendFacebookEvent,
  createEventData
}; 