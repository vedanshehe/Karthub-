# KartHub: Multi-Vendor E-Commerce Marketplace

DBMS course project (BITS Pilani, Hyderabad) · **Team 24**

KartHub is a marketplace where many independent sellers sell products from one shared catalogue. Customers search, compare each seller's price, put items from several sellers into one cart, place a single order, pay (simulated), cancel items and review delivered ones. Sellers manage listings, fulfil orders and see analytics. An admin verifies sellers and creates coupons.

The database design is the core of the project: integrity rules live in PostgreSQL (constraints, triggers, a view, stored procedures), and the API and UI are thin layers on top.

## Team

| Name | ID |
|---|---|
| Vedansh Singh | 2024A3PS0432H |
| Yashavanth | 2024A7PS0006H |
| Rashi Tripathi | 2024A3PS0412H |
| Prashant Kadam | *(add ID)* |

Contributions are listed at the end of this file.

## Technology stack

| Layer | Technology | Notes |
|---|---|---|
| Frontend | React 18, React Router 6, Vite 5 | Plain CSS, `fetch`; no UI library |
| Backend | Node.js (tested on 22) with Express 4 | JWT login (`jsonwebtoken`), `bcryptjs` password hashing, `pg` driver, `dotenv`, `cors`. **No ORM**: every SQL statement is hand-written and visible |
| Database | PostgreSQL 15 or later (tested on 16) | Schema name `karthub` |

## What you need to install

| Tool | Version | Download | Check it works |
|---|---|---|---|
| Node.js (includes npm) | 18 or newer | https://nodejs.org (LTS) | `node --version` |
| PostgreSQL (include **Command Line Tools**) | 15 or newer | https://www.postgresql.org/download/ | `psql --version` |
| Git | any recent | https://git-scm.com | `git --version` |

All JavaScript packages install automatically with `npm install` (see "Setup"). Nothing is installed globally.

**Windows:** if `psql` is "not recognized", add PostgreSQL's `bin` folder to your PATH for the current window:
`$env:Path += ";C:\Program Files\PostgreSQL\16\bin"` (use your version number), or add it permanently in Windows Settings > Environment Variables > Path.

## Repository layout

```
karthub/
├── README.md
├── .gitignore                    ignores .env and node_modules
├── db/
│   ├── schema.sql                12 tables, indexes, view v_order_total, triggers (recreates the whole schema)
│   ├── integrity.sql             extra rules: coupon, address ownership, seller role, payment amount, category cycles
│   ├── procedures.sql            sp_place_order, sp_cancel_item
│   ├── bulk_test_data.sql        about 1,160 rows of demo data (all valid)
│   ├── dev_seed.sql              tiny seed (4 categories, 4 products), alternative to bulk_test_data.sql
│   ├── setup.sql                 runs the four files above in the right order
│   ├── queries.sql               the six SQL queries Q1-Q6
│   ├── tests.sql                 41 database integrity tests (rolls itself back)
│   └── explain.sql               EXPLAIN ANALYZE: plans with and without each index
├── backend/
│   ├── package.json              scripts: start, dev, test
│   ├── .env.example              copy to .env and edit
│   ├── src/
│   │   ├── server.js             app setup, route mounting, DB error -> HTTP status mapping
│   │   ├── db.js                 connection pool, query() and withTx() (BEGIN/COMMIT/ROLLBACK)
│   │   ├── auth.js               JWT sign, requireAuth, requireRole
│   │   ├── errors.js             HttpError and wrap() for async routes
│   │   └── routes/               auth, catalogue, cart, orders, seller, reviews, addresses, admin
│   └── tests/smoke.mjs           25 end-to-end API checks
├── frontend/
│   ├── package.json, vite.config.js, index.html
│   └── src/
│       ├── main.jsx, App.jsx     entry point, navigation, role-based routes
│       ├── api.js, ui.jsx        fetch helper + login storage; small shared components and hooks
│       └── pages/                Auth, Shop, Cart, Orders, Seller, Admin
└── docs/
    ├── API.md                    request/response contract for every endpoint
    └── explain_results.txt       saved EXPLAIN ANALYZE output
```

## Setup (first time)

Run all commands from a terminal (PowerShell on Windows). Replace paths and passwords with your own.

