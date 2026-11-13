import { Router } from 'express';
import { query } from '../db.js';
import { requireAuth, requireRole } from '../auth.js';
import { HttpError, wrap } from '../errors.js';

const r = Router();
r.use(requireAuth, requireRole('admin'));

// GET /api/admin/summary -> high-level marketplace overview
r.get('/summary', wrap(async (_req, res) => {
  const [users, sellers, products, orders, revenue] = await Promise.all([
    query('SELECT COUNT(*) AS total_users FROM app_user'),
    query('SELECT COUNT(*) AS total_sellers, COUNT(*) FILTER (WHERE is_verified) AS verified_sellers FROM seller'),
    query('SELECT COUNT(*) AS total_products FROM product'),
    query('SELECT COUNT(*) AS total_orders, COUNT(*) FILTER (WHERE status = \'DELIVERED\') AS delivered_orders FROM orders'),
    query('SELECT COALESCE(SUM(amount), 0) AS total_revenue FROM payment WHERE status = \'SUCCESS\'')
  ]);
  res.json({
    total_users: Number(users.rows[0].total_users),
    total_sellers: Number(sellers.rows[0].total_sellers),
    verified_sellers: Number(sellers.rows[0].verified_sellers),
    total_products: Number(products.rows[0].total_products),
    total_orders: Number(orders.rows[0].total_orders),
    delivered_orders: Number(orders.rows[0].delivered_orders),
    total_revenue: Number(revenue.rows[0].total_revenue)
  });
}));

// GET /api/admin/sellers?verified=true|false
r.get('/sellers', wrap(async (req, res) => {
  if (req.query.verified !== undefined && !['true', 'false'].includes(req.query.verified)) {
    throw new HttpError(400, 'verified must be true or false');
  }
  const v = req.query.verified === undefined ? null : req.query.verified === 'true';
  const { rows } = await query(`
    SELECT s.seller_id, s.store_name, s.gst_no, s.is_verified, s.joined_on, u.email, u.full_name, u.phone,
           (SELECT COUNT(*) FROM listing l WHERE l.seller_id = s.seller_id) AS total_listings
    FROM seller s JOIN app_user u ON u.user_id = s.seller_id
    WHERE ($1::boolean IS NULL OR s.is_verified = $1)
    ORDER BY s.joined_on DESC, s.seller_id`, [v]);
  res.json(rows);
}));

// PUT /api/admin/sellers/:id/verify { is_verified? = true }
r.put('/sellers/:id/verify', wrap(async (req, res) => {
  if (req.body.is_verified !== undefined && typeof req.body.is_verified !== 'boolean') {
    throw new HttpError(400, 'is_verified must be true or false');
  }
  const isVerified = req.body.is_verified ?? true;
  const { rows } = await query(
    'UPDATE seller SET is_verified=$2 WHERE seller_id=$1 RETURNING seller_id, store_name, is_verified',
    [req.params.id, isVerified]);
  if (!rows.length) throw new HttpError(404, 'Seller not found');
  res.json(rows[0]);
}));

// GET /api/admin/coupons  (with active orders usage count)
r.get('/coupons', wrap(async (_req, res) => {
  const { rows } = await query(`
    SELECT c.*,
           (CURRENT_DATE BETWEEN c.valid_from AND c.valid_to) AS is_active_date,
           (SELECT COUNT(*) FROM orders o WHERE o.coupon_code = c.code AND o.status <> 'CANCELLED') AS used
    FROM coupon c ORDER BY c.valid_to DESC`);
  res.json(rows);
}));

// POST /api/admin/coupons { code, discount_pct, min_order_value?, valid_from, valid_to, max_uses }
r.post('/coupons', wrap(async (req, res) => {
  const { code, discount_pct, min_order_value, valid_from, valid_to, max_uses } = req.body;
  if (!code || discount_pct == null || !valid_from || !valid_to || !max_uses) {
    throw new HttpError(400, 'code, discount_pct, valid_from, valid_to and max_uses are required');
  }
  const cleanCode = String(code).trim().toUpperCase();
  if (cleanCode.length > 20) {
    throw new HttpError(400, 'Coupon code cannot exceed 20 characters');
  }
  const { rows } = await query(`
    INSERT INTO coupon(code, discount_pct, min_order_value, valid_from, valid_to, max_uses)
    VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
    [cleanCode, discount_pct, min_order_value ?? 0, valid_from, valid_to, max_uses]);
  res.status(201).json(rows[0]);
}));

// POST /api/admin/categories { name, parent_id? }
r.post('/categories', wrap(async (req, res) => {
  const { name, parent_id } = req.body;
  if (typeof name !== 'string' || !name.trim()) throw new HttpError(400, 'Category name is required');
  const parentId = parent_id ? Number(parent_id) : null;
  const { rows } = await query(
    'INSERT INTO category(name, parent_id) VALUES ($1, $2) RETURNING category_id, name, parent_id',
    [name.trim(), parentId]
  );
  res.status(201).json(rows[0]);
}));

// POST /api/admin/products { category_id, name, brand?, description? }
r.post('/products', wrap(async (req, res) => {
  const { category_id, name, brand, description } = req.body;
  if (!category_id || typeof name !== 'string' || !name.trim()) {
    throw new HttpError(400, 'category_id and product name are required');
  }
  if (brand != null && typeof brand !== 'string') throw new HttpError(400, 'brand must be a string');
  if (description != null && typeof description !== 'string') throw new HttpError(400, 'description must be a string');
  const { rows } = await query(
    `INSERT INTO product(category_id, name, brand, description)
     VALUES ($1, $2, $3, $4) RETURNING product_id, category_id, name, brand, description`,
    [Number(category_id), name.trim(), brand?.trim() || null, description?.trim() || null]
  );
  res.status(201).json(rows[0]);
}));

// GET /api/admin/products -> list products with category name and total listings
r.get('/products', wrap(async (_req, res) => {
  const { rows } = await query(`
    SELECT p.product_id, p.name, p.brand, p.description, c.name AS category_name, p.category_id,
           (SELECT COUNT(*) FROM listing l WHERE l.product_id = p.product_id) AS total_listings
    FROM product p
    JOIN category c ON c.category_id = p.category_id
    ORDER BY p.product_id DESC`);
  res.json(rows);
}));

// DELETE /api/admin/coupons/:code
r.delete('/coupons/:code', wrap(async (req, res) => {
  const code = req.params.code.trim().toUpperCase();
  const { rowCount } = await query('DELETE FROM coupon WHERE code = $1', [code]);
  if (!rowCount) throw new HttpError(404, 'Coupon not found');
  res.json({ ok: true, message: `Coupon ${code} deleted` });
}));

// DELETE /api/admin/categories/:id
r.delete('/categories/:id', wrap(async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) throw new HttpError(400, 'Invalid category id');
  const { rowCount } = await query('DELETE FROM category WHERE category_id = $1', [id]);
  if (!rowCount) throw new HttpError(404, 'Category not found');
  res.json({ ok: true, message: `Category #${id} deleted` });
}));

// DELETE /api/admin/products/:id
r.delete('/products/:id', wrap(async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) throw new HttpError(400, 'Invalid product id');
  const { rowCount } = await query('DELETE FROM product WHERE product_id = $1', [id]);
  if (!rowCount) throw new HttpError(404, 'Product not found');
  res.json({ ok: true, message: `Product #${id} deleted` });
}));

export default r;
