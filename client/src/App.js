import React, { useState, useEffect, lazy, Suspense } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import { ThemeProvider, useTheme } from './context/ThemeContext';
import { AuthProvider } from './context/AuthContext';
import { TokenProvider } from './context/TokenContext';
import { QueryProvider } from './context/QueryContext';
import { AudiobookPlayerProvider } from './context/AudiobookPlayerContext';
import AudiobookPlayer from './components/AudiobookPlayer';
import { GoogleOAuthProvider } from '@react-oauth/google';
import { ToastContainer, Slide } from 'react-toastify';
import { register as registerSW, setupNetworkListeners, preloadResources } from './utils/serviceWorker';
import PerformanceMonitor from './components/PerformanceMonitor';
import RouteLoadingFallback from './components/skeletons/RouteLoadingFallback';
import 'react-toastify/dist/ReactToastify.css';

// Styles
import './styles/tokens.css'
import './styles/ui.css'
import './App.css'
import './styles/index.css'
import './styles/settings.css'
import './styles/chat.css'
import './styles/character.css'
import './styles/nav.css'
import './styles/book.css'
import './styles/bookReader.css'
import './styles/page.css'
import './styles/file.css'
import './styles/search.css'
import './styles/bookUpload.css'
import './styles/tokenCosts.css'
import './styles/booksPage.css'
import './styles/toast.css'
import './styles/TokenTransactionsDashboard.css'
import './styles/BookRequestModal.css'
import './styles/gallery.css'

// Core components that should load immediately
import Navbar from "./components/navbar";
import Header from "./components/header";
import Footer from "./components/Footer";
import HomePage from "./components/homePage";
import BookRequestModal from './components/BookRequestModal';

// Lazy loaded components
const RegisterUser = lazy(() => import('./components/registerUser'));
const LoginUser = lazy(() => import('./components/loginUser'));
const EmailVerification = lazy(() => import('./components/EmailVerification'));
const ForgotPassword = lazy(() => import('./components/ForgotPassword'));
const ResetPassword = lazy(() => import('./components/ResetPassword'));
const SettingsPage = lazy(() => import('./components/settingsPage'));
const BooksPage = lazy(() => import('./components/booksPage'));
const BookPage = lazy(() => import('./components/bookPage'));
const BookReader = lazy(() => import('./components/bookReader'));
const CharacterSelect = lazy(() => import('./components/charaterSelect'));
const CharacterList = lazy(() => import('./components/characterList'));
const CharacterChat = lazy(() => import('./components/characterChat'));
const SearchBooks = lazy(() => import('./components/searchBooks'));
const BookUpload = lazy(() => import('./components/bookUpload'));
const EditProfile = lazy(() => import('./components/editProfile'));
const HowToPage = lazy(() => import('./components/HowToPage'));
const Gallery = lazy(() => import('./components/Gallery'));

// Admin components (lazy loaded)
const AdminBooksPage = lazy(() => import('./components/adminBooksPage'));
const NewBookPage = lazy(() => import('./components/newBookPage'));
const AdminBookPage = lazy(() => import('./components/adminBookPage'));
const EditBookPage = lazy(() => import('./components/editBookPage'));
const AdminPagesPage = lazy(() => import('./components/adminPagesPage'));
const AdminCharactersPage = lazy(() => import('./components/adminCharacters.js'));
const AdminSubscriptionsPage = lazy(() => import('./components/adminSubscriptions.js'));
const FeaturesPage = lazy(() => import('./components/admin/FeaturesPage'));
const TokenTransactionsDashboard = lazy(() => import('./components/TokenTransactionsDashboard'));
const CostAnalysisPage = lazy(() => import('./components/CostAnalysisPage'));
const AdminAnalytics = lazy(() => import('./components/AdminAnalytics'));
const PaymentsDashboard = lazy(() => import('./components/admin/PaymentsDashboard'));
const FeaturedContentManager = lazy(() => import('./components/admin/FeaturedContentManager'));
const BookRequestsList = lazy(() => import('./components/BookRequestsList'));

