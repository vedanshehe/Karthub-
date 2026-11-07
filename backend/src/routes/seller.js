import { Router } from 'express';
import { query, withTx } from '../db.js';
import { requireAuth, requireRole } from '../auth.js';
import { HttpError, wrap } from '../errors.js';

const r = Router();
r.use(requireAuth, requireRole('seller')); // seller_id always comes from the token, never the body

// GET /api/seller/listings
r.get('/listings', wrap(async (req, res) => {
  const { rows } = await query(`
    SELECT l.listing_id, l.product_id, p.name, p.brand, c.name AS category,
           l.price, l.stock_qty, l.is_active
    FROM listing l
    JOIN product p ON p.product_id = l.product_id
    JOIN category c ON c.category_id = p.category_id
    WHERE l.seller_id=$1 ORDER BY l.listing_id`, [req.user.id]);
  res.json(rows);
}));

// POST /api/seller/listings { product_id, price, stock_qty }
r.post('/listings', wrap(async (req, res) => {
  const { product_id, price, stock_qty } = req.body;
  if (!product_id || price == null) throw new HttpError(400, 'product_id and price are required');
  const numPrice = Number(price);
  const numStock = Number(stock_qty ?? 0);
  if (!Number.isFinite(numPrice) || numPrice <= 0) throw new HttpError(400, 'price must be a positive number');
  if (!Number.isInteger(numStock) || numStock < 0) throw new HttpError(400, 'stock_qty must be a non-negative integer');

  const { rows } = await query(`
    INSERT INTO listing(seller_id, product_id, price, stock_qty) VALUES ($1,$2,$3,$4)
    RETURNING listing_id, product_id, price, stock_qty, is_active`,
    [req.user.id, product_id, numPrice, numStock]);
  res.status(201).json(rows[0]);
}));

// PUT /api/seller/listings/:id { price?, stock_qty?, is_active? }
r.put('/listings/:id', wrap(async (req, res) => {
  const { price, stock_qty, is_active } = req.body;
  const numPrice = price != null ? Number(price) : null;
  const numStock = stock_qty != null ? Number(stock_qty) : null;
  if (numPrice != null && (!Number.isFinite(numPrice) || numPrice <= 0)) {
    throw new HttpError(400, 'price must be a positive number');
  }
  if (numStock != null && (!Number.isInteger(numStock) || numStock < 0)) {
    throw new HttpError(400, 'stock_qty must be a non-negative integer');
  }
  if (is_active != null && typeof is_active !== 'boolean') {
    throw new HttpError(400, 'is_active must be true or false');
  }

  const { rows } = await query(`
    UPDATE listing SET price = COALESCE($3, price),
                       stock_qty = COALESCE($4, stock_qty),
                       is_active = COALESCE($5, is_active)
    WHERE listing_id=$1 AND seller_id=$2
    RETURNING listing_id, product_id, price, stock_qty, is_active`,
    [req.params.id, req.user.id, numPrice, numStock, is_active ?? null]);
  if (!rows.length) throw new HttpError(404, 'Listing not found');
  res.json(rows[0]);
}));

// GET /api/seller/catalogue?q=  -> catalogue products a seller can create a listing for
r.get('/catalogue', wrap(async (req, res) => {
  const { rows } = await query(`
    SELECT p.product_id, p.name, p.brand, c.name AS category,
           EXISTS (SELECT 1 FROM listing l WHERE l.product_id = p.product_id AND l.seller_id = $2) AS already_listed
    FROM product p JOIN category c ON c.category_id = p.category_id
    WHERE ($1::text IS NULL OR p.name ILIKE '%' || $1 || '%' OR p.brand ILIKE '%' || $1 || '%')
    ORDER BY p.name LIMIT 50`, [req.query.q || null, req.user.id]);
  res.json(rows);
}));

// GET /api/seller/order-items?status=PENDING  -> order lines containing this seller's listings
r.get('/order-items', wrap(async (req, res) => {
  const { rows } = await query(`
    SELECT oi.order_id, oi.item_no, p.name, p.brand, oi.quantity, oi.unit_price,
           (oi.quantity * oi.unit_price) AS line_total, oi.item_status,
           o.placed_at, a.line1, a.city, a.state, a.pincode
    FROM order_item oi
    JOIN listing l ON l.listing_id = oi.listing_id
    JOIN product p ON p.product_id = l.product_id
    JOIN orders o  ON o.order_id = oi.order_id
    JOIN address a ON a.address_id = o.address_id
    WHERE l.seller_id=$1 AND ($2::text IS NULL OR oi.item_status = $2)
    ORDER BY o.placed_at DESC, oi.item_no`, [req.user.id, req.query.status || null]);
  res.json(rows);
}));

