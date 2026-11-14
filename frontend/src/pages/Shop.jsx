import { useState, useEffect } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../api.js';
import { useLoad, useAct, Msg, Money, RatingStars, Badge, QuantityStepper } from '../ui.jsx';

export function getCategoryIcon(name) {
  const n = String(name || '').toLowerCase();
  if (n.includes('phone') || n.includes('mobile')) return '📱';
  if (n.includes('laptop') || n.includes('computer')) return '💻';
  if (n.includes('headphone') || n.includes('audio')) return '🎧';
  if (n.includes('camera')) return '📷';
  if (n.includes('men') || n.includes('shirt')) return '👔';
  if (n.includes('women') || n.includes('dress')) return '👗';
  if (n.includes('shoe') || n.includes('footwear') || n.includes('sneaker')) return '👟';
  if (n.includes('watch')) return '⌚';
  if (n.includes('furniture') || n.includes('chair') || n.includes('sofa')) return '🛋️';
  if (n.includes('cook') || n.includes('pan') || n.includes('pot') || n.includes('kitchen')) return '🍳';
  if (n.includes('light') || n.includes('lamp')) return '💡';
  if (n.includes('decor')) return '🏺';
  if (n.includes('comic')) return '🎨';
  if (n.includes('textbook')) return '📑';
  if (n.includes('kid')) return '🧸';
  if (n.includes('book') || n.includes('fiction')) return '📖';
  if (n.includes('electronic')) return '⚡';
  if (n.includes('fashion')) return '✨';
  if (n.includes('home')) return '🏡';
  return '📦';
}

function getCategoryDescription(name) {
  const n = String(name || '').toLowerCase();
  if (n.includes('electronic')) return 'High-performance audio, portable computing, smartphones, and optical gear.';
  if (n.includes('fashion')) return 'Understated everyday apparel, versatile footwear, and minimalist timepieces.';
  if (n.includes('home')) return 'Minimalist furniture, artisan cookware, and warm ambient living essentials.';
  if (n.includes('book')) return 'Literary fiction, academic reference, graphic novels, and illustrated works.';
  return 'Curated selection from verified independent sellers.';
}

function ProductCard({ p }) {
  return (
    <Link to={`/product/${p.product_id}`} className="product-card">
      <div className="product-card-thumb">
        <span className="product-card-category-tag">{p.category}</span>
        <span style={{ fontSize: '3rem', transition: 'transform 0.2s ease' }}>
          {getCategoryIcon(p.category)}
        </span>
      </div>
      <div className="product-card-body">
        <h3 className="product-title">{p.name}</h3>
        <div className="product-brand">{p.brand ? `By ${p.brand}` : 'Curated Brand'}</div>

        <div className="product-rating-row">
          <RatingStars rating={p.avg_rating} count={p.reviews} />
        </div>

        <div className="product-price-section">
          <div>
            <div className="product-price-label">From</div>
            <div className="product-price-val">
              {p.best_price ? <Money amount={p.best_price} /> : <span style={{ color: 'var(--danger)', fontSize: '0.9rem' }}>Unavailable</span>}
            </div>
          </div>

          <div style={{ textAlign: 'right' }}>
            <span className="product-offers-count">
              {p.offers} {p.offers === 1 ? 'seller' : 'sellers'}
            </span>
            <div className="product-view-link">
              View offers →
            </div>
          </div>
        </div>
      </div>
    </Link>
  );
}

