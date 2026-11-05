-- KartHub: bulk demo/test data, about 1,160 rows. Deterministic (no random()), so every run gives the same data.
-- Run on an EMPTY schema (schema.sql -> integrity.sql -> procedures.sql -> this file), INSTEAD of dev_seed.sql.
-- All 40 users have the password  secret1 :  admin@karthub.dev, seller1..8@karthub.dev, cust1..31@karthub.dev
-- Every row passes the triggers in integrity.sql (they are checked at COMMIT).
SET search_path = karthub;
BEGIN;

-- 40 users: ids 1-8 sellers, 9 admin, 10-40 customers
INSERT INTO app_user(user_id, full_name, email, phone, password_hash, role, created_at)
SELECT i,
       CASE WHEN i <= 8 THEN 'Seller ' || i WHEN i = 9 THEN 'Admin' ELSE 'Customer ' || (i - 9) END,
       CASE WHEN i <= 8 THEN 'seller' || i WHEN i = 9 THEN 'admin' ELSE 'cust' || (i - 9) END || '@karthub.dev',
       '9' || lpad(i::text, 9, '0'),
       '$2a$10$h101Ml1UmUj8fo64afSyouo5ClhZ50JrprI0te3suIbw0O81.f4eS',
       CASE WHEN i <= 8 THEN 'seller' WHEN i = 9 THEN 'admin' ELSE 'customer' END,
       now() - (200 - i) * interval '1 day'
FROM generate_series(1, 40) i;

INSERT INTO seller(seller_id, store_name, gst_no, is_verified)
SELECT i, 'Store ' || i, '27' || lpad(i::text, 13, '0'), (i % 4 <> 0) FROM generate_series(1, 8) i;

-- 60 addresses: address a belongs to customer 10 + (a-1) % 31; the first 31 are the defaults
INSERT INTO address(address_id, user_id, line1, city, state, pincode, is_default)
SELECT a, 10 + (a - 1) % 31, a || ', MG Road',
       (ARRAY['Hyderabad','Mumbai','Delhi','Bengaluru','Chennai','Pune'])[1 + a % 6],
       (ARRAY['Telangana','Maharashtra','Delhi','Karnataka','Tamil Nadu','Maharashtra'])[1 + a % 6],
       lpad((500000 + a * 37)::text, 6, '0'), (a <= 31)
FROM generate_series(1, 60) a;

-- 20 categories: 4 roots, 16 children
INSERT INTO category(category_id, name, parent_id) VALUES
 (1,'Electronics',NULL),(2,'Fashion',NULL),(3,'Home & Kitchen',NULL),(4,'Books',NULL),
 (5,'Mobiles',1),(6,'Laptops',1),(7,'Headphones',1),(8,'Cameras',1),
 (9,'Menswear',2),(10,'Womenswear',2),(11,'Footwear',2),(12,'Watches',2),
 (13,'Furniture',3),(14,'Cookware',3),(15,'Lighting',3),(16,'Decor',3),
 (17,'Fiction',4),(18,'Textbooks',4),(19,'Comics',4),(20,'Kids Books',4);

-- 100 products
INSERT INTO product(product_id, category_id, name, brand, description)
SELECT p, 5 + (p - 1) % 16,
       (ARRAY['Smartphone','Laptop','Headphones','Camera','Shirt','Dress','Sneakers','Watch',
              'Chair','Pan','Lamp','Vase','Novel','Textbook','Comic','Storybook'])[1 + (p - 1) % 16] || ' Model ' || p,
       (ARRAY['Aurora','Zenith','Nimbus','Vertex','Orbit','Pioneer','Summit','Echo','Atlas','Nova'])[1 + p % 10],
       'Sample product ' || p
FROM generate_series(1, 100) p;

