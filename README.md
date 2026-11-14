# KartHub: Multi-Vendor E-Commerce Marketplace

DBMS Course Project (BITS Pilani, Hyderabad) · **Team 24**

KartHub is a production-grade multi-vendor e-commerce marketplace where independent sellers list and fulfill items from a unified, shared catalogue. Customers search and compare prices across competing sellers, combine items from multiple vendors into a single shopping cart, execute an atomic checkout with row-level transaction safety, apply promotional coupons, track and cancel individual order lines with instant stock replenishment, and submit verified reviews upon delivery.

The database design is the architectural foundation of the project: all business rules, relational invariants, and integrity guarantees reside in **PostgreSQL 15+** (using CHECK constraints, partial unique indexes, composite foreign keys, deferred constraint triggers, stored procedures, and views). The Node.js/Express backend and modern React frontend serve as responsive, transparent layers over the database without the opacity or overhead of an ORM.

---

## Team

| Name | ID |
|---|---|
| Vedansh Singh | 2024A3PS0432H |
| Yashavanth | 2024A7PS0006H |
| Rashi Tripathi | 2024A3PS0412H |
| Prashant Kadam | *(add ID)* |

---

## Key Highlights & Design Decisions

- **Modern Hodo Stays-Inspired UI**: Clean, warm-stone aesthetic (`#F9F6F0` palette), curated category collections, simplified navigation, responsive layout, and visual feedback for cart, checkout, seller hub, and admin management.
- **Zero-ORM Philosophy**: Every query across all 25+ API endpoints is hand-crafted parameterised SQL (`$1, $2, ...`), preventing SQL injection while maintaining complete visibility into query plans and transaction boundaries.
- **Database-Enforced Integrity**: Invariants are guaranteed by the database engine itself. Even direct `psql` inserts or concurrent updates cannot violate business rules like negative stock, category cycles, or premature reviews.
- **Atomic Multi-Vendor Checkout**: Checked out via the stored procedure `sp_place_order` inside a `withTx()` transaction block. Order lines lock active listings in consistent primary key order to eliminate deadlocks, verify stock, apply coupon limits, create payment records, deduct stock, and empty the user's cart atomically.
- **Drain-to-Empty Robustness**: Tested rigorously across cart clearing, stock exhaustion to 0, address deletion with default rollover, review removal with rating recalculation, and category/product deletion constraints.
- **Exhaustive Testing (785 Tests Total)**: Verified by 57 PostgreSQL database tests, 56 API integration smoke tests, 68 drain-and-edge invariant tests, and a 604-case automated fuzzing and boundary test suite.

---

## Technology Stack

| Layer | Technology | Details |
|---|---|---|
| **Frontend** | React 18, React Router 6, Vite 5 | Luxury minimalist design, CSS modular styling, native `fetch` client, zero UI component bloat |
| **Backend** | Node.js 18+ / 22, Express 4 | JWT authentication (`jsonwebtoken`), bcrypt password hashing (`bcryptjs`), connection pool (`pg`), CORS, zero ORM |
| **Database** | PostgreSQL 15 / 16 | Schema `karthub`, procedural SQL (PL/pgSQL), full-text search (`tsvector`), CTEs, window functions |

---

## Repository Layout

