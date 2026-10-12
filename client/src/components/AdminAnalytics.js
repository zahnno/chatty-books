import React, { useEffect, useState } from 'react';
import { toast } from 'react-toastify';
import { Download } from 'react-feather';
import {
  Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, BarElement, Tooltip, Filler
} from 'chart.js';
import { Bar, Line } from 'react-chartjs-2';
import { getServerUri, thumbUrl } from '@talkingbook/shared';
import { useTheme } from '../context/ThemeContext';
import { authFetch, catchError, getToken } from '../utils';
import {
  AdminLayout, ChartLegend, EmptyState, Loading, Notice, Stat,
  chartOptions, formatNumber, humanize, useChartTheme
} from './admin/AdminUI';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, BarElement, Tooltip, Filler);

const RANGES = [{ value: '7d', label: '7 days' }, { value: '30d', label: '30 days' }, { value: '90d', label: '90 days' }];
const TABS = [
  { value: 'overview', label: 'Overview' },
  { value: 'users', label: 'Users' },
  { value: 'content', label: 'Content' },
  { value: 'features', label: 'Features' },
];

const shortDate = (day) => new Date(`${day}T00:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });

function Delta({ value }) {
  if (value == null) return 'No previous data';
  const up = value >= 0;
  return <span className={up ? 'adm-delta-up' : 'adm-delta-down'}>{up ? '▲' : '▼'} {Math.abs(value).toFixed(1)}% vs previous period</span>;
}

// Ranked horizontal bars as plain rows: label, value, and a proportional track.
function RankedBars({ rows, unit, color }) {
  const max = Math.max(...rows.map(r => r.value), 1);
  return (
    <div className="adm-list">
      {rows.map(row => (
        <div key={row.key} className="adm-row">
          {row.image !== undefined && (
            row.image ? <img className={row.round ? 'adm-avatar' : 'adm-thumb'} src={thumbUrl(row.image, 100)} alt="" loading="lazy" /> : <div className={row.round ? 'adm-avatar' : 'adm-thumb'} />
          )}
          <div className="adm-row-body">
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
              <p className="adm-row-title">{row.label}</p>
              <span className="adm-muted" style={{ margin: 0, whiteSpace: 'nowrap' }}>{formatNumber(row.value)} {unit}</span>
            </div>
            <div className="adm-bar-track"><div className="adm-bar-fill" style={{ width: `${(row.value / max) * 100}%`, background: color }} /></div>
          </div>
        </div>
      ))}
    </div>
  );
}

function Retention({ matrix, color }) {
  if (!matrix?.length) return <EmptyState title="Not enough data" />;
  const columns = matrix.length;
  return (
    <div className="adm-retention" style={{ gridTemplateColumns: `72px repeat(${columns}, minmax(44px, 1fr))` }}>
      <div className="adm-hint">Cohort</div>
      {matrix.map((_, j) => <div key={`h${j}`} className="adm-hint">Wk {j}</div>)}
      {matrix.map((row, i) => (
        <React.Fragment key={i}>
          <div className="adm-hint" style={{ textAlign: 'left' }}>Week {i + 1}</div>
          {Array.from({ length: columns }, (_, j) => {
            const value = row[j];
            if (value == null) return <div key={j} />;
            const strong = value >= 55;
            return (
              <div
                key={j}
                title={`Week ${i + 1} cohort, ${j} week${j !== 1 ? 's' : ''} later: ${value}%`}
                style={{
                  background: `color-mix(in srgb, ${color} ${Math.max(value, 4)}%, transparent)`,
                  color: strong ? '#fff' : 'var(--text-primary)',
                }}
              >
                {value}%
              </div>
            );
          })}
        </React.Fragment>
      ))}
    </div>
  );
}

export default function AdminAnalytics() {
  const { isDarkMode } = useTheme();
  const theme = useChartTheme(isDarkMode);
  const [range, setRange] = useState('7d');
  const [tab, setTab] = useState('overview');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [exporting, setExporting] = useState(false);

  const fetchAnalytics = async () => {
    setLoading(true);
    setError(null);
    const [err, result] = await catchError(authFetch({ path: `/admin/analytics?timeRange=${range}` }));
    if (err) setError(err.message || 'Could not load analytics');
    if (result) setData(result);
    setLoading(false);
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { fetchAnalytics(); }, [range]);

  // The export is CSV, which authFetch (JSON only) can't read, so fetch it directly.
  const downloadCSV = async () => {
    setExporting(true);
    try {
      const token = await getToken();
      const response = await fetch(`${getServerUri()}/admin/analytics/export?timeRange=${range}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!response.ok) throw new Error(response.statusText || 'Export failed');
      const url = URL.createObjectURL(await response.blob());
      const a = document.createElement('a');
      a.href = url;
      a.download = `analytics_${range}_${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      toast.error(err.message || 'Could not export analytics');
    } finally {
      setExporting(false);
    }
  };

  const series = theme?.series || [];
  const overview = data?.overview;

  return (
    <AdminLayout
      title="Platform analytics"
      subtitle="Reader activity, engagement and what people use."
      actions={(
        <>
          <div className="ui-chip-row" role="group" aria-label="Time range">
            {RANGES.map(r => (
              <button key={r.value} type="button" className={`ui-chip${range === r.value ? ' active' : ''}`} aria-pressed={range === r.value} onClick={() => setRange(r.value)}>
                {r.label}
              </button>
            ))}
          </div>
          <button type="button" className="ui-btn ui-btn-secondary" onClick={downloadCSV} disabled={exporting}>
            <Download size={16} />{exporting ? 'Exporting…' : 'Export CSV'}
          </button>
        </>
      )}
    >
      {error && <Notice onRetry={fetchAnalytics}>{error}</Notice>}

      {loading && !data ? (
        <Loading label="Loading analytics…" />
      ) : data && theme && (
        <div style={{ opacity: loading ? 0.6 : 1 }}>
          <div className="adm-stats">
            <Stat label="Active users" value={formatNumber(overview.activeUsers)} note={<Delta value={overview.userGrowth} />} />
            <Stat label="Avg. session" value={`${overview.avgSessionDuration} min`} note={<Delta value={overview.sessionGrowth} />} />
            <Stat label="Interactions" value={formatNumber(overview.totalInteractions)} note={<Delta value={overview.interactionGrowth} />} />
            <Stat label="Interactions per user" value={(overview.engagementRate / 100).toFixed(1)} note={<Delta value={overview.engagementGrowth} />} />
          </div>

          <div className="ui-chip-row" role="tablist" style={{ marginBottom: 20 }}>
            {TABS.map(t => (
              <button key={t.value} type="button" role="tab" aria-selected={tab === t.value} className={`ui-chip${tab === t.value ? ' active' : ''}`} onClick={() => setTab(t.value)}>
                {t.label}
              </button>
            ))}
          </div>

          {tab === 'overview' && (
            <div className="adm-grid-2">
              <section className="adm-card">
                <h2 className="adm-card-title" style={{ marginBottom: 16 }}>Daily active users</h2>
                {data.dailyActiveUsers.length ? (
                  <div className="adm-chart">
                    <Line
                      data={{
                        labels: data.dailyActiveUsers.map(d => shortDate(d.date)),
                        datasets: [{
                          label: 'Active users',
                          data: data.dailyActiveUsers.map(d => d.users),
                          borderColor: series[0],
                          backgroundColor: `${series[0]}1f`, // ~12% alpha; canvas can't parse color-mix()
                          fill: true,
                          pointRadius: data.dailyActiveUsers.length < 2 ? 4 : 0,
                        }],
                      }}
                      options={chartOptions(theme)}
                    />
                  </div>
                ) : <EmptyState title="No activity in this period" />}
              </section>
              <section className="adm-card">
                <h2 className="adm-card-title" style={{ marginBottom: 16 }}>What people do</h2>
                {data.featureUsage.length ? (
                  <RankedBars
                    color={series[0]}
                    unit=""
                    rows={[...data.featureUsage].sort((a, b) => b.value - a.value).map(f => ({ key: f.name, label: humanize(f.name), value: f.value }))}
                  />
                ) : <EmptyState title="No activity in this period" />}
              </section>
            </div>
          )}

          {tab === 'users' && (
            <>
              <div className="adm-grid-2">
                <section className="adm-card">
                  <h2 className="adm-card-title" style={{ marginBottom: 16 }}>Active users by hour (UTC)</h2>
                  <div className="adm-chart adm-chart-sm">
                    <Bar
                      data={{
                        labels: data.userEngagement.map(d => d.timeSlot),
                        datasets: [{ label: 'Active users', data: data.userEngagement.map(d => d.activeUsers), backgroundColor: series[0], maxBarThickness: 18 }],
                      }}
                      options={chartOptions(theme)}
                    />
                  </div>
                </section>
                <section className="adm-card">
                  <h2 className="adm-card-title" style={{ marginBottom: 16 }}>Interactions by hour (UTC)</h2>
                  <div className="adm-chart adm-chart-sm">
                    <Bar
                      data={{
                        labels: data.userEngagement.map(d => d.timeSlot),
                        datasets: [{ label: 'Interactions', data: data.userEngagement.map(d => d.interactions), backgroundColor: series[0], maxBarThickness: 18 }],
                      }}
                      options={chartOptions(theme)}
                    />
                  </div>
                </section>
              </div>
              <section className="adm-card" style={{ marginTop: 16 }}>
                <h2 className="adm-card-title">Weekly retention</h2>
                <p className="adm-muted" style={{ marginBottom: 16 }}>Share of each week's active users who were active again in later weeks.</p>
                <Retention matrix={data.retention} color={series[0]} />
              </section>
            </>
          )}

          {tab === 'content' && (
            <div className="adm-grid-2">
              <section>
                <div className="adm-section-head"><h2 className="adm-section-title">Most read books</h2></div>
                {data.popularBooks.popularBooks.length ? (
                  <RankedBars
                    color={series[0]}
                    unit="interactions"
                    rows={data.popularBooks.popularBooks.map((b, i) => ({ key: b.id || i, label: b.title, value: b.interactions, image: b.coverUrl || null }))}
                  />
                ) : <EmptyState title="No book activity in this period" />}
              </section>
              <section>
                <div className="adm-section-head"><h2 className="adm-section-title">Most chatted characters</h2></div>
                {data.characterStats.length ? (
                  <RankedBars
                    color={series[0]}
                    unit="chats"
                    rows={data.characterStats.map((c, i) => ({ key: c.id || i, label: c.name, value: c.totalChats, image: c.imageUrl || null, round: true }))}
                  />
                ) : <EmptyState title="No chats in this period" />}
              </section>
            </div>
          )}

          {tab === 'features' && (
            <section className="adm-card">
              <h2 className="adm-card-title" style={{ marginBottom: 16 }}>Feature use per day</h2>
              {data.featureTrends.length ? (
                <>
                  <ChartLegend items={[
                    { label: 'Chats', color: series[0] },
                    { label: 'Image generation', color: series[1] },
                    { label: 'Audio generation', color: series[2] },
                  ]} />
                  <div className="adm-chart">
                    <Line
                      data={{
                        labels: data.featureTrends.map(d => shortDate(d.date)),
                        datasets: [
                          { label: 'Chats', data: data.featureTrends.map(d => d.chats), borderColor: series[0], backgroundColor: series[0] },
                          { label: 'Image generation', data: data.featureTrends.map(d => d.imageGen), borderColor: series[1], backgroundColor: series[1] },
                          { label: 'Audio generation', data: data.featureTrends.map(d => d.audioGen), borderColor: series[2], backgroundColor: series[2] },
                        ],
                      }}
                      options={chartOptions(theme)}
                    />
                  </div>
                </>
              ) : <EmptyState title="No activity in this period" />}
            </section>
          )}
        </div>
      )}
    </AdminLayout>
  );
}
