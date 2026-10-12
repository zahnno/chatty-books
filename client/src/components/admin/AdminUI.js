import React, { useEffect, useRef, useState } from 'react';
import { Link, NavLink } from 'react-router-dom';
import {
  Activity, ArrowLeft, BarChart2, Book, CreditCard, DollarSign, Edit3, Inbox, Lock, Search, Star, ToggleRight, TrendingUp, X
} from 'react-feather';
import { useAuth } from '../../context/AuthContext';
import '../../styles/admin.css';

export const ADMIN_SECTIONS = [
  { to: '/admin/books', label: 'Books', icon: Book },
  { to: '/admin/book-requests', label: 'Requests', icon: Edit3 },
  { to: '/admin/featured-content', label: 'Featured', icon: Star },
  { to: '/admin/subscriptions', label: 'Plans', icon: CreditCard },
  { to: '/admin/payments', label: 'Payments', icon: DollarSign },
  { to: '/admin/features', label: 'Features', icon: ToggleRight },
  { to: '/admin/transactions', label: 'Transactions', icon: Activity },
  { to: '/admin/cost-analysis', label: 'Cost analysis', icon: BarChart2 },
  { to: '/admin/analytics', label: 'Analytics', icon: TrendingUp },
];

// Shell for every admin page: the section nav, an optional back link, the page title
// with its actions, and an admin-only gate (the server enforces access too; this just
// avoids rendering a broken page for everyone else).
export function AdminLayout({ title, eyebrow = 'Admin', subtitle, actions, back, wide = true, children }) {
  const { user, loading } = useAuth();

  if (loading && !user) {
    return <div className="ui-page adm"><Loading label="Checking access…" /></div>;
  }

  if (user?.role !== 'admin') {
    return (
      <div className="ui-page adm">
        <div className="adm-denied">
          <EmptyState
            icon={Lock}
            title="Admins only"
            text={user ? 'Your account does not have access to this area.' : 'Sign in with an admin account to continue.'}
            action={<Link className="ui-btn ui-btn-primary" to={user ? '/' : '/login'}>{user ? 'Go home' : 'Sign in'}</Link>}
          />
        </div>
      </div>
    );
  }

  return (
    <div className={`ui-page adm${wide ? '' : ' ui-page-narrow'}`}>
      <nav className="adm-nav" aria-label="Admin sections">
        {ADMIN_SECTIONS.map(({ to, label, icon: Icon }) => (
          <NavLink key={to} to={to} className="adm-nav-link">
            <Icon size={15} />
            {label}
          </NavLink>
        ))}
      </nav>

      {back && (
        <Link to={back.to} className="adm-back">
          <ArrowLeft size={15} />
          {back.label}
        </Link>
      )}

      <header className="adm-header">
        <div className="adm-header-text">
          {eyebrow && <span className="ui-section-eyebrow">{eyebrow}</span>}
          <h1 className="ui-page-title">{title}</h1>
          {subtitle && <p className="ui-page-subtitle">{subtitle}</p>}
        </div>
        {actions && <div className="adm-actions">{actions}</div>}
      </header>

      {children}
    </div>
  );
}

export function Loading({ label = 'Loading…' }) {
  return (
    <div className="adm-loading" role="status">
      <span className="adm-spinner" />
      {label}
    </div>
  );
}

export function EmptyState({ icon: Icon = Inbox, title, text, action }) {
  return (
    <div className="adm-empty">
      <Icon size={32} strokeWidth={1.5} />
      {title && <h3>{title}</h3>}
      {text && <p>{text}</p>}
      {action}
    </div>
  );
}

export function Notice({ children, onRetry }) {
  return (
    <div className="adm-notice" role="alert">
      <span>{children}</span>
      {onRetry && <button type="button" className="ui-btn ui-btn-sm ui-btn-secondary" onClick={onRetry}>Retry</button>}
    </div>
  );
}

export function Stat({ label, value, note, icon: Icon }) {
  return (
    <div className="adm-stat">
      <div className="adm-stat-label">{Icon && <Icon size={14} />}{label}</div>
      <div className="adm-stat-value">{value}</div>
      {note && <div className="adm-stat-note">{note}</div>}
    </div>
  );
}

const BADGE_TONES = {
  active: 'success', completed: 'success', approved: 'success', credit: 'success', public: 'success',
  pending: 'warning', partial: 'warning', estimated: 'warning', private: 'warning',
  inactive: 'danger', failed: 'danger', rejected: 'danger', debit: 'danger',
};

export function Badge({ tone, children }) {
  const key = typeof children === 'string' ? children.toLowerCase() : '';
  const resolved = tone || BADGE_TONES[key];
  return <span className={`adm-badge${resolved ? ` adm-badge-${resolved}` : ''}`}>{children}</span>;
}

export function Field({ label, hint, htmlFor, children }) {
  return (
    <div className="adm-field">
      {label && <label className="adm-label" htmlFor={htmlFor}>{label}</label>}
      {children}
      {hint && <span className="adm-hint">{hint}</span>}
    </div>
  );
}

export function SearchInput({ value, onChange, placeholder }) {
  return (
    <label className="ui-search">
      <Search size={16} />
      <input type="search" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} aria-label={placeholder} />
    </label>
  );
}

