-- KartHub: stored procedures (Member 2, plan D8). Run AFTER schema.sql and integrity.sql.
-- Each function runs as ONE atomic statement: any RAISE EXCEPTION undoes everything it did.
-- They mirror the Express routes (POST /orders/checkout and POST /orders/:id/items/:n/cancel);
-- the API keeps its own transaction code, these are the in-database equivalents.
SET search_path = karthub;

CREATE OR REPLACE FUNCTION sp_place_order(p_user int, p_address int, p_method text, p_coupon text DEFAULT NULL)
RETURNS TABLE (out_order_id int, out_items int, out_gross numeric, out_payable numeric, out_payment_status text)
LANGUAGE plpgsql AS $$
DECLARE
  rec record; cp record;
  v_n int := 0; v_subtotal numeric := 0; v_order int; v_gross numeric; v_pay numeric; v_paid boolean;
BEGIN
  IF p_method IS NULL OR p_method NOT IN ('UPI','CARD','NETBANKING','COD') THEN
    RAISE EXCEPTION 'Invalid payment method %', p_method;
  END IF;
  PERFORM 1 FROM address a WHERE a.address_id = p_address AND a.user_id = p_user;
  IF NOT FOUND THEN RAISE EXCEPTION 'Choose one of your own addresses'; END IF;

  -- lock the listing rows, always in listing_id order, so two checkouts cannot deadlock
  FOR rec IN
    SELECT ci.listing_id, ci.quantity, l.price, l.stock_qty, l.is_active, p.name
    FROM cart_item ci JOIN listing l ON l.listing_id = ci.listing_id
    JOIN product p ON p.product_id = l.product_id
    WHERE ci.user_id = p_user ORDER BY ci.listing_id FOR UPDATE OF l
  LOOP
    v_n := v_n + 1;
    IF NOT rec.is_active THEN RAISE EXCEPTION '"%" is no longer available', rec.name; END IF;
    IF rec.stock_qty < rec.quantity THEN RAISE EXCEPTION 'Only % left of "%"', rec.stock_qty, rec.name; END IF;
    v_subtotal := v_subtotal + rec.price * rec.quantity;
  END LOOP;
  IF v_n = 0 THEN RAISE EXCEPTION 'Cart is empty'; END IF;

  IF p_coupon IS NOT NULL THEN
    SELECT c.min_order_value, c.max_uses, (CURRENT_DATE BETWEEN c.valid_from AND c.valid_to) AS in_window,
           (SELECT COUNT(*) FROM orders o WHERE o.coupon_code = p_coupon AND o.status <> 'CANCELLED') AS used
      INTO cp FROM coupon c WHERE c.code = p_coupon FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Unknown coupon code'; END IF;
    IF NOT cp.in_window THEN RAISE EXCEPTION 'Coupon has expired or is not active yet'; END IF;
    IF v_subtotal < cp.min_order_value THEN RAISE EXCEPTION 'Order must be at least % to use this coupon', cp.min_order_value; END IF;
    IF cp.used >= cp.max_uses THEN RAISE EXCEPTION 'Coupon usage limit reached'; END IF;
  END IF;

  INSERT INTO orders(user_id, address_id, coupon_code) VALUES (p_user, p_address, p_coupon) RETURNING order_id INTO v_order;

  INSERT INTO order_item(order_id, item_no, listing_id, quantity, unit_price)
  SELECT v_order, ROW_NUMBER() OVER (ORDER BY ci.listing_id), ci.listing_id, ci.quantity, l.price   -- price snapshot
  FROM cart_item ci JOIN listing l ON l.listing_id = ci.listing_id WHERE ci.user_id = p_user;

  -- CHECK (stock_qty >= 0) is the last line of defence against overselling
  UPDATE listing l SET stock_qty = l.stock_qty - ci.quantity
  FROM cart_item ci WHERE ci.listing_id = l.listing_id AND ci.user_id = p_user;

  SELECT t.gross, t.payable INTO v_gross, v_pay FROM v_order_total t WHERE t.order_id = v_order;
  v_paid := (p_method <> 'COD');                              -- mock gateway
  INSERT INTO payment(order_id, method, amount, status, paid_at)
  VALUES (v_order, p_method, v_pay, CASE WHEN v_paid THEN 'SUCCESS' ELSE 'PENDING' END, CASE WHEN v_paid THEN now() END);
  IF v_paid THEN UPDATE orders o SET status = 'PAID' WHERE o.order_id = v_order; END IF;
  DELETE FROM cart_item ci WHERE ci.user_id = p_user;

  RETURN QUERY SELECT v_order, v_n, v_gross, v_pay, CASE WHEN v_paid THEN 'SUCCESS' ELSE 'PENDING' END::text;
END $$;

CREATE OR REPLACE FUNCTION sp_cancel_item(p_user int, p_order int, p_item int)
RETURNS TABLE (out_item_status text, out_order_cancelled boolean)
LANGUAGE plpgsql AS $$
DECLARE v_live int; v_cancelled boolean := false;
BEGIN
  PERFORM 1 FROM orders o WHERE o.order_id = p_order AND o.user_id = p_user FOR UPDATE;   -- lock + ownership
  IF NOT FOUND THEN RAISE EXCEPTION 'Order not found'; END IF;

  -- trg_restore_stock fires on this UPDATE and gives the stock back exactly once
  UPDATE order_item oi SET item_status = 'CANCELLED'
  WHERE oi.order_id = p_order AND oi.item_no = p_item AND oi.item_status = 'PENDING';
  IF NOT FOUND THEN RAISE EXCEPTION 'Item % of order % does not exist or is no longer PENDING', p_item, p_order; END IF;

  SELECT COUNT(*) INTO v_live FROM order_item oi
  WHERE oi.order_id = p_order AND oi.item_status NOT IN ('CANCELLED','RETURNED');
  IF v_live = 0 THEN
    UPDATE orders o SET status = 'CANCELLED' WHERE o.order_id = p_order;
    UPDATE payment p SET status = 'REFUNDED' WHERE p.order_id = p_order AND p.status = 'SUCCESS';
    v_cancelled := true;
  END IF;
  RETURN QUERY SELECT 'CANCELLED'::text, v_cancelled;
END $$;