-- 250 listings: a fixed pseudo-random pick of (seller, product) pairs
INSERT INTO listing(listing_id, seller_id, product_id, price, stock_qty, is_active)
SELECT ROW_NUMBER() OVER (ORDER BY (s * 131 + p * 17) % 997, s, p), s, p,
       (200 + (s * 37 + p * 53) % 9800)::numeric, 30 + (s * p) % 20, ((s * 13 + p) % 25 <> 0)
FROM generate_series(1, 8) s CROSS JOIN generate_series(1, 100) p
ORDER BY (s * 131 + p * 17) % 997, s, p LIMIT 250;

-- 5 coupons (one expired, one that will be used up)
INSERT INTO coupon(code, discount_pct, min_order_value, valid_from, valid_to, max_uses) VALUES
 ('WELCOME10', 10,  500, CURRENT_DATE - 60, CURRENT_DATE + 60, 1000),
 ('FESTIVE15', 15, 2000, CURRENT_DATE - 60, CURRENT_DATE + 60, 100),
 ('BIGSALE20', 20, 5000, CURRENT_DATE - 60, CURRENT_DATE + 60, 50),
 ('EXPIRED5',   5,    0, CURRENT_DATE - 90, CURRENT_DATE - 30, 100),
 ('USEDUP25',  25,  100, CURRENT_DATE - 60, CURRENT_DATE + 60, 3);

-- 150 orders, status pattern by order_id % 10:
--   0 CANCELLED | 1,2 PLACED (COD) | 3 SHIPPED | 4,5,6,7 DELIVERED | 8,9 PAID
INSERT INTO orders(order_id, user_id, address_id, status, placed_at)
SELECT i, 10 + (i - 1) % 31, 1 + (i - 1) % 31,
       CASE i % 10 WHEN 0 THEN 'CANCELLED' WHEN 1 THEN 'PLACED' WHEN 2 THEN 'PLACED' WHEN 3 THEN 'SHIPPED'
                   WHEN 8 THEN 'PAID' WHEN 9 THEN 'PAID' ELSE 'DELIVERED' END,
       now() - (i % 170 + 1) * interval '1 day' - (i % 24) * interval '1 hour'
FROM generate_series(1, 150) i;

-- 300 order items (2 per order, two different listings)
INSERT INTO order_item(order_id, item_no, listing_id, quantity, unit_price, item_status)
SELECT o.order_id, n.item_no, l.listing_id, 1 + (o.order_id + n.item_no) % 3, l.price,
       CASE o.status WHEN 'CANCELLED' THEN 'CANCELLED' WHEN 'SHIPPED' THEN 'SHIPPED'
                     WHEN 'DELIVERED' THEN 'DELIVERED' ELSE 'PENDING' END
FROM orders o CROSS JOIN (VALUES (1),(2)) n(item_no)
JOIN listing l ON l.listing_id = 1 + ((o.order_id * 37 + (n.item_no - 1) * 101) % 250);

-- stock: subtract what live (not cancelled/returned) lines bought, then make a few listings low on stock
UPDATE listing l SET stock_qty = l.stock_qty - s.sold
FROM (SELECT listing_id, SUM(quantity) AS sold FROM order_item
      WHERE item_status NOT IN ('CANCELLED','RETURNED') GROUP BY listing_id) s
WHERE s.listing_id = l.listing_id;
UPDATE listing SET stock_qty = listing_id % 4 WHERE listing_id % 20 = 0;

-- coupons: only on non-cancelled orders that meet the minimum (the triggers re-check every one)
UPDATE orders SET coupon_code = 'USEDUP25' WHERE order_id IN (13, 26, 39);
UPDATE orders o SET coupon_code = 'BIGSALE20' FROM v_order_total t
 WHERE t.order_id = o.order_id AND o.coupon_code IS NULL AND o.status <> 'CANCELLED' AND o.order_id % 11 = 0 AND t.gross >= 5000;
UPDATE orders o SET coupon_code = 'FESTIVE15' FROM v_order_total t
 WHERE t.order_id = o.order_id AND o.coupon_code IS NULL AND o.status <> 'CANCELLED' AND o.order_id % 7 = 0 AND t.gross >= 2000;
