import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import auth from './routes/auth.js';
import catalogue from './routes/catalogue.js';
import cart from './routes/cart.js';
import orders from './routes/orders.js';

const app = express();
app.use(cors());
app.use(express.json());

app.get('/api/health', (_req, res) => res.json({ ok: true }));
app.use('/api/auth', auth);
app.use('/api', catalogue);
app.use('/api/cart', cart);
app.use('/api/orders', orders);

// Translate DBMS constraint violations into clean HTTP errors (the DB is the source of truth).
app.use((err, _req, res, _next) => {
  const map = { '23505': [409, 'Already exists (unique constraint)'], '23514': [400, 'Value violates a rule (check constraint)'],
                '23503': [400, 'Referenced record does not exist or is still in use'], '23502': [400, 'A required field is missing'],
                'P0001': [409, err.message] };
  const [status, msg] = err.status ? [err.status, err.message] : map[err.code] || [500, 'Server error'];
  if (status === 500) console.error(err);
  res.status(status).json({ error: msg, ...(err.constraint && { constraint: err.constraint }) });
});

const port = process.env.PORT || 4000;
app.listen(port, () => console.log(`KartHub API on :${port}`));
