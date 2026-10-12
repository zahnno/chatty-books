import React, { useState, useEffect } from 'react';
import { ArrowRight, User, Book, Edit3, LogOut, Shield, CreditCard, X, ChevronRight, Clock, Check, Star, Gift, BarChart2, Activity, DollarSign, ToggleRight, Image, MessageCircle, Edit2, LogIn, Sun, Moon } from "react-feather";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import Cookies from "universal-cookie";
import { useTheme } from '../context/ThemeContext';
import { useAuth } from '../context/AuthContext';
import { authFetch, catchError } from '../utils.js';
import { toast } from 'react-toastify';
import PaymentModal from './PaymentModal';
import { BlockedReaders } from './Moderation';
import SettingsPageSkeleton from './skeletons/SettingsPageSkeleton';
import '../styles/account.css';
import { thumbUrl } from '@talkingbook/shared';

export default function SettingsPage() {
  const cookies = new Cookies();
  const { isDarkMode, toggleTheme } = useTheme();
  const { user } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [subscriptionDetails, setSubscriptionDetails] = useState(null);
  const [showSubscriptionModal, setShowSubscriptionModal] = useState(false);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [availablePlans, setAvailablePlans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [plansLoading, setPlansLoading] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState(null);
  console.log(user)

  const storeName = { apple: 'the App Store', play: 'Google Play' }[subscriptionDetails?.subscription?.provider];

  const fetchSubscriptionDetails = async () => {
    try {
      const [error, data] = await catchError(authFetch({ 
        path: '/subscription/details', 
        method: 'GET' 
      }));
      
      if (error) {
        console.error('Error fetching subscription details:', error);
        // toast.error('Failed to fetch subscription details');
        return;
      }
      
      if (data) {
        setSubscriptionDetails(data);
      }
    } catch (error) {
      console.error('Error in fetchSubscriptionDetails:', error);
      toast.error('An unexpected error occurred while fetching subscription details');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSubscriptionDetails();
  }, []);

  useEffect(() => {
    // Check if we should open the subscription modal based on navigation state
    if (location.state?.openSubscriptionModal) {
      setShowSubscriptionModal(true);
      // Clear the state to prevent modal from opening again on refresh
      window.history.replaceState({}, document.title);
    }
  }, [location.state]);

  useEffect(() => {
    const fetchPlans = async () => {
      if (showSubscriptionModal) {
        setPlansLoading(true);
        try {
          const [error, data] = await catchError(authFetch({ 
            path: '/subscriptions', 
            method: 'GET' 
          }));
          
          if (error) {
            console.error('Error fetching subscription plans:', error);
            // toast.error('Failed to fetch subscription plans');
            return;
          }

          if (data) {
            setAvailablePlans(data);
          }
        } catch (error) {
          console.error('Error in fetchPlans:', error);
          // toast.error('An unexpected error occurred while fetching subscription plans');
        } finally {
          setPlansLoading(false);
        }
      }
    };

    fetchPlans();
  }, [showSubscriptionModal]);

  const handleCancelSubscription = async () => {
    setLoading(true);
    try {
      if (!window.confirm('Cancel your subscription? You keep your plan until the end of the period you’ve paid for, and you won’t be charged again.')) {
        setLoading(false);
        return;
      }

      const [error] = await catchError(authFetch({
        path: '/subscription/cancel',
        method: 'POST'
      }));

      if (error) throw error;

      toast.success('Your subscription won’t renew. You keep your plan until the end of this period.');
      await fetchSubscriptionDetails();
      setShowSubscriptionModal(false);
    } catch (error) {
      toast.error(error.message || 'Failed to cancel subscription');
    } finally {
      setLoading(false);
    }
  };

  // Undo a pending cancellation: the plan renews again as normal.
  const handleResumeSubscription = async () => {
    setLoading(true);
    try {
      const [error] = await catchError(authFetch({
        path: '/subscription/auto-renewal',
        method: 'POST',
        body: { autoRenew: true }
      }));
      if (error) throw error;
      toast.success('Your subscription will renew as usual.');
      await fetchSubscriptionDetails();
      setShowSubscriptionModal(false);
    } catch (error) {
      toast.error(error.message || 'Failed to resume subscription');
    } finally {
      setLoading(false);
    }
  };

  const handlePaymentComplete = async () => {
    // Refresh subscription details
    const [refreshError, refreshData] = await catchError(authFetch({ 
      path: '/subscription/details', 
      method: 'GET' 
    }));
    
    if (refreshData) {
      setSubscriptionDetails(refreshData);
      toast.success('Subscription updated successfully');
    }

    setShowPaymentModal(false);
    setShowSubscriptionModal(false);
  };

  const handleSelectPlan = (plan) => {
    setSelectedPlan(plan);
    setShowSubscriptionModal(false);
    setShowPaymentModal(true);
  };

  const handleBackToPlans = () => {
    setShowPaymentModal(false);
    setShowSubscriptionModal(true);
  };

  const logout = () => {
    cookies.remove('token', {path: "/"});
    window.location.href = '/settings';
  }

  let settingMenus = [];

  if (user?.role === 'admin') {
    settingMenus.push({
      label: 'Book Management',
      link: '/admin/books',
      icon: <Book size={20} />
    });
    settingMenus.push({
      label: 'Book Requests',
      link: '/admin/book-requests',
      icon: <Edit3 size={20} />
    });
    settingMenus.push({
      label: 'Featured Content',
      link: '/admin/featured-content',
      icon: <Star size={20} />
    });
    settingMenus.push({
      label: 'Subscription Management',
      link: '/admin/subscriptions',
      icon: <CreditCard size={20} />
    });
    settingMenus.push({
      label: 'Payments',
      link: '/admin/payments',
      icon: <DollarSign size={20} />
    });
    settingMenus.push({
      label: 'Features',
      link: '/admin/features',
      icon: <ToggleRight size={20} />
    });
    settingMenus.push({
      label: 'Token Transactions',
      link: '/admin/transactions',
      icon: <Activity size={20} />
    });
    settingMenus.push({
      label: 'Cost Analysis',
      link: '/admin/cost-analysis',
      icon: <BarChart2 size={20} />
    });
    settingMenus.push({
      label: 'Platform Analytics',
      link: '/admin/analytics',
      icon: <Activity size={20} />
    });
  }

  const getFeatureIcon = (feature) => {
    if (feature.toLowerCase().includes('image')) return <Image size={16} />;
    if (feature.toLowerCase().includes('chat')) return <MessageCircle size={16} />;
    if (feature.toLowerCase().includes('priority')) return <Star size={16} />;
    if (feature.toLowerCase().includes('early access')) return <Gift size={16} />;
    return <Check size={16} />;
  };



  if (loading) {
    return <SettingsPageSkeleton />;
  }

  const subscription = subscriptionDetails?.subscription;
  const endDate = subscription?.endDate ? new Date(subscription.endDate) : null;
  const endDateLabel = endDate && !isNaN(endDate) ? endDate.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' }) : null;

  return (
    <div className="ui-page ui-page-narrow account">
      <header className="account-header">
        <span className="ui-section-eyebrow">Account</span>
        <h1 className="ui-page-title">Settings</h1>
      </header>

      {!user?.email ? (
        <section className="account-card account-guest">
          <h2 className="account-card-title">You're not signed in</h2>
          <p className="account-muted">Sign in to manage your profile, subscription and reading history.</p>
          <button
            type="button"
            className="ui-btn ui-btn-primary"
            onClick={() => navigate('/login', { state: { from: location.pathname } })}
          >
            <LogIn size={16} />
            Sign in
          </button>
        </section>
      ) : (
        <>
          <section className="account-card account-profile">
            <div className="account-avatar">
              {user.profileImage ? (
                <img src={thumbUrl(user.profileImage, 100)} alt="" />
              ) : (
                <User size={32} strokeWidth={1.5} />
              )}
            </div>
            <div className="account-profile-body">
              <div className="account-profile-top">
                <div className="account-identity">
                  <h2 className="account-name">{user.username || 'Reader'}</h2>
                  <p className="account-muted">{user.email}</p>
                </div>
                <NavLink to="/settings/edit-profile" className="ui-btn ui-btn-secondary ui-btn-sm">
                  <Edit2 size={14} />
                  Edit profile
                </NavLink>
              </div>
              {user.role === 'admin' && (
                <span className="ui-tag account-role"><Shield size={12} />Admin</span>
              )}
              {user.description && (
                <p className="account-about">{user.description}</p>
              )}
              {(user.characteristics?.length > 0 || user.moods?.length > 0) && (
                <div className="ui-chip-row account-tags">
                  {user.characteristics?.map((item) => <span key={`c-${item}`} className="ui-tag">{item}</span>)}
                  {user.moods?.map((item) => <span key={`m-${item}`} className="ui-tag">{item}</span>)}
                </div>
              )}
            </div>
          </section>

          <section className="account-card">
            <div className="account-card-head">
              <h2 className="account-card-title">Subscription</h2>
              {subscription?.status && (
                <span className={`account-status account-status-${subscription.status}`}>{subscription.status.replace('_', ' ')}</span>
              )}
            </div>
            {subscription?.plan ? (
              <>
                <p className="account-plan">{subscription.plan.name}</p>
                {endDateLabel && (
                  <p className="account-muted account-renewal">
                    <Clock size={14} />
                    {subscription.status === 'active' && subscription.autoRenew !== false
                      ? `Renews on ${endDateLabel}`
                      : `Ends on ${endDateLabel}`}
                  </p>
                )}
                {subscription.plan.displayFeatures?.length > 0 && (
                  <ul className="account-features">
                    {subscription.plan.displayFeatures.map((feature) => (
                      <li key={feature}>{getFeatureIcon(feature)}{feature}</li>
                    ))}
                  </ul>
                )}
                <button type="button" className="ui-btn ui-btn-secondary" onClick={() => setShowSubscriptionModal(true)}>
                  Manage subscription
                </button>
              </>
            ) : (
              <>
                <p className="account-muted">
                  Subscribe to unlock character chat, narrated audiobooks and scene generation.
                </p>
                <button type="button" className="ui-btn ui-btn-primary" onClick={() => setShowSubscriptionModal(true)}>
                  View plans
                </button>
              </>
            )}
          </section>
        </>
      )}

      <section className="account-card">
        <div className="account-row">
          <div>
            <h2 className="account-card-title">Appearance</h2>
            <p className="account-muted">Choose how Chatty Books looks on this device.</p>
          </div>
          <div className="account-segmented" role="radiogroup" aria-label="Theme">
            <button type="button" role="radio" aria-checked={!isDarkMode} className={!isDarkMode ? 'active' : ''} onClick={() => isDarkMode && toggleTheme()}>
              <Sun size={14} />Light
            </button>
            <button type="button" role="radio" aria-checked={isDarkMode} className={isDarkMode ? 'active' : ''} onClick={() => !isDarkMode && toggleTheme()}>
              <Moon size={14} />Dark
            </button>
          </div>
        </div>
      </section>

      {user?.role === 'admin' && (
        <section className="account-card">
          <h2 className="account-card-title">Admin</h2>
          <nav className="account-links">
            {settingMenus.map((menu) => (
              <NavLink key={menu.link} className="account-link" to={menu.link}>
                <span className="account-link-label">{menu.icon}{menu.label}</span>
                <ArrowRight size={16} />
              </NavLink>
            ))}
          </nav>
        </section>
      )}

      {user?.email && <BlockedReaders />}

      {user?.email && (
        <button type="button" className="ui-btn ui-btn-ghost account-signout" onClick={logout}>
          <LogOut size={16} />
          Sign out
        </button>
      )}

      {user?.email && (
        <NavLink className="ui-btn ui-btn-ghost account-signout" to="/delete-account">
          Delete account
        </NavLink>
      )}

      {/* Subscription Plans Modal */}
      {showSubscriptionModal && (
        <div className={`modal-overlay ${isDarkMode ? 'dark' : 'light'}`}>
          <div className={`subscription-modal ${isDarkMode ? 'dark' : 'light'}`}>
            <div className="modal-header">
              <h2>Choose your plan</h2>
              <button 
                className="modal-close" 
                onClick={() => setShowSubscriptionModal(false)}
                disabled={loading}
              >
                <X size={24} />
              </button>
            </div>
            
            <div className="modal-content">
              {plansLoading ? (
                <div className="loading-content">
                  <div className="loading-spinner" />
                  <h2>Loading available plans...</h2>
                  <p>Please wait while we fetch subscription options.</p>
                </div>
              ) : (
                <div className="plans-grid">
                  {availablePlans.map(plan => (
                    <div 
                      key={plan._id} 
                      className={`plan-option ${
                        subscriptionDetails?.subscription?.plan?._id === plan._id ? 'current' : ''
                      } ${isDarkMode ? 'dark' : 'light'}`}
                    >
                      <div className="plan-info">
                        <h3>{plan.name}</h3>
                        <p className="plan-price">{plan.price === 0 ? 'FREE' : `$${plan.price}/month`}</p>
                        <p className="plan-description">{plan.description}</p>
                        <div className="plan-features">
                          {plan.displayFeatures?.map((feature, index) => (
                            <div key={index} className="feature-item">
                              {getFeatureIcon(feature)}
                              <span>{feature}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                      <button 
                        className={`plan-action-button ${isDarkMode ? 'dark' : 'light'}`}
                        onClick={() => handleSelectPlan(plan)}
                        disabled={loading || subscriptionDetails?.subscription?.plan?._id === plan._id}
                      >
                        {subscriptionDetails?.subscription?.plan?._id === plan._id ? 'Current plan' : 'Select plan'}
                        <ChevronRight size={16} />
                      </button>
                    </div>
                  ))}

                  {subscriptionDetails?.subscription?.plan && storeName && (
                    <div className={`cancellation-section ${isDarkMode ? 'dark' : 'light'}`}>
                      <h3>Billed through {storeName}</h3>
                      <p>Change or cancel it in the Chatty Books app, or in {storeName}.</p>
                    </div>
                  )}

                  {subscriptionDetails?.subscription?.plan && !storeName
                    && subscriptionDetails.subscription.stripeSubscriptionId
                    && ['active', 'past_due'].includes(subscriptionDetails.subscription.status)
                    && subscriptionDetails.subscription.autoRenew === false && (
                    <div className={`cancellation-section ${isDarkMode ? 'dark' : 'light'}`}>
                      <h3>Your subscription is ending</h3>
                      <p>You keep your plan until {endDateLabel || 'the end of this period'}, then move to the free plan.</p>
                      <button
                        className="ui-btn ui-btn-primary"
                        onClick={() => handleResumeSubscription()}
                        disabled={loading}
                      >
                        Keep my subscription
                      </button>
                    </div>
                  )}

                  {subscriptionDetails?.subscription?.plan && !storeName
                    && subscriptionDetails.subscription.autoRenew !== false
                    && subscriptionDetails.subscription.plan.tier !== 'free'
                    && ['active', 'past_due'].includes(subscriptionDetails.subscription.status) && (
                    <div className={`cancellation-section ${isDarkMode ? 'dark' : 'light'}`}>
                      <h3>Cancel subscription</h3>
                      <p>You keep your plan until the end of the period you’ve paid for, and you won’t be charged again.</p>
                      <button 
                        className={`cancel-subscription-button ${isDarkMode ? 'dark' : 'light'}`}
                        onClick={() => handleCancelSubscription()}
                        disabled={loading}
                      >
                        Cancel my subscription
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Payment Modal */}
      <PaymentModal
        isOpen={showPaymentModal}
        onClose={() => {
          setShowPaymentModal(false);
          setSelectedPlan(null);
        }}
        onBack={handleBackToPlans}
        selectedPlan={selectedPlan}
        userEmail={user?.email}
        onSubscriptionComplete={handlePaymentComplete}
        isDarkMode={isDarkMode}
      />

    </div>
  );
}