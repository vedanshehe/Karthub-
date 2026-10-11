# KartHub - Multi-Vendor E-Commerce Marketplace (DBMS Course Project)

**Team:** <Team ID>  |  **Members:** <Vedansh Singh - 2024A3PS0432H>, <Yashawanth- 2024A7PS0006H>, <Name - ID>

## Description
A marketplace where independent sellers list products from a shared catalogue, customers search and compare
seller offers, place orders (multi-seller carts), pay, and review delivered items.
Database design (ER/EER -> 12-relation schema -> constraints/triggers) is the core of the project.

## Tech stack (proposed)
React (front end) <-> Node.js/Express REST API (backend) <-> PostgreSQL 15 (via `pg`, no ORM so SQL stays visible)

## Repository layout
```
/db        schema.sql, seed.sql (sample data, 500+ rows), queries.sql, procedures.sql
/backend   Express API (routes: auth, catalogue, cart, orders, seller-dashboard)
/frontend  React app
/docs      mid-sem design document (PDF)
```

## Mid-sem progress
- [x] Requirements, ER/EER diagram, relational schema, constraints, normalization (see /docs)
- [x] `db/schema.sql` (tested on PostgreSQL 16) + `db/dev_seed.sql` (tiny dev seed)
- [ ] Seed data generator (target 500+ rows)
- [x] Backend (started): auth, catalogue search + price comparison, cart, checkout transaction, order history
- [ ] Seller dashboard, review endpoint, order cancellation, remaining views
- [ ] Front end

## Workflows planned
1. **Checkout** (transaction across cart, listing, orders, order_item, payment; rolls back on insufficient stock)
2. **Search + seller analytics** (full-text search, price comparison, CTE/aggregate dashboards)
3. **Integrity enforcement demo** (oversell, expired coupon, review on undelivered item are rejected by the DBMS)

## Member contributions
| Member | Contribution so far |
|---|---|
| Vedansh | ER/EER design, schema.sql |
| Yashawanth | Application design, backend skeleton |
| <Name> | Seed data plan, README, front-end wireframes |

## Setup
```
createdb karthub && psql karthub -f db/schema.sql
```

## Run the backend
```
cd backend && cp .env.example .env && npm install && npm start      # API on :4000
```
| Method | Endpoint | Notes |
|---|---|---|
| POST | /api/auth/register, /api/auth/login | register with `store_name`+`gst_no` to create a seller (2 tables, 1 transaction) |
| GET | /api/categories | recursive CTE, product count per subtree |
| GET | /api/products?q=&category=&min=&max=&sort= | full-text search, cheapest offer, avg rating |
| GET | /api/products/:id/offers | price comparison across sellers |
| GET/PUT/DELETE | /api/cart | JWT required |
| POST | /api/orders/checkout | W1 transaction: lock stock, coupon check, order + items + payment, clear cart |
| GET | /api/orders | order history via v_order_total |
