-- KartHub: database integrity tests (Member 2, plan D9). Run AFTER schema.sql + integrity.sql + procedures.sql:
--     psql -U postgres -d karthub -f db/tests.sql
-- Everything happens inside one transaction that is ROLLED BACK at the end, so your data is untouched.
-- Each test attempts something the database must refuse (or allow) and records PASS/FAIL.
-- "database said" shows the real error text, which is handy for the viva / W3 demo.
SET search_path = karthub;
\pset null '-'
\set QUIET on
BEGIN;

CREATE TEMP TABLE results (n serial, label text, ok boolean, detail text);
CREATE TEMP TABLE fx (k text PRIMARY KEY, v int);
CREATE FUNCTION pg_temp.f(k text) RETURNS int LANGUAGE sql STABLE AS $$ SELECT v FROM fx WHERE fx.k = $1 $$;

-- expect the statement to fail with this SQLSTATE (p_commit => also run the deferred checks, as COMMIT would)
CREATE PROCEDURE pg_temp.expect_fail(p_label text, p_stmt text, p_state text, p_commit boolean DEFAULT false)
LANGUAGE plpgsql AS $$
BEGIN
  EXECUTE p_stmt;
  IF p_commit THEN EXECUTE 'SET CONSTRAINTS ALL IMMEDIATE'; END IF;
  INSERT INTO results(label, ok, detail) VALUES (p_label, false, 'statement succeeded but should have been refused');
  IF p_commit THEN EXECUTE 'SET CONSTRAINTS ALL DEFERRED'; END IF;
EXCEPTION WHEN OTHERS THEN
  INSERT INTO results(label, ok, detail) VALUES (p_label, SQLSTATE = p_state, SQLSTATE || ': ' || SQLERRM);
END $$;

CREATE PROCEDURE pg_temp.expect_ok(p_label text, p_stmt text, p_commit boolean DEFAULT false)
LANGUAGE plpgsql AS $$
BEGIN
  EXECUTE p_stmt;
  IF p_commit THEN EXECUTE 'SET CONSTRAINTS ALL IMMEDIATE'; EXECUTE 'SET CONSTRAINTS ALL DEFERRED'; END IF;
  INSERT INTO results(label, ok, detail) VALUES (p_label, true, 'accepted');
EXCEPTION WHEN OTHERS THEN
  INSERT INTO results(label, ok, detail) VALUES (p_label, false, SQLSTATE || ': ' || SQLERRM);
END $$;

CREATE PROCEDURE pg_temp.expect_true(p_label text, p_cond_sql text)
LANGUAGE plpgsql AS $$
DECLARE v boolean;
BEGIN
  EXECUTE p_cond_sql INTO v;
  INSERT INTO results(label, ok, detail) VALUES (p_label, COALESCE(v, false), CASE WHEN COALESCE(v, false) THEN 'condition holds' ELSE 'condition is false' END);
END $$;

-- ---------------- fixtures (own data, independent of any seed) ----------------
INSERT INTO app_user(full_name, email, password_hash, role) VALUES
  ('T Customer 1', 't_c1@test.dev', 'x', 'customer'), ('T Customer 2', 't_c2@test.dev', 'x', 'customer'),
  ('T Seller', 't_s1@test.dev', 'x', 'seller');
INSERT INTO seller(seller_id, store_name, gst_no) SELECT user_id, 'T Store', 'TESTGST0000000X' FROM app_user WHERE email = 't_s1@test.dev';
INSERT INTO fx SELECT 'c1', user_id FROM app_user WHERE email = 't_c1@test.dev';
INSERT INTO fx SELECT 'c2', user_id FROM app_user WHERE email = 't_c2@test.dev';
INSERT INTO fx SELECT 's1', user_id FROM app_user WHERE email = 't_s1@test.dev';

