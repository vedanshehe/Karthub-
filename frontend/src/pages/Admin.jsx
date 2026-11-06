import { useState } from 'react';
import { api } from '../api.js';
import { useLoad, useAct, Msg, Table } from '../ui.jsx';

export function Admin() {
  const sellers = useLoad('/admin/sellers'); const coupons = useLoad('/admin/coupons'); const [msg, run] = useAct();
  const blank = { code: '', discount_pct: '', min_order_value: '', valid_from: '', valid_to: '', max_uses: '' };
  const [c, setC] = useState(blank);
  const verify = (s, v) => run(() => api(`/admin/sellers/${s.seller_id}/verify`, { method: 'PUT', body: { is_verified: v } }), 'Seller updated').then(sellers.reload);
  const create = () => run(() => api('/admin/coupons', { method: 'POST', body: Object.fromEntries(Object.entries(c).filter(([, v]) => v)) }), 'Coupon created').then(() => { coupons.reload(); setC(blank); });
  return (<><h2>Admin</h2><Msg m={msg} />
    <h3>Sellers</h3><p className="err">{sellers.err}</p>
    <Table rows={sellers.data} render={s => <button onClick={() => verify(s, !s.is_verified)}>{s.is_verified ? 'Unverify' : 'Verify'}</button>} />
    <h3>Coupons</h3><Table rows={coupons.data} />
    <h3>Create coupon</h3>
    <div className="row">{[['code', 'Code'], ['discount_pct', 'Discount % (1-90)'], ['min_order_value', 'Min order value'], ['valid_from', 'Valid from (YYYY-MM-DD)'], ['valid_to', 'Valid to (YYYY-MM-DD)'], ['max_uses', 'Max uses']].map(([k, p]) =>
      <input key={k} placeholder={p} value={c[k]} onChange={e => setC({ ...c, [k]: e.target.value })} />)}
      <button onClick={create}>Create</button></div></>);
}