```
karthub/
├── README.md                           Project overview, setup, architecture, and testing guide
├── .gitignore                          Ignores node_modules, .env, and build artifacts
├── db/
│   ├── schema.sql                      12 tables, indexes, v_order_total view, triggers
│   ├── integrity.sql                   Advanced business rules: coupon limits, address ownership, category cycles
│   ├── procedures.sql                  Atomic stored procedures: sp_place_order, sp_cancel_item
│   ├── bulk_test_data.sql              ~1,160 rows of realistic demo seed data
│   ├── dev_seed.sql                    Minimal lightweight seed data for quick local testing
│   ├── setup.sql                       Master script: drops, creates schema, rules, procedures, and seed data
│   ├── queries.sql                     The six complex SQL queries (Q1–Q6)
│   ├── tests.sql                       57 automated PostgreSQL integrity tests (runs in self-rolling transaction)
│   └── explain.sql                     EXPLAIN ANALYZE execution plan benchmarking with/without indexes
├── backend/
│   ├── package.json                    Scripts: start, dev, test, test:edge, test:stress, test:all
│   ├── .env.example                    Environment template (PORT, DATABASE_URL, JWT_SECRET)
│   ├── src/
│   │   ├── server.js                   Express app, route mounting, SQLSTATE-to-HTTP error mapping
│   │   ├── db.js                       PostgreSQL connection pool, query() and withTx() helpers
│   │   ├── auth.js                     JWT generation, password hashing, requireAuth, requireRole
│   │   ├── errors.js                   HttpError class and wrap() async handler
│   │   └── routes/                     auth, catalogue, cart, orders, seller, reviews, addresses, admin
│   └── tests/
│       ├── smoke.mjs                   56 integration smoke checks covering full user/seller/admin lifecycles
│       ├── edge_cases.mjs              68 edge case checks (drain-to-empty, zero stock, cascade/restrict)
│       └── stress_edge_cases_600.mjs   604 automated fuzzing, boundary, and concurrency test cases
├── frontend/
│   ├── package.json, vite.config.js    Vite 5 configuration with API reverse proxying to port 4000
│   ├── index.html                      HTML root with responsive viewport and Google Fonts
│   └── src/
│       ├── main.jsx, App.jsx           Router configuration, responsive navigation bar, role-based guards
│       ├── api.js, ui.jsx              API fetch wrapper with token storage; shared UI widgets and modals
│       └── pages/                      Shop, Auth, Cart, Orders, Seller, Admin
└── docs/
    ├── API.md                          Complete REST API specification and request/response contracts
    └── explain_results.txt             Recorded EXPLAIN ANALYZE query plans and index benchmarks
```

---

## Setup & Installation

### Prerequisites

| Tool | Recommended Version | Verification Command |
|---|---|---|
| **Node.js** | 18.x or 20.x+ (LTS) | `node --version` |
| **PostgreSQL** | 15.x or 16.x | `psql --version` |
| **Git** | Recent version | `git --version` |

*Windows Note*: Ensure PostgreSQL's `bin` folder (e.g. `C:\Program Files\PostgreSQL\16\bin`) is in your system `Path`.

---

### Step 1: Clone the Repository

```bash
git clone https://github.com/vedanshehe/Karthub-.git karthub
cd karthub
```

---

### Step 2: Initialize PostgreSQL Database

Start PostgreSQL, open your terminal at the repository root, and run:

**Windows (PowerShell / CMD):**
```powershell
psql -U postgres -c "CREATE DATABASE karthub;"
psql -U postgres -d karthub -P pager=off -f db/setup.sql
```

**macOS / Linux:**
```bash
createdb karthub
psql -d karthub -P pager=off -f db/setup.sql
```

> **Note:** `db/setup.sql` automatically drops the schema `karthub CASCADE`, recreates all 12 tables, indexes, triggers, stored procedures, and seeds ~1,160 rows. The terminal will output `TOTAL | 1163` upon completion.

---

### Step 3: Configure and Start the Backend

1. Navigate to `backend/` and create your `.env` file:
   ```bash
   cd backend
   cp .env.example .env     # On Windows: copy .env.example .env
   ```

2. Edit `.env` with your PostgreSQL password:
   ```env
   PORT=4000
   DATABASE_URL=postgres://postgres:YOUR_PASSWORD@localhost:5432/karthub
   JWT_SECRET=super-secret-karthub-token-key-2026
   ```
   *(If your password contains special characters like `@` or `#`, URL-encode them as `%40` or `%23`.)*

3. Install dependencies and start the server:
   ```bash
   npm install
   npm run dev              # Starts with hot-reload on http://localhost:4000
   ```

---

### Step 4: Start the Frontend

Open a second terminal window:

```bash
cd frontend
npm install
npm run dev
```

Visit **`http://localhost:5173`** in your browser. The Vite development server automatically proxies `/api/*` calls to the Node backend on port 4000.

---

## Demo Accounts

All pre-seeded demo accounts share the password **`secret1`**.

| Role | Email | Capabilities |
|---|---|---|
| **Customer** | `cust1@karthub.dev` ... `cust31@karthub.dev` | Browse catalogue, add to cart, apply coupons, place orders, cancel items, write reviews |
| **Seller** | `seller1@karthub.dev` ... `seller8@karthub.dev` | Manage product listings, update prices & stock, fulfill order items, inspect analytics |
| **Admin** | `admin@karthub.dev` | Platform KPI telemetry, verify sellers, issue coupons, manage categories & products |

### Promotional Coupons

