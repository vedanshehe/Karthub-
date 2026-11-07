import { useState } from 'react';
import { api } from '../api.js';
import { useLoad, useAct, Msg, Modal, Badge } from '../ui.jsx';

export function Addresses() {
  const { data, loading, err, reload } = useLoad('/addresses');
  const [msg, run, busy] = useAct();

  // Add address modal
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [form, setForm] = useState({ line1: '', city: '', state: '', pincode: '', is_default: false });

  const handleSave = (e) => {
    e.preventDefault();
    if (!/^[0-9]{6}$/.test(form.pincode.trim())) {
      alert('Pincode must be exactly 6 digits');
      return;
    }
    run(
      () => api('/addresses', { method: 'POST', body: form }),
      'Address saved successfully!'
    ).then(() => {
      setIsModalOpen(false);
      setForm({ line1: '', city: '', state: '', pincode: '', is_default: false });
      reload();
    });
  };

  const handleSetDefault = (addr) => {
    run(
      () => api(`/addresses/${addr.address_id}`, {
        method: 'PUT',
        body: { is_default: true }
      }),
      'Default address updated!'
    ).then(reload);
  };

  const handleDelete = (addr) => {
    if (!confirm('Are you sure you want to delete this address?')) return;
    run(
      () => api(`/addresses/${addr.address_id}`, { method: 'DELETE' }),
      'Address removed.'
    ).then(reload).catch(e => {
      // 409 if referenced by order
      alert(e.message);
    });
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div>
          <h2>Saved Shipping Addresses</h2>
          <p style={{ color: 'var(--text-muted)', marginTop: -6 }}>
            Manage delivery locations for your marketplace orders.
          </p>
        </div>
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => setIsModalOpen(true)}
        >
          + Add New Address
        </button>
      </div>

      <Msg m={msg} />
      {err && <div className="alert alert-error">{err}</div>}

      {loading ? (
        <p>Loading addresses...</p>
      ) : !data?.length ? (
        <div className="card empty-state">
          <h4>No addresses saved yet</h4>
          <p>Add your home or office address to enable quick checkout.</p>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => setIsModalOpen(true)}
            style={{ marginTop: 10 }}
          >
            Add Address
          </button>
        </div>
      ) : (
        <div className="grid-2">
          {data.map(a => (
            <div
              key={a.address_id}
              className="card"
              style={{
                borderColor: a.is_default ? 'var(--accent)' : 'var(--border-color)',
                position: 'relative'
              }}
            >
              {a.is_default && (
                <div style={{ position: 'absolute', top: 16, right: 16 }}>
                  <span className="badge badge-success">Default Address</span>
                </div>
              )}
              <h4 style={{ margin: '0 0 8px' }}>{a.line1}</h4>
              <p style={{ color: 'var(--text-muted)', margin: '0 0 16px' }}>
                {a.city}, {a.state} - <strong>{a.pincode}</strong>
              </p>

              <div className="row" style={{ gap: 8, borderTop: '1px solid #f1f5f9', paddingTop: 12 }}>
                {!a.is_default && (
                  <button
                    type="button"
                    className="btn-secondary btn-sm"
                    disabled={busy}
                    onClick={() => handleSetDefault(a)}
                  >
                    Set as Default
                  </button>
                )}
                <button
                  type="button"
                  className="btn-outline-danger btn-sm"
                  disabled={busy}
                  onClick={() => handleDelete(a)}
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add Address Modal */}
      <Modal
        isOpen={isModalOpen}
        title="Add New Delivery Address"
        onClose={() => setIsModalOpen(false)}
      >
        <form onSubmit={handleSave}>
          <div style={{ marginBottom: 12 }}>
            <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, marginBottom: 4 }}>
              Address Line (House, Flat, Street) *
            </label>
            <input
              type="text"
              required
              placeholder="e.g. Flat 302, Green Meadows"
              value={form.line1}
              onChange={e => setForm({ ...form, line1: e.target.value })}
            />
          </div>

          <div className="grid-2" style={{ marginBottom: 12 }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, marginBottom: 4 }}>
                City *
              </label>
              <input
                type="text"
                required
                placeholder="e.g. Hyderabad"
                value={form.city}
                onChange={e => setForm({ ...form, city: e.target.value })}
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, marginBottom: 4 }}>
                State *
              </label>
              <input
                type="text"
                required
                placeholder="e.g. Telangana"
                value={form.state}
                onChange={e => setForm({ ...form, state: e.target.value })}
              />
            </div>
          </div>

          <div style={{ marginBottom: 14 }}>
            <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, marginBottom: 4 }}>
              Pincode (6 digits) *
            </label>
            <input
              type="text"
              required
              maxLength={6}
              placeholder="500001"
              value={form.pincode}
              onChange={e => setForm({ ...form, pincode: e.target.value })}
            />
          </div>

          <div style={{ marginBottom: 18 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.85rem', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={form.is_default}
                onChange={e => setForm({ ...form, is_default: e.target.checked })}
                style={{ width: 'auto', margin: 0 }}
              />
              Set as my default address
            </label>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
            <button type="button" className="btn-secondary" onClick={() => setIsModalOpen(false)}>
              Cancel
            </button>
            <button type="submit" className="btn-primary" disabled={busy}>
              {busy ? 'Saving...' : 'Save Address'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

