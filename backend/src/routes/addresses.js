import { Router } from 'express';
import { query, withTx } from '../db.js';
import { requireAuth, requireRole } from '../auth.js';
import { HttpError, wrap } from '../errors.js';

const r = Router();
r.use(requireAuth, requireRole('customer'));

// GET /api/addresses
r.get('/', wrap(async (req, res) => {
  const { rows } = await query(
    'SELECT address_id, line1, city, state, pincode, is_default FROM address WHERE user_id=$1 ORDER BY is_default DESC, address_id',
    [req.user.id]
  );
  res.json(rows);
}));

// POST /api/addresses { line1, city, state, pincode, is_default? }
// If first address for user, automatically marked default.
r.post('/', wrap(async (req, res) => {
  const { line1, city, state, pincode, is_default } = req.body;
  if (!line1 || !city || !state || !pincode) {
    throw new HttpError(400, 'line1, city, state and pincode are required');
  }
  if ([line1, city, state].some(value => typeof value !== 'string' || !value.trim())) {
    throw new HttpError(400, 'line1, city and state must be non-empty strings');
  }
  if (is_default != null && typeof is_default !== 'boolean') {
    throw new HttpError(400, 'is_default must be true or false');
  }
  const cleanPin = String(pincode).trim();
  if (!/^[0-9]{6}$/.test(cleanPin)) {
    throw new HttpError(400, 'Pincode must be exactly 6 digits');
  }

  const row = await withTx(async c => {
    const have = (await c.query('SELECT COUNT(*) AS n FROM address WHERE user_id=$1', [req.user.id])).rows[0].n;
    const makeDefault = Boolean(is_default) || Number(have) === 0;
    if (makeDefault) {
      await c.query('UPDATE address SET is_default=FALSE WHERE user_id=$1', [req.user.id]);
    }
    return (await c.query(
      `INSERT INTO address(user_id, line1, city, state, pincode, is_default)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING address_id, line1, city, state, pincode, is_default`,
      [req.user.id, line1.trim(), city.trim(), state.trim(), cleanPin, makeDefault]
    )).rows[0];
  });

  res.status(201).json(row);
}));

// PUT /api/addresses/:id  (update address details or set as default)
r.put('/:id', wrap(async (req, res) => {
  const { line1, city, state, pincode, is_default } = req.body;
  if (pincode != null && !/^[0-9]{6}$/.test(String(pincode).trim())) {
    throw new HttpError(400, 'Pincode must be exactly 6 digits');
  }
  if ([line1, city, state].some(value => value != null && (typeof value !== 'string' || !value.trim()))) {
    throw new HttpError(400, 'address text fields must be non-empty strings');
  }
  if (is_default != null && typeof is_default !== 'boolean') {
    throw new HttpError(400, 'is_default must be true or false');
  }

  const row = await withTx(async c => {
    if (is_default === true) {
      await c.query('UPDATE address SET is_default=FALSE WHERE user_id=$1', [req.user.id]);
    }
    return (await c.query(`
      UPDATE address SET line1 = COALESCE($3, line1),
                         city = COALESCE($4, city),
                         state = COALESCE($5, state),
                         pincode = COALESCE($6, pincode),
                         is_default = COALESCE($7, is_default)
      WHERE address_id=$1 AND user_id=$2
      RETURNING address_id, line1, city, state, pincode, is_default`,
      [req.params.id, req.user.id, line1 ? line1.trim() : null, city ? city.trim() : null, state ? state.trim() : null, pincode ? String(pincode).trim() : null, is_default ?? null]
    )).rows[0];
  });

  if (!row) throw new HttpError(404, 'Address not found');
  res.json(row);
}));

// DELETE /api/addresses/:id
r.delete('/:id', wrap(async (req, res) => {
  const addrId = Number(req.params.id);
  if (!Number.isInteger(addrId)) throw new HttpError(400, 'address_id must be an integer');

  await withTx(async c => {
    const cur = await c.query('SELECT is_default FROM address WHERE address_id=$1 AND user_id=$2', [addrId, req.user.id]);
    if (!cur.rowCount) throw new HttpError(404, 'Address not found');
    const wasDefault = cur.rows[0].is_default;

    await c.query('DELETE FROM address WHERE address_id=$1 AND user_id=$2', [addrId, req.user.id]);

    if (wasDefault) {
      await c.query(`
        UPDATE address SET is_default=TRUE
        WHERE address_id = (SELECT address_id FROM address WHERE user_id=$1 ORDER BY address_id LIMIT 1)`,
        [req.user.id]
      );
    }
  });

  res.status(204).end();
}));

export default r;