export function Shop() {
  const cats = useLoad('/categories');
  const [selectedCat, setSelectedCat] = useState('');
  const [selectedSubcat, setSelectedSubcat] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [activeSearch, setActiveSearch] = useState('');
  const [sortBy, setSortBy] = useState('');
  const [minPrice, setMinPrice] = useState('');
  const [maxPrice, setMaxPrice] = useState('');

  // Curated category sections cache: { [catId]: Product[] }
  const [curatedSections, setCuratedSections] = useState({});
  const [curatedLoading, setCuratedLoading] = useState(false);

  // Filtered / search / category results
  const [categoryProducts, setCategoryProducts] = useState(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');

  // Root categories (filtering out any temporary smoke test categories)
  const rootCats = (cats.data || []).filter(c => !c.parent_id && !c.name.startsWith('TestCat'));

  // Determine if we are in the default "Curated Collections" overview
  const isCuratedOverview = !selectedCat && !selectedSubcat && !activeSearch && !minPrice && !maxPrice;

  // Pre-load curated items for each root category
  useEffect(() => {
    if (rootCats.length > 0 && Object.keys(curatedSections).length === 0) {
      setCuratedLoading(true);
      Promise.all(
        rootCats.map(c =>
          api(`/products?category=${c.category_id}&page=1`)
            .then(res => ({ id: c.category_id, items: res.results || [] }))
            .catch(() => ({ id: c.category_id, items: [] }))
        )
      )
        .then(results => {
          const map = {};
          results.forEach(r => { map[r.id] = r.items; });
          setCuratedSections(map);
        })
        .finally(() => setCuratedLoading(false));
    }
  }, [cats.data]);

  // Load products when category, subcategory, or sort changes
  const executeQuery = (catId, subId, q, sort, min, max) => {
    const targetCat = subId || catId || '';
    if (!targetCat && !q && !min && !max) {
      setCategoryProducts(null);
      return;
    }

    setLoading(true);
    setErr('');
    const params = new URLSearchParams();
    if (q) params.set('q', q);
    if (targetCat) params.set('category', targetCat);
    if (min) params.set('min', min);
    if (max) params.set('max', max);
    if (sort) params.set('sort', sort);

    api('/products?' + params.toString())
      .then(d => {
        setCategoryProducts(d.results || []);
      })
      .catch(e => setErr(e.message))
      .finally(() => setLoading(false));
  };

  const handleSearchSubmit = (e) => {
    if (e) e.preventDefault();
    setActiveSearch(searchTerm.trim());
    executeQuery(selectedCat, selectedSubcat, searchTerm.trim(), sortBy, minPrice, maxPrice);
  };

  const handleSelectRoot = (catId) => {
    setSelectedCat(catId);
    setSelectedSubcat('');
    executeQuery(catId, '', activeSearch, sortBy, minPrice, maxPrice);
  };

  const handleSelectSub = (subId) => {
    setSelectedSubcat(subId);
    executeQuery(selectedCat, subId, activeSearch, sortBy, minPrice, maxPrice);
  };

  const handleSortChange = (newSort) => {
    setSortBy(newSort);
    if (!isCuratedOverview || selectedCat || activeSearch) {
      executeQuery(selectedCat, selectedSubcat, activeSearch, newSort, minPrice, maxPrice);
    }
  };

  const clearAllFilters = () => {
    setSelectedCat('');
    setSelectedSubcat('');
    setSearchTerm('');
    setActiveSearch('');
    setSortBy('');
    setMinPrice('');
    setMaxPrice('');
    setCategoryProducts(null);
  };

  // Subcategories for the selected root category
  const currentRoot = rootCats.find(c => String(c.category_id) === String(selectedCat));
  const currentSubcats = (cats.data || []).filter(c => String(c.parent_id) === String(selectedCat));

  return (
    <div>
      {/* Hero Section */}
      <div className="hero-section">
        <span className="hero-tag">Curated Living & Marketplace</span>
        <h1 className="hero-title">Thoughtfully Curated.</h1>
        <p className="hero-subtitle">
          Quality lifestyle, modern electronics, home craft, and literature—sourced from verified independent merchants.
        </p>
      </div>

      {/* Floating Pill Search Bar */}
      <form onSubmit={handleSearchSubmit} className="search-widget-bar">
        <span style={{ fontSize: '1.1rem', color: 'var(--text-muted)', marginLeft: 4 }}>🔍</span>
        <input
          type="text"
          className="search-widget-input"
          placeholder="Search items, brands, or keywords..."
          value={searchTerm}
          onChange={e => setSearchTerm(e.target.value)}
        />

        <div className="search-widget-divider" />

        <select
          className="search-widget-select"
          value={selectedCat}
          onChange={e => handleSelectRoot(e.target.value)}
        >
          <option value="">All Categories</option>
          {rootCats.map(c => (
            <option key={c.category_id} value={c.category_id}>
              {c.name}
            </option>
          ))}
        </select>

        <div className="search-widget-divider" />

        <select
          className="search-widget-select"
          value={sortBy}
          onChange={e => handleSortChange(e.target.value)}
        >
          <option value="">Featured</option>
          <option value="price">Price: Low to High</option>
          <option value="rating">Top Rated</option>
        </select>

        <button type="submit" className="btn btn-primary" style={{ padding: '8px 20px' }}>
          Explore
        </button>
      </form>

      {/* Category Navigation Pills */}
      {rootCats.length > 0 && (
        <div className="category-nav-strip">
          <button
            type="button"
            className={`category-nav-btn ${!selectedCat && !activeSearch ? 'active' : ''}`}
            onClick={clearAllFilters}
          >
            ✦ All Collections
          </button>
          {rootCats.map(c => (
            <button
              key={c.category_id}
              type="button"
              className={`category-nav-btn ${String(selectedCat) === String(c.category_id) ? 'active' : ''}`}
              onClick={() => handleSelectRoot(String(c.category_id))}
            >
              {getCategoryIcon(c.name)} {c.name}
            </button>
          ))}
        </div>
      )}

      {err && <div className="alert alert-error">{err}</div>}

      {/* VIEW 1: CURATED CATEGORY OVERVIEW (Default Landing State) */}
      {isCuratedOverview && !loading && (
        <div>
          {curatedLoading && Object.keys(curatedSections).length === 0 ? (
            <div className="card empty-state">
              <div className="empty-state-icon">⏳</div>
              <h4>Curating collections...</h4>
              <p>Gathering items across verified sellers.</p>
            </div>
          ) : (
            rootCats.map(cat => {
              const items = (curatedSections[cat.category_id] || []).slice(0, 4);
              const subcatNames = (cats.data || [])
                .filter(c => c.parent_id === cat.category_id)
                .map(c => c.name)
                .join(' • ');

              return (
                <section key={cat.category_id} className="category-section-block">
                  <div className="category-section-header">
                    <div>
                      <h2 className="category-section-title">
                        {cat.name}
                      </h2>
                      <div className="category-section-desc">
                        {subcatNames || getCategoryDescription(cat.name)}
                      </div>
                    </div>
                    <button
                      type="button"
                      className="category-view-all-btn"
                      onClick={() => handleSelectRoot(String(cat.category_id))}
                    >
                      Explore {cat.name} ({cat.products_in_subtree}) →
                    </button>
                  </div>

                  <div className="products-grid">
                    {items.map(p => (
                      <ProductCard key={p.product_id} p={p} />
                    ))}
                  </div>
                </section>
              );
            })
          )}
        </div>
      )}

      {/* VIEW 2: CATEGORY SPECIFIC OR SEARCH RESULTS VIEW */}
      {!isCuratedOverview && (
        <div>
          {/* Header Bar for Active Category or Search */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={clearAllFilters}
                >
                  ← All Collections
                </button>
                {selectedCat && currentRoot && (
                  <span style={{ fontSize: '0.88rem', color: 'var(--text-muted)' }}>
                    / {currentRoot.name}
                  </span>
                )}
                {selectedSubcat && (
                  <span style={{ fontSize: '0.88rem', color: 'var(--text-main)', fontWeight: 600 }}>
                    / {cats.data?.find(c => String(c.category_id) === String(selectedSubcat))?.name}
                  </span>
                )}
              </div>

              <h2 style={{ margin: '8px 0 4px' }}>
                {activeSearch
                  ? `Search Results for "${activeSearch}"`
                  : currentRoot
                  ? `${currentRoot.name} Collection`
                  : 'All Products'}
              </h2>
              <p style={{ color: 'var(--text-muted)', margin: 0, fontSize: '0.9rem' }}>
                {activeSearch
                  ? `Showing results matching your query.`
                  : currentRoot
                  ? getCategoryDescription(currentRoot.name)
                  : 'Filtered collection of multi-vendor marketplace products.'}
              </p>
            </div>

            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              {(activeSearch || selectedCat || selectedSubcat || minPrice || maxPrice) && (
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={clearAllFilters}
                >
                  Reset All Filters
                </button>
              )}
            </div>
          </div>

          {/* Subcategory Pills Strip (when a Root Category is selected) */}
          {selectedCat && currentSubcats.length > 0 && (
            <div className="subcategory-strip">
              <button
                type="button"
                className={`subcat-pill ${!selectedSubcat ? 'active' : ''}`}
                onClick={() => handleSelectSub('')}
              >
                All {currentRoot?.name}
              </button>
              {currentSubcats.map(sub => (
                <button
                  key={sub.category_id}
                  type="button"
                  className={`subcat-pill ${String(selectedSubcat) === String(sub.category_id) ? 'active' : ''}`}
                  onClick={() => handleSelectSub(String(sub.category_id))}
                >
                  {getCategoryIcon(sub.name)} {sub.name} ({sub.products_in_subtree})
                </button>
              ))}
            </div>
          )}

          {/* Loading or Results */}
          {loading ? (
            <div className="card empty-state">
              <div className="empty-state-icon">⏳</div>
              <h4>Loading items...</h4>
              <p>Fetching active offers from independent sellers.</p>
            </div>
          ) : categoryProducts?.length ? (
            <div>
              <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: 12 }}>
                Showing <strong>{categoryProducts.length}</strong> items in this collection
              </div>
              <div className="products-grid">
                {categoryProducts.map(p => (
                  <ProductCard key={p.product_id} p={p} />
                ))}
              </div>
            </div>
          ) : (
            <div className="card empty-state">
              <div className="empty-state-icon">🔍</div>
              <h4>No items found</h4>
              <p>No products match your current category or search criteria.</p>
              <button
                type="button"
                className="btn btn-primary"
                onClick={clearAllFilters}
                style={{ marginTop: 12 }}
              >
                Return to All Collections
              </button>
            </div>
          )}
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
      `Added ${qty} unit(s) from ${offer.store_name} to cart!`
    );
  };

  return (
    <div>
      <div style={{ marginBottom: 20 }}>
        <Link to="/" className="btn btn-secondary btn-sm">
          ← Back to Catalogue
        </Link>
      </div>

      <Msg m={msg} />

      {prod.loading && (
        <div className="card empty-state">
          <p>Loading product details...</p>
        </div>
      )}

      {prod.data && (
        <div className="product-detail-grid">
          {/* Left Column: Product Showcase */}
          <div className="product-detail-showcase">
            <div className="product-detail-visual">
              <span className="product-card-category-tag">{prod.data.category}</span>
              <span>{getCategoryIcon(prod.data.category)}</span>
            </div>

            <h1 style={{ fontSize: '2rem', marginBottom: 6 }}>{prod.data.name}</h1>
            
            <div className="row" style={{ gap: 12, color: 'var(--text-muted)', marginBottom: 16 }}>
              <span>Brand: <strong style={{ color: 'var(--text-main)' }}>{prod.data.brand || 'Curated'}</strong></span>
              <span>•</span>
              <RatingStars rating={prod.data.avg_rating} count={prod.data.reviews} />
            </div>

            {prod.data.description && (
              <p style={{ color: 'var(--text-secondary)', lineHeight: 1.7, fontSize: '0.96rem', margin: '0 0 20px' }}>
                {prod.data.description}
              </p>
            )}

            <div className="product-perks-list">
              <div className="product-perk-item">
                <span>🛡️</span>
                <span>Verified Independent Sellers</span>
              </div>
              <div className="product-perk-item">
                <span>📦</span>
                <span>Direct Merchant Fulfilled</span>
              </div>
              <div className="product-perk-item">
                <span>🔒</span>
                <span>Secure Order Checkout</span>
              </div>
              <div className="product-perk-item">
                <span>✨</span>
                <span>Authentic Quality Standard</span>
              </div>
            </div>
          </div>

          {/* Right Column: Seller Offers & Pricing */}
          <div>
            <div className="card" style={{ padding: '24px 28px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 16 }}>
                <div>
                  <h3 style={{ margin: 0, fontSize: '1.35rem' }}>Independent Seller Offers</h3>
                  <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', margin: '3px 0 0' }}>
                    Compare prices and live stock from verified merchants.
                  </p>
                </div>
              </div>

              {offers.loading ? (
                <p style={{ color: 'var(--text-muted)' }}>Loading seller offers...</p>
              ) : offers.data?.length ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  {offers.data.map(o => (
                    <div
                      key={o.listing_id}
                      style={{
                        padding: '16px 18px',
                        border: '1px solid var(--border-color)',
                        borderRadius: 'var(--radius-sm)',
                        background: 'var(--bg-surface-soft)',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 12
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        <div>
                          <div style={{ fontWeight: 600, fontSize: '1rem', color: 'var(--text-main)' }}>
                            {o.store_name}
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
                            <Badge status={o.is_verified} type="verified" />
                            <RatingStars rating={o.seller_rating} />
                          </div>
                        </div>

                        <div style={{ textAlign: 'right' }}>
                          <div style={{ fontSize: '1.35rem', fontWeight: 700, color: 'var(--text-main)' }}>
                            <Money amount={o.price} />
                          </div>
                          <div>
                            {o.stock_qty > 0 ? (
                              <span className="badge badge-success" style={{ marginTop: 4 }}>
                                In Stock ({o.stock_qty})
                              </span>
                            ) : (
                              <span className="badge badge-danger" style={{ marginTop: 4 }}>
                                Out of stock
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      {(!user || user.role === 'customer') && (
                        <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 10, paddingTop: 10, borderTop: '1px solid var(--border-light)' }}>
                          {user ? (
                            o.stock_qty > 0 ? (
                              <>
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
                              </>
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
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="empty-state" style={{ padding: '24px 0' }}>
                  <h4>No active offers</h4>
                  <p>No verified sellers currently have inventory for this item.</p>
                </div>
              )}

              {!user && (
                <div style={{ marginTop: 20, padding: 14, background: '#fff', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-sm)' }}>
                  <p style={{ margin: 0, fontSize: '0.88rem', color: 'var(--text-secondary)' }}>
                    Want to buy? <Link to="/login" style={{ fontWeight: 600, color: 'var(--accent)' }}>Sign in as customer</Link> to add items to your cart and checkout.
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
