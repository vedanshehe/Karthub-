-- KartHub: EXPLAIN ANALYZE evidence that the indexes help (Member 2, plan D10).
--     psql -U postgres -d karthub -o docs/explain_results.txt -f db/explain.sql
-- With ~1,100 rows PostgreSQL rightly prefers a sequential scan, so each section loads extra rows
-- INSIDE a transaction, shows the plan WITH the index, drops the index (still inside the transaction),
-- shows the plan WITHOUT it, and finally ROLLBACKs, so your database is unchanged afterwards.
-- Read:  "Index Scan / Bitmap Index Scan / Index Only Scan" = index used,  "Seq Scan" = whole table read.
--        Compare the "Execution Time" lines.
SET search_path = karthub;
\set QUIET on
\timing off

\qecho '=============================================================='
\qecho 'E1  Order history  (index idx_orders_user_time on orders(user_id, placed_at DESC))'
\qecho '    query: GET /api/orders  -> one user''s orders, newest first'
\qecho '=============================================================='
BEGIN;
INSERT INTO orders(user_id, address_id, placed_at)
SELECT 10 + (i % 31), 1 + (i % 31), now() - (i % 900) * interval '1 hour' FROM generate_series(1, 100000) i;
ANALYZE orders;
\qecho '--- WITH the index'
EXPLAIN (ANALYZE, COSTS OFF, TIMING OFF, SUMMARY ON)
SELECT order_id, placed_at, status FROM orders WHERE user_id = 12 ORDER BY placed_at DESC LIMIT 20;
DROP INDEX idx_orders_user_time;
\qecho '--- WITHOUT the index'
EXPLAIN (ANALYZE, COSTS OFF, TIMING OFF, SUMMARY ON)
SELECT order_id, placed_at, status FROM orders WHERE user_id = 12 ORDER BY placed_at DESC LIMIT 20;
ROLLBACK;

\qecho
\qecho '=============================================================='
\qecho 'E2  Full-text product search  (GIN index idx_product_fts)'
\qecho '    query: Q1 / GET /api/products?q=...'
\qecho '=============================================================='
BEGIN;
INSERT INTO product(category_id, name, brand)
SELECT 5 + (i % 16), (ARRAY['Smartphone','Laptop','Headphones','Camera','Shirt','Dress'])[1 + i % 6] || ' Extra ' || i,
       'Brand' || (i % 50) FROM generate_series(1, 60000) i;
ANALYZE product;
\qecho '--- WITH the GIN index'
EXPLAIN (ANALYZE, COSTS OFF, TIMING OFF, SUMMARY ON)
SELECT product_id, name FROM product
WHERE to_tsvector('english', name || ' ' || coalesce(brand, '')) @@ plainto_tsquery('english', 'brand8 smartphone');
DROP INDEX idx_product_fts;
\qecho '--- WITHOUT the index'
EXPLAIN (ANALYZE, COSTS OFF, TIMING OFF, SUMMARY ON)
SELECT product_id, name FROM product
WHERE to_tsvector('english', name || ' ' || coalesce(brand, '')) @@ plainto_tsquery('english', 'brand8 smartphone');
ROLLBACK;

\qecho
\qecho '=============================================================='
\qecho 'E3  Price comparison  (index idx_listing_product_price on listing(product_id, price))'
\qecho '    query: GET /api/products/:id/offers'
\qecho '    listing is limited to one row per (seller, product), so scale it with extra sellers'
\qecho '=============================================================='
BEGIN;
INSERT INTO app_user(full_name, email, password_hash, role)
SELECT 'Bulk seller ' || i, 'bulk' || i || '@x.dev', 'x', 'seller' FROM generate_series(1, 1500) i;
INSERT INTO seller(seller_id, store_name, gst_no)
SELECT user_id, 'Bulk store ' || user_id, 'B' || lpad(user_id::text, 14, '0') FROM app_user WHERE email LIKE 'bulk%@x.dev';
INSERT INTO listing(seller_id, product_id, price, stock_qty)
SELECT s.seller_id, p.product_id, 100 + (s.seller_id * 7 + p.product_id * 13) % 5000, 10
FROM seller s CROSS JOIN (SELECT product_id FROM product WHERE product_id <= 40) p WHERE s.store_name LIKE 'Bulk store%';
ANALYZE listing;
\qecho '--- WITH the index'
EXPLAIN (ANALYZE, COSTS OFF, TIMING OFF, SUMMARY ON)
SELECT l.listing_id, l.price, l.stock_qty, s.store_name FROM listing l JOIN seller s ON s.seller_id = l.seller_id
WHERE l.product_id = 17 AND l.is_active ORDER BY l.price LIMIT 10;
DROP INDEX idx_listing_product_price;
\qecho '--- WITHOUT the index'
EXPLAIN (ANALYZE, COSTS OFF, TIMING OFF, SUMMARY ON)
SELECT l.listing_id, l.price, l.stock_qty, s.store_name FROM listing l JOIN seller s ON s.seller_id = l.seller_id
WHERE l.product_id = 17 AND l.is_active ORDER BY l.price LIMIT 10;
ROLLBACK;

\qecho
\qecho '=============================================================='
\qecho 'E4  Checkout row-lock query uses the primary keys (no extra index needed)'
\qecho '=============================================================='
EXPLAIN (ANALYZE, COSTS OFF, TIMING OFF, SUMMARY ON)
SELECT ci.listing_id, ci.quantity, l.price, l.stock_qty, l.is_active, p.name
FROM cart_item ci JOIN listing l ON l.listing_id = ci.listing_id JOIN product p ON p.product_id = l.product_id
WHERE ci.user_id = 12 ORDER BY ci.listing_id FOR UPDATE OF l;

\qecho
\qecho '=============================================================='
\qecho 'E5  Q5 (correlated subquery) and Q3 (CTE + window function) plans on the current data'
\qecho '=============================================================='
EXPLAIN (ANALYZE, COSTS OFF, TIMING OFF, SUMMARY ON)
SELECT p.name, s.store_name, l.price FROM listing l JOIN product p ON p.product_id = l.product_id JOIN seller s ON s.seller_id = l.seller_id
WHERE l.is_active AND l.price > (SELECT AVG(l2.price) FROM listing l2 WHERE l2.product_id = l.product_id AND l2.is_active);
ANALYZE;
