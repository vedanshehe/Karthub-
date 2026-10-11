import { Router } from 'express';
import { query } from '../db.js';

const r = Router();

// GET /api/categories  -> flat list with depth and subtree product counts (recursive CTE)
r.get('/categories', async (_req, res, next) => {
  try {
    const { rows } = await query(`
      WITH RECURSIVE tree AS (
        SELECT category_id, name, parent_id, category_id AS root, 0 AS depth FROM category
        UNION ALL
        SELECT c.category_id, c.name, c.parent_id, t.root, t.depth + 1
        FROM category c JOIN tree t ON c.parent_id = t.category_id
      )
      SELECT c.category_id, c.name, c.parent_id,
             COUNT(DISTINCT p.product_id) AS products_in_subtree
      FROM category c
      JOIN tree t ON t.root = c.category_id
      LEFT JOIN product p ON p.category_id = t.category_id
      GROUP BY c.category_id ORDER BY c.category_id`);
    res.json(rows);
  } catch (e) { next(e); }
});

// GET /api/products?q=&category=&min=&max=&sort=price|rating&page=
// One row per product with the cheapest active in-stock offer, offer count and average rating.
r.get('/products', async (req, res, next) => {
  try {
    const { q, category, min, max, sort } = req.query;
    const page = Math.max(parseInt(req.query.page) || 1, 1), size = 20;
    const params = [q || null, category ? +category : null, min ? +min : null, max ? +max : null, size, (page - 1) * size];
    const order = sort === 'rating' ? 'avg_rating DESC NULLS LAST' : sort === 'price' ? 'best_price ASC' : 'p.product_id';
    const { rows } = await query(`
      WITH RECURSIVE sub AS (
        SELECT category_id FROM category WHERE category_id = $2
        UNION ALL
        SELECT c.category_id FROM category c JOIN sub s ON c.parent_id = s.category_id
      ),
      offers AS (
        SELECT product_id, MIN(price) AS best_price, COUNT(*) AS offers
        FROM listing WHERE is_active AND stock_qty > 0 GROUP BY product_id
      ),
      ratings AS (
        SELECT l.product_id, ROUND(AVG(rv.rating),2) AS avg_rating, COUNT(*) AS reviews
        FROM review rv
        JOIN order_item oi ON (oi.order_id, oi.item_no) = (rv.order_id, rv.item_no)
        JOIN listing l ON l.listing_id = oi.listing_id GROUP BY l.product_id
      )
      SELECT p.product_id, p.name, p.brand, c.name AS category,
             o.best_price, o.offers, r.avg_rating, COALESCE(r.reviews,0) AS reviews
      FROM product p
      JOIN category c ON c.category_id = p.category_id
      JOIN offers o ON o.product_id = p.product_id
      LEFT JOIN ratings r ON r.product_id = p.product_id
      WHERE ($1::text IS NULL OR to_tsvector('english', p.name || ' ' || coalesce(p.brand,'')) @@ plainto_tsquery('english', $1))
        AND ($2::int  IS NULL OR p.category_id IN (SELECT category_id FROM sub))
        AND ($3::numeric IS NULL OR o.best_price >= $3)
        AND ($4::numeric IS NULL OR o.best_price <= $4)
      ORDER BY ${order} LIMIT $5 OFFSET $6`, params);
    res.json({ page, results: rows });
  } catch (e) { next(e); }
});

// GET /api/products/:id/offers -> price comparison across sellers
r.get('/products/:id/offers', async (req, res, next) => {
  try {
    const { rows } = await query(`
      SELECT l.listing_id, l.price, l.stock_qty, s.seller_id, s.store_name, s.is_verified,
             (SELECT ROUND(AVG(rv.rating),2) FROM review rv
                JOIN order_item oi ON (oi.order_id, oi.item_no) = (rv.order_id, rv.item_no)
                JOIN listing l2 ON l2.listing_id = oi.listing_id
               WHERE l2.seller_id = s.seller_id) AS seller_rating
      FROM listing l JOIN seller s ON s.seller_id = l.seller_id
      WHERE l.product_id = $1 AND l.is_active
      ORDER BY l.price`, [req.params.id]);
    res.json(rows);
  } catch (e) { next(e); }
});

export default r;