| Coupon Code | Discount | Minimum Order | Usage Limit | Status |
|---|:---:|:---:|:---:|:---:|
| `WELCOME10` | 10% | ₹500 | 100 | Active |
| `FESTIVE15` | 15% | ₹2,000 | 50 | Active |
| `BIGSALE20` | 20% | ₹5,000 | 25 | Active |
| `EXPIRED5` | 5% | ₹100 | 10 | Expired (Trigger refuses) |
| `USEDUP25` | 25% | ₹500 | 1 | Exhausted (Trigger refuses) |

---

## Comprehensive Test Suites

KartHub includes **785 automated test checks** across four dedicated suites verifying every layer of database integrity, API contract adherence, drain-to-empty edge cases, and concurrency resilience.

| Test Suite | File Location | Check Count | Execution Command | Result |
|---|---|:---:|---|:---:|
| **Database Integrity** | `db/tests.sql` | **57** | `psql -U postgres -d karthub -P pager=off -f db/tests.sql` | **57 Passed, 0 Failed** |
| **API Smoke & Lifecycle** | `backend/tests/smoke.mjs` | **56** | `npm test` *(in `backend/` with admin credentials)* | **56 Passed, 0 Failed** |
| **Drain-to-Empty & Edge Cases** | `backend/tests/edge_cases.mjs` | **68** | `npm run test:edge` *(in `backend/`)* | **68 Passed, 0 Failed** |
| **Extensive Stress & Fuzzing (600+)** | `backend/tests/stress_edge_cases_600.mjs` | **604** | `npm run test:stress` *(in `backend/`)* | **604 Passed, 0 Failed** |
| **TOTAL** | | **785** | `npm run test:all` *(runs all 3 Node suites)* | **All Checks Passed** |

### Running the 600+ Edge Cases Suite
```bash
cd backend
npm run test:stress
```
This suite covers:
1. **Auth & Registration Fuzzing (130 tests)**: RFC email compliance, boundary passwords, phone digit formats, seller GST rules, case-insensitivity, malformed JWTs, RBAC matrix across customer/seller/admin/anonymous callers.
2. **Catalogue, Search & Taxonomy (90 tests)**: Recursive category CTEs, search fuzzing, English stopword handling, price boundary sweeps, sort orders, and pagination bounds.
3. **Cart Engine & Precision Mathematics (70 tests)**: Quantity bounds, boolean type rejection, multi-item carts, subtotal precision, and removing items until completely empty.
4. **Address Management & Default Rollover (60 tests)**: Payload validation, default address rollover on deletion, cross-user isolation, and `FK RESTRICT` on ordered addresses.
5. **Order Placement & Concurrency (70 tests)**: Payment method whitelists, atomic stock reduction, race conditions on the final stock unit (`409 Conflict`), and zero-stock checkout rejection.
6. **Order Cancellation & Stock Restoration (60 tests)**: Status transitions, atomic stock restoration back to listing, double-cancellation prevention, and cross-user attack rejection.
7. **Seller Fulfillment Workflow (60 tests)**: State machine enforcement (`PLACED` -> `SHIPPED` -> `DELIVERED`), seller item isolation, and automatic order rollup.
8. **Coupon Engine & Exhaustion (50 tests)**: 1%–90% discount limits, minimum order barriers, code length limits, exhaustion down to 0, and cancellation revival.
9. **Review Scale & Deletion (50 tests)**: Delivery requirement trigger enforcement, 1–5 scale checks, unique constraints, and rating recalculation down to 0 reviews (`null` rating).
10. **Admin Governance & Cascade Deletions (50 tests)**: Category deletion with products rejected (409), product deletion with listings rejected (409), and `ON DELETE SET NULL` on subcategories.
11. **Deep System Purge Sweeps (100 tests)**: Sequential additions and drain-to-empty removals across carts, listings, coupons, and products.

---

## Database Architecture

### 12 Relational Tables (`karthub` schema)

