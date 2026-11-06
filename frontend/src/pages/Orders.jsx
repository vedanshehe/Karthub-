import { Link, useParams } from 'react-router-dom';
import { api } from '../api.js';
import { useLoad, useAct, Msg, Table } from '../ui.jsx';

export function Orders() {
  const { data, err } = useLoad('/orders');
  return (<><h2>My orders</h2><p className="err">{err}</p>
    <Table rows={data} render={r => <Link to={`/orders/${r.order_id}`}>Details</Link>} /></>);
}

export function OrderDetail() {
  const { id } = useParams(); const { data, err, reload } = useLoad('/orders/' + id); const [msg, run] = useAct();
  const cancel = it => run(() => api(`/orders/${id}/items/${it.item_no}/cancel`, { method: 'POST' }), 'Item cancelled; stock restored').then(reload);
  const review = it => {
    const rating = prompt('Rating 1-5'); if (!rating) return; const comment = prompt('Comment (optional)');
    run(() => api('/reviews', { method: 'POST', body: { order_id: +id, item_no: it.item_no, rating: +rating, comment } }), 'Review saved').then(reload);
  };
  const { items, ...o } = data || {};
  return (<><Link to="/orders">&larr; All orders</Link><h2>Order #{id}</h2><p className="err">{err}</p><Msg m={msg} />
    {data && <><Table rows={[o]} /><h3>Items</h3>
      <Table rows={items} render={it => <>
        {it.item_status === 'PENDING' && <button onClick={() => cancel(it)}>Cancel item</button>}
        {it.item_status === 'DELIVERED' && !it.reviewed && <button onClick={() => review(it)}>Write review</button>}</>} /></>}</>);
}
