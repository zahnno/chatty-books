import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Cookies from 'universal-cookie';
import { toast } from 'react-toastify';
import { useAuth } from '../context/AuthContext';
import { authFetch } from '../utils.js';
import '../styles/staticPages.css';

const cookies = new Cookies();
const STORE_NAME = { apple: 'the App Store', play: 'Google Play' };

// Public account-deletion page. Google Play requires a web URL where users can
// delete their account without the app; signed-out visitors are sent to sign in
// and brought back here.
const DeleteAccount = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [deleting, setDeleting] = useState(false);
  const [done, setDone] = useState(null); // { storeProvider } once deleted

  const signIn = () => {
    localStorage.setItem('postLoginRoute', '/delete-account');
    navigate('/login');
  };

  const onDelete = async () => {
    if (!window.confirm('Permanently delete your Chatty Books account and all of its data? This can’t be undone.')) return;
    setDeleting(true);
    try {
      const res = await authFetch({ path: '/auth/account', method: 'DELETE' });
      cookies.remove('token', { path: '/' });
      setDone({ storeProvider: res?.storeProvider || null });
    } catch (err) {
      toast.error(err?.message || 'Could not delete your account. Please try again.');
      setDeleting(false);
    }
  };

  return (
    <div className="static-page">
      <div className="static-page-content">
        <h1>Delete your account</h1>

        {done ? (
          <section>
            <p>Your Chatty Books account and its data have been deleted.</p>
            {done.storeProvider && (
              <p>
                Your subscription is billed by {STORE_NAME[done.storeProvider]}. Deleting your account doesn’t cancel it,
                so cancel it there to stop future charges.
              </p>
            )}
            <p><a href="/">Back to Chatty Books</a></p>
          </section>
        ) : (
          <>
            <section>
              <p>Deleting your account permanently removes:</p>
              <ul>
                <li>Your profile, email address and sign-in</li>
                <li>Your library and reading progress</li>
                <li>All of your character conversations</li>
                <li>Scenes and comments you posted to the gallery</li>
                <li>Any remaining tokens</li>
              </ul>
              <p>
                A web subscription is cancelled automatically. If you subscribed in the iPhone or Android app, cancel
                that subscription in the App Store or Google Play as well. Anonymous billing records are kept where the
                law requires it.
              </p>
            </section>

            <section>
              {user?.email ? (
                <>
                  <p>Signed in as <strong>{user.email}</strong>.</p>
                  <button type="button" className="ui-btn ui-btn-primary" onClick={onDelete} disabled={deleting}>
                    {deleting ? 'Deleting…' : 'Delete my account'}
                  </button>
                </>
              ) : (
                <>
                  <p>Sign in to the account you want to delete.</p>
                  <button type="button" className="ui-btn ui-btn-primary" onClick={signIn}>
                    Sign in to continue
                  </button>
                </>
              )}
            </section>

            <section>
              <p>
                You can also delete your account in the app (Settings → Delete account), or email{' '}
                <a href="mailto:support@chattybooks.com?subject=Delete%20my%20account">support@chattybooks.com</a> from
                the address on your account and we’ll delete it within 30 days.
              </p>
            </section>
          </>
        )}
      </div>
    </div>
  );
};

export default DeleteAccount;