INSERT INTO category(name) VALUES ('T Cat');
INSERT INTO category(name, parent_id) SELECT 'T Cat child', category_id FROM category WHERE name = 'T Cat';
INSERT INTO category(name, parent_id) SELECT 'T Cat grandchild', category_id FROM category WHERE name = 'T Cat child';
INSERT INTO fx SELECT 'cat', category_id FROM category WHERE name = 'T Cat';
INSERT INTO fx SELECT 'gchild', category_id FROM category WHERE name = 'T Cat grandchild';
INSERT INTO product(category_id, name, brand) VALUES (pg_temp.f('cat'), 'T Product', 'T Brand');
INSERT INTO fx SELECT 'prod', product_id FROM product WHERE name = 'T Product';
INSERT INTO listing(seller_id, product_id, price, stock_qty) VALUES (pg_temp.f('s1'), pg_temp.f('prod'), 500, 10);
INSERT INTO fx SELECT 'lst', listing_id FROM listing WHERE product_id = pg_temp.f('prod');

INSERT INTO address(user_id, line1, city, state, pincode, is_default) VALUES
  (pg_temp.f('c1'), '1 Test St', 'Hyderabad', 'TS', '500001', true),
  (pg_temp.f('c2'), '2 Test St', 'Hyderabad', 'TS', '500002', true);
INSERT INTO fx SELECT 'a1', address_id FROM address WHERE user_id = pg_temp.f('c1');
INSERT INTO fx SELECT 'a2', address_id FROM address WHERE user_id = pg_temp.f('c2');

INSERT INTO coupon(code, discount_pct, min_order_value, valid_from, valid_to, max_uses) VALUES
  ('T_EXPIRED', 10, 0,      CURRENT_DATE - 30, CURRENT_DATE - 1, 10),
  ('T_MIN',     10, 100000, CURRENT_DATE - 1,  CURRENT_DATE + 30, 10),
  ('T_ONCE',    10, 100,    CURRENT_DATE - 1,  CURRENT_DATE + 30, 1);

-- ---------------- A. CHECK / UNIQUE / FK constraints ----------------
CALL pg_temp.expect_fail('A1  stock cannot be set below zero',
  $q$UPDATE listing SET stock_qty = -1 WHERE listing_id = pg_temp.f('lst')$q$, '23514');
CALL pg_temp.expect_fail('A2  overselling decrement (stock 10 - 100) is refused',
  $q$UPDATE listing SET stock_qty = stock_qty - 100 WHERE listing_id = pg_temp.f('lst')$q$, '23514');
CALL pg_temp.expect_fail('A3  a seller cannot list the same product twice',
  $q$INSERT INTO listing(seller_id, product_id, price, stock_qty) VALUES (pg_temp.f('s1'), pg_temp.f('prod'), 400, 1)$q$, '23505');
CALL pg_temp.expect_fail('A4  price must be positive',
  $q$UPDATE listing SET price = 0 WHERE listing_id = pg_temp.f('lst')$q$, '23514');
CALL pg_temp.expect_fail('A5  a second default address is refused (partial unique index)',
  $q$INSERT INTO address(user_id, line1, city, state, pincode, is_default) VALUES (pg_temp.f('c1'), 'x', 'y', 'z', '500003', true)$q$, '23505');
CALL pg_temp.expect_fail('A6  pincode must be 6 digits',
  $q$INSERT INTO address(user_id, line1, city, state, pincode) VALUES (pg_temp.f('c1'), 'x', 'y', 'z', '12ab')$q$, '23514');
CALL pg_temp.expect_fail('A7  phone must be 10 digits',
  $q$INSERT INTO app_user(full_name, email, phone, password_hash) VALUES ('P', 'p@test.dev', '123', 'x')$q$, '23514');
CALL pg_temp.expect_fail('A8  e-mail must be unique',
  $q$INSERT INTO app_user(full_name, email, password_hash) VALUES ('Dup', 't_c1@test.dev', 'x')$q$, '23505');
