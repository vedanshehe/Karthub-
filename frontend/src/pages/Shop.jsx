import { useState, useEffect } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../api.js';
import { useLoad, useAct, Msg, Table } from '../ui.jsx';

export function Shop() {
  const cats = useLoad('/categories');
  const [f, setF] = useState({ q: '', category: '', min: '', max: '', sort: '' });
  const [res, setRes] = useState(null); const [err, setErr] = useState('');
  const search = () => { api('/products?' + new URLSearchParams(Object.entries(f).filter(([, v]) => v))).then(d => { setRes(d.results); setErr(''); }).catch(e => setErr(e.message)); };
  useEffect(search, []);
  const set = k => e => setF({ ...f, [k]: e.target.value });
  return (<><h2>Search products</h2>
    <div className="row">
      <input placeholder="Search (name or brand)" value={f.q} onChange={set('q')} />
      <select value={f.category} onChange={set('category')}><option value="">All categories</option>
        {cats.data?.map(c => <option key={c.category_id} value={c.category_id}>{c.parent_id ? '- ' : ''}{c.name} ({c.products_in_subtree})</option>)}</select>
      <input type="number" placeholder="Min price" value={f.min} onChange={set('min')} style={{ width: 100 }} />
      <input type="number" placeholder="Max price" value={f.max} onChange={set('max')} style={{ width: 100 }} />
      <select value={f.sort} onChange={set('sort')}><option value="">Sort: newest</option><option value="price">Price: low to high</option><option value="rating">Rating</option></select>
      <button onClick={search}>Search</button></div>
    <p className="err">{err}</p>
    {res && (res.length ? <Table rows={res} render={r => <Link to={`/product/${r.product_id}`} state={{ name: r.name }}>Compare offers</Link>} /> : <p>No products found.</p>)}</>);
}

export function Product({ user }) {
  const { id } = useParams(); const { data, err } = useLoad(`/products/${id}/offers`);
  const [qty, setQty] = useState(1); const [msg, run] = useAct();
  const add = r => run(() => api('/cart', { method: 'PUT', body: { listing_id: r.listing_id, quantity: +qty } }), 'Added to cart');
  return (<><Link to="/">&larr; Back to search</Link><h2>Seller offers for product #{id}</h2>
    <p className="err">{err}</p><Msg m={msg} />
    {user?.role === 'customer' && <label>Quantity <input type="number" min="1" value={qty} onChange={e => setQty(e.target.value)} style={{ width: 70 }} /></label>}
    {!user && <p>Please log in to buy.</p>}
    <Table rows={data} render={r => r.stock_qty === 0 ? 'Out of stock' : user?.role === 'customer' ? <button onClick={() => add(r)}>Add to cart</button> : ''} /></>);
}
