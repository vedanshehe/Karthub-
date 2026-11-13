import { useState, useEffect, useCallback } from 'react';
import { api } from './api.js';

export function useLoad(path) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');

  const reload = useCallback(() => {
    setLoading(true);
    api(path)
      .then(d => {
        setData(d);
        setErr('');
      })
      .catch(e => setErr(e.message))
      .finally(() => setLoading(false));
  }, [path]);

  useEffect(reload, [reload]);
  return { data, loading, err, reload };
}

export function useAct() {
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);

  const run = async (f, okText = 'Action completed successfully') => {
    setBusy(true);
    try {
      const r = await f();
      setMsg({ ok: okText });
      return r;
    } catch (e) {
      setMsg({ err: e.message });
      throw e;
    } finally {
      setBusy(false);
    }
  };

  const clearMsg = () => setMsg(null);
  return [msg, run, busy, clearMsg];
}

export function Msg({ m, onClose }) {
  if (!m) return null;
  const isErr = Boolean(m.err);
  return (
    <div className={`alert ${isErr ? 'alert-error' : 'alert-success'}`}>
      <span>{isErr ? '⚠️ ' : '✅ '}</span>
      <span style={{ flex: 1 }}>{m.err || m.ok}</span>
      {onClose && (
        <button
          type="button"
          onClick={onClose}
          style={{ background: 'transparent', border: 'none', color: 'inherit', cursor: 'pointer', padding: 0 }}
        >
          ✕
        </button>
      )}
    </div>
  );
}

export function Money({ amount }) {
  const n = Number(amount);
  if (isNaN(n)) return <span>-</span>;
  return <span>₹{n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>;
}

export function FormattedDate({ date }) {
  if (!date) return <span>-</span>;
  const d = new Date(date);
  return <span>{d.toLocaleDateString('en-IN', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>;
}

export function Badge({ status, type }) {
  const s = String(status || '').toUpperCase();
  let badgeClass = 'badge-neutral';

  if (type === 'verified') {
    badgeClass = status ? 'badge-success' : 'badge-neutral';
    return <span className={`badge ${badgeClass}`}>{status ? '✓ Verified' : 'Unverified'}</span>;
  }

  if (['PAID', 'DELIVERED', 'SUCCESS', 'ACTIVE'].includes(s)) badgeClass = 'badge-success';
  else if (['SHIPPED', 'PLACED', 'PENDING'].includes(s)) badgeClass = 'badge-info';
  else if (['CANCELLED', 'FAILED', 'RETURNED'].includes(s)) badgeClass = 'badge-danger';
  else if (['REFUNDED'].includes(s)) badgeClass = 'badge-warning';

  return <span className={`badge ${badgeClass}`}>{status}</span>;
}

export function RatingStars({ rating, count }) {
  const r = Number(rating) || 0;
  const full = Math.floor(r);
  const stars = '★'.repeat(full) + '☆'.repeat(5 - full);
  return (
    <span className="rating-stars">
      <span className="stars-glow">{stars}</span>
      <span style={{ fontWeight: 700, color: 'var(--text-main)', marginLeft: 6 }}>
        {r > 0 ? r.toFixed(1) : 'New'}
      </span>
      {count != null && <span className="rating-count">({count})</span>}
    </span>
  );
}

export function StarRatingSelector({ value, onChange, max = 5 }) {
  const [hover, setHover] = useState(0);
  const labels = ['', 'Poor', 'Fair', 'Average', 'Good', 'Excellent'];
  return (
    <div className="star-rating-selector" role="radiogroup" aria-label="Rating selector">
      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
        {Array.from({ length: max }, (_, i) => i + 1).map((star) => (
          <button
            key={star}
            type="button"
            role="radio"
            aria-checked={value === star}
            aria-label={`${star} star${star > 1 ? 's' : ''}`}
            className={`star-picker-btn ${star <= (hover || value) ? 'active' : ''}`}
            onMouseEnter={() => setHover(star)}
            onMouseLeave={() => setHover(0)}
            onClick={() => onChange(star)}
          >
            ★
          </button>
        ))}
        <span className="star-picker-label">
          {labels[hover || value] || `${value || 0} / ${max}`}
        </span>
      </div>
    </div>
  );
}

export function QuantityStepper({ value, min = 1, max, onChange, disabled }) {
  const val = Math.max(min, Number(value) || min);
  return (
    <div className="qty-stepper">
      <button
        type="button"
        className="qty-btn"
        disabled={disabled || val <= min}
        onClick={() => onChange(val - 1)}
        aria-label="Decrease quantity"
      >
        −
      </button>
      <span className="qty-value">{val}</span>
      <button
        type="button"
        className="qty-btn"
        disabled={disabled || (max != null && val >= max)}
        onClick={() => onChange(val + 1)}
        aria-label="Increase quantity"
      >
        +
      </button>
    </div>
  );
}

export function Modal({ isOpen, title, onClose, children, footer }) {
  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;
  return (
    <div className="modal-backdrop" onClick={onClose} role="dialog" aria-modal="true" aria-labelledby="modal-title">
      <div className="modal-card" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3 id="modal-title">{title}</h3>
          <button className="modal-close" onClick={onClose} aria-label="Close modal">✕</button>
        </div>
        <div className="modal-body">
          {children}
        </div>
        {footer && <div className="modal-footer">{footer}</div>}
      </div>
    </div>
  );
}

export function Table({ rows, render, emptyText = 'No records found' }) {
  if (!rows || rows.length === 0) {
    return (
      <div className="empty-state">
        <p>{emptyText}</p>
      </div>
    );
  }

  const keys = Object.keys(rows[0]);

  return (
    <div className="table-responsive">
      <table>
        <thead>
          <tr>
            {keys.map(k => (
              <th key={k}>{k.replace(/_/g, ' ')}</th>
            ))}
            {render && <th>Actions</th>}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>
              {keys.map(k => (
                <td key={k}>
                  {k.includes('price') || k.includes('revenue') || k.includes('gross') || k.includes('payable') || k === 'amount'
                    ? <Money amount={r[k]} />
                    : k.includes('_at') || k === 'joined_on'
                    ? <FormattedDate date={r[k]} />
                    : typeof r[k] === 'boolean'
                    ? <Badge status={r[k]} type={k === 'is_verified' ? 'verified' : undefined} />
                    : k.includes('status')
                    ? <Badge status={r[k]} />
                    : String(r[k] ?? '-')}
                </td>
              ))}
              {render && <td>{render(r)}</td>}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
