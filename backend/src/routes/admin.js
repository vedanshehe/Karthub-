import { Router } from 'express';
import { query } from '../db.js';
import { requireAuth, requireRole } from '../auth.js';
import { HttpError, wrap } from '../errors.js';

const r = Router();
r.use(requireAuth, requireRole('admin'));

// GET /api/admin/sellers?verified=true|false
r.get('/sellers', wrap(async (req, res) => {
  const v = req.query.verified === undefined ? null : req.query.verified === 'true';
  const { rows } = await query(`
    SELECT s.seller_id, s.store_name, s.gst_no, s.is_verified, s.joined_on, u.email
    FROM seller s JOIN app_user u ON u.user_id = s.seller_id
    WHERE ($1::boolean IS NULL OR s.is_verified = $1) ORDER BY s.joined_on DESC, s.seller_id`, [v]);
  res.json(rows);
}));

// PUT /api/admin/sellers/:id/verify { is_verified? = true }
r.put('/sellers/:id/verify', wrap(async (req, res) => {
  const { rows } = await query(
    'UPDATE seller SET is_verified=$2 WHERE seller_id=$1 RETURNING seller_id, store_name, is_verified',
    [req.params.id, req.body.is_verified ?? true]);
  if (!rows.length) throw new HttpError(404, 'Seller not found');
  res.json(rows[0]);
}));

// GET /api/admin/coupons  (with how many times each has been used)
r.get('/coupons', wrap(async (_req, res) => {
  const { rows } = await query(`
    SELECT c.*, (SELECT COUNT(*) FROM orders o WHERE o.coupon_code = c.code AND o.status <> 'CANCELLED') AS used
    FROM coupon c ORDER BY c.valid_to DESC`);
  res.json(rows);
}));

// POST /api/admin/coupons { code, discount_pct, min_order_value?, valid_from, valid_to, max_uses }
r.post('/coupons', wrap(async (req, res) => {
  const { code, discount_pct, min_order_value, valid_from, valid_to, max_uses } = req.body;
  if (!code || discount_pct == null || !valid_from || !valid_to || !max_uses)
    throw new HttpError(400, 'code, discount_pct, valid_from, valid_to and max_uses are required');
  const { rows } = await query(`
    INSERT INTO coupon(code, discount_pct, min_order_value, valid_from, valid_to, max_uses)
    VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
    [code, discount_pct, min_order_value ?? 0, valid_from, valid_to, max_uses]);
  res.status(201).json(rows[0]);
}));

export default r;
