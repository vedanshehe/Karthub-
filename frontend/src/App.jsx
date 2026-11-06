import { BrowserRouter, Routes, Route, Link, Navigate } from 'react-router-dom';
import { useState } from 'react';
import { auth } from './api.js';
import { Login, Register } from './pages/Auth.jsx';
import { Shop, Product } from './pages/Shop.jsx';
import { Cart } from './pages/Cart.jsx';
import { Orders, OrderDetail } from './pages/Orders.jsx';
import { Seller } from './pages/Seller.jsx';
import { Admin } from './pages/Admin.jsx';

export default function App() {
  const [user, setUser] = useState(auth.get());
  const logout = () => { auth.clear(); setUser(null); };
  const need = (role, el) => !user ? <Navigate to="/login" /> : user.role !== role ? <p className="err">Not allowed for your role</p> : el;
  return (
    <BrowserRouter>
      <nav>
        <Link to="/">KartHub</Link>
        {(!user || user.role === 'customer') && <><Link to="/cart">Cart</Link><Link to="/orders">My orders</Link></>}
        {user?.role === 'seller' && <Link to="/seller">Seller dashboard</Link>}
        {user?.role === 'admin' && <Link to="/admin">Admin</Link>}
        <span className="sp" />
        {user ? <><span>{user.full_name} ({user.role})</span><button onClick={logout}>Logout</button></>
              : <><Link to="/login">Login</Link><Link to="/register">Register</Link></>}
      </nav>
      <main><Routes>
        <Route path="/" element={<Shop />} />
        <Route path="/product/:id" element={<Product user={user} />} />
        <Route path="/login" element={<Login onAuth={setUser} />} />
        <Route path="/register" element={<Register onAuth={setUser} />} />
        <Route path="/cart" element={need('customer', <Cart />)} />
        <Route path="/orders" element={need('customer', <Orders />)} />
        <Route path="/orders/:id" element={need('customer', <OrderDetail />)} />
        <Route path="/seller" element={need('seller', <Seller />)} />
        <Route path="/admin" element={need('admin', <Admin />)} />
      </Routes></main>
    </BrowserRouter>
  );
}
