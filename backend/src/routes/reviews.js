import { Router } from 'express';
import { query } from '../db.js';
import { requireAuth, requireRole } from '../auth.js';
import { HttpError, wrap } from '../errors.js';

const r = Router();
r.use(requireAuth, requireRole('customer'));

// POST /api/reviews { order_id, item_no, rating, comment? }
// Ownership is checked here; "only delivered" (P0001 -> 422) and "only once" (UNIQUE -> 409) are enforced by the DB.
r.post('/', wrap(async (req, res) => {
  const { order_id, item_no, rating, comment } = req.body;
  if (!Number.isInteger(+rating) || rating < 1 || rating > 5) throw new HttpError(400, 'rating must be a whole number from 1 to 5');
  const { rows } = await query(`
    INSERT INTO review(order_id, item_no, rating, comment)
    SELECT oi.order_id, oi.item_no, $3, $4
    FROM order_item oi JOIN orders o ON o.order_id = oi.order_id
    WHERE oi.order_id=$1 AND oi.item_no=$2 AND o.user_id=$5
    RETURNING review_id, order_id, item_no, rating, comment, created_at`,
    [order_id, item_no, rating, comment || null, req.user.id]);
  if (!rows.length) throw new HttpError(404, 'Order item not found');
  res.status(201).json(rows[0]);
}));

export default r;
