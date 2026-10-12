import React, { useEffect, useMemo, useState } from 'react';
import { toast } from 'react-toastify';
import { Check, X } from 'react-feather';
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, Tooltip } from 'chart.js';
import { Bar } from 'react-chartjs-2';
import { useTheme } from '../context/ThemeContext';
import { authFetch, catchError } from '../utils';
import {
  AdminLayout, ChartLegend, EmptyState, Loading, Notice, Stat,
  chartOptions, formatDate, formatNumber, formatUSD, humanize, useChartTheme
} from './admin/AdminUI';

ChartJS.register(CategoryScale, LinearScale, BarElement, Tooltip);

const PERIODS = [7, 30, 90];
// Fixed service order so each service keeps its color whatever the period shows.
const SERVICE_ORDER = ['text', 'image', 'video', 'tts', 'getimg'];
const serviceLabel = (service) => ({ tts: 'Text to speech', getimg: 'GetImg' }[service] || humanize(service));

const colorFor = (theme, service) => {
  const index = SERVICE_ORDER.indexOf(service);
  return index === -1 ? theme.muted : theme.series[index];
};

// Last `period` UTC days as YYYY-MM-DD, matching the server's daily buckets.
const dayKeys = (period) => Array.from({ length: period }, (_, i) => {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - (period - 1 - i));
  return d.toISOString().slice(0, 10);
});

