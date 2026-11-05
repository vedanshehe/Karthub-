import { Router } from 'express';
import { query, withTx } from '../db.js';
import { requireAuth } from '../auth.js';
import { HttpError, wrap } from '../errors.js';

const r = Router();
r.use(requireAuth);

r.get('/', wrap(async (req, res) => {
  const { rows } = await query(
    'SELECT address_id, line1, city, state, pincode, is_default FROM address WHERE user_id=$1 ORDER BY is_default DESC, address_id', [req.user.id]);
  res.json(rows);
}));

// POST /api/addresses { line1, city, state, pincode, is_default? }  (first address becomes the default)
r.post('/', wrap(async (req, res) => {
  const { line1, city, state, pincode } = req.body;
  if (!line1 || !city || !state || !pincode) throw new HttpError(400, 'line1, city, state and pincode are required');
  const row = await withTx(async c => {
    const have = (await c.query('SELECT COUNT(*) AS n FROM address WHERE user_id=$1', [req.user.id])).rows[0].n;
    const makeDefault = !!req.body.is_default || Number(have) === 0;
    if (makeDefault) await c.query('UPDATE address SET is_default=FALSE WHERE user_id=$1', [req.user.id]); // partial unique index allows one default
    return (await c.query(
      `INSERT INTO address(user_id,line1,city,state,pincode,is_default) VALUES ($1,$2,$3,$4,$5,$6)
       RETURNING address_id, line1, city, state, pincode, is_default`,
      [req.user.id, line1, city, state, pincode, makeDefault])).rows[0];
  });
  res.status(201).json(row);
}));

// PUT /api/addresses/:id  (any of line1, city, state, pincode, is_default)
r.put('/:id', wrap(async (req, res) => {
  const { line1, city, state, pincode, is_default } = req.body;
  const row = await withTx(async c => {
    if (is_default === true) await c.query('UPDATE address SET is_default=FALSE WHERE user_id=$1', [req.user.id]);
    return (await c.query(`
      UPDATE address SET line1=COALESCE($3,line1), city=COALESCE($4,city), state=COALESCE($5,state),
                         pincode=COALESCE($6,pincode), is_default=COALESCE($7,is_default)
      WHERE address_id=$1 AND user_id=$2
      RETURNING address_id, line1, city, state, pincode, is_default`,
      [req.params.id, req.user.id, line1 ?? null, city ?? null, state ?? null, pincode ?? null, is_default ?? null])).rows[0];
  });
  if (!row) throw new HttpError(404, 'Address not found');
  res.json(row);
}));

// DELETE /api/addresses/:id  (fails with 409 if an order still references it: ON DELETE RESTRICT)
r.delete('/:id', wrap(async (req, res) => {
  const { rowCount } = await query('DELETE FROM address WHERE address_id=$1 AND user_id=$2', [req.params.id, req.user.id]);
  if (!rowCount) throw new HttpError(404, 'Address not found');
  res.status(204).end();
}));

export default r;
