import { useState } from 'react';
import { api } from '../api.js';
import { useLoad, useAct, Msg, Money, Modal, Badge, FormattedDate, RatingStars } from '../ui.jsx';

function Listings() {
  const { data, loading, err, reload } = useLoad('/seller/listings');
  const [msg, run, busy] = useAct();

  // Search catalogue modal
  const [isCatModalOpen, setIsCatModalOpen] = useState(false);
  const [catSearch, setCatSearch] = useState('');
  const [catResults, setCatResults] = useState(null);
  const [selectedProd, setSelectedProd] = useState(null);
  const [newPrice, setNewPrice] = useState('');
  const [newStock, setNewStock] = useState('10');

  // Edit listing modal
  const [editListing, setEditListing] = useState(null);
  const [editPrice, setEditPrice] = useState('');
  const [editStock, setEditStock] = useState('');
  const [editActive, setEditActive] = useState(true);

  const searchCatalogue = () => {
    api('/seller/catalogue?q=' + encodeURIComponent(catSearch))
      .then(setCatResults)
      .catch(e => alert(e.message));
  };

  const handleCreateListing = (e) => {
    e.preventDefault();
    if (!selectedProd) return;
    run(
      () => api('/seller/listings', {
        method: 'POST',
        body: {
          product_id: selectedProd.product_id,
          price: Number(newPrice),
          stock_qty: Number(newStock)
        }
      }),
      `Listing created for "${selectedProd.name}"!`
    ).then(() => {
      setIsCatModalOpen(false);
      setSelectedProd(null);
      setNewPrice('');
      setNewStock('10');
      reload();
    }).catch(() => {});
  };

  const openEditModal = (listing) => {
    setEditListing(listing);
    setEditPrice(String(listing.price));
    setEditStock(String(listing.stock_qty));
    setEditActive(listing.is_active);
  };

  const handleSaveEdit = (e) => {
    e.preventDefault();
    if (!editListing) return;
    run(
      () => api('/seller/listings/' + editListing.listing_id, {
        method: 'PUT',
        body: {
          price: Number(editPrice),
          stock_qty: Number(editStock),
          is_active: editActive
        }
      }),
      'Listing updated successfully!'
    ).then(() => {
      setEditListing(null);
      reload();
    }).catch(() => {});
  };

  const toggleActive = (listing) => {
    run(
      () => api('/seller/listings/' + listing.listing_id, {
        method: 'PUT',
        body: { is_active: !listing.is_active }
      }),
      `Listing ${listing.is_active ? 'hidden from' : 'activated in'} marketplace!`
    ).then(reload);
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div>
          <h3>My Active & Inactive Listings</h3>
          <p style={{ color: 'var(--text-muted)', marginTop: -6, marginBottom: 0 }}>
            Manage pricing, stock counts and marketplace visibility for your products.
          </p>
        </div>
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => {
            setIsCatModalOpen(true);
            searchCatalogue();
          }}
        >
          + List Catalogue Product
        </button>
      </div>

      <Msg m={msg} />
      {err && <div className="alert alert-error">{err}</div>}

      {loading ? (
        <p>Loading listings...</p>
      ) : !data?.length ? (
        <div className="card empty-state">
          <h4>No listings created yet</h4>
          <p>Pick items from the shared marketplace catalogue to begin selling.</p>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => {
              setIsCatModalOpen(true);
              searchCatalogue();
            }}
            style={{ marginTop: 10 }}
          >
            Browse Catalogue
          </button>
        </div>
      ) : (
        <div className="table-responsive">
          <table>
            <thead>
              <tr>
                <th>Listing ID</th>
                <th>Product</th>
                <th>Category</th>
                <th>Price</th>
                <th>Stock</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {data.map(l => (
                <tr key={l.listing_id}>
                  <td><strong>#{l.listing_id}</strong></td>
                  <td>
                    <div style={{ fontWeight: 600 }}>{l.name}</div>
                    {l.brand && <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{l.brand}</div>}
                  </td>
                  <td><span className="product-category-chip">{l.category}</span></td>
                  <td><strong><Money amount={l.price} /></strong></td>
                  <td>
                    {l.stock_qty <= 5 ? (
                      <span className="badge badge-warning">Low: {l.stock_qty}</span>
                    ) : (
                      <span>{l.stock_qty} units</span>
                    )}
                  </td>
                  <td>
                    <span className={`badge ${l.is_active ? 'badge-success' : 'badge-neutral'}`}>
                      {l.is_active ? 'Active' : 'Hidden'}
                    </span>
                  </td>
                  <td>
                    <div className="row" style={{ gap: 6 }}>
                      <button
                        type="button"
                        className="btn-secondary btn-sm"
                        onClick={() => openEditModal(l)}
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        className="btn-secondary btn-sm"
                        onClick={() => toggleActive(l)}
                      >
                        {l.is_active ? 'Hide' : 'Publish'}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal: Pick Catalogue Product to List */}
      <Modal
        isOpen={isCatModalOpen}
        title="List a Product from Shared Catalogue"
        onClose={() => {
          setIsCatModalOpen(false);
          setSelectedProd(null);
        }}
      >
        {!selectedProd ? (
          <div>
            <div className="row" style={{ marginBottom: 16 }}>
              <input
                type="text"
                placeholder="Search catalogue by name or brand..."
                value={catSearch}
                onChange={e => setCatSearch(e.target.value)}
                style={{ flex: 1 }}
              />
              <button type="button" onClick={searchCatalogue}>
                Search
              </button>
            </div>

            <div style={{ maxHeight: 360, overflowY: 'auto' }}>
              {catResults?.map(p => (
                <div
                  key={p.product_id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '10px 12px',
                    borderBottom: '1px solid #f1f5f9',
                    background: p.already_listed ? 'var(--bg-muted)' : '#fff'
                  }}
                >
                  <div>
                    <div style={{ fontWeight: 600 }}>{p.name}</div>
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                      {p.brand} • {p.category}
                    </div>
                  </div>
                  <div>
                    {p.already_listed ? (
                      <span className="badge badge-neutral">Already listed</span>
                    ) : (
                      <button
                        type="button"
                        className="btn-primary btn-sm"
                        onClick={() => setSelectedProd(p)}
                      >
                        Select
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <form onSubmit={handleCreateListing}>
            <div style={{ background: 'var(--bg-muted)', padding: '12px 14px', borderRadius: 'var(--radius-sm)', marginBottom: 16 }}>
              <div style={{ fontWeight: 700 }}>{selectedProd.name}</div>
              <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                {selectedProd.brand} • {selectedProd.category}
              </div>
            </div>

            <div style={{ marginBottom: 12 }}>
              <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, marginBottom: 4 }}>
                Your Selling Price (₹) *
              </label>
              <input
                type="number"
                step="0.01"
                min="0.01"
                required
                placeholder="e.g. 1499.00"
                value={newPrice}
                onChange={e => setNewPrice(e.target.value)}
              />
            </div>

            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, marginBottom: 4 }}>
                Initial Stock Quantity *
              </label>
              <input
                type="number"
                min="0"
                required
                value={newStock}
                onChange={e => setNewStock(e.target.value)}
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <button type="button" className="btn-secondary" onClick={() => setSelectedProd(null)}>
                Back
              </button>
              <button type="submit" className="btn-primary" disabled={busy}>
                {busy ? 'Listing...' : 'Publish Listing'}
              </button>
            </div>
          </form>
        )}
      </Modal>

      {/* Modal: Edit Existing Listing */}
      <Modal
        isOpen={Boolean(editListing)}
        title={`Edit Listing #${editListing?.listing_id}`}
        onClose={() => setEditListing(null)}
      >
        <form onSubmit={handleSaveEdit}>
          <p style={{ fontWeight: 600, marginTop: 0 }}>{editListing?.name}</p>

          <div style={{ marginBottom: 12 }}>
            <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, marginBottom: 4 }}>
              Price (₹) *
            </label>
            <input
              type="number"
              step="0.01"
              min="0.01"
              required
              value={editPrice}
              onChange={e => setEditPrice(e.target.value)}
            />
          </div>

          <div style={{ marginBottom: 14 }}>
            <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, marginBottom: 4 }}>
              Available Stock Quantity *
            </label>
            <input
              type="number"
              min="0"
              required
              value={editStock}
              onChange={e => setEditStock(e.target.value)}
            />
          </div>

          <div style={{ marginBottom: 18 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={editActive}
                onChange={e => setEditActive(e.target.checked)}
                style={{ width: 'auto', margin: 0 }}
              />
              Active in Marketplace Search
            </label>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
            <button type="button" className="btn-secondary" onClick={() => setEditListing(null)}>
              Cancel
            </button>
            <button type="submit" className="btn-primary" disabled={busy}>
              {busy ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

function Orders() {
  const { data, loading, err, reload } = useLoad('/seller/order-items');
  const [msg, run, busy] = useAct();

  const handleUpdateStatus = (r, status) => {
    run(
      () => api(`/seller/order-items/${r.order_id}/${r.item_no}`, {
        method: 'PUT',
        body: { status }
      }),
      `Order #${r.order_id} Item #${r.item_no} marked as ${status}!`
    ).then(reload);
  };

  return (
    <div>
      <div style={{ marginBottom: 16 }}>
        <h3>Order Items to Fulfil</h3>
        <p style={{ color: 'var(--text-muted)', marginTop: -6 }}>
          Dispatch and deliver order items purchased from your inventory.
        </p>
      </div>

      <Msg m={msg} />
      {err && <div className="alert alert-error">{err}</div>}

      {loading ? (
        <p>Loading fulfilment items...</p>
      ) : !data?.length ? (
        <div className="card empty-state">
          <h4>No orders to fulfil</h4>
          <p>You have no pending or active customer orders right now.</p>
        </div>
      ) : (
        <div className="table-responsive">
          <table>
            <thead>
              <tr>
                <th>Order #</th>
                <th>Item #</th>
                <th>Product</th>
                <th>Qty</th>
                <th>Unit Price</th>
                <th>Line Total</th>
                <th>Customer Address</th>
                <th>Item Status</th>
                <th>Fulfilment Action</th>
              </tr>
            </thead>
            <tbody>
              {data.map((r, i) => (
                <tr key={i}>
                  <td><strong>#{r.order_id}</strong></td>
                  <td>#{r.item_no}</td>
                  <td>
                    <div style={{ fontWeight: 600 }}>{r.name}</div>
                    {r.brand && <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{r.brand}</div>}
                  </td>
                  <td>{r.quantity}</td>
                  <td><Money amount={r.unit_price} /></td>
                  <td><strong><Money amount={r.line_total} /></strong></td>
                  <td style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                    <div>{r.line1}</div>
                    <div>{r.city}, {r.state} - {r.pincode}</div>
                  </td>
                  <td><Badge status={r.item_status} /></td>
                  <td>
                    {r.item_status === 'PENDING' && (
                      <button
                        type="button"
                        className="btn-primary btn-sm"
                        disabled={busy}
                        onClick={() => handleUpdateStatus(r, 'SHIPPED')}
                      >
                        Mark Shipped 🚚
                      </button>
                    )}
                    {r.item_status === 'SHIPPED' && (
                      <button
                        type="button"
                        className="btn-primary btn-sm"
                        disabled={busy}
                        onClick={() => handleUpdateStatus(r, 'DELIVERED')}
                      >
                        Mark Delivered 📦
                      </button>
                    )}
                    {['DELIVERED', 'CANCELLED', 'RETURNED'].includes(r.item_status) && (
                      <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Completed</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Dashboard() {
  const { data, loading, err } = useLoad('/seller/dashboard');

  if (loading) return <p>Loading analytics dashboard...</p>;
  if (err) return <div className="alert alert-error">{err}</div>;
  if (!data) return null;

  const { kpis, monthly_revenue, best_sellers, low_stock, listing_ratings, category_rank } = data;

  return (
    <div>
      <div style={{ marginBottom: 20 }}>
        <h3>Analytics & Performance Overview</h3>
        <p style={{ color: 'var(--text-muted)', marginTop: -6 }}>
          Live metrics calculated from PostgreSQL window functions and aggregates (Q3-style queries).
        </p>
      </div>

      {/* KPI Cards */}
      <div className="kpi-grid">
        <div className="kpi-card">
          <div className="kpi-label">Total Revenue</div>
          <div className="kpi-value"><Money amount={kpis?.total_revenue} /></div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">Units Sold</div>
          <div className="kpi-value">{kpis?.total_units_sold || 0}</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">Active Listings</div>
          <div className="kpi-value">{kpis?.active_listings || 0}</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">Store Rating</div>
          <div className="kpi-value">
            <RatingStars rating={kpis?.overall_rating} />
          </div>
        </div>
      </div>

      <div className="grid-2">
        {/* Monthly Revenue */}
        <div className="card">
          <h4 style={{ marginTop: 0 }}>Monthly Revenue Breakdown</h4>
          {!monthly_revenue?.length ? (
            <p className="empty-state">No monthly revenue recorded</p>
          ) : (
            <div className="table-responsive" style={{ margin: 0 }}>
              <table>
                <thead>
                  <tr>
                    <th>Month</th>
                    <th>Items Sold</th>
                    <th>Revenue</th>
                  </tr>
                </thead>
                <tbody>
                  {monthly_revenue.map((m, i) => (
                    <tr key={i}>
                      <td><FormattedDate date={m.month} /></td>
                      <td>{m.items}</td>
                      <td><strong><Money amount={m.revenue} /></strong></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Best Selling Products */}
        <div className="card">
          <h4 style={{ marginTop: 0 }}>Top 5 Best-Selling Products</h4>
          {!best_sellers?.length ? (
            <p className="empty-state">No sales recorded yet</p>
          ) : (
            <div className="table-responsive" style={{ margin: 0 }}>
              <table>
                <thead>
                  <tr>
                    <th>Product</th>
                    <th>Units Sold</th>
                    <th>Revenue</th>
                  </tr>
                </thead>
                <tbody>
                  {best_sellers.map(p => (
                    <tr key={p.product_id}>
                      <td><strong>{p.name}</strong></td>
                      <td>{p.units_sold}</td>
                      <td><Money amount={p.revenue} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      <div className="grid-2">
        {/* Category Rank */}
        <div className="card">
          <h4 style={{ marginTop: 0 }}>Seller Category Rank</h4>
          <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: -6 }}>
            Calculated via <code>RANK() OVER (PARTITION BY category_id ORDER BY revenue DESC)</code>
          </p>
          {!category_rank?.length ? (
            <p className="empty-state">No category rank data</p>
          ) : (
            <div className="table-responsive" style={{ margin: 0 }}>
              <table>
                <thead>
                  <tr>
                    <th>Category</th>
                    <th>Revenue</th>
                    <th>Category Rank</th>
                  </tr>
                </thead>
                <tbody>
                  {category_rank.map((c, i) => (
                    <tr key={i}>
                      <td>{c.category}</td>
                      <td><Money amount={c.revenue} /></td>
                      <td>
                        <span className="badge badge-info">
                          Rank #{c.rank} of {c.sellers_in_category}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Low Stock Alerts */}
        <div className="card">
          <h4 style={{ marginTop: 0 }}>Low Stock Warnings (&le; 5 units)</h4>
          {!low_stock?.length ? (
            <p className="empty-state" style={{ color: 'var(--success)' }}>
              ✓ All inventory levels are healthy!
            </p>
          ) : (
            <div className="table-responsive" style={{ margin: 0 }}>
              <table>
                <thead>
                  <tr>
                    <th>Product</th>
                    <th>Current Price</th>
                    <th>Stock Remaining</th>
                  </tr>
                </thead>
                <tbody>
                  {low_stock.map(l => (
                    <tr key={l.listing_id}>
                      <td><strong>{l.name}</strong></td>
                      <td><Money amount={l.price} /></td>
                      <td><span className="badge badge-danger">{l.stock_qty} left</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export function Seller() {
  const [tab, setTab] = useState('Listings');
  const tabs = { Listings, Orders, Dashboard };
  const ActiveTabComponent = tabs[tab];

  return (
    <div>
      <div style={{ marginBottom: 20 }}>
        <h2>Seller Hub</h2>
      </div>

      <div className="tabs-nav">
        {['Listings', 'Orders', 'Dashboard'].map(t => (
          <button
            key={t}
            className={`tab-btn ${tab === t ? 'active' : ''}`}
            onClick={() => setTab(t)}
          >
            {t === 'Orders' ? 'Fulfil Orders' : t}
          </button>
        ))}
      </div>

      <ActiveTabComponent />
    </div>
  );
}
