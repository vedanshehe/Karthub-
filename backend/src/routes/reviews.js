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
  const numOrderId = Number(order_id);
  const numItemNo = Number(item_no);
  const numRating = Number(rating);

  if (!Number.isInteger(numOrderId) || !Number.isInteger(numItemNo)) {
    throw new HttpError(400, 'order_id and item_no must be integers');
  }
  if (!Number.isInteger(numRating) || numRating < 1 || numRating > 5) {
    throw new HttpError(400, 'rating must be a whole number from 1 to 5');
  }
  if (comment != null && typeof comment !== 'string') {
    throw new HttpError(400, 'comment must be a string');
  }

  const { rows } = await query(`
    INSERT INTO review(order_id, item_no, rating, comment)
    SELECT oi.order_id, oi.item_no, $3, $4
    FROM order_item oi JOIN orders o ON o.order_id = oi.order_id
    WHERE oi.order_id=$1 AND oi.item_no=$2 AND o.user_id=$5
    RETURNING review_id, order_id, item_no, rating, comment, created_at`,
    [numOrderId, numItemNo, numRating, comment?.trim() || null, req.user.id]);
  if (!rows.length) throw new HttpError(404, 'Order item not found');
  res.status(201).json(rows[0]);
}));

// DELETE /api/reviews/:id  (customer deletes their own review)
r.delete('/:id', wrap(async (req, res) => {
  const reviewId = Number(req.params.id);
  if (!Number.isInteger(reviewId)) throw new HttpError(400, 'review_id must be an integer');

  const { rowCount } = await query(`
    DELETE FROM review r
    USING orders o, order_item oi
    WHERE r.review_id = $1
      AND (r.order_id, r.item_no) = (oi.order_id, oi.item_no)
      AND oi.order_id = o.order_id
      AND o.user_id = $2`, [reviewId, req.user.id]);

  if (!rowCount) throw new HttpError(404, 'Review not found');
  res.status(204).end();
}));

export default r;
