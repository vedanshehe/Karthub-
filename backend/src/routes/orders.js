import { Router } from 'express';
import { query } from '../db.js';
import { requireAuth, requireRole } from '../auth.js';
import { HttpError, wrap } from '../errors.js';

const r = Router();
r.use(requireAuth, requireRole('customer'));

const METHODS = ['UPI', 'CARD', 'NETBANKING', 'COD'];

// GET /api/orders/coupon/:code?subtotal=...  (coupon preview)
r.get('/coupon/:code', wrap(async (req, res) => {
  const code = req.params.code;
  const subtotal = req.query.subtotal == null ? 0 : Number(req.query.subtotal);
  if (!Number.isFinite(subtotal) || subtotal < 0) {
    throw new HttpError(400, 'subtotal must be a non-negative number');
  }
  const { rows } = await query(
    `SELECT code, discount_pct, min_order_value, valid_from, valid_to, max_uses,
            (CURRENT_DATE BETWEEN valid_from AND valid_to) AS in_window,
            (SELECT COUNT(*) FROM orders WHERE coupon_code=$1 AND status <> 'CANCELLED') AS used
     FROM coupon WHERE code=$1`, [code]
  );
  const cp = rows[0];
  if (!cp) throw new HttpError(404, 'Coupon code does not exist');
  if (!cp.in_window) throw new HttpError(400, 'Coupon is expired or not active yet');
  if (Number(cp.used) >= cp.max_uses) throw new HttpError(400, 'Coupon usage limit reached');
  if (subtotal > 0 && subtotal < Number(cp.min_order_value)) {
    throw new HttpError(400, `Order must be at least ₹${cp.min_order_value} to use this coupon`);
  }
  const discount = subtotal > 0 ? Number((subtotal * (Number(cp.discount_pct) / 100)).toFixed(2)) : 0;
  res.json({
    code: cp.code,
    discount_pct: Number(cp.discount_pct),
    min_order_value: Number(cp.min_order_value),
    discount_amount: discount,
    estimated_payable: Number(Math.max(0, subtotal - discount).toFixed(2))
  });
}));

// POST /api/orders/checkout { address_id, payment_method, coupon_code? }
// Workflow W1: delegates to stored procedure sp_place_order, which executes
// atomically across coupon, listing, orders, order_item, payment and cart_item.
r.post('/checkout', wrap(async (req, res) => {
  const { payment_method, coupon_code } = req.body;
  const addressId = Number(req.body.address_id);
  if (!Number.isInteger(addressId)) throw new HttpError(400, 'address_id is required');
  if (!METHODS.includes(payment_method)) throw new HttpError(400, `payment_method must be one of ${METHODS.join(', ')}`);

  try {
    const { rows } = await query(
      'SELECT * FROM sp_place_order($1, $2, $3, $4)',
      [req.user.id, addressId, payment_method, coupon_code || null]
    );
    const r0 = rows[0];
    res.status(201).json({
      order_id: r0.out_order_id,
      items: r0.out_items,
      gross: Number(r0.out_gross),
      payable: Number(r0.out_payable),
      payment_status: r0.out_payment_status
    });
  } catch (err) {
    const msg = err.message || '';
    if ((msg.includes('Only') && msg.includes('left of')) || msg.includes('is no longer available')) {
      throw new HttpError(409, msg);
    }
    if (msg.includes('Unknown coupon code') ||
        msg.includes('Coupon has expired') ||
        msg.includes('Order must be at least') ||
        msg.includes('Coupon usage limit reached') ||
        msg.includes('Invalid payment method') ||
        msg.includes('Choose one of your own addresses') ||
        msg.includes('Cart is empty')) {
      throw new HttpError(400, msg);
    }
    throw err;
  }
}));

// GET /api/orders -> user order history
r.get('/', wrap(async (req, res) => {
  const { rows } = await query(`
    SELECT o.order_id, o.placed_at, o.status,
           t.gross, t.payable, t.active_gross, t.active_payable,
           pay.method, pay.amount AS payment_amount, pay.status AS payment_status
    FROM orders o JOIN v_order_total t USING (order_id)
    LEFT JOIN payment pay USING (order_id)
    WHERE o.user_id=$1 ORDER BY o.placed_at DESC`, [req.user.id]);
  res.json(rows);
}));

// GET /api/orders/:id -> single order with items and full financial breakdown
r.get('/:id', wrap(async (req, res) => {
  const o = (await query(`
    SELECT o.order_id, o.placed_at, o.status, o.coupon_code,
           t.gross, t.payable, t.active_gross, t.active_payable, t.cancelled_gross,
           pay.method, pay.amount AS payment_amount, pay.status AS payment_status,
           a.line1, a.city, a.state, a.pincode
    FROM orders o JOIN v_order_total t USING (order_id)
    LEFT JOIN payment pay USING (order_id)
    LEFT JOIN address a ON a.address_id = o.address_id
    WHERE o.order_id=$1 AND o.user_id=$2`, [req.params.id, req.user.id])).rows[0];
  if (!o) throw new HttpError(404, 'Order not found');

  const items = (await query(`
    SELECT oi.item_no, p.product_id, p.name, p.brand, s.store_name, oi.quantity, oi.unit_price,
           (oi.quantity * oi.unit_price) AS line_total, oi.item_status,
           (rv.review_id IS NOT NULL) AS reviewed, rv.review_id, rv.rating AS review_rating, rv.comment AS review_comment
    FROM order_item oi
    JOIN listing l ON l.listing_id = oi.listing_id
    JOIN product p ON p.product_id = l.product_id
    JOIN seller s  ON s.seller_id = l.seller_id
    LEFT JOIN review rv ON (rv.order_id, rv.item_no) = (oi.order_id, oi.item_no)
    WHERE oi.order_id=$1 ORDER BY oi.item_no`, [req.params.id])).rows;
  res.json({ ...o, items });
}));

// POST /api/orders/:id/items/:n/cancel
// Invokes sp_cancel_item: atomic cancellation, trg_restore_stock trigger, and order/payment rollup.
r.post('/:id/items/:n/cancel', wrap(async (req, res) => {
  const orderId = Number(req.params.id);
  const itemNo = Number(req.params.n);
  if (!Number.isInteger(orderId) || !Number.isInteger(itemNo)) {
    throw new HttpError(400, 'order_id and item_no must be integers');
  }

  try {
    const { rows } = await query(
      'SELECT * FROM sp_cancel_item($1, $2, $3)',
      [req.user.id, orderId, itemNo]
    );
    const r0 = rows[0];
    res.json({
      order_id: orderId,
      item_no: itemNo,
      item_status: r0.out_item_status,
      order_cancelled: r0.out_order_cancelled
    });
  } catch (err) {
    const msg = err.message || '';
    if (msg.includes('Order not found')) {
      throw new HttpError(404, 'Order not found');
    }
    if (msg.includes('does not exist or is no longer PENDING')) {
      throw new HttpError(409, msg);
    }
    throw err;
  }
}));

export default r;
