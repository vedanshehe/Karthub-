import jwt from 'jsonwebtoken';

function jwtSecret() {
  if (!process.env.JWT_SECRET) {
    throw new Error('JWT_SECRET must be configured');
  }
  return process.env.JWT_SECRET;
}

export const assertJwtConfigured = () => { jwtSecret(); };

export const sign = user => jwt.sign({ id: user.user_id, role: user.role }, jwtSecret(), { expiresIn: '8h' });

export function requireAuth(req, res, next) {
  const h = req.headers.authorization || '';
  try {
    req.user = jwt.verify(h.replace(/^Bearer /, ''), jwtSecret());
    next();
  } catch {
    res.status(401).json({ error: 'Login required' });
  }
}
export const requireRole = (...roles) => (req, res, next) =>
  roles.includes(req.user.role) ? next() : res.status(403).json({ error: 'Not allowed for your role' });
