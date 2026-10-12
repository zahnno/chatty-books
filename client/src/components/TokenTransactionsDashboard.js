import React, { useEffect, useState } from 'react';
import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight, RefreshCw } from 'react-feather';
import { authFetch, catchError } from '../utils.js';
import {
  AdminLayout, Badge, EmptyState, Loading, Modal, Notice, SearchInput, Stat,
  formatDate, formatNumber, formatUSD, humanize
} from './admin/AdminUI';

const PAGE_SIZE = 25;
const TYPES = [{ value: 'all', label: 'All' }, { value: 'credit', label: 'Credits' }, { value: 'debit', label: 'Debits' }];
const HIDDEN_METADATA = ['costEstimateId', 'service', 'action', 'estimatedCost', 'actualCost', 'tokenQuote', 'status', 'parameters', 'partialTokensUsed'];

const userLabel = (t) => t.userId?.username || t.userId?.email || 'Unknown user';
const signed = (t) => `${t.type === 'credit' ? '+' : '-'}${formatNumber(Math.abs(t.amount))}`;

function TransactionDetail({ transaction: t, onClose }) {
  const meta = t.metadata || {};
  const quote = meta.tokenQuote;
  const extra = Object.entries(meta).filter(([key]) => !HIDDEN_METADATA.includes(key));
  const params = meta.parameters && Object.entries(meta.parameters);

  return (
    <Modal title="Transaction" onClose={onClose} wide>
      <div className="adm-form">
        <dl className="adm-dl">
          <dt>Date</dt><dd>{formatDate(t.createdAt, true)}</dd>
          <dt>User</dt><dd>{userLabel(t)}{t.userId?.email && t.userId?.username ? <span className="adm-hint"> · {t.userId.email}</span> : null}</dd>
          <dt>Description</dt><dd>{t.description || '-'}</dd>
          <dt>Action</dt><dd>{t.action ? humanize(t.action) : '-'}</dd>
          <dt>Amount</dt><dd className={t.type === 'credit' ? 'adm-positive' : 'adm-negative'}>{signed(t)} tokens</dd>
          <dt>Balance after</dt><dd>{formatNumber(t.balance)}</dd>
          {t.relatedEntityModel && <><dt>Related</dt><dd>{t.relatedEntityModel} <code className="adm-code">{t.relatedEntityId}</code></dd></>}
        </dl>

        {meta.costEstimateId && (
          <>
            <h3 className="adm-card-title">Cost estimate</h3>
            <dl className="adm-dl">
              <dt>Service</dt><dd>{meta.service ? humanize(meta.service) : '-'}</dd>
              <dt>Operation</dt><dd>{meta.action ? humanize(meta.action) : '-'}</dd>
              <dt>Status</dt><dd>{meta.status ? <Badge>{meta.status}</Badge> : '-'}</dd>
              <dt>Estimated cost</dt><dd>{formatUSD(meta.estimatedCost, 6)}</dd>
              <dt>Actual cost</dt><dd>{formatUSD(meta.actualCost, 6)}</dd>
              {quote && (
                <>
                  <dt>Tokens</dt><dd>{formatNumber(quote.baseTokens)} base + {formatNumber(quote.operatingCostTokens)} operating = <strong>{formatNumber(quote.totalTokens)}</strong></dd>
                  <dt>Quoted USD</dt><dd>{formatUSD(quote.baseUSD, 6)} + {formatUSD(quote.operatingCostUSD, 6)} = <strong>{formatUSD(quote.totalUSD, 6)}</strong></dd>
                </>
              )}
              {meta.partialTokensUsed != null && <><dt>Partial tokens</dt><dd>{formatNumber(meta.partialTokensUsed)}</dd></>}
            </dl>
            {params?.length > 0 && <pre className="adm-pre">{params.map(([k, v]) => `${k}: ${typeof v === 'object' ? JSON.stringify(v) : v}`).join('\n')}</pre>}
          </>
        )}

        {extra.length > 0 && (
          <>
            <h3 className="adm-card-title">Metadata</h3>
            <pre className="adm-pre">{extra.map(([k, v]) => `${k}: ${typeof v === 'object' ? JSON.stringify(v) : v}`).join('\n')}</pre>
          </>
        )}
      </div>
    </Modal>
  );
}

