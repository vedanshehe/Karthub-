-- KartHub: multi-vendor e-commerce marketplace  (PostgreSQL 15+)
DROP SCHEMA IF EXISTS karthub CASCADE;
CREATE SCHEMA karthub; SET search_path = karthub;

CREATE TABLE app_user (
  user_id       SERIAL PRIMARY KEY,
  full_name     VARCHAR(100) NOT NULL,
  email         VARCHAR(120) NOT NULL UNIQUE,
  phone         CHAR(10)     UNIQUE CHECK (phone ~ '^[0-9]{10}$'),
  password_hash TEXT         NOT NULL,
  role          VARCHAR(10)  NOT NULL DEFAULT 'customer'
                CHECK (role IN ('customer','seller','admin')),
  created_at    TIMESTAMP    NOT NULL DEFAULT now()
);

CREATE TABLE seller (                       -- ISA app_user
  seller_id   INT PRIMARY KEY REFERENCES app_user(user_id) ON DELETE CASCADE,
  store_name  VARCHAR(80) NOT NULL UNIQUE,
  gst_no      CHAR(15)    NOT NULL UNIQUE,
  is_verified BOOLEAN     NOT NULL DEFAULT FALSE,
  joined_on   DATE        NOT NULL DEFAULT CURRENT_DATE
);

CREATE TABLE address (
  address_id SERIAL PRIMARY KEY,
  user_id    INT NOT NULL REFERENCES app_user(user_id) ON DELETE CASCADE,
  line1      VARCHAR(150) NOT NULL,
  city       VARCHAR(60)  NOT NULL,
  state      VARCHAR(60)  NOT NULL,
  pincode    CHAR(6)      NOT NULL CHECK (pincode ~ '^[0-9]{6}$'),
  is_default BOOLEAN      NOT NULL DEFAULT FALSE
);
CREATE UNIQUE INDEX uq_one_default_addr ON address(user_id) WHERE is_default;

CREATE TABLE category (
  category_id SERIAL PRIMARY KEY,
  name        VARCHAR(60) NOT NULL UNIQUE,
  parent_id   INT REFERENCES category(category_id) ON DELETE SET NULL,
  CHECK (parent_id IS NULL OR parent_id <> category_id)
);

CREATE TABLE product (                      -- catalogue entry, seller-independent
  product_id  SERIAL PRIMARY KEY,
  category_id INT NOT NULL REFERENCES category(category_id),
  name        VARCHAR(150) NOT NULL,
  brand       VARCHAR(60),
  description TEXT,
  UNIQUE (name, brand)
);

CREATE TABLE listing (                      -- seller x product (M:N with attributes)
  listing_id SERIAL PRIMARY KEY,
  seller_id  INT NOT NULL REFERENCES seller(seller_id),
  product_id INT NOT NULL REFERENCES product(product_id),
  price      NUMERIC(10,2) NOT NULL CHECK (price > 0),
  stock_qty  INT NOT NULL DEFAULT 0 CHECK (stock_qty >= 0),
  is_active  BOOLEAN NOT NULL DEFAULT TRUE,
  UNIQUE (seller_id, product_id)
);

CREATE TABLE cart_item (                    -- user x listing (M:N)
  user_id    INT NOT NULL REFERENCES app_user(user_id) ON DELETE CASCADE,
  listing_id INT NOT NULL REFERENCES listing(listing_id) ON DELETE CASCADE,
  quantity   INT NOT NULL CHECK (quantity > 0),
  added_at   TIMESTAMP NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, listing_id)
);

CREATE TABLE coupon (
  code            VARCHAR(20) PRIMARY KEY,
  discount_pct    NUMERIC(5,2) NOT NULL CHECK (discount_pct BETWEEN 1 AND 90),
  min_order_value NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK (min_order_value >= 0),
  valid_from      DATE NOT NULL,
  valid_to        DATE NOT NULL,
  max_uses        INT  NOT NULL CHECK (max_uses > 0),
  CHECK (valid_to >= valid_from)
);