// Static pages (lazy loaded)
const HelpCenter = lazy(() => import('./components/HelpCenter'));
const AboutUs = lazy(() => import('./components/AboutUs'));
const PrivacyPolicy = lazy(() => import('./components/PrivacyPolicy'));
const DeleteAccount = lazy(() => import('./components/DeleteAccount'));
const TermsOfService = lazy(() => import('./components/TermsOfService'));

const AppContent = () => {
  const location = useLocation();
  const { isDarkMode } = useTheme();
  const [layoutState, setLayoutState] = useState({
    showHeader: true,
    showNavBar: true,
    showSettings: false,
    showFooter: true
  });

  // Book request modal state
  const [isRequestModalOpen, setIsRequestModalOpen] = useState(false);
  const openBookRequestModal = () => setIsRequestModalOpen(true);
  const closeBookRequestModal = () => setIsRequestModalOpen(false);

  // Hamburger menu state
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const toggleMenu = () => setIsMenuOpen(!isMenuOpen);
  const closeMenu = () => setIsMenuOpen(false);

  // Memoize the route checking function
  const checkRoute = React.useCallback((pathname) => {
    const isAdmin = pathname.startsWith('/admin');
    const isHiddenHeader = !isAdmin && ['/verify-email', '/forgot-password', '/reset-password', '/page', '/view/characters']
      .some(route => pathname.includes(route));
    
    const isShowSettings = ['/settings', '/admin/books']
      .some(route => pathname.startsWith(route));
    
    const isHiddenFooter = ['/admin', '/verify-email', '/forgot-password', '/reset-password', '/page', '/view/characters', '/characters']
      .some(route => pathname.startsWith(route)) ||
      pathname.includes('/page/') ||
      pathname.includes('/view/characters/');

    return {
      showHeader: !isHiddenHeader,
      showNavBar: true, // since hiddenNavbarRoutes is empty
      showSettings: isShowSettings,
      showFooter: !isHiddenFooter
    };
  }, []);

  // Update layout state on route change
  useEffect(() => {
    setLayoutState(checkRoute(location.pathname));

    // Store previous route only when needed
    if (!location.pathname.includes('/login') && !location.pathname.includes('/register')) {
      localStorage.setItem('previousRoute', location.pathname);
    }
  }, [location.pathname, checkRoute]);

  return (
    <PerformanceMonitor>
      <div className="app-shell">
        <ToastContainer 
          position="bottom-right"
          autoClose={3000}
          newestOnTop
          closeOnClick
          rtl={false}
          pauseOnFocusLoss
          draggable
          pauseOnHover
          theme={isDarkMode ? "dark" : "light"}
          transition={Slide}
          limit={3}
        />
        {layoutState.showHeader && <Header openBookRequestModal={openBookRequestModal} onMenuToggle={toggleMenu} isMenuOpen={isMenuOpen} />}
        {layoutState.showNavBar && (
          <Navbar 
            setShowHeader={val => setLayoutState(prev => ({...prev, showHeader: val}))}
            setShowNavBar={val => setLayoutState(prev => ({...prev, showNavBar: val}))}
            setShowSettings={val => setLayoutState(prev => ({...prev, showSettings: val}))}
            isOpen={isMenuOpen}
            onClose={closeMenu}
          />
        )}
        <Suspense fallback={<RouteLoadingFallback />}>
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/register" element={<RegisterUser />} />
            <Route path="/login" element={<LoginUser />} />
            <Route path="/verify-email" element={<EmailVerification />} />
            <Route path="/forgot-password" element={<ForgotPassword />} />
            <Route path="/reset-password" element={<ResetPassword />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="/books" element={<BooksPage />} />
            <Route path="/search" element={<SearchBooks />} />
            <Route path="/upload" element={<BookUpload />} />
            <Route path="/gallery" element={<Gallery />} />
            <Route path="/gallery/image/:imageId" element={<Gallery />} />
            <Route path="/books/:bookId" element={<BookPage />} />
            <Route path="/books/:bookId/page/:pageNumber" element={<BookReader />} />
            <Route path="/characters" element={<CharacterList />} />
            <Route path="/books/:bookId/view/characters" element={<CharacterSelect />} />
            <Route path="/books/:bookId/view/characters/:characterId" element={<CharacterChat />} />
            <Route path="/settings/edit-profile" element={<EditProfile />} />
            
            {/* Admin Routes */}
            <Route path="/admin" element={<Navigate to="/admin/books" replace />} />
            <Route path="/admin/payments" element={<PaymentsDashboard />} />
            <Route path="/admin/transactions" element={<TokenTransactionsDashboard />} />
            <Route path="/admin/cost-analysis" element={<CostAnalysisPage />} />
            <Route path="/admin/analytics" element={<AdminAnalytics />} />
            <Route path="/admin/featured-content" element={<FeaturedContentManager />} />
            <Route path="/admin/book-requests" element={<BookRequestsList />} />
            <Route path="/admin/books" element={<AdminBooksPage />} />
            <Route path="/admin/new/book" element={<NewBookPage />} />
            <Route path="/admin/books/:bookId" element={<AdminBookPage />} />
            <Route path="/admin/books/:bookId/edit" element={<EditBookPage />} />
            <Route path="/admin/books/:bookId/edit/pages" element={<AdminPagesPage />} />
            <Route path="/admin/books/:bookId/edit/characters" element={<AdminCharactersPage />} />
            <Route path="/admin/subscriptions" element={<AdminSubscriptionsPage />} />
            <Route path="/admin/features" element={<FeaturesPage />} />
            <Route path="/admin/token-costs" element={<Navigate to="/admin/features" replace />} />
            
            {/* Static Pages */}
            <Route path="/how-to" element={<HowToPage />} />
            <Route path="/help" element={<HelpCenter />} />
            <Route path="/about" element={<AboutUs />} />
            <Route path="/privacy" element={<PrivacyPolicy />} />
            <Route path="/delete-account" element={<DeleteAccount />} />
            <Route path="/terms" element={<TermsOfService />} />
          </Routes>
        </Suspense>
        <BookRequestModal
          isOpen={isRequestModalOpen}
          onClose={closeBookRequestModal}
        />
        {layoutState.showFooter && <Footer />}
        <AudiobookPlayer />
      </div>
    </PerformanceMonitor>
  );
};

const App = () => {
  useEffect(() => {
    // Register service worker for caching
    registerSW({
      onSuccess: () => {
        console.log('App is cached for offline use');
      },
      onUpdate: () => {
        console.log('New app version available');
        // You can show a toast here to notify users of updates
      }
    });

    // Setup network listeners for online/offline detection
    setupNetworkListeners();

    // Preload critical resources
    preloadResources([
      '/books',
      '/characters/top'
    ]);

    // Cleanup expired cache on app start
    const cleanupCache = () => {
      if ('caches' in window) {
        caches.keys().then(cacheNames => {
          const chattyBooksCache = cacheNames.filter(name => name.includes('chattybooks'));
          if (chattyBooksCache.length > 5) {
            // Clean up if too many cache versions
            chattyBooksCache.slice(0, -2).forEach(cacheName => {
              caches.delete(cacheName);
            });
          }
        });
      }
    };

    cleanupCache();
  }, []);

  return (
    <GoogleOAuthProvider clientId={process.env.REACT_APP_GOOGLE_CLIENT_ID}>
      <QueryProvider>
        <ThemeProvider>
          <AuthProvider>
            <TokenProvider>
              <AudiobookPlayerProvider>
                <AppContent />
              </AudiobookPlayerProvider>
            </TokenProvider>
          </AuthProvider>
        </ThemeProvider>
      </QueryProvider>
    </GoogleOAuthProvider>
  );
};

export default App;