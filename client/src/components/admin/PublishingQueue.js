import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, CheckCircle, ChevronRight, Inbox } from 'react-feather';
import { authFetch, catchError } from '../../utils';
import { AdminLayout, Badge, EmptyState, Loading, Notice, formatDate } from './AdminUI';

// Books submitted for Publish on Solana (Seeker app). Each one is screened by
// an AI check before a person reads it here and approves or rejects it.

const STATUSES = [
  { key: 'pending_review', label: 'Waiting' },
  { key: 'approved', label: 'Approved' },
  { key: 'minted', label: 'Live' },
  { key: 'rejected', label: 'Rejected' },
  { key: 'all', label: 'All' },
];

export const STATUS_BADGE = {
  pending_review: { tone: 'warning', label: 'Waiting for review' },
  approved: { tone: 'accent', label: 'Approved, not minted' },
  minted: { tone: 'success', label: 'Live on Solana' },
  rejected: { tone: 'danger', label: 'Rejected' },
};

export function ScreeningBadge({ screening }) {
  if (!screening?.verdict) return <Badge>Not screened</Badge>;
  if (screening.verdict === 'clear') return <Badge tone="success"><CheckCircle size={12} /> Check: clear</Badge>;
  if (screening.verdict === 'suspect') return <Badge tone="danger"><AlertTriangle size={12} /> Check: suspect</Badge>;
  return <Badge tone="warning">Check failed</Badge>;
}

export default function PublishingQueue() {
  const [status, setStatus] = useState('pending_review');
  const [books, setBooks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = async (next = status) => {
    setLoading(true);
    setError(null);
    const [err, data] = await catchError(authFetch({ path: `/api/publishing/admin/submissions?status=${next}` }));
    if (err) setError(err.message || 'Could not load submissions');
    if (data) setBooks(data.books);
    setLoading(false);
  };

  useEffect(() => { load(status); }, [status]);

  return (
    <AdminLayout
      title="Publishing"
      subtitle="Books readers submitted to publish on Solana. Read each one, check the automated screening, then approve or reject. Approved books can be minted by their publisher."
    >
      {error && <Notice onRetry={() => load()}>{error}</Notice>}

      <div className="adm-toolbar">
        <div className="ui-chip-row">
          {STATUSES.map((s) => (
            <button
              key={s.key}
              type="button"
              className={`ui-chip${status === s.key ? ' active' : ''}`}
              aria-pressed={status === s.key}
              onClick={() => setStatus(s.key)}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <Loading label="Loading submissions…" />
      ) : books.length === 0 ? (
        <EmptyState
          icon={Inbox}
          title={status === 'pending_review' ? 'Nothing waiting' : 'Nothing here'}
          text={status === 'pending_review' ? 'New submissions appear here, and support gets an email for each one.' : 'No books with this status.'}
        />
      ) : (
        <div className="adm-list">
          {books.map((book) => (
            <Link key={book.id} to={`/admin/publishing/${book.id}`} className="adm-row adm-row-link">
              {book.image_url ? (
                <img className="adm-thumb" src={book.image_url} alt="" />
              ) : (
                <div className="adm-thumb" />
              )}
              <div className="adm-row-body">
                <p className="adm-row-title">{book.title}</p>
                <p className="adm-row-sub">
                  by {book.author || 'Unknown author'} · submitted by {book.publisher?.username || book.publisher?.email || 'unknown'}
                </p>
                {book.screening?.summary && <p className="adm-row-sub clamp">{book.screening.summary}</p>}
                <div className="adm-row-meta">
                  <Badge tone={STATUS_BADGE[book.status]?.tone}>{STATUS_BADGE[book.status]?.label || book.status}</Badge>
                  <ScreeningBadge screening={book.screening} />
                  <span className="adm-hint">{formatDate(book.submittedAt, true)}</span>
                </div>
              </div>
              <ChevronRight size={18} className="adm-muted" />
            </Link>
          ))}
        </div>
      )}
    </AdminLayout>
  );
}