// PUT /api/seller/order-items/:order/:item { status: SHIPPED | DELIVERED }
// Allowed moves: PENDING -> SHIPPED -> DELIVERED. Order status is rolled up from its lines.
r.put('/order-items/:order/:item', wrap(async (req, res) => {
  const needs = { SHIPPED: 'PENDING', DELIVERED: 'SHIPPED' }[req.body.status];
  if (!needs) throw new HttpError(400, 'status must be SHIPPED or DELIVERED');

  const out = await withTx(async c => {
    await c.query('SELECT 1 FROM orders WHERE order_id=$1 FOR UPDATE', [req.params.order]);
    const upd = await c.query(`
      UPDATE order_item oi SET item_status=$3
      FROM listing l
      WHERE l.listing_id = oi.listing_id AND l.seller_id=$4
        AND oi.order_id=$1 AND oi.item_no=$2 AND oi.item_status=$5
      RETURNING oi.item_no`, [req.params.order, req.params.item, req.body.status, req.user.id, needs]);
    if (!upd.rowCount) {
      const cur = await c.query(`
        SELECT oi.item_status FROM order_item oi JOIN listing l ON l.listing_id = oi.listing_id
        WHERE oi.order_id=$1 AND oi.item_no=$2 AND l.seller_id=$3`, [req.params.order, req.params.item, req.user.id]);
      if (!cur.rowCount) throw new HttpError(404, 'Order item not found');
      throw new HttpError(409, `Item is ${cur.rows[0].item_status}; cannot move to ${req.body.status}`);
    }

    await c.query(`
      UPDATE orders o SET status = CASE
        WHEN NOT EXISTS (SELECT 1 FROM order_item WHERE order_id=o.order_id AND item_status IN ('PENDING','SHIPPED')) THEN 'DELIVERED'
        WHEN EXISTS (SELECT 1 FROM order_item WHERE order_id=o.order_id AND item_status IN ('SHIPPED','DELIVERED')) THEN 'SHIPPED'
        ELSE o.status END
      WHERE o.order_id=$1 AND o.status <> 'CANCELLED'`, [req.params.order]);

    // Cash on delivery is collected once everything has been delivered
    await c.query(`
      UPDATE payment SET status='SUCCESS', paid_at=now()
      WHERE order_id=$1 AND method='COD' AND status='PENDING'
        AND (SELECT status FROM orders WHERE order_id=$1) = 'DELIVERED'`, [req.params.order]);

    return { order_id: Number(req.params.order), item_no: Number(req.params.item), item_status: req.body.status };
  });
  res.json(out);
}));

// GET /api/seller/dashboard  (Analytics, KPI cards, monthly revenue, best sellers, low stock, category rank)
r.get('/dashboard', wrap(async (req, res) => {
  const id = req.user.id;
  const threshold = Number(req.query.low_stock) || 5;
  const live = "oi.item_status NOT IN ('CANCELLED','RETURNED')";

  const [monthly, best, low, ratings, rank, kpis] = await Promise.all([
    query(`SELECT date_trunc('month', o.placed_at)::date AS month,
                  SUM(oi.quantity*oi.unit_price) AS revenue, COUNT(*) AS items
           FROM order_item oi
           JOIN orders o ON o.order_id = oi.order_id
           JOIN listing l ON l.listing_id = oi.listing_id
           WHERE l.seller_id=$1 AND ${live}
           GROUP BY 1 ORDER BY 1 DESC`, [id]),
    query(`SELECT p.product_id, p.name, p.brand, SUM(oi.quantity) AS units_sold,
                  SUM(oi.quantity*oi.unit_price) AS revenue
           FROM order_item oi
           JOIN listing l ON l.listing_id = oi.listing_id
           JOIN product p ON p.product_id = l.product_id
           WHERE l.seller_id=$1 AND ${live}
           GROUP BY p.product_id, p.name, p.brand
           ORDER BY units_sold DESC LIMIT 5`, [id]),
    query(`SELECT l.listing_id, p.name, p.brand, l.price, l.stock_qty
           FROM listing l JOIN product p ON p.product_id = l.product_id
           WHERE l.seller_id=$1 AND l.is_active AND l.stock_qty <= $2
           ORDER BY l.stock_qty`, [id, threshold]),
    query(`SELECT l.listing_id, p.name, p.brand, l.price,
                  ROUND(AVG(rv.rating), 2) AS avg_rating, COUNT(rv.review_id) AS reviews
           FROM listing l JOIN product p ON p.product_id = l.product_id
           LEFT JOIN order_item oi ON oi.listing_id = l.listing_id
           LEFT JOIN review rv ON (rv.order_id, rv.item_no) = (oi.order_id, oi.item_no)
           WHERE l.seller_id=$1 GROUP BY l.listing_id, p.name, p.brand ORDER BY l.listing_id`, [id]),
    query(`SELECT category, revenue, rank, sellers_in_category FROM (
             SELECT x.seller_id, c.name AS category, x.revenue,
                    RANK() OVER (PARTITION BY x.category_id ORDER BY x.revenue DESC) AS rank,
                    COUNT(*) OVER (PARTITION BY x.category_id) AS sellers_in_category
             FROM (SELECT l.seller_id, p.category_id, SUM(oi.quantity*oi.unit_price) AS revenue
                   FROM order_item oi
                   JOIN listing l ON l.listing_id = oi.listing_id
                   JOIN product p ON p.product_id = l.product_id
                   WHERE ${live} GROUP BY l.seller_id, p.category_id) x
             JOIN category c ON c.category_id = x.category_id) ranked
           WHERE seller_id=$1 ORDER BY category`, [id]),
    query(`SELECT
             COALESCE(SUM(oi.quantity*oi.unit_price), 0) AS total_revenue,
             COALESCE(SUM(oi.quantity), 0) AS total_units_sold,
             (SELECT COUNT(*) FROM listing WHERE seller_id=$1 AND is_active) AS active_listings,
             (SELECT ROUND(AVG(rv.rating), 2) FROM review rv
              JOIN order_item oi2 ON (oi2.order_id, oi2.item_no) = (rv.order_id, rv.item_no)
              JOIN listing l2 ON l2.listing_id = oi2.listing_id WHERE l2.seller_id=$1) AS overall_rating
           FROM order_item oi
           JOIN listing l ON l.listing_id = oi.listing_id
           WHERE l.seller_id=$1 AND ${live}`, [id])
  ]);

  res.json({
    kpis: kpis.rows[0],
    monthly_revenue: monthly.rows,
    best_sellers: best.rows,
    low_stock: low.rows,
    listing_ratings: ratings.rows,
    category_rank: rank.rows
  });
}));

export default r;