function CostChart({ daily, period, services, theme }) {
  const days = dayKeys(period);
  const data = {
    labels: days.map(day => new Date(`${day}T00:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })),
    datasets: services.map(service => ({
      label: serviceLabel(service),
      data: days.map(day => daily.find(row => row.date === day && row.service === service)?.actualCost || 0),
      backgroundColor: colorFor(theme, service),
      borderColor: theme.surface,
      borderWidth: { top: 2 },
      maxBarThickness: 28,
    })),
  };
  return (
    <>
      <ChartLegend items={services.map(service => ({ label: serviceLabel(service), color: colorFor(theme, service) }))} />
      <div className="adm-chart">
        <Bar data={data} options={chartOptions(theme, { money: true, stacked: true })} />
      </div>
    </>
  );
}

function ServiceRates() {
  const [rates, setRates] = useState(null);
  const [error, setError] = useState(null);
  const [editing, setEditing] = useState(null); // { service, key, value }
  const [saving, setSaving] = useState(false);

  const fetchRates = async () => {
    const [err, data] = await catchError(authFetch({ path: '/admin/service-rates' }));
    if (err) return setError(err.message || 'Could not load service rates');
    setRates(data.rates);
  };

  useEffect(() => { fetchRates(); }, []);

  const save = async (e) => {
    e.preventDefault();
    const rate = Number(editing.value);
    if (editing.value === '' || Number.isNaN(rate) || rate < 0) return toast.error('Enter a rate of 0 or more');
    setSaving(true);
    const [err] = await catchError(authFetch({
      path: `/admin/service-rates/${editing.service}/${editing.key}`,
      method: 'PUT',
      body: { rate },
    }));
    setSaving(false);
    if (err) return toast.error(err.message || 'Could not save the rate');
    toast.success('Rate updated');
    setEditing(null);
    fetchRates();
  };

  if (error) return <Notice onRetry={() => { setError(null); fetchRates(); }}>{error}</Notice>;
  if (!rates) return <Loading label="Loading rates…" />;

  return (
    <div className="adm-grid">
      {Object.entries(rates).map(([serviceKey, service]) => (
        <div key={serviceKey} className="adm-card">
          <h3 className="adm-card-title">{service.name}</h3>
          <dl className="adm-dl" style={{ marginTop: 14 }}>
            {service.rates.map(item => {
              const isEditing = editing?.service === serviceKey && editing?.key === item.key;
              return (
                <React.Fragment key={item.key}>
                  <dt>{item.name}</dt>
                  <dd>
                    {isEditing ? (
                      <form className="adm-inline" onSubmit={save}>
                        <input
                          className="adm-input adm-input-sm"
                          type="number"
                          step="any"
                          min="0"
                          value={editing.value}
                          onChange={(e) => setEditing({ ...editing, value: e.target.value })}
                          autoFocus
                          aria-label={`${item.name} rate`}
                        />
                        <button type="submit" className="adm-icon-btn" disabled={saving} aria-label="Save"><Check size={15} /></button>
                        <button type="button" className="adm-icon-btn" onClick={() => setEditing(null)} disabled={saving} aria-label="Cancel"><X size={15} /></button>
                      </form>
                    ) : (
                      <button
                        type="button"
                        className="adm-sort"
                        style={{ textTransform: 'none', letterSpacing: 0, textDecoration: 'underline dotted', textUnderlineOffset: 3 }}
                        title="Click to edit"
                        onClick={() => setEditing({ service: serviceKey, key: item.key, value: String(item.rate) })}
                      >
                        {formatUSD(item.rate, 6)} <span className="adm-hint">{item.unit}</span>
                      </button>
                    )}
                  </dd>
                </React.Fragment>
              );
            })}
          </dl>
        </div>
      ))}
    </div>
  );
}

export default function CostAnalysisPage() {
  const { isDarkMode } = useTheme();
  const theme = useChartTheme(isDarkMode);
  const [period, setPeriod] = useState(30);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    const [err, result] = await catchError(authFetch({ path: `/admin/cost-analysis?period=${period}` }));
    if (err) setError(err.message || 'Could not load cost analysis');
    if (result) setData(result);
    setLoading(false);
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { fetchData(); }, [period]);

  const services = useMemo(() => {
    const present = Object.keys(data?.serviceBreakdown || {});
    return [...SERVICE_ORDER.filter(s => present.includes(s)), ...present.filter(s => !SERVICE_ORDER.includes(s))];
  }, [data]);

  const drift = data ? data.totals.actualCost - data.totals.estimatedCost : 0;

  return (
    <AdminLayout
      title="Cost analysis"
      subtitle="What AI generation costs us, by provider service, against what we estimated."
      actions={(
        <div className="ui-chip-row" role="group" aria-label="Period">
          {PERIODS.map(p => (
            <button key={p} type="button" className={`ui-chip${period === p ? ' active' : ''}`} aria-pressed={period === p} onClick={() => setPeriod(p)}>
              {p} days
            </button>
          ))}
        </div>
      )}
    >
      {error && <Notice onRetry={fetchData}>{error}</Notice>}

      {loading && !data ? (
        <Loading label="Loading cost analysis…" />
      ) : data && (
        <div style={{ opacity: loading ? 0.6 : 1 }}>
          <div className="adm-stats">
            <Stat label="Actual cost" value={formatUSD(data.totals.actualCost, 2)} note={`Last ${period} days`} />
            <Stat label="Estimated cost" value={formatUSD(data.totals.estimatedCost, 2)} note={`${drift >= 0 ? '+' : '-'}${formatUSD(Math.abs(drift), 2)} actual vs estimate`} />
            <Stat label="Operations" value={formatNumber(data.totals.count)} note="Completed generations" />
            <Stat label="Average per operation" value={formatUSD(data.totals.count ? data.totals.actualCost / data.totals.count : 0)} />
          </div>

          <section className="adm-card">
            <h2 className="adm-card-title" style={{ marginBottom: 16 }}>Actual cost per day</h2>
            {services.length === 0 ? (
              <EmptyState title="No costs in this period" />
            ) : theme && data.daily ? (
              <CostChart daily={data.daily} period={period} services={services} theme={theme} />
            ) : null}
          </section>

          {services.length > 0 && (
            <section className="adm-section">
              <div className="adm-section-head"><h2 className="adm-section-title">By service</h2></div>
              <div className="adm-table-wrap">
                <table className="adm-table">
                  <thead>
                    <tr>
                      <th>Service / operation</th>
                      <th className="num">Count</th>
                      <th className="num">Estimated</th>
                      <th className="num">Actual</th>
                      <th className="num">Difference</th>
                    </tr>
                  </thead>
                  <tbody>
                    {services.map(service => {
                      const stats = data.serviceBreakdown[service];
                      return (
                        <React.Fragment key={service}>
                          <tr>
                            <td>
                              <strong style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                                {theme && <i style={{ width: 10, height: 10, borderRadius: 3, background: colorFor(theme, service) }} />}
                                {serviceLabel(service)}
                              </strong>
                            </td>
                            <td className="num"><strong>{formatNumber(stats.count)}</strong></td>
                            <td className="num"><strong>{formatUSD(stats.estimatedCost)}</strong></td>
                            <td className="num"><strong>{formatUSD(stats.actualCost)}</strong></td>
                            <td className={`num ${stats.actualCost > stats.estimatedCost ? 'adm-negative' : 'adm-positive'}`}>
                              {formatUSD(stats.actualCost - stats.estimatedCost)}
                            </td>
                          </tr>
                          {stats.actions.map(action => (
                            <tr key={`${service}-${action.action}`}>
                              <td style={{ paddingLeft: 34 }} className="adm-muted">{humanize(action.action)}</td>
                              <td className="num">{formatNumber(action.count)}</td>
                              <td className="num">{formatUSD(action.estimatedCost)}</td>
                              <td className="num">{formatUSD(action.actualCost)}</td>
                              <td className="num">{formatUSD(action.actualCost - action.estimatedCost)}</td>
                            </tr>
                          ))}
                        </React.Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          <section className="adm-section">
            <div className="adm-section-head">
              <h2 className="adm-section-title">Service rates</h2>
              <span className="adm-hint">Click a rate to edit. New estimates use it right away.</span>
            </div>
            <ServiceRates />
          </section>

          {data.recentEstimates?.length > 0 && (
            <section className="adm-section">
              <div className="adm-section-head"><h2 className="adm-section-title">Recent operations</h2></div>
              <div className="adm-table-wrap">
                <table className="adm-table">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Service</th>
                      <th>Operation</th>
                      <th>User</th>
                      <th className="num">Estimated</th>
                      <th className="num">Actual</th>
                      <th className="num">Difference</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.recentEstimates.map(estimate => {
                      const diff = (estimate.actualCost || 0) - (estimate.estimatedCost || 0);
                      return (
                        <tr key={estimate._id}>
                          <td style={{ whiteSpace: 'nowrap' }}>{formatDate(estimate.createdAt, true)}</td>
                          <td>{serviceLabel(estimate.service)}</td>
                          <td>{humanize(estimate.action)}</td>
                          <td className="truncate">{estimate.userId?.username || estimate.userId?.email || 'System'}</td>
                          <td className="num">{formatUSD(estimate.estimatedCost)}</td>
                          <td className="num">{formatUSD(estimate.actualCost)}</td>
                          <td className={`num ${diff > 0 ? 'adm-negative' : 'adm-positive'}`}>{diff > 0 ? '+' : ''}{formatUSD(diff)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>
          )}
        </div>
      )}
    </AdminLayout>
  );
}