CALL pg_temp.expect_fail('A9  cart quantity must be above zero',
  $q$INSERT INTO cart_item(user_id, listing_id, quantity) VALUES (pg_temp.f('c1'), pg_temp.f('lst'), 0)$q$, '23514');
CALL pg_temp.expect_fail('A10 payment method must be UPI/CARD/NETBANKING/COD',
  $q$INSERT INTO payment(order_id, method, amount) VALUES (1, 'BITCOIN', 1)$q$, '23514');
CALL pg_temp.expect_fail('A11 coupon discount is limited to 1-90 percent',
  $q$INSERT INTO coupon(code, discount_pct, valid_from, valid_to, max_uses) VALUES ('T_BAD', 95, CURRENT_DATE, CURRENT_DATE, 1)$q$, '23514');
CALL pg_temp.expect_fail('A12 a category cannot be its own parent (CHECK)',
  $q$INSERT INTO category(category_id, name, parent_id) VALUES (99999, 'T self', 99999)$q$, '23514');
CALL pg_temp.expect_fail('A13 duplicate unbranded catalogue products are refused',
  $q$WITH first_copy AS (
       INSERT INTO product(category_id, name, brand) VALUES (pg_temp.f('cat'), 'T Unbranded Product', NULL)
     )
     INSERT INTO product(category_id, name, brand) VALUES (pg_temp.f('cat'), 'T Unbranded Product', NULL)$q$, '23505');

-- ---------------- B. triggers and deferred rules ----------------
CALL pg_temp.expect_fail('B1  category cycle of length 3 is refused (trg_category_cycle)',
  $q$UPDATE category SET parent_id = pg_temp.f('gchild') WHERE category_id = pg_temp.f('cat')$q$, 'P0001');
CALL pg_temp.expect_fail('B2  an order cannot ship to ANOTHER user''s address (composite FK)',
  $q$INSERT INTO orders(user_id, address_id) VALUES (pg_temp.f('c2'), pg_temp.f('a1'))$q$, '23503');
CALL pg_temp.expect_fail('B3  role=seller without a seller row is refused at COMMIT',
  $q$INSERT INTO app_user(full_name, email, password_hash, role) VALUES ('Fake seller', 'fs@test.dev', 'x', 'seller')$q$, 'P0001', true);
CALL pg_temp.expect_fail('B4  a seller row for a non-seller user is refused at COMMIT',
  $q$INSERT INTO seller(seller_id, store_name, gst_no) VALUES (pg_temp.f('c2'), 'T Store 3', 'TESTGST0000000Z')$q$, 'P0001', true);
CALL pg_temp.expect_ok('B5  registering a seller (user + seller row together) is accepted',
  $q$WITH u AS (INSERT INTO app_user(full_name, email, password_hash, role) VALUES ('Seller 2', 't_s2@test.dev', 'x', 'seller') RETURNING user_id)
     INSERT INTO seller(seller_id, store_name, gst_no) SELECT user_id, 'T Store 2', 'TESTGST0000000Y' FROM u$q$, true);

-- ---------------- C. stored procedure: place an order, rollback, coupons ----------------
INSERT INTO cart_item(user_id, listing_id, quantity) VALUES (pg_temp.f('c1'), pg_temp.f('lst'), 2);
INSERT INTO fx SELECT 'o1', out_order_id FROM sp_place_order(pg_temp.f('c1'), pg_temp.f('a1'), 'UPI', NULL);
CALL pg_temp.expect_true('C1  sp_place_order: stock 10 -> 8, order PAID, cart emptied, payment = payable',
  $q$SELECT (SELECT stock_qty FROM listing WHERE listing_id = pg_temp.f('lst')) = 8
  AND (SELECT status FROM orders WHERE order_id = pg_temp.f('o1')) = 'PAID'
  AND NOT EXISTS (SELECT 1 FROM cart_item WHERE user_id = pg_temp.f('c1'))
  AND (SELECT amount FROM payment WHERE order_id = pg_temp.f('o1')) = 1000$q$);