export default function TokenTransactionsDashboard() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [type, setType] = useState('all');
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState({ field: 'date', order: 'desc' });
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState(null);

  useEffect(() => {
    const timer = setTimeout(() => { setQuery(search.trim()); setPage(1); }, 350);
    return () => clearTimeout(timer);
  }, [search]);

  const fetchTransactions = async () => {
    setLoading(true);
    setError(null);
    const params = new URLSearchParams({
      page: String(page),
      limit: String(PAGE_SIZE),
      sort: sort.field === 'amount' ? 'amount' : 'date',
      order: sort.order,
    });
    if (type !== 'all') params.set('type', type);
    if (query) params.set('q', query);
    const [err, result] = await catchError(authFetch({ path: `/transactions?${params}` }));
    if (err) setError(err.message || 'Could not load transactions');
    if (result) setData(result);
    setLoading(false);
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { fetchTransactions(); }, [page, type, query, sort]);

  const toggleSort = (field) => {
    setSort(prev => (prev.field === field ? { field, order: prev.order === 'desc' ? 'asc' : 'desc' } : { field, order: 'desc' }));
    setPage(1);
  };

  const SortIcon = ({ field }) => (sort.field !== field ? null : sort.order === 'desc' ? <ArrowDown size={12} /> : <ArrowUp size={12} />);

  const transactions = data?.transactions || [];
  const metrics = data?.metrics;
  const totalPages = data?.totalPages || 1;

  return (
    <AdminLayout
      title="Token transactions"
      subtitle="Every token credit and debit across all readers."
      actions={<button type="button" className="ui-btn ui-btn-secondary" onClick={fetchTransactions} disabled={loading}><RefreshCw size={16} />Refresh</button>}
    >
      {metrics && (
        <div className="adm-stats">
          <Stat label="Tokens spent" value={formatNumber(Math.round(metrics.totalTokens))} note={`${formatNumber(Math.round(metrics.baseTokens))} base · ${formatNumber(Math.round(metrics.operatingTokens))} operating`} />
          <Stat label="Quoted value" value={formatUSD(metrics.totalUSD, 2)} note={`${formatUSD(metrics.baseUSD, 2)} base · ${formatUSD(metrics.operatingUSD, 2)} operating`} />
          <Stat label="Actual provider cost" value={formatUSD(metrics.actualUSD, 2)} note="For debits with a cost estimate" />
          <Stat label="Transactions" value={formatNumber(data.total)} note={type === 'all' ? 'Credits and debits' : humanize(type) + 's'} />
        </div>
      )}

      <div className="adm-toolbar">
        <SearchInput value={search} onChange={setSearch} placeholder="Search by user email or name" />
        <div className="ui-chip-row">
          {TYPES.map(t => (
            <button key={t.value} type="button" className={`ui-chip${type === t.value ? ' active' : ''}`} aria-pressed={type === t.value} onClick={() => { setType(t.value); setPage(1); }}>
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {error && <Notice onRetry={fetchTransactions}>{error}</Notice>}

      {loading && !data ? (
        <Loading label="Loading transactions…" />
      ) : transactions.length === 0 ? (
        <EmptyState title="No transactions" text={query || type !== 'all' ? 'Nothing matches this search or filter.' : 'Token activity will show up here.'} />
      ) : (
        <>
          <div className="adm-table-wrap" style={{ opacity: loading ? 0.6 : 1 }}>
            <table className="adm-table">
              <thead>
                <tr>
                  <th><button type="button" className="adm-sort" onClick={() => toggleSort('date')}>Date <SortIcon field="date" /></button></th>
                  <th>User</th>
                  <th>Description</th>
                  <th>Action</th>
                  <th className="num"><button type="button" className="adm-sort" onClick={() => toggleSort('amount')}>Amount <SortIcon field="amount" /></button></th>
                  <th className="num">Balance</th>
                  <th className="num">Actual cost</th>
                </tr>
              </thead>
              <tbody>
                {transactions.map(t => (
                  <tr key={t._id} className="is-clickable" onClick={() => setSelected(t)} tabIndex={0} onKeyDown={(e) => { if (e.key === 'Enter') setSelected(t); }}>
                    <td style={{ whiteSpace: 'nowrap' }}>{formatDate(t.createdAt, true)}</td>
                    <td className="truncate" title={userLabel(t)}>{userLabel(t)}</td>
                    <td className="truncate" title={t.description}>{t.description}</td>
                    <td>{t.action ? humanize(t.action) : '-'}</td>
                    <td className={`num ${t.type === 'credit' ? 'adm-positive' : 'adm-negative'}`}>{signed(t)}</td>
                    <td className="num">{formatNumber(t.balance)}</td>
                    <td className="num">{t.metadata?.actualCost != null ? formatUSD(t.metadata.actualCost, 4) : '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="adm-pager">
            <span>Page {data.page} of {totalPages} · {formatNumber(data.total)} total</span>
            <div className="adm-pager-buttons">
              <button type="button" className="ui-btn ui-btn-sm ui-btn-secondary" onClick={() => setPage(p => p - 1)} disabled={page <= 1 || loading}><ChevronLeft size={14} />Previous</button>
              <button type="button" className="ui-btn ui-btn-sm ui-btn-secondary" onClick={() => setPage(p => p + 1)} disabled={page >= totalPages || loading}>Next<ChevronRight size={14} /></button>
            </div>
          </div>
        </>
      )}

      {selected && <TransactionDetail transaction={selected} onClose={() => setSelected(null)} />}
    </AdminLayout>
  );
}
