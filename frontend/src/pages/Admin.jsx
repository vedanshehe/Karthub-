import { useState } from 'react';
import { api } from '../api.js';
import { useLoad, useAct, Msg, Money, Modal, Badge, FormattedDate } from '../ui.jsx';

export function Admin() {
  const [tab, setTab] = useState('Overview');
  const summary = useLoad('/admin/summary');
  const sellers = useLoad('/admin/sellers');
  const coupons = useLoad('/admin/coupons');
  const cats = useLoad('/categories');
  const adminProds = useLoad('/admin/products');
  const [msg, run, busy] = useAct();

  // Create coupon modal
  const [isCouponModalOpen, setIsCouponModalOpen] = useState(false);
  const [newCoupon, setNewCoupon] = useState({
    code: '',
    discount_pct: '10',
    min_order_value: '500',
    valid_from: new Date().toISOString().slice(0, 10),
    valid_to: new Date(Date.now() + 90 * 86400000).toISOString().slice(0, 10),
    max_uses: '100'
  });

  // Create category modal
  const [isCatModalOpen, setIsCatModalOpen] = useState(false);
  const [catName, setCatName] = useState('');
  const [catParent, setCatParent] = useState('');

  // Create product modal
  const [isProdModalOpen, setIsProdModalOpen] = useState(false);
  const [prodForm, setProdForm] = useState({ category_id: '', name: '', brand: '', description: '' });

  const handleVerifySeller = (seller, verify) => {
    run(
      () => api(`/admin/sellers/${seller.seller_id}/verify`, {
        method: 'PUT',
        body: { is_verified: verify }
      }),
      `Seller "${seller.store_name}" ${verify ? 'verified' : 'unverified'}!`
    ).then(() => {
      sellers.reload();
      summary.reload();
    });
  };

  const handleCreateCoupon = (e) => {
    e.preventDefault();
    run(
      () => api('/admin/coupons', {
        method: 'POST',
        body: {
          code: newCoupon.code.trim().toUpperCase(),
          discount_pct: Number(newCoupon.discount_pct),
          min_order_value: Number(newCoupon.min_order_value || 0),
          valid_from: newCoupon.valid_from,
          valid_to: newCoupon.valid_to,
          max_uses: Number(newCoupon.max_uses)
        }
      }),
      `Coupon ${newCoupon.code.toUpperCase()} created successfully!`
    ).then(() => {
      setIsCouponModalOpen(false);
      coupons.reload();
    });
  };

  const handleDeleteCoupon = (c) => {
    if (!confirm(`Are you sure you want to delete coupon "${c.code}"?`)) return;
    run(
      () => api('/admin/coupons/' + c.code, { method: 'DELETE' }),
      `Coupon "${c.code}" deleted from marketplace.`
    ).then(coupons.reload).catch(e => alert(e.message));
  };

  const handleCreateCategory = (e) => {
    e.preventDefault();
    run(
      () => api('/admin/categories', {
        method: 'POST',
        body: {
          name: catName.trim(),
          parent_id: catParent ? Number(catParent) : null
        }
      }),
      `Category "${catName}" added to marketplace!`
    ).then(() => {
      setIsCatModalOpen(false);
      setCatName('');
      setCatParent('');
      cats.reload();
      summary.reload();
    });
  };

  const handleDeleteCategory = (cat) => {
    if (!confirm(`Are you sure you want to delete category "${cat.name}"? If it has child categories or products, it cannot be deleted.`)) return;
    run(
      () => api('/admin/categories/' + cat.category_id, { method: 'DELETE' }),
      `Category "${cat.name}" removed.`
    ).then(() => {
      cats.reload();
      summary.reload();
    }).catch(e => alert(e.message));
  };

  const handleCreateProduct = (e) => {
    e.preventDefault();
    run(
      () => api('/admin/products', {
        method: 'POST',
        body: {
          category_id: Number(prodForm.category_id),
          name: prodForm.name.trim(),
          brand: prodForm.brand.trim() || undefined,
          description: prodForm.description.trim() || undefined
        }
      }),
      `Product "${prodForm.name}" added to catalogue!`
    ).then(() => {
      setIsProdModalOpen(false);
      setProdForm({ category_id: '', name: '', brand: '', description: '' });
      adminProds.reload();
      summary.reload();
    });
  };

  const handleDeleteProduct = (prod) => {
    if (!confirm(`Are you sure you want to delete product "${prod.name}"? If any seller has created listings for it, deletion will be rejected.`)) return;
    run(
      () => api('/admin/products/' + prod.product_id, { method: 'DELETE' }),
      `Product "${prod.name}" removed from catalogue.`
    ).then(() => {
      adminProds.reload();
      summary.reload();
    }).catch(e => alert(e.message));
  };

  return (
    <div>
      <div style={{ marginBottom: 20 }}>
        <h2>Marketplace Administration</h2>
        <p style={{ color: 'var(--text-muted)', marginTop: -6 }}>
          Platform controls for vendor verification, promotional coupons and catalogue asset management.
        </p>
      </div>

      <Msg m={msg} />

      <div className="tabs-nav">
        {['Overview', 'Sellers', 'Coupons', 'Catalogue'].map(t => (
          <button
            key={t}
            className={`tab-btn ${tab === t ? 'active' : ''}`}
            onClick={() => setTab(t)}
          >
            {t}
          </button>
        ))}
      </div>

      {/* OVERVIEW TAB */}
      {tab === 'Overview' && (
        <div>
          <div className="kpi-grid">
            <div className="kpi-card">
              <div className="kpi-label">Total Users</div>
              <div className="kpi-value">{summary.data?.total_users || 0}</div>
            </div>
            <div className="kpi-card">
              <div className="kpi-label">Active Sellers</div>
              <div className="kpi-value">
                {summary.data?.verified_sellers || 0} / {summary.data?.total_sellers || 0}
              </div>
            </div>
            <div className="kpi-card">
              <div className="kpi-label">Catalogue Products</div>
              <div className="kpi-value">{summary.data?.total_products || 0}</div>
            </div>
            <div className="kpi-card">
              <div className="kpi-label">Total Orders Placed</div>
              <div className="kpi-value">{summary.data?.total_orders || 0}</div>
            </div>
            <div className="kpi-card">
              <div className="kpi-label">Total GMV Settled</div>
              <div className="kpi-value"><Money amount={summary.data?.total_revenue} /></div>
            </div>
          </div>

          <div className="card">
            <h3 style={{ marginTop: 0 }}>System Management Controls</h3>
            <p style={{ color: 'var(--text-muted)' }}>
              Use the tabs above to verify pending sellers, inspect or create discount coupons, or expand the catalogue by introducing new product categories and products.
            </p>
            <div className="row" style={{ gap: 10 }}>
              <button type="button" className="btn btn-secondary" onClick={() => setTab('Sellers')}>
                Manage Sellers
              </button>
              <button type="button" className="btn btn-secondary" onClick={() => setTab('Coupons')}>
                Manage Coupons
              </button>
              <button type="button" className="btn btn-primary" onClick={() => setTab('Catalogue')}>
                Catalogue Management
              </button>
            </div>
          </div>
        </div>
      )}

      {/* SELLERS TAB */}
      {tab === 'Sellers' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <h3>Registered Sellers ({sellers.data?.length || 0})</h3>
          </div>

          {sellers.loading ? (
            <p>Loading sellers...</p>
          ) : (
            <div className="table-responsive">
              <table>
                <thead>
                  <tr>
                    <th>Seller ID</th>
                    <th>Store Name</th>
                    <th>GST Number</th>
                    <th>Contact Email</th>
                    <th>Listings</th>
                    <th>Joined</th>
                    <th>Status</th>
                    <th>Verification Action</th>
                  </tr>
                </thead>
                <tbody>
                  {sellers.data?.map(s => (
                    <tr key={s.seller_id}>
                      <td>#{s.seller_id}</td>
                      <td><strong>{s.store_name}</strong></td>
                      <td><code>{s.gst_no}</code></td>
                      <td>{s.email}</td>
                      <td>{s.total_listings}</td>
                      <td><FormattedDate date={s.joined_on} /></td>
                      <td><Badge status={s.is_verified} type="verified" /></td>
                      <td>
                        <button
                          type="button"
                          className={s.is_verified ? 'btn-outline-danger btn-sm' : 'btn-primary btn-sm'}
                          disabled={busy}
                          onClick={() => handleVerifySeller(s, !s.is_verified)}
                        >
                          {s.is_verified ? 'Revoke Verification' : 'Verify Seller ✓'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* COUPONS TAB */}
      {tab === 'Coupons' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <div>
              <h3 style={{ margin: '0 0 4px' }}>Marketplace Coupons ({coupons.data?.length || 0})</h3>
              <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                Create promotional discount coupons or delete unused ones.
              </span>
            </div>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => setIsCouponModalOpen(true)}
            >
              + Create New Coupon
            </button>
          </div>

          {coupons.loading ? (
            <p>Loading coupons...</p>
          ) : (
            <div className="table-responsive">
              <table>
                <thead>
                  <tr>
                    <th>Coupon Code</th>
                    <th>Discount</th>
                    <th>Min Order Value</th>
                    <th>Usage Count</th>
                    <th>Validity Period</th>
                    <th>Status</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {coupons.data?.map(c => {
                    const isExhausted = Number(c.used) >= c.max_uses;
                    const isActive = c.is_active_date && !isExhausted;
                    return (
                      <tr key={c.code}>
                        <td><strong><code>{c.code}</code></strong></td>
                        <td>{c.discount_pct}% OFF</td>
                        <td><Money amount={c.min_order_value} /></td>
                        <td>
                          {c.used} / {c.max_uses} uses
                          {isExhausted && <span style={{ color: 'var(--danger)', marginLeft: 6 }}>(Exhausted)</span>}
                        </td>
                        <td style={{ fontSize: '0.82rem' }}>
                          <FormattedDate date={c.valid_from} /> to <FormattedDate date={c.valid_to} />
                        </td>
                        <td>
                          <span className={`badge ${isActive ? 'badge-success' : 'badge-neutral'}`}>
                            {isActive ? 'Active' : 'Expired/Used'}
                          </span>
                        </td>
                        <td>
                          <button
                            type="button"
                            className="btn-outline-danger btn-sm"
                            disabled={busy}
                            onClick={() => handleDeleteCoupon(c)}
                            title="Delete coupon"
                          >
                            Delete
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* Modal: Create Coupon */}
          <Modal
            isOpen={isCouponModalOpen}
            title="Create Marketplace Promotional Coupon"
            onClose={() => setIsCouponModalOpen(false)}
          >
            <form onSubmit={handleCreateCoupon}>
              <div style={{ marginBottom: 12 }}>
                <label>Coupon Code *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. SUMMER25"
                  value={newCoupon.code}
                  onChange={e => setNewCoupon({ ...newCoupon, code: e.target.value.toUpperCase() })}
                />
              </div>

              <div className="grid-2" style={{ marginBottom: 12 }}>
                <div>
                  <label>Discount Percentage (1-90%) *</label>
                  <input
                    type="number"
                    min="1"
                    max="90"
                    required
                    value={newCoupon.discount_pct}
                    onChange={e => setNewCoupon({ ...newCoupon, discount_pct: e.target.value })}
                  />
                </div>
                <div>
                  <label>Min Order Value (₹)</label>
                  <input
                    type="number"
                    min="0"
                    value={newCoupon.min_order_value}
                    onChange={e => setNewCoupon({ ...newCoupon, min_order_value: e.target.value })}
                  />
                </div>
              </div>

              <div className="grid-2" style={{ marginBottom: 12 }}>
                <div>
                  <label>Valid From *</label>
                  <input
                    type="date"
                    required
                    value={newCoupon.valid_from}
                    onChange={e => setNewCoupon({ ...newCoupon, valid_from: e.target.value })}
                  />
                </div>
                <div>
                  <label>Valid To *</label>
                  <input
                    type="date"
                    required
                    value={newCoupon.valid_to}
                    onChange={e => setNewCoupon({ ...newCoupon, valid_to: e.target.value })}
                  />
                </div>
              </div>

              <div style={{ marginBottom: 18 }}>
                <label>Maximum Allowed Uses *</label>
                <input
                  type="number"
                  min="1"
                  required
                  value={newCoupon.max_uses}
                  onChange={e => setNewCoupon({ ...newCoupon, max_uses: e.target.value })}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
                <button type="button" className="btn-secondary" onClick={() => setIsCouponModalOpen(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn-primary" disabled={busy}>
                  {busy ? 'Creating...' : 'Create Coupon'}
                </button>
              </div>
            </form>
          </Modal>
        </div>
      )}

      {/* CATALOGUE TAB */}
      {tab === 'Catalogue' && (
        <div>
          {/* Creation Forms */}
          <div className="grid-2" style={{ marginBottom: 28 }}>
            {/* Create Category Card */}
            <div className="card" style={{ margin: 0 }}>
              <h3 style={{ marginTop: 0 }}>Add New Category</h3>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                Add root categories or sub-categories. Cycle prevention is checked by database triggers.
              </p>
              <form onSubmit={handleCreateCategory}>
                <div style={{ marginBottom: 12 }}>
                  <label>Category Name *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Gaming Laptops"
                    value={catName}
                    onChange={e => setCatName(e.target.value)}
                  />
                </div>
                <div style={{ marginBottom: 16 }}>
                  <label>Parent Category (Optional)</label>
                  <select value={catParent} onChange={e => setCatParent(e.target.value)}>
                    <option value="">None (Root category)</option>
                    {cats.data?.map(c => (
                      <option key={c.category_id} value={c.category_id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>
                <button type="submit" className="btn-primary" disabled={busy}>
                  {busy ? 'Saving...' : 'Add Category'}
                </button>
              </form>
            </div>

            {/* Create Product Card */}
            <div className="card" style={{ margin: 0 }}>
              <h3 style={{ marginTop: 0 }}>Add New Product</h3>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                Create a catalogue entry that any independent seller can list offers for.
              </p>
              <form onSubmit={handleCreateProduct}>
                <div style={{ marginBottom: 12 }}>
                  <label>Category *</label>
                  <select
                    required
                    value={prodForm.category_id}
                    onChange={e => setProdForm({ ...prodForm, category_id: e.target.value })}
                  >
                    <option value="">Select Category</option>
                    {cats.data?.map(c => (
                      <option key={c.category_id} value={c.category_id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div style={{ marginBottom: 12 }}>
                  <label>Product Name *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. MacBook Air M3"
                    value={prodForm.name}
                    onChange={e => setProdForm({ ...prodForm, name: e.target.value })}
                  />
                </div>

                <div style={{ marginBottom: 12 }}>
                  <label>Brand Name</label>
                  <input
                    type="text"
                    placeholder="e.g. Apple"
                    value={prodForm.brand}
                    onChange={e => setProdForm({ ...prodForm, brand: e.target.value })}
                  />
                </div>

                <div style={{ marginBottom: 16 }}>
                  <label>Description</label>
                  <textarea
                    rows={2}
                    placeholder="Key specifications and product details..."
                    value={prodForm.description}
                    onChange={e => setProdForm({ ...prodForm, description: e.target.value })}
                  />
                </div>

                <button type="submit" className="btn-primary" disabled={busy}>
                  {busy ? 'Saving...' : 'Add Product to Catalogue'}
                </button>
              </form>
            </div>
          </div>

          {/* Manage Existing Categories */}
          <div className="card" style={{ marginBottom: 24 }}>
            <h3 style={{ marginTop: 0 }}>Categories ({cats.data?.length || 0})</h3>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginTop: -6 }}>
              Categories can only be deleted if they contain no products and no subcategories.
            </p>
            {cats.loading ? (
              <p>Loading categories...</p>
            ) : (
              <div className="table-responsive">
                <table>
                  <thead>
                    <tr>
                      <th>ID</th>
                      <th>Category Name</th>
                      <th>Parent Category ID</th>
                      <th>Subtree Products</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {cats.data?.map(c => (
                      <tr key={c.category_id}>
                        <td>#{c.category_id}</td>
                        <td><strong>{c.name}</strong></td>
                        <td>{c.parent_id ? `#${c.parent_id}` : 'Root'}</td>
                        <td>{c.products_in_subtree} items</td>
                        <td>
                          <button
                            type="button"
                            className="btn-outline-danger btn-sm"
                            disabled={busy}
                            onClick={() => handleDeleteCategory(c)}
                            title="Delete category"
                          >
                            Delete
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Manage Existing Products */}
          <div className="card">
            <h3 style={{ marginTop: 0 }}>Catalogue Products ({adminProds.data?.length || 0})</h3>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginTop: -6 }}>
              Products can be deleted only if no seller listings are currently associated with them.
            </p>
            {adminProds.loading ? (
              <p>Loading products...</p>
            ) : (
              <div className="table-responsive">
                <table>
                  <thead>
                    <tr>
                      <th>ID</th>
                      <th>Product Name</th>
                      <th>Brand</th>
                      <th>Category</th>
                      <th>Active Listings</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {adminProds.data?.map(p => (
                      <tr key={p.product_id}>
                        <td>#{p.product_id}</td>
                        <td><strong>{p.name}</strong></td>
                        <td>{p.brand || '-'}</td>
                        <td><span className="product-category-chip">{p.category_name}</span></td>
                        <td>
                          {p.total_listings > 0 ? (
                            <span className="badge badge-info">{p.total_listings} listing(s)</span>
                          ) : (
                            <span className="badge badge-neutral">No listings</span>
                          )}
                        </td>
                        <td>
                          <button
                            type="button"
                            className="btn-outline-danger btn-sm"
                            disabled={busy}
                            onClick={() => handleDeleteProduct(p)}
                            title="Delete product"
                          >
                            Delete
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