INSERT INTO cart_item(user_id, listing_id, quantity) VALUES (pg_temp.f('c2'), pg_temp.f('lst'), 50);
CALL pg_temp.expect_fail('C2  buying more than the stock is refused',
  $q$SELECT * FROM sp_place_order(pg_temp.f('c2'), pg_temp.f('a2'), 'UPI', NULL)$q$, 'P0001');
CALL pg_temp.expect_true('C3  ... and nothing was left half-written (rollback): stock still 8, cart kept, no order',
  $q$SELECT (SELECT stock_qty FROM listing WHERE listing_id = pg_temp.f('lst')) = 8
  AND EXISTS (SELECT 1 FROM cart_item WHERE user_id = pg_temp.f('c2'))
  AND NOT EXISTS (SELECT 1 FROM orders WHERE user_id = pg_temp.f('c2'))$q$);

UPDATE cart_item SET quantity = 1 WHERE user_id = pg_temp.f('c2');
CALL pg_temp.expect_fail('C4  an expired coupon is refused by the procedure',
  $q$SELECT * FROM sp_place_order(pg_temp.f('c2'), pg_temp.f('a2'), 'UPI', 'T_EXPIRED')$q$, 'P0001');
CALL pg_temp.expect_fail('C5  an unknown coupon is refused by the procedure',
  $q$SELECT * FROM sp_place_order(pg_temp.f('c2'), pg_temp.f('a2'), 'UPI', 'NOPE')$q$, 'P0001');
CALL pg_temp.expect_fail('C6  order below the coupon minimum is refused by the procedure',
  $q$SELECT * FROM sp_place_order(pg_temp.f('c2'), pg_temp.f('a2'), 'UPI', 'T_MIN')$q$, 'P0001');
CALL pg_temp.expect_fail('C7  expired coupon refused by the TRIGGER even on a direct INSERT',
  $q$INSERT INTO orders(user_id, address_id, coupon_code) VALUES (pg_temp.f('c2'), pg_temp.f('a2'), 'T_EXPIRED')$q$, 'P0001');
CALL pg_temp.expect_fail('C8  coupon minimum refused by the deferred trigger on a direct INSERT',
  $q$WITH o AS (INSERT INTO orders(user_id, address_id, coupon_code) VALUES (pg_temp.f('c2'), pg_temp.f('a2'), 'T_MIN') RETURNING order_id)
     INSERT INTO order_item(order_id, item_no, listing_id, quantity, unit_price) SELECT order_id, 1, pg_temp.f('lst'), 1, 500 FROM o$q$, 'P0001', true);
CALL pg_temp.expect_fail('C9  attaching a coupon to an existing order is checked too (UPDATE)',
  $q$UPDATE orders SET coupon_code = 'T_EXPIRED' WHERE order_id = pg_temp.f('o1')$q$, 'P0001');

INSERT INTO fx SELECT 'o2', out_order_id FROM sp_place_order(pg_temp.f('c2'), pg_temp.f('a2'), 'COD', 'T_ONCE');
CALL pg_temp.expect_true('C10 valid coupon (10%) applied: payment = 450, COD payment PENDING, stock 8 -> 7',
  $q$SELECT (SELECT amount FROM payment WHERE order_id = pg_temp.f('o2')) = 450
  AND (SELECT status FROM payment WHERE order_id = pg_temp.f('o2')) = 'PENDING'
  AND (SELECT stock_qty FROM listing WHERE listing_id = pg_temp.f('lst')) = 7$q$);

INSERT INTO cart_item(user_id, listing_id, quantity) VALUES (pg_temp.f('c1'), pg_temp.f('lst'), 1);
CALL pg_temp.expect_fail('C11 a used-up coupon (max_uses = 1) is refused',
  $q$SELECT * FROM sp_place_order(pg_temp.f('c1'), pg_temp.f('a1'), 'UPI', 'T_ONCE')$q$, 'P0001');
