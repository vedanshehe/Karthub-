import pg from 'pg';
import 'dotenv/config';

export const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
// every connection uses the project schema
pool.on('connect', c => c.query('SET search_path = karthub'));

export const query = (text, params) => pool.query(text, params);

// Runs fn(client) inside BEGIN/COMMIT; any thrown error triggers ROLLBACK.
export async function withTx(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const out = await fn(client);
    await client.query('COMMIT');
    return out;
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}
