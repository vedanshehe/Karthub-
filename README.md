# KartHub - Multi-Vendor E-Commerce Marketplace (DBMS Course Project)

**Team:** \<Team ID> | **Members:** \<Vedansh Singh - 2024A3PS0432H>, \<Yashawanth - 2024A7PS0006H>, \<Name - ID>

## Description

A marketplace where independent sellers list products from a shared catalogue, customers search and compare seller offers, place orders (multi-seller carts), pay, and review delivered items.

Database design (ER/EER → 12-relation schema → constraints/triggers) is the core of the project.

## Tech stack (proposed)

React (front end) ↔ Node.js/Express REST API (backend) ↔ PostgreSQL 15 (via `pg`, no ORM so SQL stays visible).

## Repository layout

```text
/db        schema.sql, seed.sql (sample data, 500+ rows), queries.sql, procedures.sql
/backend   Express API (routes: auth, catalogue, cart, orders, seller-dashboard)
/frontend  React app
/docs      mid-sem design document (PDF)
```

## Mid-sem progress

- [x] Requirements, ER/EER diagram, relational schema, constraints, normalization (see `/docs`)
- [x] `db/schema.sql` (tested on PostgreSQL 16) + `db/dev_seed.sql` (tiny dev seed)
- [ ] Seed data generator (target 500+ rows)
- [x] Backend (started): auth, catalogue search + price comparison, cart, checkout transaction, order history
- [ ] Seller dashboard, review endpoint, order cancellation, remaining views
- [ ] Front end

## Workflows planned

1. **Checkout:** Transaction across cart, listing, orders, order items, and payment; rolls back on insufficient stock.
2. **Search + seller analytics:** Full-text search, price comparison, and CTE/aggregate dashboards.
3. **Integrity enforcement demo:** Overselling, expired coupons, and reviews on undelivered items are rejected by the DBMS.

## Member contributions

| Member | Contribution so far |
|---|---|
| Vedansh | ER/EER design, `schema.sql` |
| Yashawanth | Application design, backend skeleton |
| \<Name> | Seed data plan, README, front-end wireframes |

## Setup

Create the database and load the schema:

```bash
createdb karthub && psql karthub -f db/schema.sql
```

## Run the backend

```bash
cd backend
cp .env.example .env
npm install
npm start
```

The API runs on port `4000`.

## API Endpoints

| Method | Endpoint | Notes |
|---|---|---|
| POST | `/api/auth/register` | Register a customer or seller. Use `store_name` + `gst_no` to create a seller (2 tables, 1 transaction). |
| POST | `/api/auth/login` | Authenticate and log in. |
| GET | `/api/categories` | Recursive CTE, product count per subtree. |
| GET | `/api/products?q=&category=&min=&max=&sort=` | Full-text search, cheapest offer, average rating. |
| GET | `/api/products/:id/offers` | Price comparison across sellers. |
| GET | `/api/cart` | Retrieve cart (JWT required). |
| PUT | `/api/cart` | Update cart (JWT required). |
| DELETE | `/api/cart` | Remove cart contents (JWT required). |
| POST | `/api/orders/checkout` | W1 transaction: lock stock, check coupon, create order + items + payment, clear cart. |
| GET | `/api/orders` | Order history via `v_order_total` (JWT required). |

## Contributing

Contributions from team members and other developers are welcome. Please follow the workflow below to keep development organized and protect the `main` branch.

### 1. Get repository access

- **Team members:** Ask the repository owner to invite your GitHub account as a collaborator.
- **External contributors:** Fork the repository to your own GitHub account.

### 2. Clone the repository

For collaborators:

```bash
git clone https://github.com/vedanshehe/Karthub-.git
cd Karthub-
```

If you forked the repository, clone your fork instead.

### 3. Create a new branch

Always work on a separate branch. Do not make changes directly on `main`.

```bash
git switch main
git pull origin main
git switch -c feature/your-feature
```

Use a descriptive branch name, such as:

- `feature/catalogue-search`
- `feature/cart`
- `feature/seller-dashboard`
- `fix/checkout`
- `docs/readme`

Replace `feature/your-feature` with a name relevant to your task.

### 4. Make and test your changes

- Work on your assigned feature or bug fix.
- Follow the existing project structure and coding style.
- Test your changes locally before submitting them.
- For database changes, verify your SQL against the existing schema.
- Avoid modifying unrelated files or overwriting another contributor's work.

### 5. Commit and push your changes

After making your changes, run:

```bash
git add .
git commit -m "Describe your changes"
git push -u origin feature/your-feature
```

Replace the branch name and commit message with appropriate values.

### 6. Create a Pull Request

After pushing your branch:

1. Open the [KartHub repository](https://github.com/vedanshehe/Karthub-).
2. Go to **Pull requests → New pull request**.
3. Select `main` as the base branch.
4. Select your feature branch as the compare branch.
5. Describe your changes and mention how you tested them.
6. Click **Create pull request**.

If you are contributing through a fork, create the Pull Request from your fork's branch into the original repository's `main` branch.

### 7. Code review and merging

The repository owner will review your Pull Request and may request changes before merging.

- Address review comments and push updates to the same branch.
- Ensure your changes do not break existing functionality.
- Resolve review comments before merging.
- Merge only after the changes have been reviewed and are ready.

**Important:** The `main` branch is protected. Do not push directly to it. All contributions should be submitted through Pull Requests.

### 8. Contribution guidelines

- Never commit passwords, API keys, database credentials, or your local `.env` file.
- Keep each Pull Request focused on one feature, bug fix, or documentation change.
- Write clear commit messages.
- Coordinate with the team before modifying shared database structures.
- Report bugs and discuss proposed changes with the team before starting substantial work.

Thank you for contributing to KartHub!

