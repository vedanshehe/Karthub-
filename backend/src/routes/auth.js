import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { query, withTx } from '../db.js';
import { sign } from '../auth.js';

const r = Router();

// POST /api/auth/register  { full_name, email, phone, password, store_name?, gst_no? }
// Supplying store_name + gst_no registers a seller: app_user + seller rows are created in ONE transaction.
r.post('/register', async (req, res, next) => {
  try {
    const { full_name, email, phone, password, store_name, gst_no } = req.body;
    if (!full_name || !email || !password || password.length < 6)
      return res.status(400).json({ error: 'full_name, email and a password of 6+ chars are required' });
    const hash = await bcrypt.hash(password, 10);
    const isSeller = !!(store_name && gst_no);
    const user = await withTx(async c => {
      const { rows } = await c.query(
        `INSERT INTO app_user(full_name,email,phone,password_hash,role)
         VALUES ($1,$2,$3,$4,$5) RETURNING user_id, full_name, email, role`,
        [full_name, email, phone || null, hash, isSeller ? 'seller' : 'customer']);
      if (isSeller)
        await c.query('INSERT INTO seller(seller_id,store_name,gst_no) VALUES ($1,$2,$3)', [rows[0].user_id, store_name, gst_no]);
      return rows[0];
    });
    res.status(201).json({ user, token: sign(user) });
  } catch (e) { next(e); }
});

// POST /api/auth/login { email, password }
r.post('/login', async (req, res, next) => {
  try {
    const { email, password } = req.body;
    const { rows } = await query('SELECT user_id, full_name, email, role, password_hash FROM app_user WHERE email=$1', [email]);
    const u = rows[0];
    if (!u || !(await bcrypt.compare(password || '', u.password_hash)))
      return res.status(401).json({ error: 'Invalid email or password' });
    delete u.password_hash;
    res.json({ user: u, token: sign(u) });
  } catch (e) { next(e); }
});

export default r;