// File picker with drag and drop, a filename or thumbnail preview, and a remove button.
export function FileDrop({ accept, label, hint, fileName, previewUrl, previewShape, onFile, onClear }) {
  const inputRef = useRef(null);
  const [dragging, setDragging] = useState(false);

  return (
    <div
      className={`adm-drop${dragging ? ' is-dragging' : ''}`}
      role="button"
      tabIndex={0}
      onClick={() => inputRef.current?.click()}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); inputRef.current?.click(); } }}
      onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        const file = e.dataTransfer.files?.[0];
        if (file) onFile(file);
      }}
    >
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onFile(file);
          e.target.value = '';
        }}
      />
      {previewUrl && <img src={previewUrl} alt="" className={`adm-drop-preview${previewShape === 'square' ? ' square' : ''}`} />}
      <div className="adm-drop-text">
        <strong>{fileName || label}</strong>
        <span>{fileName ? 'Click or drop to replace' : hint}</span>
      </div>
      {(fileName || previewUrl) && onClear && (
        <button
          type="button"
          className="adm-icon-btn danger"
          style={{ marginLeft: 'auto' }}
          aria-label="Remove file"
          onClick={(e) => { e.stopPropagation(); onClear(); }}
        >
          <X size={16} />
        </button>
      )}
    </div>
  );
}

export function Modal({ title, onClose, wide, children, busy }) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape' && !busy) onClose(); };
    document.addEventListener('keydown', onKey);
    const { overflow } = document.body.style;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = overflow;
    };
  }, [onClose, busy]);

  return (
    <div className="adm adm-modal-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget && !busy) onClose(); }}>
      <div className={`adm-modal${wide ? ' adm-modal-wide' : ''}`} role="dialog" aria-modal="true" aria-label={title}>
        <div className="adm-modal-head">
          <h2 className="adm-modal-title">{title}</h2>
          <button type="button" className="adm-icon-btn" onClick={onClose} disabled={busy} aria-label="Close">
            <X size={18} />
          </button>
        </div>
        <div className="adm-modal-body">{children}</div>
      </div>
    </div>
  );
}

// Chart.js reads colors as strings, so resolve the admin tokens for the current theme.
export function useChartTheme(isDarkMode) {
  const [theme, setTheme] = useState(null);

  useEffect(() => {
    const probe = document.createElement('div');
    probe.className = 'adm';
    probe.style.display = 'none';
    document.body.appendChild(probe);
    const css = getComputedStyle(probe);
    const root = getComputedStyle(document.documentElement);
    const read = (name, from = css) => from.getPropertyValue(name).trim();
    setTheme({
      series: [1, 2, 3, 4, 5].map(i => read(`--adm-series-${i}`)),
      text: read('--text-secondary', root),
      muted: read('--text-muted', root),
      grid: read('--separator', root),
      surface: read('--raised', root),
      font: read('--font-primary', root),
    });
    document.body.removeChild(probe);
  }, [isDarkMode]);

  return theme;
}

// Shared Chart.js options: recessive grid, token-colored text, crosshair-style tooltips.
export function chartOptions(theme, { money = false, stacked = false, legend = false } = {}) {
  if (!theme) return {};
  const tick = { color: theme.muted, font: { family: theme.font, size: 12 } };
  return {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: 'index', intersect: false },
    plugins: {
      legend: { display: legend, labels: { color: theme.text, boxWidth: 10, boxHeight: 10, font: { family: theme.font } } },
      ...(money && {
        tooltip: { callbacks: { label: (ctx) => `${ctx.dataset.label}: ${formatUSD(ctx.parsed.y)}` } },
      }),
    },
    elements: {
      line: { borderWidth: 2, tension: 0.3 },
      point: { radius: 0, hoverRadius: 4 },
      bar: { borderRadius: 4, borderSkipped: 'start' },
    },
    scales: {
      x: { stacked, grid: { display: false }, border: { color: theme.grid }, ticks: { ...tick, maxRotation: 0, autoSkipPadding: 16 } },
      y: {
        stacked,
        beginAtZero: true,
        grid: { color: theme.grid },
        border: { display: false },
        ticks: { ...tick, ...(money && { callback: (v) => formatUSD(v, 2) }) },
      },
    },
  };
}

export function ChartLegend({ items }) {
  if (!items || items.length < 2) return null;
  return (
    <ul className="adm-legend">
      {items.map(({ label, color }) => (
        <li key={label}><i style={{ background: color }} />{label}</li>
      ))}
    </ul>
  );
}

export const formatUSD = (amount, digits) => {
  if (amount == null || Number.isNaN(Number(amount))) return '-';
  const value = Number(amount);
  const places = digits ?? (Math.abs(value) > 0 && Math.abs(value) < 1 ? 4 : 2);
  return new Intl.NumberFormat('en-US', {
    style: 'currency', currency: 'USD', minimumFractionDigits: places, maximumFractionDigits: places,
  }).format(value);
};

export const formatNumber = (n) => (n == null ? '-' : new Intl.NumberFormat('en-US').format(n));

export const formatDate = (value, withTime = false) => {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleDateString('en-US', {
    year: 'numeric', month: 'short', day: 'numeric',
    ...(withTime && { hour: 'numeric', minute: '2-digit' }),
  });
};

export const humanize = (value = '') => value
  .toString()
  .replace(/[_-]+/g, ' ')
  .toLowerCase()
  .replace(/^\w/, c => c.toUpperCase());