1. `app_user`: Core platform identities (customer, seller, admin) with unique email and 10-digit phone.
2. `seller`: Subtype ISA relationship linking to `app_user` with GST and store branding.
3. `address`: Customer shipping addresses with 6-digit Indian PIN codes and single-default partial unique index.
4. `category`: Self-referencing hierarchical category tree with cycle-prevention trigger.
5. `product`: Seller-independent catalogue item with brand and full-text GIN search vectors.
6. `listing`: Multi-vendor offers tying seller to product with price, stock quantity, and active flag.
7. `cart_item`: User shopping carts with composite primary key `(user_id, listing_id)`.
8. `coupon`: Promotional discount codes with validity dates, minimum order value, and usage caps.
9. `orders`: High-level order entity with delivery address reference, status, and coupon linkage.
10. `order_item`: Weak entity line items `(order_id, item_no)` storing price-at-purchase and fulfillment status.
11. `payment`: Payment records with method (`UPI`, `CARD`, `NETBANKING`, `COD`) and amount validation.
12. `review`: Customer ratings (1–5) and feedback, restricted exclusively to delivered items.

### Core Integrity Guarantees

| Rule / Invariant | Enforcement Mechanism |
|---|---|
| Non-negative stock & positive pricing | `CHECK (stock_qty >= 0)`, `CHECK (price > 0)` |
| Unique listing per seller per product | `UNIQUE (seller_id, product_id)` |
| Single default address per customer | Partial unique index `CREATE UNIQUE INDEX uq_one_default_addr ON address(user_id) WHERE is_default = TRUE` |
| Order ships only to customer's own address | Composite foreign key `FOREIGN KEY (address_id, user_id) REFERENCES address(address_id, user_id)` |
| Reviews restricted to delivered items | Trigger `trg_review_delivered` (rejects non-delivered reviews with SQLSTATE `P0001`) |
| Stock restored exactly once on cancel | Trigger `trg_restore_stock` (guards against double cancellation or refund transitions) |
| Coupon validity and usage exhaustion | Trigger `trg_coupon_valid` (locks coupon row, checks expiry and max uses) |
| Order minimum for coupon discount | Deferred constraint trigger `trg_coupon_min` (evaluated at `COMMIT` across all order lines) |
| Payment amount equals order payable | Deferred constraint trigger `trg_payment_amount` (checked at `COMMIT`) |
| Acyclic category hierarchy | Trigger `trg_category_cycle` (walks parent tree to prevent circular references) |
| Historical order preservation | `ON DELETE RESTRICT` on `orders`, `order_item`, `address`, `coupon`, `product` |

---

## Complex SQL Queries (Q1–Q6)

Implemented in `db/queries.sql` and leveraged across backend analytics and search:

- **Q1: Multi-Vendor Search & Ranking**: Combines GIN full-text index search on product names and brands with `LEFT JOIN` on active listings to retrieve the minimum in-stock price, number of competing sellers, and average customer rating.
- **Q2: Recursive Category Hierarchy with Rollup**: Uses recursive Common Table Expressions (`WITH RECURSIVE`) to traverse category parent-child trees and aggregate total catalogue product counts across all subtrees.
- **Q3: Seller Performance & Window Ranking**: Calculates monthly seller revenue and utilizes `RANK() OVER (PARTITION BY category_id ORDER BY revenue DESC)` to rank sellers within their product categories.
- **Q4: Category Best-Sellers**: Computes total units sold per product using window functions and joins across `order_item` lines to identify top-performing products per category.
- **Q5: Correlated Price Premium Analysis**: Uses correlated subqueries to surface listings priced more than 15% above the platform average for that specific product catalogue item.
- **Q6: Platform Anomaly Detection**: Employs `HAVING` and aggregate subqueries to identify high-volume multi-vendor buyers (customers buying from 3+ sellers) alongside sellers whose ratings fall below the marketplace average.

---

## REST API Overview

Base URL: `http://localhost:4000/api`. Detailed documentation available in **[`docs/API.md`](docs/API.md)**.

