import React, { useEffect, useMemo, useState } from 'react';
import { toast } from 'react-toastify';
import { Check, Inbox, RotateCcw, X } from 'react-feather';
import { authFetch, catchError } from '../utils';
import { AdminLayout, Badge, EmptyState, Loading, Notice, SearchInput, formatDate } from './admin/AdminUI';

const STATUSES = ['all', 'pending', 'approved', 'rejected'];

export default function BookRequestsList() {
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('pending');
  const [updating, setUpdating] = useState(null);

  const fetchRequests = async () => {
    setLoading(true);
    setError(null);
    const [err, data] = await catchError(authFetch({ path: '/admin/book-requests' }));
    if (err) setError(err.message || 'Could not load book requests');
    if (data) setRequests(data);
    setLoading(false);
  };

  useEffect(() => { fetchRequests(); }, []);

  const setRequestStatus = async (request, next) => {
    setUpdating(request._id);
    const [err, data] = await catchError(authFetch({
      path: `/admin/book-request/${request._id}`,
      method: 'PUT',
      body: { status: next, notes: request.notes },
    }));
    setUpdating(null);
    if (err) return toast.error(err.message || 'Could not update the request');
    setRequests(prev => prev.map(r => (r._id === data._id ? data : r)));
    toast.success(next === 'pending' ? 'Moved back to pending' : `Request ${next}`);
  };

  const counts = useMemo(() => requests.reduce((acc, r) => {
    acc[r.status] = (acc[r.status] || 0) + 1;
    return acc;
  }, { all: requests.length }), [requests]);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return requests.filter(r =>
      (status === 'all' || r.status === status) &&
      (!q || [r.title, r.author, r.userId?.username, r.userId?.email].some(t => t?.toLowerCase().includes(q)))
    );
  }, [requests, query, status]);

  return (
    <AdminLayout title="Book requests" subtitle="Titles readers have asked for. Approve the ones you plan to add.">
      {error && <Notice onRetry={fetchRequests}>{error}</Notice>}

      <div className="adm-toolbar">
        <SearchInput value={query} onChange={setQuery} placeholder="Search title, author or requester" />
        <div className="ui-chip-row">
          {STATUSES.map(s => (
            <button
              key={s}
              type="button"
              className={`ui-chip${status === s ? ' active' : ''}`}
              aria-pressed={status === s}
              onClick={() => setStatus(s)}
            >
              {s === 'all' ? 'All' : s.charAt(0).toUpperCase() + s.slice(1)} {counts[s] ? `(${counts[s]})` : ''}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <Loading label="Loading requests…" />
      ) : shown.length === 0 ? (
        <EmptyState
          icon={Inbox}
          title={requests.length ? 'Nothing here' : 'No requests yet'}
          text={requests.length ? 'No requests match this search or status.' : 'Requests readers send from the site appear here.'}
        />
      ) : (
        <div className="adm-list">
          {shown.map(request => (
            <div key={request._id} className="adm-row">
              <div className="adm-row-body">
                <p className="adm-row-title">{request.title}</p>
                <p className="adm-row-sub">by {request.author}</p>
                {request.notes && <p className="adm-row-sub clamp">{request.notes}</p>}
                <div className="adm-row-meta">
                  <Badge>{request.status}</Badge>
                  <span className="adm-hint">
                    {request.userId?.username || request.userId?.email || 'Unknown reader'} · {formatDate(request.createdAt)}
                  </span>
                </div>
              </div>
              <div className="adm-row-actions">
                {request.status === 'pending' ? (
                  <>
                    <button type="button" className="ui-btn ui-btn-sm ui-btn-primary" onClick={() => setRequestStatus(request, 'approved')} disabled={updating === request._id}>
                      <Check size={14} />Approve
                    </button>
                    <button type="button" className="ui-btn ui-btn-sm ui-btn-danger" onClick={() => setRequestStatus(request, 'rejected')} disabled={updating === request._id}>
                      <X size={14} />Reject
                    </button>
                  </>
                ) : (
                  <button type="button" className="ui-btn ui-btn-sm ui-btn-ghost" onClick={() => setRequestStatus(request, 'pending')} disabled={updating === request._id}>
                    <RotateCcw size={14} />Reopen
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </AdminLayout>
  );
}