### 1. Get the code

```
git clone https://github.com/vedanshehe/Karthub-.git karthub
cd karthub
```

### 2. Create the database and load everything

Make sure PostgreSQL is running. Then, from the **repository root**:

```
# Windows (the postgres user and the password you chose when installing PostgreSQL)
psql -U postgres -c "CREATE DATABASE karthub;"
psql -U postgres -d karthub -f db/setup.sql

# macOS / Linux
createdb karthub
psql -d karthub -f db/setup.sql
```

This creates the tables, the extra rules, the stored procedures and about 1,160 rows of demo data. **`setup.sql` erases and recreates the `karthub` schema every time**, so use it to reset the data too. The last table printed should end with `TOTAL | 1163`.

If psql shows `-- More --` and waits, press `q`, or add `-P pager=off` to the command.

### 3. Configure and start the backend

```
cd backend
copy .env.example .env          # macOS/Linux: cp .env.example .env
```

Edit `backend/.env`:

```
PORT=4000
DATABASE_URL=postgres://postgres:YOUR_PASSWORD@localhost:5432/karthub
JWT_SECRET=any-long-random-string
```

If your password contains special characters, URL-encode them in `DATABASE_URL` (for example `@` becomes `%40`, `#` becomes `%23`). **Never commit `.env`**; it is in `.gitignore`.

```
npm install
npm start                       # API on http://localhost:4000, health check at /api/health
```

(`npm run dev` restarts the server automatically when you edit a file.)

### 4. Start the frontend (second terminal)

```
cd frontend
npm install
npm run dev
```

Open **http://localhost:5173**. The Vite dev server forwards every `/api/...` request to the backend on port 4000 (see `frontend/vite.config.js`), so there is nothing else to configure. Keep both terminals running.

## Demo accounts

All passwords are `secret1`.

| Role | Email |
|---|---|
| Customer | `cust1@karthub.dev` ... `cust31@karthub.dev` |
| Seller | `seller1@karthub.dev` ... `seller8@karthub.dev` |
| Admin | `admin@karthub.dev` |

Coupons in the demo data: `WELCOME10` (10%, min 500), `FESTIVE15` (15%, min 2000), `BIGSALE20` (20%, min 5000), `EXPIRED5` (expired, always refused), `USEDUP25` (limit reached, always refused).

Registering through the UI always creates a customer, or a seller if you tick "Register as a seller". An admin can only be created in the database: `UPDATE karthub.app_user SET role='admin' WHERE email='you@example.com';` (the user must not be a seller).

## Testing

| What | Command (run from) | Expected |
|---|---|---|
| Database integrity (41 tests) | `psql -U postgres -d karthub -P pager=off -f db/tests.sql` (repo root) | `passed 41, failed 0`. Rolls back, so data is untouched |
| The six SQL queries | `psql -U postgres -d karthub -P pager=off -f db/queries.sql` (repo root) | Result tables for Q1-Q6 |
| EXPLAIN ANALYZE evidence | `psql -U postgres -d karthub -o docs/explain_results.txt -f db/explain.sql` (repo root) | Plans with and without each index; data unchanged |
| API end-to-end (25 checks) | `npm test` (in `backend/`, API must be running) | `All checks passed` |
| API including admin checks | PowerShell: `$env:ADMIN_EMAIL="admin@karthub.dev"; $env:ADMIN_PASSWORD="secret1"; npm test` | Three extra PASS lines |

`npm test` creates its own users and listing each run, using product id 1 (set `PRODUCT_ID` to change it). Re-run `db/setup.sql` any time you want a clean slate.

## The three workflows (try them in the browser)

**W1: Checkout (transaction, row locks).** Log in as a customer, search "smartphone", open **Compare offers**, add to cart, choose address and payment, place the order. One transaction locks the listing rows (in id order, so two checkouts cannot deadlock), checks stock and coupon, inserts the order, its lines (with the price copied) and the payment, reduces stock and empties the cart. Race test: put the last unit of a listing in two customers' carts and check out in two browser windows; exactly one succeeds and the other gets "Only 0 left", with nothing half-written.

