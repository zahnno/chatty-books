import React, { useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle, ChevronDown, ChevronRight, Info, RefreshCw, XCircle } from 'react-feather';
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, Tooltip } from 'chart.js';
import { Bar } from 'react-chartjs-2';
import { useTheme } from '../../context/ThemeContext';
import { authFetch, catchError } from '../../utils';
import {
  AdminLayout, Badge, ChartLegend, EmptyState, Loading, Notice, Stat,
  chartOptions, formatDate, formatNumber, formatUSD, useChartTheme
} from './AdminUI';

ChartJS.register(CategoryScale, LinearScale, BarElement, Tooltip);

const PERIODS = [7, 30, 90, 365];
// Fixed order so each provider keeps its color whatever the period shows.
const PROVIDERS = ['stripe', 'apple', 'play', 'solana'];
const PROVIDER_LABELS = { stripe: 'Stripe (web)', apple: 'App Store', play: 'Google Play', solana: 'Solana (Seeker)', none: 'No provider', unknown: 'Unknown' };
const providerLabel = (p) => PROVIDER_LABELS[p] || p;

const colorFor = (theme, provider) => {
  const index = PROVIDERS.indexOf(provider);
  return index === -1 ? theme.muted : theme.series[index];
};

const SEVERITY = {
  error: { icon: XCircle, tone: 'danger', label: 'Problem' },
  warning: { icon: AlertTriangle, tone: 'warning', label: 'Warning' },
  info: { icon: Info, tone: undefined, label: 'Info' },
};

// Last `period` UTC days as YYYY-MM-DD, matching the server's daily buckets.
const dayKeys = (period) => Array.from({ length: period }, (_, i) => {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - (period - 1 - i));
  return d.toISOString().slice(0, 10);
});

const userLabel = (u) => {
  if (!u) return 'Deleted user';
  if (u.email || u.username) return u.email || u.username;
  return u.walletAddress ? `${u.walletAddress.slice(0, 4)}…${u.walletAddress.slice(-4)}` : u._id;
};