CREATE TABLE orders (
  order_id    SERIAL PRIMARY KEY,
  user_id     INT NOT NULL REFERENCES app_user(user_id),
  address_id  INT NOT NULL REFERENCES address(address_id),
  coupon_code VARCHAR(20) REFERENCES coupon(code),
  status      VARCHAR(10) NOT NULL DEFAULT 'PLACED'
              CHECK (status IN ('PLACED','PAID','SHIPPED','DELIVERED','CANCELLED')),
  placed_at   TIMESTAMP NOT NULL DEFAULT now()
);

CREATE TABLE order_item (                   -- weak entity of orders
  order_id    INT NOT NULL REFERENCES orders(order_id) ON DELETE CASCADE,
  item_no     INT NOT NULL,
  listing_id  INT NOT NULL REFERENCES listing(listing_id),
  quantity    INT NOT NULL CHECK (quantity > 0),
  unit_price  NUMERIC(10,2) NOT NULL CHECK (unit_price > 0),  -- price snapshot
  item_status VARCHAR(10) NOT NULL DEFAULT 'PENDING'
              CHECK (item_status IN ('PENDING','SHIPPED','DELIVERED','RETURNED','CANCELLED')),
  PRIMARY KEY (order_id, item_no)
);

CREATE TABLE payment (
  payment_id SERIAL PRIMARY KEY,
  order_id   INT NOT NULL UNIQUE REFERENCES orders(order_id) ON DELETE CASCADE,
  method     VARCHAR(12) NOT NULL CHECK (method IN ('UPI','CARD','NETBANKING','COD')),
  amount     NUMERIC(12,2) NOT NULL CHECK (amount >= 0),
  status     VARCHAR(10) NOT NULL DEFAULT 'PENDING'
             CHECK (status IN ('PENDING','SUCCESS','FAILED','REFUNDED')),
  paid_at    TIMESTAMP
);

CREATE TABLE review (
  review_id  SERIAL PRIMARY KEY,
  order_id   INT NOT NULL,
  item_no    INT NOT NULL,
  rating     SMALLINT NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment    TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT now(),
  UNIQUE (order_id, item_no),               -- at most one review per purchased item
  FOREIGN KEY (order_id, item_no) REFERENCES order_item(order_id, item_no) ON DELETE CASCADE
);

-- ---------- indexes ----------
CREATE INDEX idx_listing_product_price ON listing(product_id, price);
CREATE INDEX idx_orders_user_time      ON orders(user_id, placed_at DESC);
CREATE INDEX idx_product_fts ON product USING GIN (to_tsvector('english', name || ' ' || coalesce(brand,'')));

-- ---------- views ----------
CREATE VIEW v_order_total AS
  SELECT o.order_id, SUM(oi.quantity*oi.unit_price) AS gross,
         ROUND(SUM(oi.quantity*oi.unit_price) * (1 - COALESCE(c.discount_pct,0)/100), 2) AS payable
  FROM orders o JOIN order_item oi USING(order_id)
  LEFT JOIN coupon c ON c.code = o.coupon_code GROUP BY o.order_id, c.discount_pct;

-- ---------- trigger: reviews only for delivered items ----------
CREATE FUNCTION fn_review_only_delivered() RETURNS trigger AS $$
BEGIN
  IF (SELECT item_status FROM order_item WHERE order_id=NEW.order_id AND item_no=NEW.item_no) <> 'DELIVERED' THEN
    RAISE EXCEPTION 'Only delivered items can be reviewed';
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;
CREATE TRIGGER trg_review_delivered BEFORE INSERT ON review
  FOR EACH ROW EXECUTE FUNCTION fn_review_only_delivered();

-- ---------- trigger: restore stock when an item is cancelled/returned ----------
CREATE FUNCTION fn_restore_stock() RETURNS trigger AS $$
BEGIN
  IF NEW.item_status IN ('CANCELLED','RETURNED') AND OLD.item_status NOT IN ('CANCELLED','RETURNED') THEN
    UPDATE listing SET stock_qty = stock_qty + NEW.quantity WHERE listing_id = NEW.listing_id;
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;
CREATE TRIGGER trg_restore_stock AFTER UPDATE OF item_status ON order_item
  FOR EACH ROW EXECUTE FUNCTION fn_restore_stock();
