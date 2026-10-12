import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { toast } from 'react-toastify';
import { AlertTriangle, Check, CheckCircle, ExternalLink, RefreshCw, RotateCcw, X } from 'react-feather';
import { authFetch, catchError } from '../../utils';
import { AdminLayout, Badge, Loading, Notice, formatDate, formatUSD } from './AdminUI';
import { STATUS_BADGE, ScreeningBadge } from './PublishingQueue';

// One submission: what the automated screening found, who submitted it, the
// book's text page by page, and the approve / reject decision.

const PAGE_BATCH = 10;
const REJECT_NOTE = "We couldn't confirm you hold the rights to publish this book.";

export default function PublishingSubmission() {
  const { bookId } = useParams();
  const [book, setBook] = useState(null);
  const [pages, setPages] = useState([]);
  const [totalPages, setTotalPages] = useState(0);
  const [error, setError] = useState(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [busy, setBusy] = useState(null);
  const [note, setNote] = useState(REJECT_NOTE);
  const [edits, setEdits] = useState([]);

  const load = async () => {
    setError(null);
    const [err, data] = await catchError(authFetch({ path: `/api/publishing/admin/books/${bookId}?from=1&count=${PAGE_BATCH}` }));
    if (err) return setError(err.message || 'Could not load the submission');
    setBook(data.book);
    setPages(data.pages);
    setTotalPages(data.totalPages);
  };

  const loadEdits = async () => {
    const [, data] = await catchError(authFetch({ path: `/api/publishing/admin/books/${bookId}/edits` }));
    if (data) setEdits(data.edits);
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load(); loadEdits(); }, [bookId]);

  const revert = async (edit) => {
    if (!window.confirm(`Revert "${edit.label}"? This puts back the values from before the change.`)) return;
    setBusy(`revert-${edit._id}`);
    const [err] = await catchError(authFetch({ path: `/api/publishing/admin/edits/${edit._id}/revert`, method: 'POST', body: {} }));
    setBusy(null);
    if (err) return toast.error(err.message || 'Could not revert the change');
    toast.success('Change reverted');
    loadEdits();
    load();
  };

  const loadMore = async () => {
    setLoadingMore(true);
    const from = (pages[pages.length - 1]?.pageNumber || 0) + 1;
    const [err, data] = await catchError(authFetch({ path: `/api/publishing/admin/books/${bookId}?from=${from}&count=${PAGE_BATCH}` }));
    setLoadingMore(false);
    if (err) return toast.error(err.message || 'Could not load more pages');
    setPages((prev) => [...prev, ...data.pages]);
  };

  const decide = async (approve) => {
    setBusy(approve ? 'approve' : 'reject');
    const [err, data] = await catchError(authFetch({
      path: `/api/publishing/admin/books/${bookId}/review`,
      method: 'POST',
      body: { approve, note: approve ? undefined : note },
    }));
    setBusy(null);
    if (err) return toast.error(err.message || 'Could not save the review');
    setBook(data.book);
    toast.success(approve ? 'Approved. The publisher can mint it now.' : 'Rejected. The publisher will see your note.');
  };

  const rescreen = async () => {
    setBusy('screen');
    const [err, data] = await catchError(authFetch({ path: `/api/publishing/admin/books/${bookId}/screen`, method: 'POST', body: {} }));
    setBusy(null);
    if (err) return toast.error(err.message || 'Could not run the check');
    setBook(data.book);
    toast.success('Screening updated');
  };

  if (error) {
    return (
      <AdminLayout title="Submission" back={{ to: '/admin/publishing', label: 'Publishing' }}>
        <Notice onRetry={load}>{error}</Notice>
      </AdminLayout>
    );
  }
  if (!book) {
    return (
      <AdminLayout title="Submission" back={{ to: '/admin/publishing', label: 'Publishing' }}>
        <Loading label="Loading submission…" />
      </AdminLayout>
    );
  }

  const sc = book.screening || {};
  const waiting = book.status === 'pending_review';

  return (
    <AdminLayout
      eyebrow="Publishing review"
      title={book.title}
      subtitle={`by ${book.author || 'Unknown author'}`}
      back={{ to: '/admin/publishing', label: 'Publishing' }}
      actions={<Badge tone={STATUS_BADGE[book.status]?.tone}>{STATUS_BADGE[book.status]?.label || book.status}</Badge>}
    >
      <div className="adm-grid-2">
        <section className={`adm-card adm-screening adm-screening-${sc.verdict || 'none'}`}>
          <div className="adm-section-head">
            <h2 className="adm-card-title">Automated check</h2>
            <ScreeningBadge screening={sc} />
          </div>
          {sc.summary && <p className="adm-screening-summary">{sc.summary}</p>}
          {sc.verdict && sc.verdict !== 'error' && (
            <dl className="adm-dl">
              <dt>Copyright risk</dt><dd>{sc.copyrightRisk}</dd>
              <dt>Content risk</dt><dd>{sc.contentRisk}</dd>
              {sc.knownWork && (<><dt>Looks like</dt><dd>{sc.knownWork}</dd></>)}
            </dl>
          )}
          {!!sc.reasons?.length && (
            <ul className="adm-screening-reasons">
              {sc.reasons.map((r) => <li key={r}>{r}</li>)}
            </ul>
          )}
          {sc.error && <p className="adm-hint">{sc.error}</p>}
          <p className="adm-hint">
            Reads the title, author and first 10 pages. It flags; you decide.
            {sc.checkedAt && ` Checked ${formatDate(sc.checkedAt, true)}.`}
          </p>
          <button type="button" className="ui-btn ui-btn-sm ui-btn-ghost" onClick={rescreen} disabled={!!busy}>
            <RefreshCw size={14} />{busy === 'screen' ? 'Checking…' : 'Run check again'}
          </button>
        </section>

        <section className="adm-card">
          <h2 className="adm-card-title">Submission</h2>
          <dl className="adm-dl" style={{ marginTop: 14 }}>
            <dt>Submitted by</dt><dd>{book.publisher?.username || '—'}{book.publisher?.email ? ` (${book.publisher.email})` : ''}</dd>
            <dt>Wallet</dt><dd className="adm-code">{book.publisher?.wallet || 'none'}</dd>
            <dt>Submitted</dt><dd>{formatDate(book.submittedAt, true)}</dd>
            <dt>Pages</dt><dd>{totalPages}</dd>
            <dt>Characters</dt><dd>{book.characters.length ? book.characters.map((c) => c.name).join(', ') : 'Still being created'}</dd>
            {book.categories?.length > 0 && (<><dt>Categories</dt><dd>{book.categories.join(', ')}</dd></>)}
            {book.reviewedAt && (<><dt>Reviewed</dt><dd>{formatDate(book.reviewedAt, true)}{book.reviewNote ? ` · "${book.reviewNote}"` : ''}</dd></>)}
            {book.status === 'minted' && (
              <>
                <dt>NFT</dt>
                <dd>
                  <a href={`https://core.metaplex.com/explorer/${book.asset}`} target="_blank" rel="noreferrer">
                    {book.asset} <ExternalLink size={12} />
                  </a>
                </dd>
                <dt>Earnings</dt><dd>{book.interactions} chats · {formatUSD(book.earnedUsd, 3)} earned · {formatUSD(book.claimedUsd, 3)} claimed</dd>
              </>
            )}
          </dl>
          {book.description && <p className="adm-row-sub" style={{ marginTop: 16 }}>{book.description}</p>}
        </section>
      </div>

      {waiting && (
        <section className="adm-card adm-decision">
          <h2 className="adm-card-title">Decision</h2>
          <p className="adm-hint">Approve only if the publisher plausibly wrote the book or holds the rights, and the content is fine to host.</p>
          <label className="adm-label" htmlFor="reject-note">Note to the publisher if you reject</label>
          <textarea id="reject-note" className="adm-textarea" value={note} onChange={(e) => setNote(e.target.value)} />
          <div className="adm-form-actions">
            <button type="button" className="ui-btn ui-btn-danger" onClick={() => decide(false)} disabled={!!busy}>
              <X size={16} />{busy === 'reject' ? 'Rejecting…' : 'Reject'}
            </button>
            <button type="button" className="ui-btn ui-btn-primary" onClick={() => decide(true)} disabled={!!busy}>
              <Check size={16} />{busy === 'approve' ? 'Approving…' : 'Approve'}
            </button>
          </div>
        </section>
      )}

      {edits.length > 0 && (
        <section className="adm-section" id="changes">
          <div className="adm-section-head">
            <h2 className="adm-section-title">Change history</h2>
            <span className="adm-hint">Edits by the publisher or NFT holder, newest first</span>
          </div>
          <div className="adm-list">
            {edits.map((edit) => (
              <div key={edit._id} className="adm-row adm-edit">
                <div className="adm-row-body">
                  <p className="adm-row-title">{edit.label}</p>
                  <p className="adm-row-sub">
                    {edit.userId?.username || edit.userId?.email || 'Unknown'}{edit.wallet ? ` · ${edit.wallet.slice(0, 4)}…${edit.wallet.slice(-4)}` : ''} · {formatDate(edit.createdAt, true)}
                  </p>
                  {edit.screening?.summary && <p className="adm-row-sub">{edit.screening.summary}</p>}
                  <EditDiff edit={edit} />
                  <div className="adm-row-meta">
                    {edit.live ? <Badge tone="accent">Live book</Badge> : <Badge>Before minting</Badge>}
                    {edit.screening?.verdict === 'suspect' && <Badge tone="danger"><AlertTriangle size={12} /> Check: suspect</Badge>}
                    {edit.screening?.verdict === 'clear' && <Badge tone="success"><CheckCircle size={12} /> Check: clear</Badge>}
                    {edit.status === 'reverted' && <Badge tone="warning">Reverted {formatDate(edit.revertedAt)}</Badge>}
                  </div>
                </div>
                {edit.status !== 'reverted' && (
                  <div className="adm-row-actions">
                    <button type="button" className="ui-btn ui-btn-sm ui-btn-ghost" onClick={() => revert(edit)} disabled={!!busy}>
                      <RotateCcw size={14} />{busy === `revert-${edit._id}` ? 'Reverting…' : 'Revert'}
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="adm-section">
        <div className="adm-section-head">
          <h2 className="adm-section-title">Read the book</h2>
          <span className="adm-hint">Showing {pages.length} of {totalPages} pages</span>
        </div>
        <div className="adm-reader">
          {pages.map((p) => (
            <article key={p.pageNumber} className="adm-reader-page">
              <span className="adm-page-number">Page {p.pageNumber}</span>
              <div className="adm-reader-text">{p.text}</div>
            </article>
          ))}
        </div>
        {pages.length < totalPages && (
          <button type="button" className="ui-btn ui-btn-secondary" onClick={loadMore} disabled={loadingMore} style={{ marginTop: 16 }}>
            {loadingMore ? 'Loading…' : `Load ${Math.min(PAGE_BATCH, totalPages - pages.length)} more pages`}
          </button>
        )}
      </section>
    </AdminLayout>
  );
}

const showValue = (v) => (Array.isArray(v) ? v.join(', ') : v == null || v === '' ? '(empty)' : String(v));

// Before → after for each changed field. Images show as links.
function EditDiff({ edit }) {
  const fields = [...new Set([...Object.keys(edit.before || {}), ...Object.keys(edit.after || {})])]
    .filter((f) => edit.action === 'update' || ['firstName', 'lastName', 'description', 'intro', 'appearance'].includes(f));
  if (!fields.length) return null;
  const cell = (field, value) => (field === 'image_url' && value
    ? <a href={value} target="_blank" rel="noreferrer">image</a>
    : showValue(value).slice(0, 600));
  return (
    <dl className="adm-dl adm-edit-diff">
      {fields.map((f) => (
        <React.Fragment key={f}>
          <dt>{f}</dt>
          <dd>
            {edit.action !== 'create' && <del>{cell(f, edit.before?.[f])}</del>}
            {edit.action !== 'delete' && <ins>{cell(f, edit.after?.[f])}</ins>}
          </dd>
        </React.Fragment>
      ))}
    </dl>
  );
}
