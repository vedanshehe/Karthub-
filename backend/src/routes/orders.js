import { Router } from 'express';
import { query, withTx } from '../db.js';
import { requireAuth } from '../auth.js';

const r = Router();
r.use(requireAuth);

class HttpError extends Error { constructor(status, msg) { super(msg); this.status = status; } }

// POST /api/orders/checkout { address_id, payment_method, coupon_code? }
// Workflow W1: one transaction across listing, orders, order_item, payment, cart_item.
r.post('/checkout', async (req, res, next) => {
  try {
    const { address_id, payment_method, coupon_code } = req.body;
    const out = await withTx(async c => {
      const addr = await c.query('SELECT 1 FROM address WHERE address_id=$1 AND user_id=$2', [address_id, req.user.id]);
      if (!addr.rowCount) throw new HttpError(400, 'Choose one of your own addresses');

      // lock the rows we are about to decrement so concurrent checkouts cannot oversell
      const cart = (await c.query(`
        SELECT ci.listing_id, ci.quantity, l.price, l.stock_qty, l.is_active, p.name
        FROM cart_item ci JOIN listing l ON l.listing_id = ci.listing_id
        JOIN product p ON p.product_id = l.product_id
        WHERE ci.user_id=$1 ORDER BY ci.listing_id FOR UPDATE OF l`, [req.user.id])).rows;
      if (!cart.length) throw new HttpError(400, 'Cart is empty');
      for (const it of cart) {
        if (!it.is_active) throw new HttpError(409, `"${it.name}" is no longer available`);
        if (it.stock_qty < it.quantity)
          throw new HttpError(409, `Only ${it.stock_qty} left of "${it.name}"`);
      }
      const subtotal = cart.reduce((a, it) => a + Number(it.price) * it.quantity, 0);

      let discountPct = 0;
      if (coupon_code) {
        const cp = (await c.query(`
          SELECT discount_pct FROM coupon
          WHERE code=$1 AND CURRENT_DATE BETWEEN valid_from AND valid_to AND min_order_value <= $2
            AND max_uses > (SELECT COUNT(*) FROM orders WHERE coupon_code=$1 AND status <> 'CANCELLED')`,
          [coupon_code, subtotal])).rows[0];
        if (!cp) throw new HttpError(400, 'Coupon is invalid, expired, exhausted or order value too low');
        discountPct = Number(cp.discount_pct);
      }

      const { order_id } = (await c.query(
        'INSERT INTO orders(user_id,address_id,coupon_code) VALUES ($1,$2,$3) RETURNING order_id',
        [req.user.id, address_id, coupon_code || null])).rows[0];

      let n = 0;
      for (const it of cart) {
        await c.query(
          'INSERT INTO order_item(order_id,item_no,listing_id,quantity,unit_price) VALUES ($1,$2,$3,$4,$5)',
          [order_id, ++n, it.listing_id, it.quantity, it.price]);       // price snapshot
        await c.query('UPDATE listing SET stock_qty = stock_qty - $1 WHERE listing_id=$2', [it.quantity, it.listing_id]);
      }
      const payable = +(subtotal * (1 - discountPct / 100)).toFixed(2);
      await c.query('INSERT INTO payment(order_id,method,amount) VALUES ($1,$2,$3)', [order_id, payment_method, payable]);
      await c.query('DELETE FROM cart_item WHERE user_id=$1', [req.user.id]);
      return { order_id, items: n, subtotal, discount_pct: discountPct, payable };
    });
    res.status(201).json(out);
  } catch (e) { next(e); }
});

// GET /api/orders -> my order history (uses idx_orders_user_time + v_order_total)
r.get('/', async (req, res, next) => {
  try {
    const { rows } = await query(`
      SELECT o.order_id, o.placed_at, o.status, t.payable, pay.status AS payment_status
      FROM orders o JOIN v_order_total t USING (order_id)
      LEFT JOIN payment pay USING (order_id)
      WHERE o.user_id=$1 ORDER BY o.placed_at DESC`, [req.user.id]);
    res.json(rows);
  } catch (e) { next(e); }
});

export default r;
