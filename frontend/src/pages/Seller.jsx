import { useState } from 'react';
import { api } from '../api.js';
import { useLoad, useAct, Msg, Table } from '../ui.jsx';

function Listings() {
  const { data, err, reload } = useLoad('/seller/listings'); const [msg, run] = useAct();
  const [q, setQ] = useState(''); const [cat, setCat] = useState(null);
  const put = (r, body) => run(() => api('/seller/listings/' + r.listing_id, { method: 'PUT', body })).then(reload);
  const find = () => api('/seller/catalogue?q=' + encodeURIComponent(q)).then(setCat).catch(e => run(() => { throw e; }));
  const create = p => {
    const price = prompt('Price?'); const stock = prompt('Stock quantity?'); if (!price) return;
    run(() => api('/seller/listings', { method: 'POST', body: { product_id: p.product_id, price: +price, stock_qty: +(stock || 0) } }), 'Listing created').then(reload);
  };
  return (<><h3>My listings</h3><p className="err">{err}</p><Msg m={msg} />
    <Table rows={data} render={r => <>
      <button onClick={() => { const v = prompt('New price', r.price); v && put(r, { price: +v }); }}>Price</button>
      <button onClick={() => { const v = prompt('New stock', r.stock_qty); v !== null && put(r, { stock_qty: +v }); }}>Stock</button>
      <button onClick={() => put(r, { is_active: !r.is_active })}>{r.is_active ? 'Hide' : 'Show'}</button></>} />
    <h3>List a catalogue product</h3>
    <input placeholder="Search catalogue" value={q} onChange={e => setQ(e.target.value)} /><button onClick={find}>Search</button>
    {cat && <Table rows={cat} render={p => <button onClick={() => create(p)}>List it</button>} />}</>);
}
function Orders() {
  const { data, err, reload } = useLoad('/seller/order-items'); const [msg, run] = useAct();
  const move = (r, status) => run(() => api(`/seller/order-items/${r.order_id}/${r.item_no}`, { method: 'PUT', body: { status } }), 'Updated').then(reload);
  return (<><h3>Order lines to fulfil</h3><p className="err">{err}</p><Msg m={msg} />
    <Table rows={data} render={r => r.item_status === 'PENDING' ? <button onClick={() => move(r, 'SHIPPED')}>Mark shipped</button>
      : r.item_status === 'SHIPPED' ? <button onClick={() => move(r, 'DELIVERED')}>Mark delivered</button> : ''} /></>);
}
function Dashboard() {
  const { data, err } = useLoad('/seller/dashboard');
  const names = { monthly_revenue: 'Monthly revenue', best_sellers: 'Best sellers', low_stock: 'Low stock (5 or fewer)', listing_ratings: 'Ratings per listing', category_rank: 'My rank among sellers in each category' };
  return (<><p className="err">{err}</p>{data && Object.keys(names).map(k => <div key={k}><h3>{names[k]}</h3><Table rows={data[k]} /></div>)}</>);
}
export function Seller() {
  const [tab, setTab] = useState('Listings'); const T = { Listings, Orders, Dashboard }[tab];
  return (<><h2>Seller dashboard</h2>
    <div className="tabs">{['Listings', 'Orders', 'Dashboard'].map(t => <button key={t} className={t === tab ? 'on' : ''} onClick={() => setTab(t)}>{t}</button>)}</div><T /></>);
}
