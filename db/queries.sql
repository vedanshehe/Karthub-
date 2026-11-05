-- KartHub: the six non-trivial SQL queries (Member 2, plan D2-D4).
-- Run:  psql -U postgres -d karthub -f db/queries.sql
-- Q1 and Q2 are the same queries the API uses (GET /products and GET /categories).
SET search_path = karthub;
\pset null '-'

-- ===== Q1  Search: cheapest in-stock offer, number of sellers, average rating
--      concepts: CTEs, JOINs, GROUP BY, aggregates, LEFT JOIN, full-text search (GIN index)
\echo '--- Q1: search "smartphone" ---'
WITH offers AS (
  SELECT product_id, MIN(price) AS best_price, COUNT(*) AS offers
  FROM listing WHERE is_active AND stock_qty > 0 GROUP BY product_id
), ratings AS (
  SELECT l.product_id, ROUND(AVG(rv.rating), 2) AS avg_rating, COUNT(*) AS reviews
  FROM review rv
  JOIN order_item oi ON (oi.order_id, oi.item_no) = (rv.order_id, rv.item_no)
  JOIN listing l ON l.listing_id = oi.listing_id
  GROUP BY l.product_id
)
SELECT p.product_id, p.name, p.brand, c.name AS category, o.best_price, o.offers, r.avg_rating, COALESCE(r.reviews, 0) AS reviews
FROM product p
JOIN category c ON c.category_id = p.category_id
JOIN offers o ON o.product_id = p.product_id
LEFT JOIN ratings r ON r.product_id = p.product_id
WHERE to_tsvector('english', p.name || ' ' || coalesce(p.brand, '')) @@ plainto_tsquery('english', 'smartphone')
ORDER BY o.best_price;

-- ===== Q2  Category tree with the product count of every subtree
--      concepts: recursive CTE, GROUP BY, COUNT(DISTINCT)
\echo '--- Q2: category tree with subtree product counts ---'
WITH RECURSIVE tree AS (
  SELECT category_id, category_id AS root, 0 AS depth FROM category
  UNION ALL
  SELECT c.category_id, t.root, t.depth + 1 FROM category c JOIN tree t ON c.parent_id = t.category_id
)
SELECT c.category_id, c.name, c.parent_id, COUNT(DISTINCT p.product_id) AS products_in_subtree
FROM category c
JOIN tree t ON t.root = c.category_id
LEFT JOIN product p ON p.category_id = t.category_id
GROUP BY c.category_id, c.name, c.parent_id
ORDER BY c.category_id;

-- ===== Q3  Monthly revenue per seller and the seller's rank inside each category that month
--      concepts: CTE, DATE_TRUNC, SUM, RANK() window function. Cancelled/returned lines are excluded.
\echo '--- Q3: monthly seller revenue and category rank (latest 3 months) ---'
WITH monthly AS (
  SELECT l.seller_id, p.category_id, date_trunc('month', o.placed_at)::date AS month,
         SUM(oi.quantity * oi.unit_price) AS revenue
  FROM order_item oi
  JOIN orders  o ON o.order_id   = oi.order_id
  JOIN listing l ON l.listing_id = oi.listing_id
  JOIN product p ON p.product_id = l.product_id
  WHERE oi.item_status NOT IN ('CANCELLED', 'RETURNED')
  GROUP BY l.seller_id, p.category_id, date_trunc('month', o.placed_at)
)
SELECT m.month, s.store_name, c.name AS category, m.revenue,
       RANK() OVER (PARTITION BY m.month, m.category_id ORDER BY m.revenue DESC) AS category_rank
FROM monthly m
JOIN seller   s ON s.seller_id   = m.seller_id
JOIN category c ON c.category_id = m.category_id
WHERE m.month >= date_trunc('month', CURRENT_DATE - INTERVAL '2 months')
ORDER BY m.month DESC, c.name, category_rank;

-- ===== Q4  Best-selling product in each category (by units sold; ties all shown)
--      concepts: CTE, RANK() window function, filtering on the window result
\echo '--- Q4: best-selling product per category ---'
WITH sold AS (
  SELECT p.category_id, p.product_id, p.name, SUM(oi.quantity) AS units
  FROM order_item oi
  JOIN listing l ON l.listing_id = oi.listing_id
  JOIN product p ON p.product_id = l.product_id
  WHERE oi.item_status NOT IN ('CANCELLED', 'RETURNED')
  GROUP BY p.category_id, p.product_id, p.name
), ranked AS (
  SELECT *, RANK() OVER (PARTITION BY category_id ORDER BY units DESC) AS rnk FROM sold
)
SELECT c.name AS category, r.name AS product, r.units
FROM ranked r JOIN category c ON c.category_id = r.category_id
WHERE r.rnk = 1
ORDER BY c.name;

-- ===== Q5  Listings priced above the average price of the same product
--      concepts: correlated subquery (executed per listing)
\echo '--- Q5: listings priced above the product average (top 15 by how far above) ---'
SELECT p.name AS product, s.store_name, l.price,
       (SELECT ROUND(AVG(l2.price), 2) FROM listing l2 WHERE l2.product_id = l.product_id AND l2.is_active) AS product_avg_price,
       ROUND(l.price - (SELECT AVG(l2.price) FROM listing l2 WHERE l2.product_id = l.product_id AND l2.is_active), 2) AS above_avg_by
FROM listing l
JOIN product p ON p.product_id = l.product_id
JOIN seller  s ON s.seller_id  = l.seller_id
WHERE l.is_active
  AND l.price > (SELECT AVG(l2.price) FROM listing l2 WHERE l2.product_id = l.product_id AND l2.is_active)
ORDER BY above_avg_by DESC
LIMIT 15;

-- ===== Q6a Customers who bought from at least three different sellers
--      concepts: multi-table JOIN, GROUP BY, HAVING COUNT(DISTINCT ...)
\echo '--- Q6a: customers who bought from 3+ different sellers ---'
SELECT u.user_id, u.full_name, COUNT(DISTINCT l.seller_id) AS sellers_bought_from, COUNT(DISTINCT o.order_id) AS orders
FROM app_user u
JOIN orders o      ON o.user_id    = u.user_id AND o.status <> 'CANCELLED'
JOIN order_item oi ON oi.order_id  = o.order_id
JOIN listing l     ON l.listing_id = oi.listing_id
GROUP BY u.user_id, u.full_name
HAVING COUNT(DISTINCT l.seller_id) >= 3
ORDER BY sellers_bought_from DESC, u.user_id;

-- ===== Q6b Sellers rated below the platform average
--      concepts: GROUP BY, HAVING with a scalar subquery
\echo '--- Q6b: sellers rated below the platform average ---'
SELECT s.seller_id, s.store_name, ROUND(AVG(rv.rating), 2) AS seller_avg_rating, COUNT(*) AS reviews,
       (SELECT ROUND(AVG(rating), 2) FROM review) AS platform_avg
FROM seller s
JOIN listing l     ON l.seller_id  = s.seller_id
JOIN order_item oi ON oi.listing_id = l.listing_id
JOIN review rv     ON (rv.order_id, rv.item_no) = (oi.order_id, oi.item_no)
GROUP BY s.seller_id, s.store_name
HAVING AVG(rv.rating) < (SELECT AVG(rating) FROM review)
ORDER BY seller_avg_rating;