function RevenueChart({ daily, period, theme }) {
  const days = dayKeys(period);
  const providers = PROVIDERS.filter(p => daily.some(row => row.provider === p));
  const data = {
    labels: days.map(day => new Date(`${day}T00:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })),
    datasets: providers.map(provider => ({
      label: providerLabel(provider),
      data: days.map(day => daily.find(row => row.date === day && row.provider === provider)?.usd || 0),
      backgroundColor: colorFor(theme, provider),
      borderColor: theme.surface,
      borderWidth: { top: 2 },
      maxBarThickness: 28,
    })),
  };
  return (
    <>
      <ChartLegend items={providers.map(p => ({ label: providerLabel(p), color: colorFor(theme, p) }))} />
      <div className="adm-chart">
        <Bar data={data} options={chartOptions(theme, { money: true, stacked: true })} />
      </div>
    </>
  );
}

function ProviderDot({ provider, theme }) {
  if (!theme) return null;
  return <i className="adm-pay-dot" style={{ background: colorFor(theme, provider) }} />;
}

function Issue({ issue }) {
  const [open, setOpen] = useState(false);
  const { icon: Icon, tone } = SEVERITY[issue.severity] || SEVERITY.info;
  const expandable = issue.users?.length > 0;
  return (
    <li className={`adm-pay-issue adm-pay-issue-${issue.severity}`}>
      <button
        type="button"
        className="adm-pay-issue-head"
        onClick={() => expandable && setOpen(!open)}
        aria-expanded={expandable ? open : undefined}
        disabled={!expandable}
      >
        <Icon size={16} className="adm-pay-issue-icon" />
        <span className="adm-pay-issue-text">
          <strong>{issue.title}</strong>
          <span className="adm-hint">{issue.detail}</span>
        </span>
        <span className="adm-pay-issue-meta">
          {issue.provider && <Badge>{providerLabel(issue.provider)}</Badge>}
          {issue.users?.length > 0 && <Badge tone={tone}>{formatNumber(issue.count)} {issue.count === 1 ? 'account' : 'accounts'}</Badge>}
          {expandable && (open ? <ChevronDown size={16} /> : <ChevronRight size={16} />)}
        </span>
      </button>
      {open && (
        <div className="adm-table-wrap adm-pay-issue-users">
          <table className="adm-table">
            <thead>
              <tr><th>Account</th><th>Provider</th><th>Status</th><th>Period ends</th></tr>
            </thead>
            <tbody>
              {issue.users.map(u => (
                <tr key={u._id}>
                  <td className="truncate">{userLabel(u)}</td>
                  <td>{u.subscription?.provider ? providerLabel(u.subscription.provider) : '-'}</td>
                  <td>{u.subscription?.status ? <Badge>{u.subscription.status}</Badge> : '-'}</td>
                  <td>{formatDate(u.subscription?.endDate)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {issue.count > issue.users.length && (
            <p className="adm-hint" style={{ padding: '8px 14px' }}>Showing {issue.users.length} of {formatNumber(issue.count)}.</p>
          )}
        </div>
      )}
    </li>
  );
}

function ProviderSetup({ provider, config, theme }) {
  return (
    <div className="adm-card">
      <div className="adm-pay-card-head">
        <h3 className="adm-card-title"><ProviderDot provider={provider} theme={theme} />{providerLabel(provider)}</h3>
        <Badge tone={config.configured ? 'success' : 'danger'}>{config.configured ? 'Configured' : 'Not configured'}</Badge>
      </div>
      <ul className="adm-pay-checks">
        {config.checks.map(c => {
          const Icon = c.level === 'ok' ? CheckCircle : c.level === 'warning' ? AlertTriangle : XCircle;
          return (
            <li key={c.label} className={`adm-pay-check-${c.level}`}>
              <Icon size={15} aria-label={c.level === 'ok' ? 'OK' : c.level} />
              <span>
                <strong>{c.label}</strong>
                <span className="adm-hint">{c.detail}</span>
              </span>
            </li>
          );
        })}
      </ul>
      <dl className="adm-dl" style={{ marginTop: 14 }}>
        <dt>Mode</dt>
        <dd>{config.mode || '-'}</dd>
        {provider !== 'solana' && (
          <>
            <dt>Last webhook</dt>
            <dd>{config.lastWebhook ? `${formatDate(config.lastWebhook.at, true)} (${formatNumber(config.lastWebhook.count)} total)` : 'None recorded'}</dd>
          </>
        )}
      </dl>
    </div>
  );
}

export default function PaymentsDashboard() {
  const { isDarkMode } = useTheme();
  const theme = useChartTheme(isDarkMode);
  const [period, setPeriod] = useState(30);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    const [err, result] = await catchError(authFetch({ path: `/api/admin/payments?period=${period}` }));
    if (err) setError(err.message || 'Could not load the payments overview');
    if (result) setData(result);
    setLoading(false);
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { fetchData(); }, [period]);

  const subs = data?.subscribers.byProvider || {};
  const rows = data ? [...PROVIDERS, ...Object.keys(subs).filter(p => !PROVIDERS.includes(p))] : [];
  const sum = (field) => Object.values(subs).reduce((t, r) => t + (r[field] || 0), 0);
  const problems = data?.issues.filter(i => i.severity === 'error').length || 0;
  const warnings = data?.issues.filter(i => i.severity === 'warning').length || 0;
  const sandboxPeriods = data ? Object.values(data.revenue.byProvider).reduce((t, r) => t + r.sandbox, 0) : 0;

  return (
    <AdminLayout
      title="Payments"
      subtitle="Every billing provider in one place: setup, subscribers, revenue and anything that doesn't add up."
      actions={(
        <>
          <div className="ui-chip-row" role="group" aria-label="Period">
            {PERIODS.map(p => (
              <button key={p} type="button" className={`ui-chip${period === p ? ' active' : ''}`} aria-pressed={period === p} onClick={() => setPeriod(p)}>
                {p === 365 ? '1 year' : `${p} days`}
              </button>
            ))}
          </div>
          <button type="button" className="adm-icon-btn" onClick={fetchData} disabled={loading} aria-label="Refresh">
            <RefreshCw size={16} />
          </button>
        </>
      )}
    >
      {error && <Notice onRetry={fetchData}>{error}</Notice>}

      {loading && !data ? (
        <Loading label="Loading payments…" />
      ) : data && (
        <div style={{ opacity: loading ? 0.6 : 1 }}>
          <div className="adm-stats">
            <Stat
              label="Revenue"
              value={formatUSD(data.revenue.totalUSD, 2)}
              note={`Last ${period} days, list price before fees${sandboxPeriods ? ` · ${formatNumber(sandboxPeriods)} sandbox excluded` : ''}`}
            />
            <Stat label="Monthly recurring" value={formatUSD(sum('mrr'), 2)} note="Plans set to renew, plus live crypto passes" />
            <Stat label="Paying subscribers" value={formatNumber(sum('active') + sum('pastDue'))} note={`${formatNumber(sum('ending'))} ending · ${formatNumber(sum('pastDue'))} past due · ${formatNumber(data.subscribers.free)} free`} />
            <Stat
              label="Needs attention"
              value={problems || warnings ? `${problems} / ${warnings}` : 'All clear'}
              note="Problems / warnings"
            />
          </div>

          <section className="adm-card">
            <h2 className="adm-card-title" style={{ marginBottom: 16 }}>Revenue per day</h2>
            {data.revenue.daily.length === 0 ? (
              <EmptyState title="No payments in this period" />
            ) : theme ? (
              <RevenueChart daily={data.revenue.daily} period={period} theme={theme} />
            ) : null}
          </section>

          <section className="adm-section">
            <div className="adm-section-head"><h2 className="adm-section-title">By provider</h2></div>
            <div className="adm-table-wrap">
              <table className="adm-table">
                <thead>
                  <tr>
                    <th>Provider</th>
                    <th className="num">Renewing</th>
                    <th className="num">Ending</th>
                    <th className="num">Past due</th>
                    <th className="num">Lapsed</th>
                    <th className="num">Sandbox</th>
                    <th className="num">Monthly recurring</th>
                    <th className="num">Paid periods</th>
                    <th className="num">Revenue ({period}d)</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map(provider => {
                    const s = subs[provider] || {};
                    const r = data.revenue.byProvider[provider] || {};
                    return (
                      <tr key={provider}>
                        <td>
                          <strong style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                            <ProviderDot provider={provider} theme={theme} />
                            {providerLabel(provider)}
                          </strong>
                        </td>
                        <td className="num">{formatNumber(s.renewing || 0)}</td>
                        <td className="num">{formatNumber(s.ending || 0)}</td>
                        <td className="num">{formatNumber(s.pastDue || 0)}</td>
                        <td className="num">{formatNumber(s.lapsed || 0)}</td>
                        <td className="num">{formatNumber(s.sandbox || 0)}</td>
                        <td className="num">{formatUSD(s.mrr || 0, 2)}</td>
                        <td className="num">{formatNumber(r.periods || 0)}</td>
                        <td className="num"><strong>{formatUSD(r.usd || 0, 2)}</strong></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p className="adm-hint" style={{ marginTop: 8 }}>
              Ending: cancelled, keeps access until the period ends. Lapsed: expired, cancelled or refunded but still on a paid plan.
              Sandbox: App Store sandbox / TestFlight or Play license testers, no money received.
            </p>
          </section>

          <section className="adm-section">
            <div className="adm-section-head">
              <h2 className="adm-section-title">Needs attention</h2>
              <span className="adm-hint">Checked live against the database</span>
            </div>
            {data.issues.length === 0 ? (
              <div className="adm-card"><EmptyState icon={CheckCircle} title="Nothing to fix" text="Every subscription state adds up." /></div>
            ) : (
              <ul className="adm-pay-issues">
                {data.issues.map(issue => <Issue key={`${issue.title}-${issue.provider}`} issue={issue} />)}
              </ul>
            )}
          </section>

          <section className="adm-section">
            <div className="adm-section-head">
              <h2 className="adm-section-title">Provider setup</h2>
              <span className="adm-hint">Server environment on this deployment</span>
            </div>
            <div className="adm-grid-2 adm-pay-setup">
              {PROVIDERS.map(p => <ProviderSetup key={p} provider={p} config={data.providers[p]} theme={theme} />)}
            </div>
          </section>

          <section className="adm-section">
            <div className="adm-section-head"><h2 className="adm-section-title">Plan product ids</h2></div>
            <div className="adm-table-wrap">
              <table className="adm-table">
                <thead>
                  <tr><th>Plan</th><th className="num">Price</th><th>Stripe price</th><th>App Store product</th><th>Play product</th></tr>
                </thead>
                <tbody>
                  {data.plans.filter(p => p.price > 0).map(plan => (
                    <tr key={plan._id}>
                      <td><strong>{plan.name}</strong> {!plan.isActive && <Badge>inactive</Badge>}</td>
                      <td className="num">{formatUSD(plan.price, 2)}</td>
                      {['stripePriceId', 'appleProductId', 'playProductId'].map(field => (
                        <td key={field}>
                          {plan[field] ? <code className="adm-code">{plan[field]}</code> : <Badge tone="warning">missing</Badge>}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="adm-section">
            <div className="adm-section-head"><h2 className="adm-section-title">Recent payments</h2></div>
            {data.recent.length === 0 ? (
              <div className="adm-card"><EmptyState title="No payments yet" /></div>
            ) : (
              <div className="adm-table-wrap">
                <table className="adm-table">
                  <thead>
                    <tr><th>Date</th><th>Provider</th><th>Type</th><th>Account</th><th>Plan</th><th className="num">Amount</th><th>Reference</th></tr>
                  </thead>
                  <tbody>
                    {data.recent.map(p => (
                      <tr key={p._id}>
                        <td style={{ whiteSpace: 'nowrap' }}>{formatDate(p.at, true)}</td>
                        <td style={{ whiteSpace: 'nowrap' }}><ProviderDot provider={p.provider} theme={theme} />{providerLabel(p.provider)}</td>
                        <td>{p.kind} {p.sandbox && <Badge tone="warning">sandbox</Badge>}</td>
                        <td className="truncate">{userLabel(p.user)}</td>
                        <td>{p.plan}</td>
                        <td className={`num${p.sandbox ? ' adm-muted' : ''}`}>{formatUSD(p.usd, 2)}</td>
                        <td className="truncate">{p.reference ? <code className="adm-code">{p.reference}</code> : '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <p className="adm-hint" style={{ marginTop: 24 }}>
            Updated {formatDate(data.generatedAt, true)}. Revenue counts each paid period at its plan's current list price
            (Stripe, App Store, Play) or the confirmed USD amount (Solana); store and processor fees are not deducted.
          </p>
        </div>
      )}
    </AdminLayout>
  );
}