UPDATE orders o SET coupon_code = 'WELCOME10' FROM v_order_total t
 WHERE t.order_id = o.order_id AND o.coupon_code IS NULL AND o.status <> 'CANCELLED' AND o.order_id % 5 = 0 AND t.gross >= 500;

-- 150 payments; amount = payable from the view (trigger trg_payment_amount checks it at COMMIT)
INSERT INTO payment(order_id, method, amount, status, paid_at)
SELECT o.order_id, m.method, t.payable,
       CASE WHEN o.status = 'CANCELLED' THEN (CASE WHEN m.method = 'COD' THEN 'FAILED' ELSE 'REFUNDED' END)
            WHEN o.status = 'PLACED' THEN 'PENDING' ELSE 'SUCCESS' END,
       CASE WHEN o.status IN ('PAID','SHIPPED','DELIVERED') THEN o.placed_at + interval '1 hour' END
FROM orders o JOIN v_order_total t USING (order_id)
CROSS JOIN LATERAL (SELECT CASE WHEN o.order_id % 10 IN (1,2,7) THEN 'COD'
                                ELSE (ARRAY['UPI','CARD','NETBANKING'])[1 + o.order_id % 3] END AS method) m;

-- 80 reviews on delivered items; sellers 7 and 8 get lower ratings
INSERT INTO review(order_id, item_no, rating, comment, created_at)
SELECT oi.order_id, oi.item_no,
       CASE WHEN l.seller_id IN (7, 8) THEN 1 + oi.order_id % 3 ELSE 3 + oi.order_id % 3 END,
       'Review for order ' || oi.order_id || ' item ' || oi.item_no, now() - (oi.order_id % 30) * interval '1 day'
FROM order_item oi JOIN listing l ON l.listing_id = oi.listing_id
WHERE oi.item_status = 'DELIVERED' ORDER BY oi.order_id, oi.item_no LIMIT 80;

-- explicit ids were used above, so move every sequence past them
SELECT setval('app_user_user_id_seq',   (SELECT MAX(user_id)     FROM app_user));
SELECT setval('address_address_id_seq', (SELECT MAX(address_id)  FROM address));
SELECT setval('category_category_id_seq',(SELECT MAX(category_id) FROM category));
SELECT setval('product_product_id_seq', (SELECT MAX(product_id)  FROM product));
SELECT setval('listing_listing_id_seq', (SELECT MAX(listing_id)  FROM listing));
SELECT setval('orders_order_id_seq',    (SELECT MAX(order_id)    FROM orders));
COMMIT;

SELECT 'app_user' AS tbl, COUNT(*) FROM app_user UNION ALL SELECT 'seller', COUNT(*) FROM seller
UNION ALL SELECT 'address', COUNT(*) FROM address UNION ALL SELECT 'category', COUNT(*) FROM category
UNION ALL SELECT 'product', COUNT(*) FROM product UNION ALL SELECT 'listing', COUNT(*) FROM listing
UNION ALL SELECT 'coupon', COUNT(*) FROM coupon UNION ALL SELECT 'orders', COUNT(*) FROM orders
UNION ALL SELECT 'order_item', COUNT(*) FROM order_item UNION ALL SELECT 'payment', COUNT(*) FROM payment
UNION ALL SELECT 'review', COUNT(*) FROM review UNION ALL SELECT 'TOTAL', 
  (SELECT COUNT(*) FROM app_user)+(SELECT COUNT(*) FROM seller)+(SELECT COUNT(*) FROM address)+(SELECT COUNT(*) FROM category)
 +(SELECT COUNT(*) FROM product)+(SELECT COUNT(*) FROM listing)+(SELECT COUNT(*) FROM coupon)+(SELECT COUNT(*) FROM orders)
 +(SELECT COUNT(*) FROM order_item)+(SELECT COUNT(*) FROM payment)+(SELECT COUNT(*) FROM review);
