import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { api } from '../api.js';
import { useLoad, useAct, Msg, Money, Modal } from '../ui.jsx';

export function Cart() {
  const nav = useNavigate();
  const cart = useLoad('/cart');
  const addrs = useLoad('/addresses');
  const [msg, run, busy] = useAct();

  // Checkout states
  const [selectedAddrId, setSelectedAddrId] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('UPI');
  const [couponCode, setCouponCode] = useState('');
  const [appliedCoupon, setAppliedCoupon] = useState(null);
  const [couponErr, setCouponErr] = useState('');

  // Address modal states
  const [isAddrModalOpen, setIsAddrModalOpen] = useState(false);
  const [newAddr, setNewAddr] = useState({ line1: '', city: '', state: '', pincode: '', is_default: false });

  // Compute active address
  const activeAddrId = selectedAddrId ||
    addrs.data?.find(x => x.is_default)?.address_id ||
    addrs.data?.[0]?.address_id || '';

  const updateQuantity = (item, newQty) => {
    if (newQty <= 0) {
      deleteItem(item);
      return;
    }
    run(() => api('/cart', {
      method: 'PUT',
      body: { listing_id: item.listing_id, quantity: newQty }
    })).then(cart.reload);
  };

  const deleteItem = (item) => {
    run(() => api('/cart/' + item.listing_id, { method: 'DELETE' }), 'Item removed from cart').then(cart.reload);
  };

  const handleApplyCoupon = async () => {
    const code = couponCode.trim().toUpperCase();
    if (!code) {
      setAppliedCoupon(null);
      setCouponErr('');
      return;
    }
    setCouponErr('');
    try {
      const preview = await api(`/orders/coupon/${code}?subtotal=${cart.data?.subtotal || 0}`);
      setAppliedCoupon(preview);
    } catch (e) {
      setAppliedCoupon(null);
      setCouponErr(e.message);
    }
  };

  const handleSaveAddress = async (e) => {
    e.preventDefault();
    if (!/^[0-9]{6}$/.test(newAddr.pincode.trim())) {
      alert('Pincode must be exactly 6 digits');
      return;
    }
    try {
      const saved = await api('/addresses', { method: 'POST', body: newAddr });
      await addrs.reload();
      setSelectedAddrId(saved.address_id);
      setIsAddrModalOpen(false);
      setNewAddr({ line1: '', city: '', state: '', pincode: '', is_default: false });
    } catch (e) {
      alert(e.message);
    }
  };

  const handleCheckout = () => {
    if (!activeAddrId) {
      alert('Please select or add a delivery address first.');
      return;
    }
    run(async () => {
      const r = await api('/orders/checkout', {
        method: 'POST',
        body: {
          address_id: Number(activeAddrId),
          payment_method: paymentMethod,
          coupon_code: appliedCoupon ? appliedCoupon.code : couponCode.trim() || undefined
        }
      });
      nav('/orders/' + r.order_id);
    }, 'Order placed successfully!');
  };

  const subtotal = Number(cart.data?.subtotal || 0);
  const discountAmount = appliedCoupon ? Number(appliedCoupon.discount_amount || 0) : 0;
  const estimatedPayable = Math.max(0, subtotal - discountAmount);

  return (
    <div>
      <h2>Your Shopping Cart</h2>

      <Msg m={msg} />

      {cart.loading ? (
        <p>Loading cart...</p>
      ) : !cart.data?.items?.length ? (
        <div className="card empty-state">
          <h4>Your cart is empty</h4>
          <p>You have no items in your cart. Explore our catalogue to find what you need.</p>
          <Link to="/" className="btn btn-primary" style={{ marginTop: 10 }}>
            Start Shopping
          </Link>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 24 }}>
          {/* Left Column: Cart items */}
          <div>
            <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
              <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border-color)', background: '#f8fafc' }}>
                <h3 style={{ margin: 0 }}>Items ({cart.data.items.length})</h3>
              </div>

              <div style={{ padding: '10px 20px' }}>
                {cart.data.items.map(it => (
                  <div
                    key={it.listing_id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '16px 0',
                      borderBottom: '1px solid #f1f5f9'
                    }}
                  >
                    <div style={{ flex: 1, paddingRight: 16 }}>
                      <div style={{ fontWeight: 600, fontSize: '1rem', color: 'var(--text-main)' }}>
                        {it.name}
                      </div>
                      <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                        Seller: <strong>{it.store_name}</strong> {it.brand ? `• Brand: ${it.brand}` : ''}
                      </div>
                      <div style={{ marginTop: 4, fontWeight: 600 }}>
                        <Money amount={it.price} /> <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>each</span>
                      </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                      <div className="row" style={{ gap: 4 }}>
                        <button
                          type="button"
                          className="btn-secondary btn-sm"
                          onClick={() => updateQuantity(it, it.quantity - 1)}
                        >
                          -
                        </button>
                        <span style={{ minWidth: 28, textAlign: 'center', fontWeight: 600 }}>
                          {it.quantity}
                        </span>
                        <button
                          type="button"
                          className="btn-secondary btn-sm"
                          onClick={() => updateQuantity(it, it.quantity + 1)}
                        >
                          +
                        </button>
                      </div>

                      <div style={{ minWidth: 90, textAlign: 'right', fontWeight: 700, fontSize: '1.05rem' }}>
                        <Money amount={it.line_total} />
                      </div>

                      <button
                        type="button"
                        className="btn-outline-danger btn-sm"
                        onClick={() => deleteItem(it)}
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Right Column: Checkout Summary */}
          <div>
            <div className="card">
              <h3 style={{ marginTop: 0, paddingBottom: 10, borderBottom: '1px solid var(--border-color)' }}>
                Order Summary
              </h3>

              <div style={{ marginBottom: 16 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                  <span style={{ color: 'var(--text-muted)' }}>Gross Subtotal</span>
                  <span style={{ fontWeight: 600 }}><Money amount={subtotal} /></span>
                </div>

                {appliedCoupon && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8, color: 'var(--success)' }}>
                    <span>Coupon ({appliedCoupon.code} - {appliedCoupon.discount_pct}%)</span>
                    <span>-<Money amount={discountAmount} /></span>
                  </div>
                )}

                <div style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  paddingTop: 12,
                  marginTop: 12,
                  borderTop: '1px solid var(--border-color)',
                  fontSize: '1.15rem',
                  fontWeight: 800
                }}>
                  <span>Estimated Total</span>
                  <span style={{ color: 'var(--primary)' }}><Money amount={estimatedPayable} /></span>
                </div>
              </div>

              {/* Coupon input */}
              <div style={{ marginBottom: 20, background: 'var(--bg-muted)', padding: 12, borderRadius: 'var(--radius-sm)' }}>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: 4 }}>
                  PROMO / COUPON CODE
                </label>
                <div style={{ display: 'flex', gap: 6 }}>
                  <input
                    type="text"
                    placeholder="e.g. WELCOME10"
                    value={couponCode}
                    onChange={e => setCouponCode(e.target.value.toUpperCase())}
                  />
                  <button type="button" className="btn-secondary" onClick={handleApplyCoupon}>
                    Apply
                  </button>
                </div>
                {appliedCoupon && (
                  <p style={{ margin: '6px 0 0', color: 'var(--success)', fontSize: '0.82rem', fontWeight: 600 }}>
                    ✓ Applied! You save <Money amount={discountAmount} />.
                  </p>
                )}
                {couponErr && (
                  <p style={{ margin: '6px 0 0', color: 'var(--danger)', fontSize: '0.82rem' }}>
                    ✕ {couponErr}
                  </p>
                )}
              </div>

              {/* Address selector */}
              <div style={{ marginBottom: 20 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                  <label style={{ fontSize: '0.85rem', fontWeight: 600 }}>Shipping Address</label>
                  <button
                    type="button"
                    className="btn-secondary btn-sm"
                    onClick={() => setIsAddrModalOpen(true)}
                  >
                    + Add New
                  </button>
                </div>

                {!addrs.data?.length ? (
                  <div style={{ color: 'var(--danger)', fontSize: '0.85rem' }}>
                    No saved addresses. Please add a shipping address.
                  </div>
                ) : (
                  <select
                    value={activeAddrId}
                    onChange={e => setSelectedAddrId(e.target.value)}
                  >
                    {addrs.data.map(a => (
                      <option key={a.address_id} value={a.address_id}>
                        {a.line1}, {a.city} - {a.pincode} {a.is_default ? '(Default)' : ''}
                      </option>
                    ))}
                  </select>
                )}
              </div>

              {/* Payment Method */}
              <div style={{ marginBottom: 24 }}>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: 8 }}>
                  Payment Method
                </label>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  {['UPI', 'CARD', 'NETBANKING', 'COD'].map(m => (
                    <label
                      key={m}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        padding: '8px 12px',
                        border: '1px solid',
                        borderColor: paymentMethod === m ? 'var(--accent)' : 'var(--border-color)',
                        background: paymentMethod === m ? 'var(--primary-light)' : '#fff',
                        borderRadius: 'var(--radius-sm)',
                        cursor: 'pointer',
                        fontSize: '0.85rem',
                        fontWeight: 600
                      }}
                    >
                      <input
                        type="radio"
                        name="payment_method"
                        checked={paymentMethod === m}
                        onChange={() => setPaymentMethod(m)}
                        style={{ width: 'auto', margin: 0 }}
                      />
                      {m === 'COD' ? 'Cash on Delivery' : m}
                    </label>
                  ))}
                </div>
              </div>

              <button
                type="button"
                className="btn-primary"
                disabled={busy || !activeAddrId}
                onClick={handleCheckout}
                style={{ width: '100%', padding: '12px', fontSize: '1rem', fontWeight: 700 }}
              >
                {busy ? 'Placing Order...' : 'Confirm & Place Order'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Address Modal */}
      <Modal
        isOpen={isAddrModalOpen}
        title="Add Shipping Address"
        onClose={() => setIsAddrModalOpen(false)}
      >
        <form onSubmit={handleSaveAddress}>
          <div style={{ marginBottom: 12 }}>
            <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, marginBottom: 4 }}>
              Address Line (House, Flat, Street) *
            </label>
            <input
              type="text"
              required
              placeholder="e.g. 104 Lakeview Apts, MG Road"
              value={newAddr.line1}
              onChange={e => setNewAddr({ ...newAddr, line1: e.target.value })}
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
                value={newAddr.city}
                onChange={e => setNewAddr({ ...newAddr, city: e.target.value })}
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
                value={newAddr.state}
                onChange={e => setNewAddr({ ...newAddr, state: e.target.value })}
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
              value={newAddr.pincode}
              onChange={e => setNewAddr({ ...newAddr, pincode: e.target.value })}
            />
          </div>

          <div style={{ marginBottom: 18 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.85rem', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={newAddr.is_default}
                onChange={e => setNewAddr({ ...newAddr, is_default: e.target.checked })}
                style={{ width: 'auto', margin: 0 }}
              />
              Set as my default address
            </label>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
            <button type="button" className="btn-secondary" onClick={() => setIsAddrModalOpen(false)}>
              Cancel
            </button>
            <button type="submit" className="btn-primary">
              Save Address
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
