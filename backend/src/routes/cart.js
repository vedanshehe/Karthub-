import { Router } from 'express';
import { query } from '../db.js';
import { requireAuth } from '../auth.js';

const r = Router();
r.use(requireAuth);

// GET /api/cart
r.get('/', async (req, res, next) => {
  try {
    const { rows } = await query(`
      SELECT ci.listing_id, p.name, s.store_name, l.price, ci.quantity,
             l.price * ci.quantity AS line_total, l.stock_qty
      FROM cart_item ci
      JOIN listing l ON l.listing_id = ci.listing_id
      JOIN product p ON p.product_id = l.product_id
      JOIN seller s  ON s.seller_id = l.seller_id
      WHERE ci.user_id = $1 ORDER BY ci.added_at`, [req.user.id]);
    const subtotal = rows.reduce((a, x) => a + Number(x.line_total), 0);
    res.json({ items: rows, subtotal });
  } catch (e) { next(e); }
});

// PUT /api/cart { listing_id, quantity }  -> add or set quantity (upsert on the composite PK)
r.put('/', async (req, res, next) => {
  try {
    const { listing_id, quantity } = req.body;
    const { rows } = await query(`
      INSERT INTO cart_item(user_id, listing_id, quantity) VALUES ($1,$2,$3)
      ON CONFLICT (user_id, listing_id) DO UPDATE SET quantity = EXCLUDED.quantity
      RETURNING listing_id, quantity`, [req.user.id, listing_id, quantity]);
    res.json(rows[0]);
  } catch (e) { next(e); }
});

// DELETE /api/cart/:listingId
r.delete('/:listingId', async (req, res, next) => {
  try {
    await query('DELETE FROM cart_item WHERE user_id=$1 AND listing_id=$2', [req.user.id, req.params.listingId]);
    res.status(204).end();
  } catch (e) { next(e); }
});

export default r;
