import { useState, useEffect } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../api.js';
import { useLoad, useAct, Msg, Money, RatingStars, Badge, QuantityStepper } from '../ui.jsx';

function getCategoryIcon(name) {
  const n = String(name || '').toLowerCase();
  if (n.includes('phone') || n.includes('mobile')) return '📱';
  if (n.includes('laptop') || n.includes('computer')) return '💻';
  if (n.includes('electronic') || n.includes('audio') || n.includes('headphone')) return '🎧';
  if (n.includes('book')) return '📚';
  if (n.includes('fashion') || n.includes('clothing') || n.includes('wear')) return '👕';
  if (n.includes('home') || n.includes('furniture')) return '🏠';
  if (n.includes('grocery') || n.includes('food')) return '🍎';
  return '📦';
}

export function Shop() {
  const cats = useLoad('/categories');
  const [f, setF] = useState({ q: '', category: '', min: '', max: '', sort: '' });
  const [res, setRes] = useState(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');

  const searchWithParams = (filterObj) => {
    setLoading(true);
    const params = new URLSearchParams(Object.entries(filterObj).filter(([, v]) => v));
    api('/products?' + params)
      .then(d => {
        setRes(d.results);
        setErr('');
      })
      .catch(e => setErr(e.message))
      .finally(() => setLoading(false));
  };

  const search = () => searchWithParams(f);

  useEffect(() => {
    search();
  }, []);

  const setField = k => e => setF({ ...f, [k]: e.target.value });

  const handleSelectCategory = (catId) => {
    const updated = { ...f, category: catId };
    setF(updated);
    searchWithParams(updated);
  };

  const clearFilters = () => {
    const reset = { q: '', category: '', min: '', max: '', sort: '' };
    setF(reset);
    searchWithParams(reset);
  };

  return (
    <div>
      {/* Hero Banner */}
      <div className="hero-banner">
        <div className="hero-badge">⚡ Multi-Vendor Shared Catalogue</div>
        <h1>Discover Genuine Products & Best Prices</h1>
        <p>
          Compare verified independent sellers, evaluate live inventory counts, read authenticated buyer reviews, and checkout seamlessly.
        </p>
      </div>

      {/* Quick Category Filter Pills */}
      {cats.data && cats.data.length > 0 && (
        <div className="category-filter-strip">
          <button
            type="button"
            className={`cat-pill-btn ${!f.category ? 'active' : ''}`}
            onClick={() => handleSelectCategory('')}
          >
            All Categories
          </button>
          {cats.data.map(c => (
            <button
              key={c.category_id}
              type="button"
              className={`cat-pill-btn ${String(f.category) === String(c.category_id) ? 'active' : ''}`}
              onClick={() => handleSelectCategory(String(c.category_id))}
            >
              {getCategoryIcon(c.name)} {c.name} ({c.products_in_subtree})
            </button>
          ))}
        </div>
      )}

      {/* Search & Filter Bar */}
      <div className="card" style={{ padding: '20px 24px', background: '#fff' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 14 }}>
          <div>
            <label>Search Keyword</label>
            <input
              placeholder="Search smartphone, laptop..."
              value={f.q}
              onChange={setField('q')}
              onKeyDown={e => e.key === 'Enter' && search()}
            />
          </div>

          <div>
            <label>Category Filter</label>
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
              <label>Min ₹</label>
              <input
                type="number"
                placeholder="0"
                value={f.min}
                onChange={setField('min')}
              />
            </div>
            <div style={{ flex: 1 }}>
              <label>Max ₹</label>
              <input
                type="number"
                placeholder="Any"
                value={f.max}
                onChange={setField('max')}
              />
            </div>
          </div>

          <div>
            <label>Sort By</label>
            <select value={f.sort} onChange={setField('sort')}>
              <option value="">Catalogue Default</option>
              <option value="price">Price: Low to High</option>
              <option value="rating">Top Customer Rated</option>
            </select>
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 16 }}>
          <button type="button" className="btn-secondary" onClick={clearFilters}>
            Reset Filters
          </button>
          <button type="button" className="btn-primary" onClick={search}>
            Apply Filters
          </button>
        </div>
      </div>

      {err && <div className="alert alert-error">{err}</div>}

      {loading ? (
        <div className="card empty-state">
          <div className="empty-state-icon">⏳</div>
          <h4>Loading products...</h4>
          <p>Fetching multi-vendor catalogue offers.</p>
        </div>
      ) : res?.length ? (
        <div className="products-grid">
          {res.map(p => (
            <div key={p.product_id} className="product-card">
              <div className="product-card-thumb">
                {getCategoryIcon(p.category)}
              </div>
              <span className="product-category-chip">{p.category}</span>
              <h3 className="product-title">{p.name}</h3>
              <div className="product-brand">{p.brand ? `By ${p.brand}` : 'Generic Brand'}</div>

              <div style={{ marginBottom: 12 }}>
                <RatingStars rating={p.avg_rating} count={p.reviews} />
              </div>

              <div className="product-price-section">
                <div>
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>
                    Best offer from
                  </div>
                  <div className="product-price-val">
                    {p.best_price ? <Money amount={p.best_price} /> : <span style={{ color: 'var(--danger)', fontSize: '1rem' }}>Out of stock</span>}
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
          <div className="empty-state-icon">🔍</div>
          <h4>No products found</h4>
          <p>Try searching for a different keyword or adjusting your category/price filters.</p>
          <button type="button" className="btn-secondary" onClick={clearFilters} style={{ marginTop: 12 }}>
            Clear all filters
          </button>
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
      <div style={{ marginBottom: 18 }}>
        <Link to="/" className="btn btn-secondary btn-sm">
          ← Back to catalogue
        </Link>
      </div>

      <Msg m={msg} />

      {prod.data && (
        <div className="card" style={{ marginBottom: 28, position: 'relative' }}>
          <div style={{ display: 'flex', gap: 20, alignItems: 'flex-start' }}>
            <div className="product-card-thumb" style={{ width: 100, height: 100, fontSize: '2.5rem', flexShrink: 0 }}>
              {getCategoryIcon(prod.data.category)}
            </div>
            <div style={{ flex: 1 }}>
              <span className="product-category-chip">{prod.data.category}</span>
              <h2 style={{ margin: '6px 0 8px' }}>{prod.data.name}</h2>
              <div className="row" style={{ gap: 14, color: 'var(--text-muted)', marginBottom: 12 }}>
                <span>Brand: <strong>{prod.data.brand || 'Unbranded'}</strong></span>
                <span>•</span>
                <RatingStars rating={prod.data.avg_rating} count={prod.data.reviews} />
              </div>
              {prod.data.description && (
                <p style={{ color: 'var(--text-secondary)', lineHeight: 1.6, margin: 0, fontSize: '0.95rem' }}>
                  {prod.data.description}
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      <h3>Seller Offers & Price Comparison</h3>
      <p style={{ color: 'var(--text-muted)', marginTop: -6, marginBottom: 16 }}>
        Multiple verified sellers offer this item out of the shared catalogue. Compare price, live stock and ratings.
      </p>

      {offers.loading ? (
        <div className="card empty-state">
          <p>Loading seller offers...</p>
        </div>
      ) : offers.data?.length ? (
        <div className="table-responsive">
          <table>
            <thead>
              <tr>
                <th>Seller / Store</th>
                <th>Seller Rating</th>
                <th>Stock Availability</th>
                <th>Offer Price</th>
                {(!user || user.role === 'customer') && <th style={{ width: 240 }}>Action</th>}
              </tr>
            </thead>
            <tbody>
              {offers.data.map(o => (
                <tr key={o.listing_id}>
                  <td>
                    <div style={{ fontWeight: 700, fontSize: '0.95rem' }}>{o.store_name}</div>
                    <div style={{ marginTop: 3 }}>
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
                    <span style={{ fontSize: '1.2rem', fontWeight: 800, color: 'var(--text-main)' }}>
                      <Money amount={o.price} />
                    </span>
                  </td>
                  {(!user || user.role === 'customer') && (
                    <td>
                      {user ? (
                        o.stock_qty > 0 ? (
                          <div className="row" style={{ gap: 8 }}>
                            <QuantityStepper
                              value={quantities[o.listing_id] || 1}
                              min={1}
                              max={o.stock_qty}
                              onChange={v => handleQtyChange(o.listing_id, v)}
                              disabled={busy}
                            />
                            <button
                              type="button"
                              className="btn btn-primary btn-sm"
                              disabled={busy}
                              onClick={() => addToCart(o)}
                            >
                              Add to Cart 🛒
                            </button>
                          </div>
                        ) : (
                          <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                            Currently Unavailable
                          </span>
                        )
                      ) : (
                        <Link to="/login" className="btn btn-secondary btn-sm">
                          Sign in to Buy
                        </Link>
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
        <div className="card" style={{ background: 'var(--primary-light)', borderColor: '#bfdbfe', marginTop: 24 }}>
          <p style={{ margin: 0, fontWeight: 500 }}>
            Want to purchase? <Link to="/login" style={{ fontWeight: 700, color: 'var(--accent)' }}>Sign in as customer</Link> to add items to your cart and checkout.
          </p>
        </div>
      )}
    </div>
  );
}
