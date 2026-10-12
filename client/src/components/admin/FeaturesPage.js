import React, { useEffect, useState } from 'react';
import { toast } from 'react-toastify';
import { authFetch, catchError } from '../../utils';
import { AdminLayout, Loading, Notice, formatDate } from './AdminUI';

// On/off switches for the paid features. What a use costs is set on the Cost
// analysis page (provider rates plus markup), not here.
export default function FeaturesPage() {
  const [features, setFeatures] = useState(null);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(null); // feature key

  const fetchFeatures = async () => {
    setError(null);
    const [err, data] = await catchError(authFetch({ path: '/admin/features' }));
    if (err) return setError(err.message || 'Could not load features');
    setFeatures(data);
  };

  useEffect(() => { fetchFeatures(); }, []);

  const toggle = async (feature) => {
    const enabled = !feature.enabled;
    if (!enabled && !window.confirm(`Turn off ${feature.label}? Readers will see "not available at this time" until it's back on.`)) return;
    setSaving(feature.key);
    const [err, saved] = await catchError(authFetch({ path: `/admin/features/${feature.key}`, method: 'PUT', body: { enabled } }));
    setSaving(null);
    if (err) return toast.error(err.message || 'Could not update the feature');
    setFeatures(prev => prev.map(f => (f.key === saved.key ? saved : f)));
    toast.success(`${saved.label} turned ${saved.enabled ? 'on' : 'off'}`);
  };

  return (
    <AdminLayout
      title="Features"
      subtitle="Turn paid features on or off for every reader. Prices come from the provider rates on the Cost analysis page."
    >
      {error && <Notice onRetry={fetchFeatures}>{error}</Notice>}
      {!features && !error ? (
        <Loading label="Loading features…" />
      ) : features && (
        <ul className="adm-features">
          {features.map(feature => (
            <li key={feature.key} className="adm-card adm-feature">
              <div className="adm-feature-text">
                <strong>{feature.label}</strong>
                <span className="adm-hint">{feature.description}</span>
                {feature.updatedAt && <span className="adm-hint">Changed {formatDate(feature.updatedAt, true)}</span>}
              </div>
              <span className={`adm-feature-state${feature.enabled ? ' is-on' : ''}`}>{feature.enabled ? 'On' : 'Off'}</span>
              <button
                type="button"
                role="switch"
                aria-checked={feature.enabled}
                aria-label={feature.label}
                className="adm-switch"
                disabled={saving === feature.key}
                onClick={() => toggle(feature)}
              >
                <span />
              </button>
            </li>
          ))}
        </ul>
      )}
    </AdminLayout>
  );
}
