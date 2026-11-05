import { Router } from 'express';
import { query, withTx } from '../db.js';
import { requireAuth } from '../auth.js';
import { HttpError, wrap } from '../errors.js';

const r = Router();
r.use(requireAuth);

const METHODS = ['UPI', 'CARD', 'NETBANKING', 'COD'];

// POST /api/orders/checkout { address_id, payment_method, coupon_code? }
// Workflow W1: one transaction across coupon, listing, orders, order_item, payment, cart_item.
r.post('/checkout', wrap(async (req, res) => {
  const { payment_method, coupon_code } = req.body;
  const addressId = Number(req.body.address_id);
  if (!Number.isInteger(addressId)) throw new HttpError(400, 'address_id is required');
  if (!METHODS.includes(payment_method)) throw new HttpError(400, `payment_method must be one of ${METHODS.join(', ')}`);

  const out = await withTx(async c => {
    const addr = await c.query('SELECT 1 FROM address WHERE address_id=$1 AND user_id=$2', [addressId, req.user.id]);
    if (!addr.rowCount) throw new HttpError(400, 'Choose one of your own addresses');

    // lock the listing rows we are about to decrement (ordered -> no deadlock between two checkouts)
    const cart = (await c.query(`
      SELECT ci.listing_id, ci.quantity, l.price, l.stock_qty, l.is_active, p.name
      FROM cart_item ci JOIN listing l ON l.listing_id = ci.listing_id
      JOIN product p ON p.product_id = l.product_id
      WHERE ci.user_id=$1 ORDER BY ci.listing_id FOR UPDATE OF l`, [req.user.id])).rows;
    if (!cart.length) throw new HttpError(400, 'Cart is empty');
    for (const it of cart) {
      if (!it.is_active) throw new HttpError(409, `"${it.name}" is no longer available`);
      if (it.stock_qty < it.quantity) throw new HttpError(409, `Only ${it.stock_qty} left of "${it.name}"`);
    }
    const subtotal = cart.reduce((a, it) => a + Number(it.price) * it.quantity, 0);

    // coupon row is locked, so two checkouts cannot both take the last allowed use
    let code = null;
    if (coupon_code) {
      const cp = (await c.query(`
        SELECT min_order_value, max_uses,
               (CURRENT_DATE BETWEEN valid_from AND valid_to) AS in_window,
               (SELECT COUNT(*) FROM orders WHERE coupon_code=$1 AND status <> 'CANCELLED') AS used
        FROM coupon WHERE code=$1 FOR UPDATE`, [coupon_code])).rows[0];
      if (!cp) throw new HttpError(400, 'Unknown coupon code');
      if (!cp.in_window) throw new HttpError(400, 'Coupon has expired or is not active yet');
      if (subtotal < Number(cp.min_order_value)) throw new HttpError(400, `Order must be at least ${cp.min_order_value} to use this coupon`);
      if (Number(cp.used) >= cp.max_uses) throw new HttpError(400, 'Coupon usage limit reached');
      code = coupon_code;
    }

    const { order_id } = (await c.query(
      'INSERT INTO orders(user_id,address_id,coupon_code) VALUES ($1,$2,$3) RETURNING order_id',
      [req.user.id, addressId, code])).rows[0];

    let n = 0;
    for (const it of cart) {
      await c.query(
        'INSERT INTO order_item(order_id,item_no,listing_id,quantity,unit_price) VALUES ($1,$2,$3,$4,$5)',
        [order_id, ++n, it.listing_id, it.quantity, it.price]);          // price snapshot
      // CHECK (stock_qty >= 0) is the last line of defence against overselling
      await c.query('UPDATE listing SET stock_qty = stock_qty - $1 WHERE listing_id=$2', [it.quantity, it.listing_id]);
    }

    // payable comes from the view, so payment.amount always equals the order total
    const t = (await c.query('SELECT gross, payable FROM v_order_total WHERE order_id=$1', [order_id])).rows[0];
    const paid = payment_method !== 'COD';                               // mock gateway: COD pending, others succeed
    await c.query('INSERT INTO payment(order_id,method,amount,status,paid_at) VALUES ($1,$2,$3,$4,$5)',
      [order_id, payment_method, t.payable, paid ? 'SUCCESS' : 'PENDING', paid ? new Date() : null]);
    if (paid) await c.query("UPDATE orders SET status='PAID' WHERE order_id=$1", [order_id]);
    await c.query('DELETE FROM cart_item WHERE user_id=$1', [req.user.id]);
    return { order_id, items: n, gross: Number(t.gross), payable: Number(t.payable), payment_status: paid ? 'SUCCESS' : 'PENDING' };
  });
  res.status(201).json(out);
}));