| Domain | Method & Endpoint | Access | Purpose |
|---|---|:---:|---|
| **Auth** | `POST /auth/register` | Public | Register customer or seller atomically |
| | `POST /auth/login` | Public | Authenticate with bcrypt and receive JWT |
| **Catalogue** | `GET /categories` | Public | Fetch recursive category tree with counts |
| | `GET /products` | Public | Search products with min price & rating |
| | `GET /products/:id/offers` | Public | Compare competing seller listings for a product |
| **Cart** | `GET /cart` | Customer | Fetch cart items, live prices, and subtotal |
| | `PUT /cart` | Customer | Add or update listing quantity |
| | `DELETE /cart/:listingId` | Customer | Remove specific listing from cart |
| **Addresses** | `GET /addresses` | Customer | List saved delivery addresses |
| | `POST /addresses` | Customer | Add new address with PIN validation |
| | `PUT /addresses/:id` | Customer | Update address or toggle default flag |
| | `DELETE /addresses/:id` | Customer | Remove address (`FK RESTRICT` if ordered) |
| **Orders** | `POST /orders/checkout` | Customer | Atomic checkout via `sp_place_order` |
| | `GET /orders` | Customer | View customer order history |
| | `GET /orders/:id` | Customer | View detailed order lines and payment status |
| | `POST /orders/:id/items/:n/cancel` | Customer | Cancel line item via `sp_cancel_item` |
| **Reviews** | `POST /reviews` | Customer | Post 1–5 star review for delivered item |
| | `DELETE /reviews/:id` | Customer | Delete review and recalculate rating |
| **Seller** | `GET /seller/listings` | Seller | Manage seller listings, prices, and stock |
| | `POST /seller/listings` | Seller | Create new listing for catalogue item |
| | `PUT /seller/listings/:id` | Seller | Update price or stock level |
| | `DELETE /seller/listings/:id` | Seller | Delete un-ordered listing or deactivate |
| | `GET /seller/order-items` | Seller | View items awaiting fulfillment |
| | `PUT /seller/order-items/:order/:item` | Seller | Advance status (`PENDING` -> `SHIPPED` -> `DELIVERED`) |
| | `GET /seller/dashboard` | Seller | Analytics, monthly GMV, low stock, rank |
| **Admin** | `GET /admin/summary` | Admin | Platform-wide KPIs (GMV, orders, users) |
| | `GET /admin/sellers` | Admin | List sellers and verification status |
| | `PUT /admin/sellers/:id/verify` | Admin | Toggle seller verified badge |
| | `GET /admin/coupons` | Admin | List active and historical coupons |
| | `POST /admin/coupons` | Admin | Create new promotional coupon |
| | `DELETE /admin/coupons/:code` | Admin | Delete unused coupon (`FK RESTRICT` if used) |
| | `POST /admin/categories` | Admin | Add category (cycle checked) |
| | `DELETE /admin/categories/:id` | Admin | Delete empty category (`FK RESTRICT` if products) |
| | `GET /admin/products` | Admin | List products with listing counts |
| | `POST /admin/products` | Admin | Add product to shared catalogue |
| | `DELETE /admin/products/:id` | Admin | Delete unlisted product (`FK RESTRICT` if listed) |

---

## Member Contributions

### Mid-Semester Phase
- **Yashavanth**: ER/EER relational design, baseline `schema.sql` definition.
- **Vedansh Singh**: Application architecture, backend skeleton, and query structures.
- **Rashi Tripathi**: Seed data plan, initial README documentation, UI wireframing.

### Final Phase
- **Yashavanth (2024A7PS0006H)**: Relational database schema architecture and normalization (12 tables), composite foreign key constraints (address ownership isolation), partial unique indexing (`uq_one_default_addr`), trigger rules (`trg_category_cycle`, `trg_review_delivered`, `trg_restore_stock`), automated database test suite (`db/tests.sql` — 57 tests), comprehensive 600+ edge case fuzzing and drain-to-empty test suite (`stress_edge_cases_600.mjs`, `edge_cases.mjs`), database error code mapping (`22001`, `23505`, `23514`), input type sanitization, and Hodo Stays UI frontend design revamp.
- **Vedansh Singh (2024A3PS0432H)**: Backend REST API architecture & service routing (auth, catalogue, cart, orders, seller hub, admin controls), atomic transaction blocks (`withTx()`), PostgreSQL stored procedures (`sp_place_order`, `sp_cancel_item`), complex analytical SQL queries (Q1–Q6 with recursive CTEs and window ranking), integration smoke testing (`smoke.mjs`), and EXPLAIN ANALYZE query plan benchmarking.
- **Rashi Tripathi (2024A3PS0412H)**: Seed data modeling & realistic generation (`bulk_test_data.sql` with ~1,160 rows), REST API contract specification (`docs/API.md`), user persona testing, and project documentation.
- **Prashant Kadam**: Test execution validation, manual boundary scenario testing, query performance verification, and final submission reporting.

---

## AI Assistance Disclosure

AI tools (Claude / Google Antigravity) were utilized for assistance in boilerplate generation, test case scaffolding, and debugging. Every SQL query, constraint trigger, API endpoint, and UI component was executed, tested, and validated locally against the live PostgreSQL database engine.
