import React, { useState } from 'react';
import { CardElement, useStripe, useElements } from '@stripe/react-stripe-js';
import { Lock, CreditCard, Shield, Info } from 'react-feather';
import { authFetch, catchError } from '../utils.js';
import { useToken } from '../context/TokenContext';

const PaymentForm = ({ email, selectedPriceId, onSubscriptionComplete, selectedPlan, isDarkMode }) => {
  const stripe = useStripe();
  const elements = useElements();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const { fetchTokenBalance } = useToken();

  const CARD_ELEMENT_OPTIONS = {
    hidePostalCode: true,
    appearance: {
      theme: isDarkMode ? 'night' : 'stripe',
      variables: {
        colorPrimary: '#00b894',
        colorBackground: isDarkMode ? '#2d3748' : '#ffffff',
        colorText: isDarkMode ? '#fff' : '#32325d',
        colorDanger: '#df1b41',
        fontFamily: '"Helvetica Neue", Helvetica, sans-serif',
        spacingUnit: '2px',
        borderRadius: '6px',
      },
      rules: {
        '.Input': {
          backgroundColor: isDarkMode ? '#2d3748' : '#ffffff',
          color: isDarkMode ? '#fff' : '#32325d',
        },
        '.Input:disabled': {
          backgroundColor: 'transparent',
        },
        '.Input--invalid': {
          color: '#df1b41',
        },
        '.Input:-webkit-autofill': {
          backgroundColor: 'transparent !important',
          '-webkit-text-fill-color': isDarkMode ? '#fff' : '#32325d',
          '-webkit-box-shadow': `0 0 0px 1000px ${isDarkMode ? '#2d3748' : '#ffffff'} inset`,
        },
        '.Input:autofill': {
          backgroundColor: 'transparent !important',
          '-webkit-text-fill-color': isDarkMode ? '#fff' : '#32325d',
          '-webkit-box-shadow': `0 0 0px 1000px ${isDarkMode ? '#2d3748' : '#ffffff'} inset`,
        }
      }
    }
  };

  const handleSubscription = async (event) => {
    event.preventDefault();
    setLoading(true);
    setError(null);

    if (!stripe || !elements) {
      setLoading(false);
      setError('Payment system is not ready. Please try again in a moment.');
      return;
    }

    const cardElement = elements.getElement(CardElement);
    if (!cardElement._implementation._complete) {
      setLoading(false);
      setError('Please enter your card details');
      return;
    }

    try {
      // Create payment method
      const { error: paymentMethodError, paymentMethod } = await stripe.createPaymentMethod({
        type: 'card',
        card: elements.getElement(CardElement),
        billing_details: {
          email: email,
        },
      });

      if (paymentMethodError) {
        throw new Error(paymentMethodError.message);
      }

      // Subscribe with the payment method
      const [subscribeError, subscribeData] = await catchError(authFetch({
        path: '/subscription/subscribe',
        method: 'POST',
        body: {
          planId: selectedPlan._id,
          paymentMethod: paymentMethod.id
        }
      }));

      if (subscribeError) {
        // Clear the card input on error
        elements.getElement(CardElement).clear();
        throw new Error(subscribeError.message || 'Failed to create subscription');
      }

      // If there's a client secret, confirm the payment
      if (subscribeData.clientSecret) {
        const { error: confirmError } = await stripe.confirmCardPayment(subscribeData.clientSecret);
        if (confirmError) {
          // Clear the card input on error
          elements.getElement(CardElement).clear();
          throw new Error(confirmError.message);
        }
      }

      // Update token balance after successful subscription
      await fetchTokenBalance();

      // Call the completion handler
      onSubscriptionComplete();
    } catch (err) {
      let errorMessage = err.message || 'An error occurred during subscription';
      
      // Clean up error message by removing prefixes and making it more user-friendly
      errorMessage = errorMessage
        .replace('StripeCardError: ', '')
        .replace('Error: ', '');

      // Make error messages more user-friendly
      if (errorMessage.includes('Could not find payment information')) {
        errorMessage = 'Please enter your card details';
      } else if (errorMessage.includes('Element is already occupied')) {
        errorMessage = 'Please wait while we process your payment';
      } else if (errorMessage.includes('Element is not mounted')) {
        errorMessage = 'Please enter your card details';
      }
      
      setError(errorMessage);
      console.error('Subscription error:', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={`payment-container ${isDarkMode ? 'dark' : 'light'}`}>
      <div className="payment-header">
        <Lock size={20} className="lock-icon" />
        <h2>Secure Payment</h2>
      </div>

      <div className={`subscription-summary ${isDarkMode ? 'dark' : 'light'}`}>
        <h3>Subscription Details</h3>
        <div className="summary-content">
          <div className="summary-row">
            <strong>{selectedPlan?.name}</strong>
          </div>
          <div className="summary-row">
            <strong>${selectedPlan?.price}/month</strong>
          </div>
          {selectedPlan?.displayFeatures?.map((feature, index) => (
            <div key={index} className="summary-row feature-row">
              <span>✓</span>
              <span>{feature}</span>
            </div>
          ))}
        </div>
      </div>

      <form onSubmit={handleSubscription} className={`payment-form ${isDarkMode ? 'dark' : 'light'}`}>
        <div className="form-group">
          <label>Email</label>
          <div className={`input-wrapper ${isDarkMode ? 'dark' : 'light'}`}>
            <input type="email" value={email} disabled className="email-input" />
          </div>
        </div>

        <div className="form-group">
          <label>
            <div className="label-content">
              <CreditCard size={16} />
              <span>Card Details</span>
            </div>
          </label>
          <div className={`card-element-wrapper ${isDarkMode ? 'dark' : 'light'}`}>
            <CardElement options={CARD_ELEMENT_OPTIONS} />
          </div>
        </div>

        {error && (
          <div className="error-message">
            <Info size={16} />
            {error}
          </div>
        )}

        <button 
          type="submit"
          disabled={!stripe || loading}
          className={`submit-button ${isDarkMode ? 'dark' : 'light'}`}
        >
          {loading ? (
            <>
              <div className="spinner"></div>
              Processing...
            </>
          ) : (
            <>
              <Lock size={16} />
              Subscribe Now
            </>
          )}
        </button>

        <div className="security-info">
          <Shield size={14} />
          <span>Your payment information is securely processed by Stripe</span>
        </div>
      </form>

      <style jsx>{`
        .payment-container {
          max-width: 500px;
          margin: 0 auto;
          color: ${isDarkMode ? '#e2e8f0' : '#32325d'};
        }

        .payment-header {
          display: flex;
          align-items: center;
          gap: 10px;
          margin-bottom: 2rem;
        }

        .lock-icon {
          color: #00b894;
        }

        .subscription-summary {
          background: ${isDarkMode ? '#2d3748' : '#f8fafc'};
          border-radius: 8px;
          padding: 1.5rem;
          margin-bottom: 2rem;
          border: 1px solid ${isDarkMode ? '#4a5568' : '#e2e8f0'};
        }

        .summary-content {
          margin-top: 1rem;
        }

        .summary-row {
          display: flex;
          justify-content: space-between;
          margin-bottom: 0.5rem;
          color: ${isDarkMode ? '#e2e8f0' : '#4a5568'};
        }

        .feature-row {
          justify-content: flex-start;
          gap: 8px;
          color: ${isDarkMode ? '#a0aec0' : '#718096'};
          font-size: 0.9em;
        }

        .feature-row span:first-child {
          color: ${isDarkMode ? '#68d391' : '#48bb78'};
        }

        .form-group {
          margin-bottom: 1.5rem;
        }

        .label-content {
          display: flex;
          align-items: center;
          gap: 8px;
          margin-bottom: 8px;
          color: ${isDarkMode ? '#e2e8f0' : '#4a5568'};
        }

        .input-wrapper {
          background: ${isDarkMode ? '#2d3748' : '#f8fafc'};
          border: 1px solid ${isDarkMode ? '#4a5568' : '#e2e8f0'};
          border-radius: 6px;
          padding: 12px;
        }

        .email-input {
          width: 100%;
          border: none;
          background: transparent;
          color: ${isDarkMode ? '#e2e8f0' : '#4a5568'};
          font-size: 16px;
        }

        .card-element-wrapper {
          background: ${isDarkMode ? '#2d3748' : 'white'} !important;
          padding: 12px 16px;
          border: 1px solid ${isDarkMode ? '#4a5568' : '#e2e8f0'};
          border-radius: 6px;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
          transition: border-color 0.15s ease;
        }

        .card-element-wrapper:hover {
          border-color: ${isDarkMode ? '#718096' : '#cbd5e0'};
        }

        .error-message {
          display: flex;
          align-items: center;
          gap: 8px;
          color: #e53e3e;
          background: ${isDarkMode ? '#742a2a' : '#fff5f5'};
          padding: 12px;
          border-radius: 6px;
          margin-bottom: 1rem;
        }

        .submit-button {
          width: 100%;
          padding: 14px;
          background: #00b894;
          color: white;
          border: none;
          border-radius: 6px;
          font-size: 16px;
          font-weight: 600;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          transition: background-color 0.15s ease;
        }

        .submit-button:hover:not(:disabled) {
          background: #00a187;
        }

        .submit-button:disabled {
          opacity: 0.7;
          cursor: not-allowed;
        }

        .spinner {
          width: 16px;
          height: 16px;
          border: 2px solid rgba(255, 255, 255, 0.3);
          border-radius: 50%;
          border-top-color: white;
          animation: spin 1s linear infinite;
        }

        @keyframes spin {
          to {
            transform: rotate(360deg);
          }
        }

        .security-info {
          display: flex;
          align-items: center;
          gap: 8px;
          margin-top: 1rem;
          color: ${isDarkMode ? '#a0aec0' : '#718096'};
          font-size: 14px;
          justify-content: center;
        }

        .StripeElement--webkit-autofill {
          background-color: transparent !important;
        }
      `}</style>
    </div>
  );
};

export default PaymentForm; 