**W2: Search and analytics (joins, GROUP BY/HAVING, full-text index, recursive CTE, window functions).** Filter by text, category (including sub-categories) and price; each product shows its cheapest in-stock offer, offer count and average rating. Log in as a seller to see revenue by month, best sellers, low stock, ratings per listing and rank among sellers in each category.

**W3: Integrity (the database refuses bad data).** Try an oversized quantity, an expired or used-up coupon, cancelling an item twice (stock returns exactly once), reviewing an undelivered item, or reviewing an item twice. `db/tests.sql` shows the exact database error for each rule.

## Database design summary

**12 tables:** `app_user`, `seller` (ISA of user), `address`, `category` (self-referencing tree), `product` (seller-independent catalogue), `listing` (seller x product with price and stock), `cart_item`, `coupon`, `orders`, `order_item` (weak entity, key `(order_id, item_no)`), `payment`, `review`.

**Rules enforced by PostgreSQL itself**

| Rule | Mechanism |
|---|---|
| Stock never below zero; no double listing; positive prices; rating 1-5; phone and pincode formats; status and payment-method values | CHECK, UNIQUE, NOT NULL |
| One default address per user | Partial unique index `uq_one_default_addr` |
| Order ships only to the buyer's own address | Composite foreign key `(address_id, user_id)` |
| Reviews only for delivered items, once per item | Trigger `trg_review_delivered` + UNIQUE `(order_id, item_no)` |
| Stock returns exactly once on cancel or return | Trigger `trg_restore_stock` |
| Coupon valid today, usage limit not exceeded (coupon row locked) | Trigger `trg_coupon_valid` (insert and update) |
| Coupon minimum order value | Deferred constraint trigger `trg_coupon_min` (checked at COMMIT, when the lines exist) |
| `role = 'seller'` exactly when a seller row exists | Deferred constraint triggers `trg_role_seller_row`, `trg_role_user_row` |
| `payment.amount` equals the order's payable amount | Deferred constraint trigger `trg_payment_amount` |
| No category cycles of any length | Trigger `trg_category_cycle` |

**View:** `v_order_total` (gross and payable per order, so totals are never stored twice).
**Indexes:** `(product_id, price)` on listing, `(user_id, placed_at DESC)` on orders, GIN full-text on product name and brand.
**Stored procedures:** `sp_place_order(user, address, method, coupon)` and `sp_cancel_item(user, order, item)`. They do in one atomic database call what the API routes do. Try them in psql: `SELECT * FROM karthub.sp_place_order(10, 1, 'UPI', NULL);`.
**SQL queries (db/queries.sql):** Q1 search with cheapest offer and rating; Q2 category tree with subtree counts (recursive CTE); Q3 monthly seller revenue and category rank (window function); Q4 best-selling product per category; Q5 listings above their product's average price (correlated subquery); Q6 customers who bought from 3+ sellers and sellers rated below the platform average (HAVING, subquery).

## REST API

Base URL `http://localhost:4000/api`. JWT in the `Authorization: Bearer <token>` header. Full request and response examples are in **[docs/API.md](docs/API.md)**.

| Area | Endpoints |
|---|---|
| Auth | `POST /auth/register`, `POST /auth/login` |
| Catalogue | `GET /categories`, `GET /products`, `GET /products/:id/offers` |
| Cart | `GET /cart`, `PUT /cart`, `DELETE /cart/:listingId` |
| Addresses | `GET/POST /addresses`, `PUT/DELETE /addresses/:id` |
| Orders | `POST /orders/checkout`, `GET /orders`, `GET /orders/:id`, `POST /orders/:id/items/:n/cancel` |
| Reviews | `POST /reviews` |
| Seller | `GET/POST /seller/listings`, `PUT /seller/listings/:id`, `GET /seller/catalogue`, `GET /seller/order-items`, `PUT /seller/order-items/:order/:item`, `GET /seller/dashboard` |
| Admin | `GET /admin/sellers`, `PUT /admin/sellers/:id/verify`, `GET/POST /admin/coupons` |

Database errors map to HTTP codes in `backend/src/server.js`: unique, check and foreign-key violations return 409, trigger errors return 422, bad input 400, missing or wrong login 401, wrong role 403.

## Working on the code (developer guide)

