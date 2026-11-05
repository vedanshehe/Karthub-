-- KartHub: remaining integrity rules (Member 2, plan D5-D6). Run AFTER schema.sql.
-- Each rule below was listed as "not yet enforced inside the database" in the design document.
SET search_path = karthub;

-- R1. The shipping address must belong to the user placing the order.
--     Composite FK (address_id, user_id) instead of a plain address_id FK.
ALTER TABLE address ADD CONSTRAINT uq_address_owner UNIQUE (address_id, user_id);
ALTER TABLE orders  DROP CONSTRAINT IF EXISTS orders_address_id_fkey;
ALTER TABLE orders  ADD  CONSTRAINT fk_orders_address_owner
  FOREIGN KEY (address_id, user_id) REFERENCES address (address_id, user_id);

-- R2a. Coupon must be valid today and have uses left. Locks the coupon row so two
--      concurrent orders cannot both take the last allowed use.
CREATE FUNCTION fn_coupon_valid_on_order() RETURNS trigger AS $$
DECLARE cp record;
BEGIN
  IF NEW.coupon_code IS NULL THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND NEW.coupon_code IS NOT DISTINCT FROM OLD.coupon_code THEN RETURN NEW; END IF;
  SELECT (CURRENT_DATE BETWEEN valid_from AND valid_to) AS in_window, max_uses,
         (SELECT COUNT(*) FROM orders o WHERE o.coupon_code = NEW.coupon_code AND o.status <> 'CANCELLED' AND o.order_id <> NEW.order_id) AS used
    INTO cp FROM coupon WHERE code = NEW.coupon_code FOR UPDATE;
  IF NOT FOUND THEN RETURN NEW; END IF;                      -- unknown code: the FK rejects it
  IF NOT cp.in_window THEN RAISE EXCEPTION 'Coupon % has expired or is not active yet', NEW.coupon_code; END IF;
  IF cp.used >= cp.max_uses THEN RAISE EXCEPTION 'Coupon % usage limit reached', NEW.coupon_code; END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;
CREATE TRIGGER trg_coupon_valid BEFORE INSERT OR UPDATE OF coupon_code ON orders
  FOR EACH ROW EXECUTE FUNCTION fn_coupon_valid_on_order();

-- R2b. Minimum order value. The lines are inserted after the order row, so this check is
--      DEFERRED to COMMIT, when the whole order exists.
CREATE FUNCTION fn_coupon_min_order() RETURNS trigger AS $$
DECLARE v_min numeric; v_gross numeric;
BEGIN
  IF NEW.coupon_code IS NULL THEN RETURN NULL; END IF;
  SELECT min_order_value INTO v_min FROM coupon WHERE code = NEW.coupon_code;
  SELECT gross INTO v_gross FROM v_order_total WHERE order_id = NEW.order_id;
  IF v_gross IS NULL OR v_gross < v_min THEN
    RAISE EXCEPTION 'Order total is below the coupon minimum of %', v_min;
  END IF;
  RETURN NULL;
END $$ LANGUAGE plpgsql;
CREATE CONSTRAINT TRIGGER trg_coupon_min AFTER INSERT OR UPDATE OF coupon_code ON orders
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION fn_coupon_min_order();

-- R3. app_user.role = 'seller' exactly when a seller row exists (checked at COMMIT, so the
--     registration transaction may insert the two rows in either order).
CREATE FUNCTION fn_seller_role_consistent() RETURNS trigger AS $$
DECLARE uid int; r text;
BEGIN
  IF TG_TABLE_NAME = 'seller' THEN uid := COALESCE(NEW.seller_id, OLD.seller_id);
  ELSE uid := COALESCE(NEW.user_id, OLD.user_id); END IF;
  SELECT role INTO r FROM app_user WHERE user_id = uid;
  IF NOT FOUND THEN RETURN NULL; END IF;                     -- user deleted (seller row cascades)
  IF (r = 'seller') <> EXISTS (SELECT 1 FROM seller WHERE seller_id = uid) THEN
    RAISE EXCEPTION 'User % must have role seller if and only if a seller row exists', uid;
  END IF;
  RETURN NULL;
END $$ LANGUAGE plpgsql;
CREATE CONSTRAINT TRIGGER trg_role_seller_row AFTER INSERT OR UPDATE OR DELETE ON seller
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION fn_seller_role_consistent();
CREATE CONSTRAINT TRIGGER trg_role_user_row AFTER INSERT OR UPDATE OF role ON app_user
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION fn_seller_role_consistent();

-- R4. payment.amount must equal the order's payable amount (view v_order_total); checked at COMMIT.
CREATE FUNCTION fn_payment_matches_total() RETURNS trigger AS $$
DECLARE v_pay numeric;
BEGIN
  SELECT payable INTO v_pay FROM v_order_total WHERE order_id = NEW.order_id;
  IF v_pay IS DISTINCT FROM NEW.amount THEN
    RAISE EXCEPTION 'Payment amount % does not match the order payable amount %', NEW.amount, v_pay;
  END IF;
  RETURN NULL;
END $$ LANGUAGE plpgsql;
CREATE CONSTRAINT TRIGGER trg_payment_amount AFTER INSERT OR UPDATE OF amount ON payment
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION fn_payment_matches_total();

-- R5. The category tree must not contain cycles of any length (the CHECK only stops self-parenting).
CREATE FUNCTION fn_category_no_cycle() RETURNS trigger AS $$
BEGIN
  IF NEW.parent_id IS NULL THEN RETURN NEW; END IF;
  IF EXISTS (
    WITH RECURSIVE anc AS (
      SELECT category_id, parent_id FROM category WHERE category_id = NEW.parent_id
      UNION ALL
      SELECT c.category_id, c.parent_id FROM category c JOIN anc a ON c.category_id = a.parent_id)
    SELECT 1 FROM anc WHERE category_id = NEW.category_id) THEN
    RAISE EXCEPTION 'Category % cannot be moved under its own descendant', NEW.category_id;
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;
CREATE TRIGGER trg_category_cycle BEFORE UPDATE OF parent_id ON category
  FOR EACH ROW EXECUTE FUNCTION fn_category_no_cycle();
