export class HttpError extends Error {
  constructor(status, msg) { super(msg); this.status = status; }
}
// Express 4 does not catch rejected promises; this forwards them to the error middleware.
export const wrap = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
