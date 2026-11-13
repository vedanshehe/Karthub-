import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { api } from '../api.js';
import { useLoad, useAct, Msg, Money, Modal, QuantityStepper } from '../ui.jsx';

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
    run(
      () => api('/cart/' + item.listing_id, { method: 'DELETE' }),
      `Removed "${item.name}" from your cart.`
    ).then(cart.reload);
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
      <div style={{ marginBottom: 20 }}>
        <h2>Shopping Cart & Checkout</h2>
        <p style={{ color: 'var(--text-muted)', marginTop: -6 }}>
          Review your items, apply promotional discount coupons, and complete order placement.
        </p>
      </div>

      <Msg m={msg} />

      {cart.loading ? (
        <div className="card empty-state">
          <p>Loading cart...</p>
        </div>
      ) : !cart.data?.items?.length ? (
        <div className="card empty-state">
          <div className="empty-state-icon">🛒</div>
          <h4>Your cart is currently empty</h4>
          <p>Explore thousands of genuine products across multiple verified sellers.</p>
          <Link to="/" className="btn btn-primary" style={{ marginTop: 14 }}>
            Explore Catalogue
          </Link>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: '1.45fr 1fr', gap: 28, alignItems: 'start' }}>
          {/* Left Column: Cart items */}
          <div>
            <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
              <div style={{ padding: '16px 24px', borderBottom: '1px solid var(--border-color)', background: '#f8fafc', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h3 style={{ margin: 0, fontSize: '1.1rem' }}>Cart Items ({cart.data.items.length})</h3>
                <span style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>Multi-Vendor Fulfillment</span>
              </div>

              <div style={{ padding: '8px 24px' }}>
                {cart.data.items.map(it => (
                  <div
                    key={it.listing_id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '18px 0',
                      borderBottom: '1px solid #f1f5f9',
                      gap: 16
                    }}
                  >
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 700, fontSize: '1.05rem', color: 'var(--text-main)', marginBottom: 2 }}>
                        {it.name}
                      </div>
                      <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                        Seller: <strong>{it.store_name}</strong> {it.brand ? `• Brand: ${it.brand}` : ''}
                      </div>
                      <div style={{ marginTop: 4, fontWeight: 700, color: 'var(--text-secondary)' }}>
                        <Money amount={it.price} /> <span style={{ fontSize: '0.8rem', fontWeight: 500, color: 'var(--text-muted)' }}>each</span>
                      </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                      <QuantityStepper
                        value={it.quantity}
                        min={1}
                        onChange={newQty => updateQuantity(it, newQty)}
                        disabled={busy}
                      />

                      <div style={{ minWidth: 96, textAlign: 'right', fontWeight: 800, fontSize: '1.1rem', color: 'var(--text-main)' }}>
                        <Money amount={it.line_total} />
                      </div>

                      <button
                        type="button"
                        className="btn-outline-danger btn-sm"
                        disabled={busy}
                        onClick={() => deleteItem(it)}
                        title="Remove item from cart"
                        aria-label="Remove item"
                      >
                        ✕ Remove
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Right Column: Order Summary & Checkout */}
          <div style={{ position: 'sticky', top: 80 }}>
            <div className="card">
              <h3 style={{ marginTop: 0, paddingBottom: 12, borderBottom: '1px solid var(--border-color)' }}>
                Order Summary
              </h3>

              <div style={{ marginBottom: 18 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10, fontSize: '0.92rem' }}>
                  <span style={{ color: 'var(--text-muted)' }}>Items Subtotal</span>
                  <span style={{ fontWeight: 600 }}><Money amount={subtotal} /></span>
                </div>

                {appliedCoupon && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10, color: 'var(--success)', fontWeight: 600, fontSize: '0.92rem' }}>
                    <span>Coupon Promo ({appliedCoupon.code} - {appliedCoupon.discount_pct}%)</span>
                    <span>-<Money amount={discountAmount} /></span>
                  </div>
                )}

                <div style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'baseline',
                  paddingTop: 14,
                  marginTop: 14,
                  borderTop: '2px solid var(--border-color)',
                  fontSize: '1.25rem',
                  fontWeight: 800
                }}>
                  <span>Estimated Total</span>
                  <span style={{ color: 'var(--primary)' }}><Money amount={estimatedPayable} /></span>
                </div>
              </div>

              {/* Coupon input */}
              <div style={{ marginBottom: 22, background: 'var(--bg-muted)', padding: '14px 16px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-color)' }}>
                <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-muted)', marginBottom: 6 }}>
                  HAVE A PROMO / COUPON CODE?
                </label>
                <div style={{ display: 'flex', gap: 8 }}>
                  <input
                    type="text"
                    placeholder="e.g. WELCOME10"
                    value={couponCode}
                    onChange={e => setCouponCode(e.target.value.toUpperCase())}
                    style={{ textTransform: 'uppercase', fontWeight: 600 }}
                  />
                  <button type="button" className="btn-secondary" onClick={handleApplyCoupon}>
                    Apply
                  </button>
                </div>
                {appliedCoupon && (
                  <p style={{ margin: '8px 0 0', color: 'var(--success)', fontSize: '0.85rem', fontWeight: 700 }}>
                    ✓ Applied! You save <Money amount={discountAmount} />.
                  </p>
                )}
                {couponErr && (
                  <p style={{ margin: '8px 0 0', color: 'var(--danger)', fontSize: '0.85rem' }}>
                    ✕ {couponErr}
                  </p>
                )}
              </div>

              {/* Address selector */}
              <div style={{ marginBottom: 22 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                  <label style={{ marginBottom: 0 }}>Shipping Address</label>
                  <button
                    type="button"
                    className="btn-secondary btn-sm"
                    onClick={() => setIsAddrModalOpen(true)}
                  >
                    + Add New
                  </button>
                </div>

                {!addrs.data?.length ? (
                  <div style={{ color: 'var(--danger)', fontSize: '0.85rem', padding: '8px 0' }}>
                    ⚠️ No saved delivery addresses found. Please add a shipping address.
                  </div>
                ) : (
                  <select
                    value={activeAddrId}
                    onChange={e => setSelectedAddrId(e.target.value)}
                  >
                    {addrs.data.map(a => (
                      <option key={a.address_id} value={a.address_id}>
                        {a.line1}, {a.city} - {a.pincode} {a.is_default ? '★ (Default)' : ''}
                      </option>
                    ))}
                  </select>
                )}
              </div>

              {/* Payment Method */}
              <div style={{ marginBottom: 26 }}>
                <label style={{ marginBottom: 8 }}>
                  Payment Method
                </label>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  {[
                    { id: 'UPI', label: 'UPI / QR', icon: '📱' },
                    { id: 'CARD', label: 'Debit / Credit Card', icon: '💳' },
                    { id: 'NETBANKING', label: 'Net Banking', icon: '🏦' },
                    { id: 'COD', label: 'Cash on Delivery', icon: '💵' }
                  ].map(m => (
                    <label
                      key={m.id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        padding: '10px 12px',
                        border: '1.5px solid',
                        borderColor: paymentMethod === m.id ? 'var(--accent)' : 'var(--border-color)',
                        background: paymentMethod === m.id ? 'var(--primary-light)' : '#fff',
                        borderRadius: 'var(--radius-sm)',
                        cursor: 'pointer',
                        fontSize: '0.84rem',
                        fontWeight: 600,
                        transition: 'all 0.15s ease'
                      }}
                    >
                      <input
                        type="radio"
                        name="payment_method"
                        checked={paymentMethod === m.id}
                        onChange={() => setPaymentMethod(m.id)}
                        style={{ width: 'auto', margin: 0 }}
                      />
                      <span>{m.icon} {m.label}</span>
                    </label>
                  ))}
                </div>
              </div>

              <button
                type="button"
                className="btn-primary"
                disabled={busy || !activeAddrId}
                onClick={handleCheckout}
                style={{ width: '100%', padding: '14px', fontSize: '1.025rem', fontWeight: 800 }}
              >
                {busy ? 'Processing Checkout...' : `Confirm & Place Order (₹${estimatedPayable.toFixed(2)})`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Address Modal */}
      <Modal
        isOpen={isAddrModalOpen}
        title="Add New Shipping Address"
        onClose={() => setIsAddrModalOpen(false)}
      >
        <form onSubmit={handleSaveAddress}>
          <div style={{ marginBottom: 14 }}>
            <label>Address Line (House, Flat, Street) *</label>
            <input
              type="text"
              required
              placeholder="e.g. 104 Lakeview Apts, MG Road"
              value={newAddr.line1}
              onChange={e => setNewAddr({ ...newAddr, line1: e.target.value })}
            />
          </div>

          <div className="grid-2" style={{ marginBottom: 14 }}>
            <div>
              <label>City *</label>
              <input
                type="text"
                required
                placeholder="e.g. Hyderabad"
                value={newAddr.city}
                onChange={e => setNewAddr({ ...newAddr, city: e.target.value })}
              />
            </div>
            <div>
              <label>State *</label>
              <input
                type="text"
                required
                placeholder="e.g. Telangana"
                value={newAddr.state}
                onChange={e => setNewAddr({ ...newAddr, state: e.target.value })}
              />
            </div>
          </div>

          <div style={{ marginBottom: 16 }}>
            <label>Pincode (6 digits) *</label>
            <input
              type="text"
              required
              maxLength={6}
              placeholder="500001"
              value={newAddr.pincode}
              onChange={e => setNewAddr({ ...newAddr, pincode: e.target.value })}
            />
          </div>

          <div style={{ marginBottom: 20 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.88rem', cursor: 'pointer', textTransform: 'none', fontWeight: 600, color: 'var(--text-main)' }}>
              <input
                type="checkbox"
                checked={newAddr.is_default}
                onChange={e => setNewAddr({ ...newAddr, is_default: e.target.checked })}
                style={{ width: 'auto', margin: 0 }}
              />
              Set as my default shipping address
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
