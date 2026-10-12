import React, { useEffect, useState } from 'react';
import { toast } from 'react-toastify';
import { CreditCard, Edit2, Plus, X, Zap } from 'react-feather';
import { authFetch, catchError } from '../utils.js';
import { AdminLayout, Badge, EmptyState, Field, Loading, Modal, Notice, formatNumber, formatUSD } from './admin/AdminUI';

const TIERS = ['free', 'basic', 'standard', 'premium', 'enterprise'];

const EMPTY_PLAN = {
  name: '',
  description: '',
  price: 0,
  tokensPerMonth: 0,
  tier: 'basic',
  duration: 30,
  displayFeatures: [],
  isActive: true,
  appleProductId: '',
  playProductId: '',
  playBasePlanId: '',
};

function PlanForm({ plan, onSaved, onClose }) {
  const isEdit = Boolean(plan?._id);
  const [form, setForm] = useState(() => ({ ...EMPTY_PLAN, ...(plan || {}) }));
  const [feature, setFeature] = useState('');
  const [saving, setSaving] = useState(false);

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setForm(prev => ({ ...prev, [name]: type === 'checkbox' ? checked : type === 'number' ? (value === '' ? '' : Number(value)) : value }));
  };

  const addFeature = () => {
    const text = feature.trim();
    if (!text) return;
    setForm(prev => ({ ...prev, displayFeatures: [...prev.displayFeatures, text] }));
    setFeature('');
  };

  const removeFeature = (index) => {
    setForm(prev => ({ ...prev, displayFeatures: prev.displayFeatures.filter((_, i) => i !== index) }));
  };

  const save = async (e) => {
    e.preventDefault();
    setSaving(true);
    const body = {
      name: form.name.trim(),
      description: form.description.trim(),
      price: Number(form.price) || 0,
      tokensPerMonth: Number(form.tokensPerMonth) || 0,
      tier: form.tier,
      duration: Number(form.duration) || 30,
      displayFeatures: form.displayFeatures,
      isActive: form.isActive,
      appleProductId: (form.appleProductId || '').trim(),
      playProductId: (form.playProductId || '').trim(),
      playBasePlanId: (form.playBasePlanId || '').trim(),
    };
    const [error] = await catchError(authFetch({
      path: isEdit ? `/subscription/${plan._id}/update` : '/subscription/create',
      method: 'POST',
      body,
    }));
    setSaving(false);
    if (error) return toast.error(error.message || `Could not ${isEdit ? 'update' : 'create'} the plan`);
    toast.success(isEdit ? 'Plan updated' : 'Plan created');
    onSaved();
  };

  return (
    <Modal title={isEdit ? `Edit ${plan.name}` : 'New plan'} onClose={onClose} wide busy={saving}>
      <form className="adm-form" onSubmit={save}>
        <div className="adm-form-row">
          <Field label="Name" htmlFor="name">
            <input id="name" name="name" className="adm-input" value={form.name} onChange={handleChange} required />
          </Field>
          <Field label="Tier" htmlFor="tier">
            <select id="tier" name="tier" className="adm-select" value={form.tier} onChange={handleChange}>
              {TIERS.map(t => <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>)}
            </select>
          </Field>
        </div>

        <Field label="Description" htmlFor="description">
          <textarea id="description" name="description" className="adm-textarea" value={form.description} onChange={handleChange} required rows={3} />
        </Field>

        <div className="adm-form-row">
          <Field label="Price (USD per month)" htmlFor="price" hint={isEdit ? 'Changing the price creates a new Stripe price.' : undefined}>
            <input id="price" name="price" type="number" min="0" step="0.01" className="adm-input" value={form.price} onChange={handleChange} required />
          </Field>
          <Field label="Tokens per month" htmlFor="tokensPerMonth">
            <input id="tokensPerMonth" name="tokensPerMonth" type="number" min="0" className="adm-input" value={form.tokensPerMonth} onChange={handleChange} required />
          </Field>
        </div>

        <div className="adm-form-row">
          <Field label="Duration (days)" htmlFor="duration">
            <input id="duration" name="duration" type="number" min="1" className="adm-input" value={form.duration} onChange={handleChange} required />
          </Field>
          <Field label="Status">
            <label className="adm-check" style={{ height: 42 }}>
              <input type="checkbox" name="isActive" checked={!!form.isActive} onChange={handleChange} />
              Active and available to subscribe
            </label>
          </Field>
        </div>

        <Field label="Features shown to readers">
          {form.displayFeatures.length > 0 && (
            <div className="adm-feature-list">
              {form.displayFeatures.map((text, index) => (
                <span key={`${text}-${index}`} className="ui-tag">
                  {text}
                  <button type="button" aria-label={`Remove ${text}`} onClick={() => removeFeature(index)}><X size={12} /></button>
                </span>
              ))}
            </div>
          )}
          <div className="adm-inline">
            <input
              className="adm-input"
              value={feature}
              onChange={(e) => setFeature(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addFeature(); } }}
              placeholder="e.g. Unlimited character chats"
              aria-label="New feature"
            />
            <button type="button" className="ui-btn ui-btn-secondary" onClick={addFeature}><Plus size={16} />Add</button>
          </div>
        </Field>

        <Field label="App store products" hint="Must match App Store Connect and Play Console. Leave empty if the plan is not sold in the app.">
          <div className="adm-form-row" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))' }}>
            <input name="appleProductId" className="adm-input" value={form.appleProductId || ''} onChange={handleChange} placeholder="Apple product ID" aria-label="Apple product ID" />
            <input name="playProductId" className="adm-input" value={form.playProductId || ''} onChange={handleChange} placeholder="Play product ID" aria-label="Play product ID" />
            <input name="playBasePlanId" className="adm-input" value={form.playBasePlanId || ''} onChange={handleChange} placeholder="Play base plan ID" aria-label="Play base plan ID" />
          </div>
        </Field>

        {isEdit && (
          <dl className="adm-dl">
            <dt>Stripe price</dt><dd><code className="adm-code">{plan.stripePriceId || 'Not set'}</code></dd>
            <dt>Stripe product</dt><dd><code className="adm-code">{plan.stripeProductId || 'Not set'}</code></dd>
          </dl>
        )}
        {!isEdit && <p className="adm-hint" style={{ margin: 0 }}>A Stripe product and monthly price are created automatically.</p>}

        <div className="adm-form-actions">
          <button type="submit" className="ui-btn ui-btn-primary" disabled={saving}>{saving ? 'Saving…' : isEdit ? 'Save changes' : 'Create plan'}</button>
          <button type="button" className="ui-btn ui-btn-secondary" onClick={onClose} disabled={saving}>Cancel</button>
        </div>
      </form>
    </Modal>
  );
}

