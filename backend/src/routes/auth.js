import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { query, withTx } from '../db.js';
import { sign } from '../auth.js';
import { HttpError, wrap } from '../errors.js';

const r = Router();

// POST /api/auth/register  { full_name, email, phone?, password, store_name?, gst_no? }
// Supplying store_name + gst_no registers a seller: app_user + seller rows are created in ONE transaction.
r.post('/register', wrap(async (req, res) => {
  const { full_name, email, phone, password, store_name, gst_no } = req.body;
  if (typeof full_name !== 'string' || !full_name.trim() ||
      typeof email !== 'string' || !email.trim() ||
      typeof password !== 'string' || password.length < 6) {
    throw new HttpError(400, 'full_name, email and a password of 6+ chars are required');
  }
  const cleanEmail = email.trim().toLowerCase();
  const emailRegex = /^[a-zA-Z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[a-zA-Z0-9!#$%&'*+/=?^_`{|}~-]+)*@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z]{2,})+$/;
  if (!emailRegex.test(cleanEmail) || cleanEmail.includes('.@') || cleanEmail.includes('@.')) {
    throw new HttpError(400, 'A valid email address is required');
  }
  let cleanPhone = null;
  if (phone != null && String(phone).trim() !== '') {
    cleanPhone = String(phone).trim();
    if (!/^[0-9]{10}$/.test(cleanPhone)) {
      throw new HttpError(400, 'phone must be a 10-digit string');
    }
  }

  // Check partial seller registration
  const trimmedStore = typeof store_name === 'string' ? store_name.trim() : '';
  const trimmedGst = typeof gst_no === 'string' ? String(gst_no).trim().toUpperCase() : '';
  if ((trimmedStore && !trimmedGst) || (!trimmedStore && trimmedGst)) {
    throw new HttpError(400, 'Both store_name and gst_no are required to register as a seller');
  }

  const isSeller = Boolean(trimmedStore && trimmedGst);
  if (isSeller) {
    if (!/^[0-9A-Z]{15}$/.test(trimmedGst)) {
      throw new HttpError(400, 'GST number must be exactly 15 alphanumeric characters');
    }
  }

  const hash = await bcrypt.hash(password, 10);
  const user = await withTx(async c => {
    const { rows } = await c.query(
      `INSERT INTO app_user(full_name, email, phone, password_hash, role)
       VALUES ($1, $2, $3, $4, $5) RETURNING user_id, full_name, email, phone, role`,
      [full_name.trim(), cleanEmail, cleanPhone, hash, isSeller ? 'seller' : 'customer']
    );
    const u = rows[0];
    if (isSeller) {
      await c.query(
        'INSERT INTO seller(seller_id, store_name, gst_no) VALUES ($1, $2, $3)',
        [u.user_id, trimmedStore, trimmedGst]
      );
    }
    return u;
  });

  res.status(201).json({ user, token: sign(user) });
}));

// POST /api/auth/login { email, password }
r.post('/login', wrap(async (req, res) => {
  const { email, password } = req.body;
  if (typeof email !== 'string' || !email.trim() || typeof password !== 'string' || !password) {
    throw new HttpError(400, 'email and password are required');
  }
  const { rows } = await query(
    'SELECT user_id, full_name, email, phone, role, password_hash FROM app_user WHERE email=$1',
    [email.trim().toLowerCase()]
  );
  const u = rows[0];
  if (!u || !(await bcrypt.compare(password || '', u.password_hash))) {
    throw new HttpError(401, 'Invalid email or password');
  }
  delete u.password_hash;
  res.json({ user: u, token: sign(u) });
}));

export default r;
