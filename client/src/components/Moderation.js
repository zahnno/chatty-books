// Reporting and blocking on the web, matching the mobile app (App Store 1.2 /
// Google Play UGC rules). Reported scenes/comments and blocked readers' content
// disappear right away; the server filters them from then on.
import React, { useEffect, useRef, useState } from 'react';
import { MoreHorizontal, X } from 'react-feather';
import { toast } from 'react-toastify';
import { authFetch } from '../utils.js';
import '../styles/moderation.css';

export const REPORT_REASONS = [
  { key: 'sexual', label: 'Sexual content' },
  { key: 'hate', label: 'Hate or discrimination' },
  { key: 'harassment', label: 'Harassment or bullying' },
  { key: 'violence', label: 'Violence or threats' },
  { key: 'self_harm', label: 'Self-harm' },
  { key: 'spam', label: 'Spam or scams' },
  { key: 'other', label: 'Something else' },
];

const NOUN = { image: 'scene', comment: 'comment', message: 'reply' };

export const reportContent = (targetType, targetId, reason, details) =>
  authFetch({ path: '/reports', method: 'POST', body: { targetType, targetId, reason, details } });
export const blockUser = (userId) => authFetch({ path: `/users/${userId}/block`, method: 'POST', body: {} });
export const unblockUser = (userId) => authFetch({ path: `/users/${userId}/block`, method: 'DELETE' });
export const fetchBlockedUsers = () => authFetch({ path: '/users/blocked' });

// Tells the gallery (which keeps its own list) to drop content right away.
export const MODERATION_EVENT = 'chattybooks:moderation';
export const emitModeration = (detail) => window.dispatchEvent(new CustomEvent(MODERATION_EVENT, { detail }));

// Asks, then blocks. Returns true if the reader was blocked.
export async function confirmAndBlock(author) {
  const name = author?.username || 'this reader';
  if (!window.confirm(`Block ${name}? You won’t see their scenes or comments. You can unblock them in Settings.`)) {
    return false;
  }
  try {
    await blockUser(author._id);
    emitModeration({ blockedUserId: author._id });
    toast.success(`${name} is blocked.`);
    return true;
  } catch (err) {
    toast.error(err?.message || 'Could not block this reader.');
    return false;
  }
}

// "⋯" button with a small menu. items: [{ label, onClick, danger? }]
export function MoreMenu({ items, label = 'More options', className = '' }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const close = (e) => {
      if (e.type === 'keydown' ? e.key === 'Escape' : !ref.current?.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', close);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', close);
    };
  }, [open]);

  if (!items.length) return null;
  return (
    <div className={`mod-menu ${className}`} ref={ref}>
      <button
        type="button"
        className="mod-menu-trigger"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
      >
        <MoreHorizontal size={18} />
      </button>
      {open && (
        <div className="mod-menu-list" role="menu">
          {items.map((item) => (
            <button
              key={item.label}
              type="button"
              role="menuitem"
              className={`mod-menu-item ${item.danger ? 'danger' : ''}`}
              onClick={(e) => {
                e.stopPropagation();
                setOpen(false);
                item.onClick();
              }}
            >
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// Modal to report a scene, comment or AI reply. target: { type, id }
export function ReportDialog({ target, onClose, onReported }) {
  const [reason, setReason] = useState(null);
  const [details, setDetails] = useState('');
  const [sending, setSending] = useState(false);
  const noun = NOUN[target?.type] || 'content';

  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const submit = async (e) => {
    e.preventDefault();
    if (!reason || sending) return;
    setSending(true);
    try {
      await reportContent(target.type, target.id, reason, details.trim() || undefined);
      toast.success(
        target.type === 'message'
          ? 'Thanks for reporting. This helps us improve how characters respond.'
          : `Thanks for reporting. We review reports within 24 hours, and you won’t see this ${noun} again.`
      );
      onReported?.();
      onClose();
    } catch (err) {
      toast.error(err?.message || 'Could not send your report.');
      setSending(false);
    }
  };

  return (
    <div className="mod-dialog-backdrop" onMouseDown={onClose}>
      <form
        className="mod-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="mod-dialog-title"
        onMouseDown={(e) => e.stopPropagation()}
        onSubmit={submit}
      >
        <div className="mod-dialog-head">
          <h2 id="mod-dialog-title">Report this {noun}</h2>
          <button type="button" className="mod-dialog-close" aria-label="Close" onClick={onClose}>
            <X size={18} />
          </button>
        </div>
        <p className="mod-dialog-sub">
          {target?.type === 'message'
            ? 'Character replies are written by AI. Tell us what went wrong with this one.'
            : `Why are you reporting this ${noun}?`}
        </p>
        <div className="mod-reasons" role="radiogroup" aria-label="Reason">
          {REPORT_REASONS.map((r) => (
            <label key={r.key} className={`mod-reason ${reason === r.key ? 'selected' : ''}`}>
              <input type="radio" name="reason" value={r.key} checked={reason === r.key} onChange={() => setReason(r.key)} />
              {r.label}
            </label>
          ))}
        </div>
        <textarea
          className="mod-details"
          placeholder="Anything else we should know? (optional)"
          maxLength={1000}
          value={details}
          onChange={(e) => setDetails(e.target.value)}
        />
        <div className="mod-dialog-actions">
          <button type="button" className="ui-btn ui-btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="ui-btn ui-btn-primary" disabled={!reason || sending}>
            {sending ? 'Sending…' : 'Send report'}
          </button>
        </div>
      </form>
    </div>
  );
}

// Settings section: readers this user has blocked, with unblock.
export function BlockedReaders() {
  const [users, setUsers] = useState(null);

  useEffect(() => {
    fetchBlockedUsers()
      .then((data) => setUsers(data?.users || []))
      .catch(() => setUsers([]));
  }, []);

  const unblock = async (u) => {
    if (!window.confirm(`Unblock ${u.username}? Their scenes and comments will show in the gallery again.`)) return;
    try {
      await unblockUser(u._id);
      setUsers((prev) => prev.filter((x) => x._id !== u._id));
    } catch (err) {
      toast.error(err?.message || 'Could not unblock this reader.');
    }
  };

  return (
    <section className="account-card">
      <div className="account-card-head">
        <h2 className="account-card-title">Blocked readers</h2>
      </div>
      <p className="account-muted">You won’t see scenes or comments from readers you block. They aren’t told.</p>
      {users === null ? null : users.length === 0 ? (
        <p className="account-muted">You haven’t blocked anyone.</p>
      ) : (
        <div className="mod-blocked-list">
          {users.map((u) => (
            <div key={u._id} className="mod-blocked-row">
              <span>{u.username}</span>
              <button type="button" className="ui-btn ui-btn-secondary ui-btn-sm" onClick={() => unblock(u)}>
                Unblock
              </button>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
