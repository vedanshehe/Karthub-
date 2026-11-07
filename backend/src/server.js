import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../.env') });
dotenv.config();
import express from 'express';
import cors from 'cors';
import auth from './routes/auth.js';
import catalogue from './routes/catalogue.js';
import cart from './routes/cart.js';
import orders from './routes/orders.js';
import seller from './routes/seller.js';
import reviews from './routes/reviews.js';
import addresses from './routes/addresses.js';
import admin from './routes/admin.js';
import { assertJwtConfigured } from './auth.js';

assertJwtConfigured();

const app = express();
app.use(cors());
app.use(express.json());

app.get('/api/health', (_req, res) => res.json({ ok: true }));
app.use('/api/auth', auth);
app.use('/api/cart', cart);
app.use('/api/orders', orders);
app.use('/api/seller', seller);
app.use('/api/reviews', reviews);
app.use('/api/addresses', addresses);
app.use('/api/admin', admin);
app.use('/api', catalogue);

// Translate DBMS errors into clean HTTP errors (the DB is the source of truth).
// 23505/23514/23503 -> 409, trigger errors (P0001) -> 422, as in the application design document.
app.use((err, _req, res, _next) => {
  const map = { '23505': [409, 'Already exists (unique constraint)'],
                '23514': [409, 'Value violates a rule (check constraint)'],
                '23503': [409, 'Referenced record does not exist or is still in use'],
                '23502': [400, 'A required field is missing'],
                '22P02': [400, 'A value has the wrong format'],
                '22003': [400, 'A number is out of range'],
                'P0001': [422, err.message] };
  const [status, msg] = err.status ? [err.status, err.message] : map[err.code] || [500, 'Server error'];
  if (status === 500) console.error(err);
  res.status(status).json({ error: msg, ...(err.constraint && { constraint: err.constraint }) });
});

const port = process.env.PORT || 4000;
app.listen(port, () => console.log(`KartHub API on :${port}`));
