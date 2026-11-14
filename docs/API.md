# KartHub REST API Specification

KartHub is a multi-vendor e-commerce marketplace REST API built with Node.js/Express, PostgreSQL 15+, and raw parameterised SQL.

Base URL: `http://localhost:4000/api`

---

## 1. Authentication & Error Conventions

### Authentication Header
Protected endpoints require a JSON Web Token (JWT) in the `Authorization` header:
```http
Authorization: Bearer <jwt_token>
```

### Database Error to HTTP Status Mapping
Errors raised by database constraints and triggers map deterministically to HTTP status codes:
| SQLSTATE / Error Condition | HTTP Status | Description |
| :--- | :--- | :--- |
| `23505` | 409 Conflict | Unique constraint violation (e.g. duplicate email, duplicate listing per seller) |
| `23514` | 409 Conflict | Check constraint violation (e.g. negative stock, rating out of 1–5) |
| `23503` | 409 Conflict | Foreign key constraint violation (e.g. shipping to another user's address) |
| `P0001` | 422 Unprocessable | Trigger failure (e.g. reviewing an undelivered item) |
| `23502` / `22P02` / `22003` / `22001` | 400 Bad Request | Missing required column, malformed type, number out of range, or value too long |
| Token invalid / missing | 401 Unauthorized | Login required |
| Role mismatch | 403 Forbidden | Not allowed for user's role |
| Record missing | 404 Not Found | Item, order, or resource not found |

---

## 2. Authentication Routes (`/api/auth`)

### `POST /auth/register`
Creates a customer or multi-vendor seller in a single atomic transaction.
- **Access**: Public
- **Request Body**:
  ```json
  {
    "full_name": "Aditi Sharma",
    "email": "aditi@example.com",
    "phone": "9876543210",
    "password": "secretpassword",
    "store_name": "Apex Electronics",
    "gst_no": "27ABCDE1234F1Z5"
  }
  ```
  *Note: Supplying `store_name` requires `gst_no` (15 uppercase alphanumeric characters), which atomically creates both `app_user` and `seller` rows.*
- **Response (201 Created)**:
  ```json
  {
    "user": {
      "user_id": 41,
      "full_name": "Aditi Sharma",
      "email": "aditi@example.com",
      "phone": "9876543210",
      "role": "seller"
    },
    "token": "eyJhbGciOi..."
  }
  ```

### `POST /auth/login`
Authenticates a user via bcrypt password hash and issues an 8-hour JWT.
- **Access**: Public
- **Request Body**:
  ```json
  {
    "email": "cust1@karthub.dev",
    "password": "secret1"
  }
  ```
- **Response (200 OK)**:
  ```json
  {
    "user": {
      "user_id": 10,
      "full_name": "Customer 1",
      "email": "cust1@karthub.dev",
      "phone": "9000000010",
      "role": "customer"
    },
    "token": "eyJhbGciOi..."
  }
  ```

---

## 3. Catalogue Routes (`/api`)

### `GET /categories`
Returns the recursive category hierarchy with subtree product counts computed via a recursive CTE.
- **Access**: Public
- **Response (200 OK)**:
  ```json
  [
    {
      "category_id": 1,
      "name": "Electronics",
      "parent_id": null,
      "products_in_subtree": "25"
    },
    {
      "category_id": 5,
      "name": "Mobiles",
      "parent_id": 1,
      "products_in_subtree": "7"
    }
  ]
  ```

### `GET /products`
Searches products with GIN full-text index matching, category subtree filtering, and price ranges.
- **Access**: Public
- **Query Parameters**:
  - `q` (string): Search query for product name and brand.
  - `category` (int): Category ID (includes all child/sub-categories).
  - `min` (numeric): Minimum price filter.
  - `max` (numeric): Maximum price filter.
  - `sort` (string): `price` (low to high), `rating` (high to low), or default ID.
  - `page` (int): Page number (size: 20).
- **Response (200 OK)**:
  ```json
  {
    "page": 1,
    "results": [
      {
        "product_id": 1,
        "name": "Smartphone Model 1",
        "brand": "Zenith",
        "description": "Sample product 1",
        "category": "Mobiles",
        "category_id": 5,
        "best_price": "239.00",
        "offers": 2,
        "avg_rating": "4.20",
        "reviews": 3
      }
    ]
  }
  ```

### `GET /products/:id`
Retrieves product details and overall customer rating.
- **Access**: Public
- **Response (200 OK)**:
  ```json
  {
    "product_id": 1,
    "name": "Smartphone Model 1",
    "brand": "Zenith",
    "description": "Sample product 1",
    "category": "Mobiles",
    "category_id": 5,
    "avg_rating": "4.20",
    "reviews": "3"
  }
  ```

### `GET /products/:id/offers`
Lists competitive price offers across all sellers for a single product.
- **Access**: Public
- **Response (200 OK)**:
  ```json
  [
    {
      "listing_id": 12,
      "price": "239.00",
      "stock_qty": 41,
      "seller_id": 3,
      "store_name": "Store 3",
      "is_verified": true,
      "seller_rating": "4.15"
    }
  ]
  ```

---

## 4. Shopping Cart Routes (`/api/cart`)

### `GET /cart`
Retrieves the logged-in customer's shopping cart lines and computed subtotal.
- **Access**: Protected (Customer)
- **Response (200 OK)**:
  ```json
  {
    "items": [
      {
        "listing_id": 12,
        "product_id": 1,
        "name": "Smartphone Model 1",
        "brand": "Zenith",
        "store_name": "Store 3",
        "price": "239.00",
        "quantity": 2,
        "line_total": "478.00",
        "stock_qty": 41,
        "is_active": true
      }
    ],
    "subtotal": 478.00
  }
  ```

### `PUT /cart`
Upserts an item quantity in the cart on composite key `(user_id, listing_id)`.
- **Access**: Protected (Customer)
- **Request Body**:
  ```json
  {
    "listing_id": 12,
    "quantity": 3
  }
  ```
- **Response (200 OK)**:
  ```json
  {
    "listing_id": 12,
    "quantity": 3
  }
  ```

### `DELETE /cart/:listingId`
Removes an item line from the cart.
- **Access**: Protected (Customer)
- **Response (204 No Content)**

---

## 5. Orders & Checkout (`/api/orders`)

### `GET /orders/coupon/:code`
Calculates discount and previews payable amount for a coupon code before placing an order.
- **Access**: Protected (Customer)
- **Query Parameters**: `subtotal` (numeric)
- **Response (200 OK)**:
  ```json
  {
    "code": "WELCOME10",
    "discount_pct": 10,
    "min_order_value": 500,
    "discount_amount": 50,
    "estimated_payable": 450
  }
  ```

### `POST /orders/checkout`
Workflow W1: Executes the checkout transaction via PostgreSQL stored procedure `sp_place_order`.
- **Access**: Protected (Customer)
- **Request Body**:
  ```json
  {
    "address_id": 1,
    "payment_method": "UPI",
    "coupon_code": "WELCOME10"
  }
  ```
- **Response (201 Created)**:
  ```json
  {
    "order_id": 151,
    "items": 2,
    "gross": 1000.00,
    "payable": 900.00,
    "payment_status": "SUCCESS"
  }
  ```

### `GET /orders`
Lists the customer's order history ordered by `placed_at DESC`.
- **Access**: Protected (Customer)
- **Response (200 OK)**:
  ```json
  [
    {
      "order_id": 151,
      "placed_at": "2026-11-08T02:00:00.000Z",
      "status": "PAID",
      "gross": "1000.00",
      "payable": "900.00",
      "active_gross": "1000.00",
      "active_payable": "900.00",
      "method": "UPI",
      "payment_amount": "900.00",
      "payment_status": "SUCCESS"
    }
  ]
  ```

### `GET /orders/:id`
Retrieves comprehensive details for a specific order, including line items and review eligibility.
- **Access**: Protected (Customer - Own order)
- **Response (200 OK)**:
  ```json
  {
    "order_id": 151,
    "placed_at": "2026-11-08T02:00:00.000Z",
    "status": "PAID",
    "coupon_code": "WELCOME10",
    "gross": "1000.00",
    "payable": "900.00",
    "active_gross": "1000.00",
    "active_payable": "900.00",
    "cancelled_gross": "0.00",
    "method": "UPI",
    "payment_amount": "900.00",
    "payment_status": "SUCCESS",
    "line1": "10, MG Road",
    "city": "Hyderabad",
    "state": "Telangana",
    "pincode": "500037",
    "items": [
      {
        "item_no": 1,
        "product_id": 1,
        "name": "Smartphone Model 1",
        "brand": "Zenith",
        "store_name": "Store 3",
        "quantity": 1,
        "unit_price": "500.00",
        "line_total": "500.00",
        "item_status": "PENDING",
        "reviewed": false,
        "review_rating": null
      }
    ]
  }
  ```

### `POST /orders/:id/items/:n/cancel`
Cancels a PENDING order line via PostgreSQL stored procedure `sp_cancel_item`.
- **Database Trigger**: `trg_restore_stock` automatically returns the item quantity to `listing.stock_qty`.
- **Access**: Protected (Customer - Own order)
- **Response (200 OK)**:
  ```json
  {
    "order_id": 151,
    "item_no": 1,
    "item_status": "CANCELLED",
    "order_cancelled": true
  }
  ```

---

## 6. Review Routes (`/api/reviews`)

### `POST /reviews`
Submits a rating (1-5) and comment for a purchased line item.
- **Database Trigger**: `trg_review_delivered` ensures the item status is `DELIVERED`.
- **Access**: Protected (Customer)
- **Request Body**:
  ```json
  {
    "order_id": 151,
    "item_no": 1,
    "rating": 5,
    "comment": "Super fast delivery and pristine condition."
  }
  ```
- **Response (201 Created)**:
  ```json
  {
    "review_id": 81,
    "order_id": 151,
    "item_no": 1,
    "rating": 5,
    "comment": "Super fast delivery and pristine condition.",
    "created_at": "2026-11-08T02:05:00.000Z"
  }
  ```

### `DELETE /reviews/:id`
Permanently deletes a review authored by the authenticated customer (204 No Content). Once deleted, the customer is free to submit a new review for that delivered order item.
- **Access**: Protected (Customer)

---

## 7. Address Book Routes (`/api/addresses`)

- **Access:** Protected (Customer)
- `GET /addresses`: Lists user's saved addresses (`is_default DESC`).
- `POST /addresses`: Creates address `{ line1, city, state, pincode, is_default? }`.
- `PUT /addresses/:id`: Updates address fields or sets default.
- `DELETE /addresses/:id`: Removes address (blocked with 409 if referenced by existing orders).

---

## 8. Seller Hub Routes (`/api/seller`)

### `GET /seller/listings`
Lists all products offered by the authenticated seller.
- **Access**: Protected (`role: seller`)

### `POST /seller/listings`
Creates an active listing for a catalogue product.
- **Access**: Protected (`role: seller`)
- **Request Body**:
  ```json
  {
    "product_id": 1,
    "price": 1299.00,
    "stock_qty": 20
  }
  ```

### `PUT /seller/listings/:id`
Updates price, stock, or toggles visibility (`is_active`).
- **Access**: Protected (`role: seller`)

### `DELETE /seller/listings/:id`
Permanently removes un-ordered listing (204 No Content). If the listing has historical order lines, it deactivates the listing (`is_active = FALSE`) and returns 200 OK with explanatory message.
- **Access**: Protected (`role: seller`)

### `GET /seller/order-items`
Lists order lines containing this seller's products, including shipping destinations.
- **Access**: Protected (`role: seller`)

### `PUT /seller/order-items/:order/:item`
Advances line status: `PENDING -> SHIPPED -> DELIVERED`.
- Automatically rolls up parent `orders.status`.
- Settles COD payments to `SUCCESS` upon full order delivery.
- **Access**: Protected (`role: seller`)
- **Request Body**:
  ```json
  {
    "status": "SHIPPED"
  }
  ```

### `GET /seller/dashboard`
Returns seller KPI cards, monthly revenue, best-selling products, low-stock alerts, and category rank computed via window function `RANK() OVER (PARTITION BY category_id ORDER BY revenue DESC)`.
- **Access**: Protected (`role: seller`)

---

## 9. Admin Routes (`/api/admin`)

- `GET /admin/summary`: Platform-wide totals (users, sellers, products, orders, GMV).
- `GET /admin/sellers`: Lists sellers with verification status.
- `PUT /admin/sellers/:id/verify`: Toggles seller `is_verified` `{ is_verified: true | false }`.
- `GET /admin/coupons`: Lists promotional coupons and current usage counts.
- `POST /admin/coupons`: Creates a coupon `{ code, discount_pct, min_order_value, valid_from, valid_to, max_uses }`.
- `DELETE /admin/coupons/:code`: Deletes unused coupon (200 OK). Blocked with 409 Conflict if historical orders reference it.
- `POST /admin/categories`: Adds category to catalogue `{ name, parent_id? }` (cycle checked by `trg_category_cycle`).
- `DELETE /admin/categories/:id`: Deletes empty category (200 OK). Blocked with 409 Conflict if category contains products.
- `GET /admin/products`: Lists catalogue products with category name and total listings count.
- `POST /admin/products`: Adds new product to shared catalogue `{ category_id, name, brand?, description? }`.
- `DELETE /admin/products/:id`: Deletes unlisted product (200 OK). Blocked with 409 Conflict if active or past listings reference it.

