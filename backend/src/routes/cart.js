import { Router } from 'express';
import { query } from '../db.js';
import { requireAuth, requireRole } from '../auth.js';
import { HttpError, wrap } from '../errors.js';

const r = Router();
r.use(requireAuth, requireRole('customer'));

// GET /api/cart
r.get('/', wrap(async (req, res) => {
  const { rows } = await query(`
    SELECT ci.listing_id, p.product_id, p.name, p.brand, s.store_name, l.price, ci.quantity,
           (l.price * ci.quantity) AS line_total, l.stock_qty, l.is_active
    FROM cart_item ci
    JOIN listing l ON l.listing_id = ci.listing_id
    JOIN product p ON p.product_id = l.product_id
    JOIN seller s  ON s.seller_id = l.seller_id
    WHERE ci.user_id = $1 ORDER BY ci.added_at`, [req.user.id]);
  const subtotal = rows.reduce((a, x) => a + Number(x.line_total), 0);
  res.json({ items: rows, subtotal: Number(subtotal.toFixed(2)) });
}));

// PUT /api/cart { listing_id, quantity }  -> add or set quantity (upsert on composite PK)
r.put('/', wrap(async (req, res) => {
  if (typeof req.body.listing_id === 'boolean' || typeof req.body.quantity === 'boolean') {
    throw new HttpError(400, 'boolean values are not allowed for listing_id or quantity');
  }
  const listingId = Number(req.body.listing_id);
  const qty = Number(req.body.quantity);

  if (!Number.isInteger(listingId)) {
    throw new HttpError(400, 'listing_id is required and must be an integer');
  }
  if (!Number.isInteger(qty) || qty <= 0) {
    throw new HttpError(400, 'quantity must be a positive integer greater than zero');
  }

  const { rows } = await query(`
    INSERT INTO cart_item(user_id, listing_id, quantity) VALUES ($1, $2, $3)
    ON CONFLICT (user_id, listing_id) DO UPDATE SET quantity = EXCLUDED.quantity
    RETURNING listing_id, quantity`, [req.user.id, listingId, qty]);
  res.json(rows[0]);
}));

// DELETE /api/cart/:listingId
r.delete('/:listingId', wrap(async (req, res) => {
  const listingId = Number(req.params.listingId);
  await query('DELETE FROM cart_item WHERE user_id=$1 AND listing_id=$2', [req.user.id, listingId]);
  res.status(204).end();
}));

export default r;