export default function AdminSubscriptionsPage() {
  const [plans, setPlans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [editing, setEditing] = useState(null); // plan, {} for new, or null

  const fetchPlans = async () => {
    setError(null);
    const [err, data] = await catchError(authFetch({ path: '/admin/subscriptions' }));
    if (err) setError(err.message || 'Could not load plans');
    if (data) setPlans(data);
    setLoading(false);
  };

  useEffect(() => { fetchPlans(); }, []);

  const deactivate = async (plan) => {
    if (!window.confirm(`Deactivate ${plan.name}? It stops being offered and its Stripe product is archived. Existing subscribers keep their plan.`)) return;
    const [err] = await catchError(authFetch({ path: `/subscription/${plan._id}/delete`, method: 'POST' }));
    if (err) return toast.error(err.message || 'Could not deactivate the plan');
    toast.success(`${plan.name} deactivated`);
    fetchPlans();
  };

  return (
    <AdminLayout
      title="Subscription plans"
      subtitle="Prices, monthly token grants and what each plan shows to readers."
      actions={<button type="button" className="ui-btn ui-btn-primary" onClick={() => setEditing({})}><Plus size={16} />New plan</button>}
    >
      {error && <Notice onRetry={fetchPlans}>{error}</Notice>}

      {loading ? (
        <Loading label="Loading plans…" />
      ) : plans.length === 0 && !error ? (
        <EmptyState icon={CreditCard} title="No plans yet" text="Create a plan to start selling subscriptions." />
      ) : (
        <div className="adm-grid">
          {plans.map(plan => (
            <article key={plan._id} className={`adm-card adm-plan${plan.isActive ? '' : ' is-inactive'}`}>
              <div className="adm-plan-head">
                <div>
                  <h3 className="adm-card-title">{plan.name}</h3>
                  <p className="adm-muted">{plan.description}</p>
                </div>
                <Badge>{plan.isActive ? 'Active' : 'Inactive'}</Badge>
              </div>
              <div className="adm-plan-price">
                {formatUSD(plan.price, 2)} <small>/ month</small>
              </div>
              <div className="adm-row-meta">
                <span className="ui-tag"><Zap size={12} style={{ marginRight: 4 }} />{formatNumber(plan.tokensPerMonth)} tokens</span>
                <span className="ui-tag" style={{ textTransform: 'capitalize' }}>{plan.tier}</span>
                <span className="ui-tag">{plan.duration || 30} days</span>
              </div>
              {plan.displayFeatures?.length > 0 && (
                <ul className="adm-plan-features">
                  {plan.displayFeatures.map((text, i) => <li key={i}>{text}</li>)}
                </ul>
              )}
              <div className="adm-plan-ids">
                <dl className="adm-dl">
                  <dt>Stripe</dt><dd><code className="adm-code">{plan.stripePriceId || 'Not set'}</code></dd>
                  <dt>Apple</dt><dd>{plan.appleProductId ? <code className="adm-code">{plan.appleProductId}</code> : <span className="adm-hint">Not sold</span>}</dd>
                  <dt>Play</dt><dd>{plan.playProductId ? <code className="adm-code">{plan.playProductId}{plan.playBasePlanId ? ` / ${plan.playBasePlanId}` : ''}</code> : <span className="adm-hint">Not sold</span>}</dd>
                </dl>
              </div>
              <div className="adm-form-actions">
                <button type="button" className="ui-btn ui-btn-sm ui-btn-secondary" onClick={() => setEditing(plan)}><Edit2 size={14} />Edit</button>
                {plan.isActive && (
                  <button type="button" className="ui-btn ui-btn-sm ui-btn-danger" onClick={() => deactivate(plan)}>Deactivate</button>
                )}
              </div>
            </article>
          ))}
        </div>
      )}

      {editing && (
        <PlanForm
          key={editing._id || 'new'}
          plan={editing._id ? editing : null}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); fetchPlans(); }}
        />
      )}
    </AdminLayout>
  );
}
