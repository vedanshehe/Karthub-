import { BrowserRouter, Routes, Route, Link, Navigate, useLocation } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { auth } from './api.js';
import { Login, Register } from './pages/Auth.jsx';
import { Shop, Product } from './pages/Shop.jsx';
import { Cart } from './pages/Cart.jsx';
import { Orders, OrderDetail } from './pages/Orders.jsx';
import { Addresses } from './pages/Addresses.jsx';
import { Seller } from './pages/Seller.jsx';
import { Admin } from './pages/Admin.jsx';

function Nav({ user, onLogout }) {
  const loc = useLocation();
  const isActive = path => loc.pathname === path ? 'active' : '';

  return (
    <header>
      <nav>
        <Link to="/" className="brand-logo">
          <span>KartHub</span>
          <span className="brand-dot" />
          <span className="brand-badge">Marketplace</span>
        </Link>

        <Link to="/" className={`nav-link ${isActive('/')}`}>
          Catalogue
        </Link>

        {(!user || user.role === 'customer') && (
          <>
            <Link to="/cart" className={`nav-link ${isActive('/cart')}`}>
              🛒 Cart
            </Link>
            <Link to="/orders" className={`nav-link ${isActive('/orders')}`}>
              Orders
            </Link>
            <Link to="/addresses" className={`nav-link ${isActive('/addresses')}`}>
              Addresses
            </Link>
          </>
        )}

        {user?.role === 'seller' && (
          <Link to="/seller" className={`nav-link ${isActive('/seller')}`}>
            Seller Hub
          </Link>
        )}

        {user?.role === 'admin' && (
          <Link to="/admin" className={`nav-link ${isActive('/admin')}`}>
            Admin Panel
          </Link>
        )}

        <span className="sp" />

        {user ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div className="user-pill">
              <div className="user-avatar">
                {user.full_name?.charAt(0).toUpperCase() || 'U'}
              </div>
              <span style={{ fontWeight: 600 }}>{user.full_name}</span>
              <span className={`badge ${user.role === 'admin' ? 'badge-danger' : user.role === 'seller' ? 'badge-info' : 'badge-neutral'}`} style={{ fontSize: '0.68rem', padding: '1px 6px' }}>
                {user.role}
              </span>
            </div>
            <button type="button" className="btn-logout" onClick={onLogout}>
              Logout
            </button>
          </div>
        ) : (
          <div style={{ display: 'flex', gap: 8 }}>
            <Link to="/login" className="btn btn-secondary btn-sm">
              Sign In
            </Link>
            <Link to="/register" className="btn btn-primary btn-sm">
              Register
            </Link>
          </div>
        )}
      </nav>
    </header>
  );
}

function Footer() {
  return (
    <footer className="site-footer">
      <div className="footer-inner">
        <div className="footer-top-grid">
          <div>
            <div className="footer-brand-title">
              <span>KartHub</span>
              <span className="brand-dot" />
            </div>
            <p className="footer-brand-desc">
              A thoughtfully curated multi-vendor marketplace connecting discerning buyers with verified independent merchants and artisans.
            </p>
          </div>

          <div>
            <div className="footer-col-title">Collections</div>
            <ul className="footer-links-list">
              <li><Link to="/" className="footer-link-item">Electronics & Tech</Link></li>
              <li><Link to="/" className="footer-link-item">Fashion & Apparel</Link></li>
              <li><Link to="/" className="footer-link-item">Home & Cookware</Link></li>
              <li><Link to="/" className="footer-link-item">Books & Literature</Link></li>
            </ul>
          </div>

          <div>
            <div className="footer-col-title">Marketplace</div>
            <ul className="footer-links-list">
              <li><Link to="/seller" className="footer-link-item">Seller Hub</Link></li>
              <li><Link to="/orders" className="footer-link-item">Track Orders</Link></li>
              <li><Link to="/addresses" className="footer-link-item">Saved Addresses</Link></li>
              <li><Link to="/admin" className="footer-link-item">Admin Governance</Link></li>
            </ul>
          </div>

          <div>
            <div className="footer-col-title">Standards</div>
            <p style={{ fontSize: '0.86rem', color: 'var(--text-muted)', lineHeight: 1.6, margin: 0 }}>
              Every product listing is backed by verified independent sellers, authentic reviews, and a 100% genuine catalogue guarantee.
            </p>
          </div>
        </div>

        <div className="footer-bottom-row">
          <div>© {new Date().getFullYear()} KartHub Marketplace. All rights reserved.</div>
          <div style={{ display: 'flex', gap: 16 }}>
            <span>Verified Independent Sellers</span>
            <span>•</span>
            <span>Multi-Vendor Shared Catalogue</span>
            <span>•</span>
            <span>Hodo Stays Aesthetic</span>
          </div>
        </div>
      </div>
    </footer>
  );
}

export default function App() {
  const [user, setUser] = useState(auth.get());

  useEffect(() => {
    const handleAuthChange = () => {
      setUser(auth.get());
    };
    window.addEventListener('kh_auth_change', handleAuthChange);
    return () => window.removeEventListener('kh_auth_change', handleAuthChange);
  }, []);

  const logout = () => {
    auth.clear();
    setUser(null);
  };

  const requireRole = (role, element) => {
    if (!user) return <Navigate to="/login" replace />;
    if (user.role !== role) {
      return (
        <div className="card" style={{ maxWidth: 500, margin: '40px auto' }}>
          <div className="alert alert-error">
            Access Restricted: This screen requires the <strong>{role}</strong> role.
          </div>
          <Link to="/" className="btn btn-primary" style={{ marginTop: 10 }}>
            Return to Marketplace
          </Link>
        </div>
      );
    }
    return element;
  };

  return (
    <BrowserRouter>
      <Nav user={user} onLogout={logout} />
      <main>
        <Routes>
          <Route path="/" element={<Shop />} />
          <Route path="/product/:id" element={<Product user={user} />} />
          <Route path="/login" element={<Login onAuth={setUser} />} />
          <Route path="/register" element={<Register onAuth={setUser} />} />
          <Route path="/cart" element={requireRole('customer', <Cart />)} />
          <Route path="/orders" element={requireRole('customer', <Orders />)} />
          <Route path="/orders/:id" element={requireRole('customer', <OrderDetail />)} />
          <Route path="/addresses" element={requireRole('customer', <Addresses />)} />
          <Route path="/seller" element={requireRole('seller', <Seller />)} />
          <Route path="/admin" element={requireRole('admin', <Admin />)} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
      <Footer />
    </BrowserRouter>
  );
}