CALL pg_temp.expect_fail('C12 payment amount must equal the order payable amount (checked at COMMIT)',
  $q$UPDATE payment SET amount = 1 WHERE order_id = pg_temp.f('o1')$q$, 'P0001', true);

-- ---------------- D. cancellation and stock restore ----------------
CALL pg_temp.expect_fail('D1  another user cannot cancel my order item',
  $q$SELECT * FROM sp_cancel_item(pg_temp.f('c1'), pg_temp.f('o2'), 1)$q$, 'P0001');
CALL pg_temp.expect_ok('D2  owner cancels a PENDING item (sp_cancel_item)',
  $q$SELECT * FROM sp_cancel_item(pg_temp.f('c2'), pg_temp.f('o2'), 1)$q$);
CALL pg_temp.expect_true('D3  stock restored once (7 -> 8) and the order became CANCELLED',
  $q$SELECT (SELECT stock_qty FROM listing WHERE listing_id = pg_temp.f('lst')) = 8
  AND (SELECT status FROM orders WHERE order_id = pg_temp.f('o2')) = 'CANCELLED'$q$);
CALL pg_temp.expect_fail('D4  cancelling the same item twice is refused',
  $q$SELECT * FROM sp_cancel_item(pg_temp.f('c2'), pg_temp.f('o2'), 1)$q$, 'P0001');
UPDATE order_item SET item_status = 'RETURNED' WHERE order_id = pg_temp.f('o2') AND item_no = 1;
CALL pg_temp.expect_true('D5  CANCELLED -> RETURNED does not restore stock a second time (trigger guard)',
  $q$SELECT (SELECT stock_qty FROM listing WHERE listing_id = pg_temp.f('lst')) = 8$q$);
CALL pg_temp.expect_ok('D6  a cancelled order frees its coupon use: T_ONCE can be used again',
  $q$SELECT * FROM sp_place_order(pg_temp.f('c1'), pg_temp.f('a1'), 'UPI', 'T_ONCE')$q$);

-- ---------------- E. reviews ----------------
CALL pg_temp.expect_fail('E1  reviewing an item that is not DELIVERED is refused (trg_review_delivered)',
  $q$INSERT INTO review(order_id, item_no, rating) VALUES (pg_temp.f('o1'), 1, 5)$q$, 'P0001');
UPDATE order_item SET item_status = 'DELIVERED' WHERE order_id = pg_temp.f('o1') AND item_no = 1;
CALL pg_temp.expect_fail('E2  rating must be 1-5',
  $q$INSERT INTO review(order_id, item_no, rating) VALUES (pg_temp.f('o1'), 1, 6)$q$, '23514');
CALL pg_temp.expect_ok('E3  reviewing a DELIVERED item is accepted',
  $q$INSERT INTO review(order_id, item_no, rating, comment) VALUES (pg_temp.f('o1'), 1, 5, 'great')$q$);
CALL pg_temp.expect_fail('E4  a second review of the same item is refused (UNIQUE)',
  $q$INSERT INTO review(order_id, item_no, rating) VALUES (pg_temp.f('o1'), 1, 4)$q$, '23505');

-- ---------------- F. every deferred rule holds for all rows created above ----------------
CALL pg_temp.expect_ok('F1  all deferred (COMMIT-time) checks pass for the fixture data', 'SET CONSTRAINTS ALL IMMEDIATE');

-- ---------------- report ----------------
\set QUIET off
\echo
SELECT n, CASE WHEN ok THEN 'PASS' ELSE 'FAIL' END AS result, label, left(detail, 95) AS "database said" FROM results ORDER BY n;
SELECT COUNT(*) FILTER (WHERE ok) AS passed, COUNT(*) FILTER (WHERE NOT ok) AS failed, COUNT(*) AS total FROM results;
ROLLBACK;
