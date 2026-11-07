import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../api.js';
import { useLoad, useAct, Msg, Money, FormattedDate, Badge, Modal, RatingStars } from '../ui.jsx';

export function Orders() {
  const { data, loading, err } = useLoad('/orders');

  return (
    <div>
      <h2>My Order History</h2>
      <p style={{ color: 'var(--text-muted)', marginTop: -8, marginBottom: 20 }}>
        Track your placed orders, delivery progress, item cancellations, and reviews.
      </p>

      {err && <div className="alert alert-error">{err}</div>}

      {loading ? (
        <p>Loading your orders...</p>
      ) : !data?.length ? (
        <div className="card empty-state">
          <h4>No orders yet</h4>
          <p>You haven't placed any orders yet. Discover products in our catalogue.</p>
          <Link to="/" className="btn btn-primary" style={{ marginTop: 10 }}>
            Start Shopping
          </Link>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {data.map(o => (
            <div key={o.order_id} className="card" style={{ padding: '18px 24px' }}>
              <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 14 }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ fontSize: '1.1rem', fontWeight: 700 }}>Order #{o.order_id}</span>
                    <Badge status={o.status} />
                  </div>
                  <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginTop: 4 }}>
                    Placed on <FormattedDate date={o.placed_at} />
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
                  <div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                      Payable Total
                    </div>
                    <div style={{ fontSize: '1.2rem', fontWeight: 800, color: 'var(--text-main)' }}>
                      <Money amount={o.payable} />
                    </div>
                  </div>

                  <div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                      Payment ({o.method || 'MOCK'})
                    </div>
                    <div>
                      <Badge status={o.payment_status} />
                    </div>
                  </div>

                  <Link to={`/orders/${o.order_id}`} className="btn btn-secondary btn-sm">
                    View Details →
                  </Link>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function OrderDetail() {
  const { id } = useParams();
  const { data, loading, err, reload } = useLoad('/orders/' + id);
  const [msg, run, busy] = useAct();

  // Cancel item modal
  const [cancelModalItem, setCancelModalItem] = useState(null);

  // Review modal
  const [reviewModalItem, setReviewModalItem] = useState(null);
  const [reviewRating, setReviewRating] = useState(5);
  const [reviewComment, setReviewComment] = useState('');

  const handleCancelItem = () => {
    if (!cancelModalItem) return;
    run(
      () => api(`/orders/${id}/items/${cancelModalItem.item_no}/cancel`, { method: 'POST' }),
      `Item #${cancelModalItem.item_no} cancelled. Stock restored to listing.`
    )
      .then(() => {
        setCancelModalItem(null);
        reload();
      })
      .catch(() => {});
  };

  const handleSaveReview = (e) => {
    e.preventDefault();
    if (!reviewModalItem) return;
    run(
      () => api('/reviews', {
        method: 'POST',
        body: {
          order_id: Number(id),
          item_no: reviewModalItem.item_no,
          rating: Number(reviewRating),
          comment: reviewComment.trim() || undefined
        }
      }),
      'Review submitted successfully!'
    )
      .then(() => {
        setReviewModalItem(null);
        setReviewComment('');
        reload();
      })
      .catch(() => {});
  };

  if (loading) return <p>Loading order #{id}...</p>;
  if (err) return <div className="alert alert-error">{err}</div>;
  if (!data) return null;

  return (
    <div>
      <div style={{ marginBottom: 16 }}>
        <Link to="/orders" className="btn btn-secondary btn-sm">
          ← Back to orders
        </Link>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <h2>Order #{data.order_id}</h2>
          <span style={{ color: 'var(--text-muted)', fontSize: '0.88rem' }}>
            Placed on <FormattedDate date={data.placed_at} />
          </span>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <Badge status={data.status} />
          <Badge status={data.payment_status} />
        </div>
      </div>

      <Msg m={msg} />

      {/* Financial Summary & Address Overview */}
      <div className="grid-2">
        <div className="card">
          <h3 style={{ marginTop: 0 }}>Payment & Billing</h3>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
            <span style={{ color: 'var(--text-muted)' }}>Original Gross:</span>
            <span><Money amount={data.gross} /></span>
          </div>

          {data.coupon_code && (
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6, color: 'var(--success)' }}>
              <span>Coupon applied:</span>
              <span><strong>{data.coupon_code}</strong></span>
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6, fontWeight: 700, fontSize: '1.05rem', borderTop: '1px solid var(--border-color)', paddingTop: 8 }}>
            <span>Original Payable:</span>
            <span><Money amount={data.payable} /></span>
          </div>

          {Number(data.cancelled_gross) > 0 && (
            <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--danger)', fontSize: '0.85rem' }}>
              <span>Cancelled items value:</span>
              <span>-<Money amount={data.cancelled_gross} /></span>
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 10, paddingTop: 10, borderTop: '1px solid #f1f5f9', fontSize: '0.85rem' }}>
            <span style={{ color: 'var(--text-muted)' }}>Payment Method:</span>
            <span><strong>{data.method}</strong></span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', marginTop: 4 }}>
            <span style={{ color: 'var(--text-muted)' }}>Payment Amount Charged:</span>
            <span><strong><Money amount={data.payment_amount} /></strong></span>
          </div>
        </div>

        <div className="card">
          <h3 style={{ marginTop: 0 }}>Delivery Address</h3>
          {data.line1 ? (
            <div>
              <p style={{ margin: 0, fontWeight: 600 }}>{data.line1}</p>
              <p style={{ margin: '4px 0', color: 'var(--text-muted)' }}>
                {data.city}, {data.state} - {data.pincode}
              </p>
            </div>
          ) : (
            <p style={{ color: 'var(--text-muted)' }}>Address details unavailable</p>
          )}
        </div>
      </div>

      {/* Line items table */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border-color)', background: '#f8fafc' }}>
          <h3 style={{ margin: 0 }}>Items in this order</h3>
        </div>

        <div className="table-responsive" style={{ margin: 0, border: 'none', borderRadius: 0 }}>
          <table>
            <thead>
              <tr>
                <th>Item #</th>
                <th>Product</th>
                <th>Seller Store</th>
                <th>Unit Price</th>
                <th>Qty</th>
                <th>Line Total</th>
                <th>Status</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {data.items?.map(it => (
                <tr key={it.item_no}>
                  <td><strong>#{it.item_no}</strong></td>
                  <td>
                    <div style={{ fontWeight: 600 }}>{it.name}</div>
                    {it.brand && <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{it.brand}</div>}
                  </td>
                  <td>{it.store_name}</td>
                  <td><Money amount={it.unit_price} /></td>
                  <td>{it.quantity}</td>
                  <td><strong><Money amount={it.line_total} /></strong></td>
                  <td><Badge status={it.item_status} /></td>
                  <td>
                    {it.item_status === 'PENDING' && (
                      <button
                        type="button"
                        className="btn-outline-danger btn-sm"
                        onClick={() => setCancelModalItem(it)}
                      >
                        Cancel item
                      </button>
                    )}

                    {it.item_status === 'DELIVERED' && !it.reviewed && (
                      <button
                        type="button"
                        className="btn-secondary btn-sm"
                        onClick={() => {
                          setReviewModalItem(it);
                          setReviewRating(5);
                          setReviewComment('');
                        }}
                      >
                        ★ Write review
                      </button>
                    )}

                    {it.reviewed && (
                      <span style={{ fontSize: '0.82rem', color: 'var(--success)', fontWeight: 600 }}>
                        ✓ Reviewed ({it.review_rating}★)
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Cancel Item Modal */}
      <Modal
        isOpen={Boolean(cancelModalItem)}
        title="Confirm Item Cancellation"
        onClose={() => setCancelModalItem(null)}
      >
        <p>
          Are you sure you want to cancel <strong>{cancelModalItem?.name}</strong> (Item #{cancelModalItem?.item_no})?
        </p>
        <div className="alert alert-error" style={{ fontSize: '0.82rem' }}>
          Database Trigger: The item quantity ({cancelModalItem?.quantity}) will be immediately restored to the seller's inventory.
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 20 }}>
          <button type="button" className="btn-secondary" onClick={() => setCancelModalItem(null)}>
            Keep Item
          </button>
          <button
            type="button"
            className="btn-danger"
            disabled={busy}
            onClick={handleCancelItem}
          >
            {busy ? 'Cancelling...' : 'Confirm Cancellation'}
          </button>
        </div>
      </Modal>

      {/* Write Review Modal */}
      <Modal
        isOpen={Boolean(reviewModalItem)}
        title={`Review "${reviewModalItem?.name}"`}
        onClose={() => setReviewModalItem(null)}
      >
        <form onSubmit={handleSaveReview}>
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: 6 }}>
              Rating (1 to 5 Stars) *
            </label>
            <div style={{ display: 'flex', gap: 12 }}>
              {[1, 2, 3, 4, 5].map(star => (
                <button
                  key={star}
                  type="button"
                  onClick={() => setReviewRating(star)}
                  style={{
                    background: reviewRating >= star ? '#fef3c7' : '#f1f5f9',
                    color: reviewRating >= star ? '#d97706' : '#94a3b8',
                    border: '1px solid',
                    borderColor: reviewRating >= star ? '#f59e0b' : '#cbd5e1',
                    fontSize: '1.25rem',
                    padding: '6px 12px',
                    borderRadius: 'var(--radius-sm)'
                  }}
                >
                  ★ {star}
                </button>
              ))}
            </div>
          </div>

          <div style={{ marginBottom: 20 }}>
            <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: 4 }}>
              Your feedback / comment (Optional)
            </label>
            <textarea
              rows={4}
              placeholder="How was the product quality and delivery experience?"
              value={reviewComment}
              onChange={e => setReviewComment(e.target.value)}
            />
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
            <button type="button" className="btn-secondary" onClick={() => setReviewModalItem(null)}>
              Cancel
            </button>
            <button type="submit" className="btn-primary" disabled={busy}>
              {busy ? 'Submitting...' : 'Submit Review'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
