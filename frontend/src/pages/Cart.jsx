import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { useLoad, useAct, Msg, Table } from '../ui.jsx';

export function Cart() {
  const nav = useNavigate(); const cart = useLoad('/cart'); const addrs = useLoad('/addresses'); const [msg, run] = useAct();
  const [co, setCo] = useState({ address_id: '', payment_method: 'UPI', coupon_code: '' });
  const [a, setA] = useState({ line1: '', city: '', state: '', pincode: '' });
  const addrId = co.address_id || addrs.data?.find(x => x.is_default)?.address_id || addrs.data?.[0]?.address_id || '';
  const put = (r, q) => run(() => api('/cart', { method: 'PUT', body: { listing_id: r.listing_id, quantity: q } })).then(cart.reload);
  const del = r => run(() => api('/cart/' + r.listing_id, { method: 'DELETE' })).then(cart.reload);
  const addAddr = () => run(() => api('/addresses', { method: 'POST', body: a }), 'Address saved').then(() => { addrs.reload(); setA({ line1: '', city: '', state: '', pincode: '' }); });
  const checkout = () => run(async () => {
    const r = await api('/orders/checkout', { method: 'POST', body: { address_id: +addrId, payment_method: co.payment_method, coupon_code: co.coupon_code || undefined } });
    nav('/orders/' + r.order_id);
  }, 'Order placed');
  return (<><h2>Your cart</h2><p className="err">{cart.err}</p>
    <Table rows={cart.data?.items} render={r => <>
      <button onClick={() => put(r, r.quantity + 1)}>+</button><button onClick={() => r.quantity > 1 && put(r, r.quantity - 1)}>-</button><button onClick={() => del(r)}>Remove</button></>} />
    {cart.data?.items.length > 0 && <>
      <p><b>Subtotal: {cart.data.subtotal}</b></p>
      <h3>Checkout</h3>
      <div className="row">
        <select value={addrId} onChange={e => setCo({ ...co, address_id: e.target.value })}>
          {!addrs.data?.length && <option value="">Add an address first</option>}
          {addrs.data?.map(x => <option key={x.address_id} value={x.address_id}>{x.line1}, {x.city} {x.pincode}{x.is_default ? ' (default)' : ''}</option>)}</select>
        <select value={co.payment_method} onChange={e => setCo({ ...co, payment_method: e.target.value })}>
          {['UPI', 'CARD', 'NETBANKING', 'COD'].map(m => <option key={m}>{m}</option>)}</select>
        <input placeholder="Coupon code (optional)" value={co.coupon_code} onChange={e => setCo({ ...co, coupon_code: e.target.value })} />
        <button onClick={checkout} disabled={!addrId}>Place order</button></div></>}
    <Msg m={msg} />
    <h3>Add an address</h3>
    <div className="row">{[['line1', 'Address line'], ['city', 'City'], ['state', 'State'], ['pincode', 'Pincode (6 digits)']].map(([k, p]) =>
      <input key={k} placeholder={p} value={a[k]} onChange={e => setA({ ...a, [k]: e.target.value })} />)}
      <button onClick={addAddr}>Save address</button></div></>);
}