// GET /api/orders -> my order history (idx_orders_user_time + v_order_total)
r.get('/', wrap(async (req, res) => {
  const { rows } = await query(`
    SELECT o.order_id, o.placed_at, o.status, t.payable, pay.status AS payment_status
    FROM orders o JOIN v_order_total t USING (order_id)
    LEFT JOIN payment pay USING (order_id)
    WHERE o.user_id=$1 ORDER BY o.placed_at DESC`, [req.user.id]);
  res.json(rows);
}));

// GET /api/orders/:id -> one order with its lines (drives the cancel / review buttons in the UI)
r.get('/:id', wrap(async (req, res) => {
  const o = (await query(`
    SELECT o.order_id, o.placed_at, o.status, o.coupon_code, t.gross, t.payable,
           pay.method, pay.status AS payment_status
    FROM orders o JOIN v_order_total t USING (order_id)
    LEFT JOIN payment pay USING (order_id)
    WHERE o.order_id=$1 AND o.user_id=$2`, [req.params.id, req.user.id])).rows[0];
  if (!o) throw new HttpError(404, 'Order not found');
  const items = (await query(`
    SELECT oi.item_no, p.name, s.store_name, oi.quantity, oi.unit_price, oi.item_status,
           (rv.review_id IS NOT NULL) AS reviewed
    FROM order_item oi
    JOIN listing l ON l.listing_id = oi.listing_id
    JOIN product p ON p.product_id = l.product_id
    JOIN seller s  ON s.seller_id = l.seller_id
    LEFT JOIN review rv ON (rv.order_id, rv.item_no) = (oi.order_id, oi.item_no)
    WHERE oi.order_id=$1 ORDER BY oi.item_no`, [req.params.id])).rows;
  res.json({ ...o, items });
}));

// POST /api/orders/:id/items/:n/cancel
// Only PENDING items. The status UPDATE fires trg_restore_stock, which returns the stock exactly once.
r.post('/:id/items/:n/cancel', wrap(async (req, res) => {
  const out = await withTx(async c => {
    // lock + ownership check; also serialises concurrent cancels / seller updates on the same order
    const own = await c.query('SELECT 1 FROM orders WHERE order_id=$1 AND user_id=$2 FOR UPDATE', [req.params.id, req.user.id]);
    if (!own.rowCount) throw new HttpError(404, 'Order not found');

    const upd = await c.query(`
      UPDATE order_item SET item_status='CANCELLED'
      WHERE order_id=$1 AND item_no=$2 AND item_status='PENDING' RETURNING item_no`, [req.params.id, req.params.n]);
    if (!upd.rowCount) {
      const cur = await c.query('SELECT item_status FROM order_item WHERE order_id=$1 AND item_no=$2', [req.params.id, req.params.n]);
      if (!cur.rowCount) throw new HttpError(404, 'Order item not found');
      throw new HttpError(409, `Item is already ${cur.rows[0].item_status}; only PENDING items can be cancelled`);
    }

    // whole order cancelled when no live items remain
    const live = (await c.query(
      "SELECT COUNT(*) AS n FROM order_item WHERE order_id=$1 AND item_status NOT IN ('CANCELLED','RETURNED')",
      [req.params.id])).rows[0].n;
    let orderCancelled = false;
    if (Number(live) === 0) {
      await c.query("UPDATE orders SET status='CANCELLED' WHERE order_id=$1", [req.params.id]);
      await c.query("UPDATE payment SET status='REFUNDED' WHERE order_id=$1 AND status='SUCCESS'", [req.params.id]);
      orderCancelled = true;
    }
    return { order_id: Number(req.params.id), item_no: Number(req.params.n), item_status: 'CANCELLED', order_cancelled: orderCancelled };
  });
  res.json(out);
}));

export default r;
