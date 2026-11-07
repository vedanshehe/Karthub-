import { useState, useEffect } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../api.js';
import { useLoad, useAct, Msg, Money, RatingStars, Badge } from '../ui.jsx';

export function Shop() {
  const cats = useLoad('/categories');
  const [f, setF] = useState({ q: '', category: '', min: '', max: '', sort: '' });
  const [res, setRes] = useState(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');

  const search = () => {
    setLoading(true);
    const params = new URLSearchParams(Object.entries(f).filter(([, v]) => v));
    api('/products?' + params)
      .then(d => {
        setRes(d.results);
        setErr('');
      })
      .catch(e => setErr(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(search, []);

  const setField = k => e => setF({ ...f, [k]: e.target.value });

  const clearFilters = () => {
    setF({ q: '', category: '', min: '', max: '', sort: '' });
    setLoading(true);
    api('/products')
      .then(d => setRes(d.results))
      .catch(e => setErr(e.message))
      .finally(() => setLoading(false));
  };

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <h1>Explore Products</h1>
        <p style={{ color: 'var(--text-muted)' }}>
          Browse shared multi-vendor catalogue, compare competitive prices, and shop with confidence.
        </p>
      </div>

      {/* Search & Filter Bar */}
      <div className="card" style={{ padding: '16px 20px', background: '#fff' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
          <div>
            <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: 4 }}>
              SEARCH KEYWORD
            </label>
            <input
              placeholder="Search smartphone, laptop..."
              value={f.q}
              onChange={setField('q')}
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: 4 }}>
              CATEGORY
            </label>
            <select value={f.category} onChange={setField('category')}>
              <option value="">All categories</option>
              {cats.data?.map(c => (
                <option key={c.category_id} value={c.category_id}>
                  {c.parent_id ? '• ' : ''}{c.name} ({c.products_in_subtree})
                </option>
              ))}
            </select>
          </div>

          <div style={{ display: 'flex', gap: 8 }}>
            <div style={{ flex: 1 }}>
              <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: 4 }}>
                MIN ₹
              </label>
              <input
                type="number"
                placeholder="0"
                value={f.min}
                onChange={setField('min')}
              />
            </div>
            <div style={{ flex: 1 }}>
              <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: 4 }}>
                MAX ₹
              </label>
              <input
                type="number"
                placeholder="Any"
                value={f.max}
                onChange={setField('max')}
              />
            </div>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: 4 }}>
              SORT BY
            </label>
            <select value={f.sort} onChange={setField('sort')}>
              <option value="">Default order</option>
              <option value="price">Price: Low to High</option>
              <option value="rating">Customer Rating</option>
            </select>
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 14 }}>
          <button type="button" className="btn-secondary" onClick={clearFilters}>
            Reset
          </button>
          <button type="button" onClick={search}>
            Apply Filters
          </button>
        </div>
      </div>

      {err && <div className="alert alert-error">{err}</div>}

      {loading ? (
        <div className="empty-state">
          <p>Loading catalogue products...</p>
        </div>
      ) : res?.length ? (
        <div className="products-grid">
          {res.map(p => (
            <div key={p.product_id} className="product-card">
              <span className="product-category-chip">{p.category}</span>
              <h3 className="product-title">{p.name}</h3>
              <div className="product-brand">{p.brand ? `By ${p.brand}` : 'Generic'}</div>

              <div style={{ marginBottom: 10 }}>
                <RatingStars rating={p.avg_rating} count={p.reviews} />
              </div>

              <div className="product-price-section">
                <div>
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                    Best offer from
                  </div>
                  <div className="product-price-val">
                    {p.best_price ? <Money amount={p.best_price} /> : 'Out of stock'}
                  </div>
                </div>

                <div style={{ textAlign: 'right' }}>
                  <span className="badge badge-info" style={{ marginBottom: 6 }}>
                    {p.offers} {p.offers === 1 ? 'seller' : 'sellers'}
                  </span>
                  <div>
                    <Link
                      to={`/product/${p.product_id}`}
                      className="btn btn-secondary btn-sm"
                      style={{ marginTop: 4 }}
                    >
                      Compare offers →
                    </Link>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="empty-state card">
          <h4>No products found</h4>
          <p>Try searching for a different keyword or adjusting your category/price filters.</p>
          <button className="btn-secondary" onClick={clearFilters}>Clear all filters</button>
        </div>
      )}
    </div>
  );
}

export function Product({ user }) {
  const { id } = useParams();
  const prod = useLoad(`/products/${id}`);
  const offers = useLoad(`/products/${id}/offers`);
  const [quantities, setQuantities] = useState({});
  const [msg, run, busy] = useAct();

  const handleQtyChange = (listingId, val) => {
    setQuantities(prev => ({ ...prev, [listingId]: Math.max(1, parseInt(val, 10) || 1) }));
  };

  const addToCart = (offer) => {
    const qty = quantities[offer.listing_id] || 1;
    run(
      () => api('/cart', { method: 'PUT', body: { listing_id: offer.listing_id, quantity: qty } }),
      `Added ${qty} unit(s) of "${prod.data?.name || 'Item'}" from ${offer.store_name} to cart!`
    );
  };

  return (
    <div>
      <div style={{ marginBottom: 16 }}>
        <Link to="/" className="btn btn-secondary btn-sm">
          ← Back to catalogue
        </Link>
      </div>

      <Msg m={msg} />

      {prod.data && (
        <div className="card" style={{ marginBottom: 24 }}>
          <span className="product-category-chip">{prod.data.category}</span>
          <h2>{prod.data.name}</h2>
          <div className="row" style={{ gap: 14, color: 'var(--text-muted)', marginBottom: 14 }}>
            <span>Brand: <strong>{prod.data.brand || 'Unbranded'}</strong></span>
            <span>•</span>
            <RatingStars rating={prod.data.avg_rating} count={prod.data.reviews} />
          </div>
          {prod.data.description && (
            <p style={{ color: 'var(--text-muted)', lineHeight: 1.6, margin: 0 }}>
              {prod.data.description}
            </p>
          )}
        </div>
      )}

      <h3>Seller Offers & Price Comparison</h3>
      <p style={{ color: 'var(--text-muted)', marginTop: -6, marginBottom: 16 }}>
        Multiple verified sellers offer this item out of the shared catalogue. Choose the best price and seller rating.
      </p>

      {offers.loading ? (
        <p>Loading seller offers...</p>
      ) : offers.data?.length ? (
        <div className="table-responsive">
          <table>
            <thead>
              <tr>
                <th>Seller / Store</th>
                <th>Seller Rating</th>
                <th>Stock Availability</th>
                <th>Price</th>
                {user?.role === 'customer' && <th style={{ width: 220 }}>Action</th>}
              </tr>
            </thead>
            <tbody>
              {offers.data.map(o => (
                <tr key={o.listing_id}>
                  <td>
                    <div style={{ fontWeight: 600 }}>{o.store_name}</div>
                    <div style={{ marginTop: 2 }}>
                      <Badge status={o.is_verified} type="verified" />
                    </div>
                  </td>
                  <td>
                    <RatingStars rating={o.seller_rating} />
                  </td>
                  <td>
                    {o.stock_qty > 0 ? (
                      <span className="badge badge-success">In Stock ({o.stock_qty})</span>
                    ) : (
                      <span className="badge badge-danger">Out of stock</span>
                    )}
                  </td>
                  <td>
                    <span style={{ fontSize: '1.15rem', fontWeight: 700, color: 'var(--text-main)' }}>
                      <Money amount={o.price} />
                    </span>
                  </td>
                  {user?.role === 'customer' && (
                    <td>
                      {o.stock_qty > 0 ? (
                        <div className="row" style={{ gap: 6 }}>
                          <input
                            type="number"
                            min="1"
                            max={o.stock_qty}
                            value={quantities[o.listing_id] || 1}
                            onChange={e => handleQtyChange(o.listing_id, e.target.value)}
                            style={{ width: 64, padding: '6px 8px' }}
                          />
                          <button
                            type="button"
                            className="btn btn-primary btn-sm"
                            disabled={busy}
                            onClick={() => addToCart(o)}
                          >
                            Add to Cart
                          </button>
                        </div>
                      ) : (
                        <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                          Unavailable
                        </span>
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="card empty-state">
          <h4>No active offers right now</h4>
          <p>No sellers currently have active listings for this product.</p>
        </div>
      )}

      {!user && (
        <div className="card" style={{ background: 'var(--primary-light)', borderColor: '#bfdbfe', marginTop: 20 }}>
          <p style={{ margin: 0 }}>
            Want to purchase? <Link to="/login" style={{ fontWeight: 600, color: 'var(--accent)' }}>Sign in as customer</Link> to add items to your cart.
          </p>
        </div>
      )}
    </div>
  );
}
