import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../api.js';
import { useLoad, useAct, Msg, Money, FormattedDate, Badge, Modal, RatingStars, StarRatingSelector } from '../ui.jsx';

export function Orders() {
  const { data, loading, err } = useLoad('/orders');

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <h2>My Order History</h2>
        <p style={{ color: 'var(--text-muted)', marginTop: -6 }}>
          Track real-time order states, item dispatch, cancellation status, and write product reviews.
        </p>
      </div>

      {err && <div className="alert alert-error">{err}</div>}

      {loading ? (
        <div className="card empty-state">
          <p>Loading your orders...</p>
        </div>
      ) : !data?.length ? (
        <div className="card empty-state">
          <div className="empty-state-icon">📦</div>
          <h4>No orders placed yet</h4>
          <p>You haven't placed any orders yet. Discover items in our multi-vendor catalogue.</p>
          <Link to="/" className="btn btn-primary" style={{ marginTop: 14 }}>
            Explore Catalogue
          </Link>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          {data.map(o => (
            <div key={o.order_id} className="card" style={{ padding: '20px 24px', margin: 0 }}>
              <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ fontSize: '1.15rem', fontWeight: 800 }}>Order #{o.order_id}</span>
                    <Badge status={o.status} />
                  </div>
                  <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginTop: 4 }}>
                    Placed on <FormattedDate date={o.placed_at} />
                  </div>
                </div>

                <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 28 }}>
                  <div>
                    <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 700 }}>
                      Payable Total
                    </div>
                    <div style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--text-main)' }}>
                      <Money amount={o.payable} />
                    </div>
                  </div>

                  <div>
                    <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 700 }}>
                      Payment ({o.method || 'MOCK'})
                    </div>
                    <div style={{ marginTop: 2 }}>
                      <Badge status={o.payment_status} />
                    </div>
                  </div>

                  <Link to={`/orders/${o.order_id}`} className="btn btn-secondary btn-sm" style={{ fontWeight: 700 }}>
                    View Order Details →
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
      `Item #${cancelModalItem.item_no} cancelled. Inventory quantity restored to seller.`
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

  const handleDeleteReview = (item) => {
    if (!confirm(`Are you sure you want to delete your review for "${item.name}"?`)) return;
    run(
      () => api(`/reviews/${item.review_id}`, { method: 'DELETE' }),
      'Your review has been deleted.'
    ).then(reload);
  };

  if (loading) return <div className="card empty-state"><p>Loading order #{id}...</p></div>;
  if (err) return <div className="alert alert-error">{err}</div>;
  if (!data) return null;

  return (
    <div>
      <div style={{ marginBottom: 18 }}>
        <Link to="/orders" className="btn btn-secondary btn-sm">
          ← Back to all orders
        </Link>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 22, flexWrap: 'wrap', gap: 14 }}>
        <div>
          <h2 style={{ margin: '0 0 4px' }}>Order #{data.order_id}</h2>
          <span style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
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
          <h3 style={{ marginTop: 0 }}>Payment & Billing Breakdown</h3>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8, fontSize: '0.92rem' }}>
            <span style={{ color: 'var(--text-muted)' }}>Original Order Gross:</span>
            <span><Money amount={data.gross} /></span>
          </div>

          {data.coupon_code && (
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8, color: 'var(--success)', fontWeight: 600, fontSize: '0.92rem' }}>
              <span>Promotional Coupon Applied:</span>
              <span><strong>{data.coupon_code}</strong></span>
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8, fontWeight: 800, fontSize: '1.1rem', borderTop: '1px solid var(--border-color)', paddingTop: 10 }}>
            <span>Original Payable Total:</span>
            <span style={{ color: 'var(--primary)' }}><Money amount={data.payable} /></span>
          </div>

          {Number(data.cancelled_gross) > 0 && (
            <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--danger)', fontSize: '0.88rem', fontWeight: 600, marginTop: 4 }}>
              <span>Cancelled items refunded/deducted:</span>
              <span>-<Money amount={data.cancelled_gross} /></span>
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 12, paddingTop: 12, borderTop: '1px solid #f1f5f9', fontSize: '0.88rem' }}>
            <span style={{ color: 'var(--text-muted)' }}>Payment Channel:</span>
            <span><strong>{data.method}</strong></span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.88rem', marginTop: 4 }}>
            <span style={{ color: 'var(--text-muted)' }}>Payment Amount Charged:</span>
            <span><strong><Money amount={data.payment_amount} /></strong></span>
          </div>
        </div>

        <div className="card">
          <h3 style={{ marginTop: 0 }}>Delivery Shipping Address</h3>
          {data.line1 ? (
            <div>
              <p style={{ margin: 0, fontWeight: 700, fontSize: '1rem', color: 'var(--text-main)' }}>{data.line1}</p>
              <p style={{ margin: '6px 0', color: 'var(--text-secondary)' }}>
                {data.city}, {data.state} - <strong>{data.pincode}</strong>
              </p>
              <div style={{ marginTop: 12 }}>
                <span className="badge badge-neutral">Standard Ground Delivery</span>
              </div>
            </div>
          ) : (
            <p style={{ color: 'var(--text-muted)' }}>Address details unavailable</p>
          )}
        </div>
      </div>

      {/* Line items table */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ padding: '16px 24px', borderBottom: '1px solid var(--border-color)', background: '#f8fafc' }}>
          <h3 style={{ margin: 0, fontSize: '1.1rem' }}>Items in this order</h3>
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
                <th>Item Status</th>
                <th>Action & Reviews</th>
              </tr>
            </thead>
            <tbody>
              {data.items?.map(it => (
                <tr key={it.item_no}>
                  <td><strong>#{it.item_no}</strong></td>
                  <td>
                    <div style={{ fontWeight: 700 }}>{it.name}</div>
                    {it.brand && <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{it.brand}</div>}
                  </td>
                  <td>{it.store_name}</td>
                  <td><Money amount={it.unit_price} /></td>
                  <td><strong>{it.quantity}</strong></td>
                  <td><strong><Money amount={it.line_total} /></strong></td>
                  <td><Badge status={it.item_status} /></td>
                  <td>
                    {it.item_status === 'PENDING' && (
                      <button
                        type="button"
                        className="btn-outline-danger btn-sm"
                        disabled={busy}
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
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        <span style={{ fontSize: '0.82rem', color: 'var(--success)', fontWeight: 700 }}>
                          ✓ Reviewed ({it.review_rating}★)
                        </span>
                        {it.review_comment && (
                          <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)', fontStyle: 'italic', maxWidth: 180 }}>
                            "{it.review_comment}"
                          </span>
                        )}
                        {it.review_id && (
                          <div>
                            <button
                              type="button"
                              className="btn-outline-danger btn-sm"
                              style={{ padding: '2px 8px', fontSize: '0.75rem', marginTop: 2 }}
                              disabled={busy}
                              onClick={() => handleDeleteReview(it)}
                              title="Delete this review from the marketplace"
                            >
                              ✕ Delete Review
                            </button>
                          </div>
                        )}
                      </div>
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
        <p style={{ marginTop: 0 }}>
          Are you sure you want to cancel <strong>{cancelModalItem?.name}</strong> (Item #{cancelModalItem?.item_no})?
        </p>
        <div className="alert alert-error" style={{ fontSize: '0.84rem' }}>
          Database Trigger: The cancelled item quantity ({cancelModalItem?.quantity}) will be immediately restored back into the seller's inventory, and order totals recalculated.
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
          <div style={{ marginBottom: 18 }}>
            <label>Rating (1 to 5 Stars) *</label>
            <StarRatingSelector value={reviewRating} onChange={setReviewRating} />
          </div>

          <div style={{ marginBottom: 20 }}>
            <label>Your Feedback / Comment (Optional)</label>
            <textarea
              rows={4}
              placeholder="How was the product quality, packaging and delivery experience?"
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
