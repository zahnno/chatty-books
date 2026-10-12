import React from 'react';
import { X, ArrowLeft } from 'react-feather';
import { Elements } from '@stripe/react-stripe-js';
import { stripePromise } from '../config/stripe';
import PaymentForm from './PaymentForm';

const PaymentModal = ({ 
  isOpen, 
  onClose, 
  onBack, 
  selectedPlan, 
  userEmail, 
  onSubscriptionComplete, 
  isDarkMode 
}) => {
  if (!isOpen) return null;

  return (
    <div className={`payment-modal-overlay ${isDarkMode ? 'dark' : 'light'}`}>
      <div className={`payment-modal ${isDarkMode ? 'dark' : 'light'}`}>
        <div className="payment-modal-header">
          <button 
            className={`back-button ${isDarkMode ? 'dark' : 'light'}`}
            onClick={onBack}
            title="Back to subscription plans"
          >
            <ArrowLeft size={20} />
            <span>Back</span>
          </button>
          <h2>Complete Your Subscription</h2>
          <button 
            className="modal-close" 
            onClick={onClose}
            title="Close modal"
          >
            <X size={24} />
          </button>
        </div>
        
        <div className="payment-modal-content">
          <Elements stripe={stripePromise}>
            <PaymentForm 
              selectedPlan={selectedPlan}
              email={userEmail}
              onSubscriptionComplete={onSubscriptionComplete}
              isDarkMode={isDarkMode}
            />
          </Elements>
        </div>
      </div>

      <style jsx>{`
        .payment-modal-overlay {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(0, 0, 0, 0.7);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 1000;
          backdrop-filter: blur(4px);
        }

        .payment-modal {
          background: ${isDarkMode ? '#1a202c' : '#ffffff'};
          border-radius: 12px;
          width: 90%;
          max-width: 600px;
          max-height: 90vh;
          overflow-y: auto;
          box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);
          border: 1px solid ${isDarkMode ? '#2d3748' : '#e2e8f0'};
        }

        .payment-modal-header {
          display: grid;
          grid-template-columns: auto 1fr auto;
          align-items: center;
          gap: 1rem;
          padding: 1.5rem 2rem;
          border-bottom: 1px solid ${isDarkMode ? '#2d3748' : '#e2e8f0'};
          position: sticky;
          top: 0;
          background: ${isDarkMode ? '#1a202c' : '#ffffff'};
          z-index: 10;
        }

        .payment-modal-header h2 {
          margin: 0;
          color: ${isDarkMode ? '#e2e8f0' : '#2d3748'};
          font-size: 1.25rem;
          font-weight: 600;
          text-align: center;
          justify-self: center;
        }

        .back-button {
          display: flex;
          align-items: center;
          gap: 8px;
          background: none;
          border: none;
          color: ${isDarkMode ? '#a0aec0' : '#4a5568'};
          cursor: pointer;
          padding: 8px 12px;
          border-radius: 6px;
          transition: all 0.2s ease;
          font-size: 14px;
          font-weight: 500;
          justify-self: start;
          min-width: fit-content;
        }

        .back-button:hover {
          background: ${isDarkMode ? '#2d3748' : '#f7fafc'};
          color: ${isDarkMode ? '#e2e8f0' : '#2d3748'};
        }

        .modal-close {
          background: none;
          border: none;
          color: ${isDarkMode ? '#a0aec0' : '#4a5568'};
          cursor: pointer;
          padding: 8px;
          border-radius: 6px;
          transition: all 0.2s ease;
          display: flex;
          align-items: center;
          justify-content: center;
          justify-self: end;
          min-width: fit-content;
        }

        .modal-close:hover {
          background: ${isDarkMode ? '#2d3748' : '#f7fafc'};
          color: ${isDarkMode ? '#e2e8f0' : '#2d3748'};
        }

        .payment-modal-content {
          padding: 2rem;
        }

        /* Responsive design */
        @media (max-width: 768px) {
          .payment-modal {
            width: 95%;
            max-height: 95vh;
          }

          .payment-modal-header {
            padding: 1rem 1.5rem;
          }

          .payment-modal-header h2 {
            font-size: 1.125rem;
          }

          .payment-modal-content {
            padding: 1.5rem;
          }

          .back-button span {
            display: none;
          }
        }

        @media (max-width: 480px) {
          .payment-modal {
            width: 100%;
            height: 100%;
            max-height: 100vh;
            border-radius: 0;
          }

          .payment-modal-header {
            padding: 1rem;
          }

          .payment-modal-content {
            padding: 1rem;
          }
        }
      `}</style>
    </div>
  );
};

export default PaymentModal; 