**Principles used throughout**
- Integrity rules belong in the database. The API validates input and returns clear errors, but the database is the source of truth.
- Always use parameterised SQL (`$1, $2...`); never build SQL with string concatenation.
- Anything that changes several tables runs inside `withTx()` so an error undoes everything.
- Seller and customer identity always comes from the JWT (`req.user.id`), never from the request body.
- Numeric columns reach the browser as strings (`"12999.00"`); convert with `Number()` before maths.

**Add an API endpoint:** create or extend a file in `backend/src/routes/`, wrap handlers with `wrap(async (req, res) => {...})`, protect it with `requireAuth` (and `requireRole('seller')` where needed), mount it in `server.js`, document it in `docs/API.md`, and add a check to `backend/tests/smoke.mjs`.

**Add a screen:** add a component in `frontend/src/pages/`, register its route in `App.jsx`, and use `useLoad(path)` to fetch and `useAct()` to run actions with a success or error message.

**Change the database:** edit `db/schema.sql` (tables) or `db/integrity.sql` (extra rules), keep `db/setup.sql`'s order (tables, rules, procedures, data), add a test to `db/tests.sql`, and re-run `db/setup.sql` followed by the tests. If a rule affects inserted data, make sure `db/bulk_test_data.sql` still satisfies it.

**Before you push:** run `db/tests.sql` and `npm test`; confirm `backend/.env` is not staged (`git status`).

## Contributing

1. `git pull` before you start; create a branch (`git checkout -b feature/short-name`).
2. Keep commits small with a clear message (what and why).
3. Run the database and API tests (table above) and fix any FAIL.
4. Push the branch and open a pull request, or `git pull --rebase` then push to `main` if the team agrees.
5. Never commit `.env`, passwords or `node_modules`. If a push is rejected, run `git pull --rebase`, fix any conflict, re-test, push again.

## Troubleshooting

| Problem | Fix |
|---|---|
| `psql` is not recognized | Add PostgreSQL's `bin` folder to PATH (see "What you need to install") |
| `password authentication failed` from the backend | Wrong password in `backend/.env`; URL-encode special characters; restart `npm start` after editing `.env` |
| `database "karthub" does not exist` | Run the `CREATE DATABASE` command in Setup step 2 |
| `relation "app_user" does not exist` | Tables are missing; run `db/setup.sql` from the repo root |
| Login fails for demo accounts | Demo data not loaded; re-run `db/setup.sql` |
| Frontend shows "Request failed" | The backend is not running on port 4000 |
| `npm test` says `fetch failed` / connection refused | Start the API (`npm start`) in another terminal first |
| Page opens but is blank | Open the browser console (F12) and read the first red error |

## Known limitations

- Payments are simulated: COD stays PENDING until the whole order is delivered; other methods succeed instantly. There is no real gateway and no courier integration.
- Cancelling one item of a multi-item order does not refund money (the payment table has no refund amount); the payment is marked REFUNDED only when every item is cancelled.
- Seller revenue on the dashboard is before coupon discounts.
- Admin accounts are created directly in the database; there is no UI for managing categories or products.
- `address` is in 2NF, not BCNF, because a pincode determines state and city; this was a deliberate choice (no 19,000-row pincode reference table).

## Member contributions

Mid-semester (11 October 2026):

| Member | Contribution |
|---|---|
| Yashavanth | ER/EER design, `schema.sql` |
| Vedansh Singh | Application design, backend skeleton |
| Rashi Tripathi | Seed data plan, README, front-end wireframes |

Final phase (**update this table with what each member actually did before submission**):

| Member | Contribution |
|---|---|
| Vedansh Singh | Backend completion (seller, cancellation, review, address and admin APIs, checkout hardening, tests, API contract), database integrity rules, stored procedures, SQL queries Q1-Q6, database tests, EXPLAIN ANALYZE, demo data, React frontend |
| Yashavanth | *(fill in)* |
| Rashi Tripathi | *(fill in)* |
| Prashant Kadam | *(fill in)* |

## AI assistance

AI tools (Claude) were used for scaffolding and debugging in this project. All generated code and SQL was run and tested (`db/tests.sql`, `backend/tests/smoke.mjs`), and each member is responsible for understanding and explaining the parts they own.
