const crypto = require('crypto');
const { ZodError } = require('zod');
const config = require('./config');
const { pool, explainDbError } = require('./db');

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');

// bins authenticate with an x-api-key header, we only store the hash
const deviceAuth = asyncHandler(async (req, res, next) => {
  const key = req.get('x-api-key');
  if (!key) throw new HttpError(401, 'Missing x-api-key header');
  const [rows] = await pool.query('SELECT id, name FROM devices WHERE api_key_hash = ?', [sha256(key)]);
  if (!rows.length) throw new HttpError(401, 'Invalid API key');
  req.device = rows[0];
  next();
});

const adminAuth = (req, res, next) => {
  const token = (req.get('authorization') || '').replace(/^Bearer /, '');
  const ok =
    config.adminToken &&
    crypto.timingSafeEqual(Buffer.from(sha256(token)), Buffer.from(sha256(config.adminToken)));
  if (!ok) return next(new HttpError(401, 'Admin token required'));
  next();
};

const notFound = (req, res) => res.status(404).json({ error: 'Not found' });

// eslint-disable-next-line no-unused-vars
const errorHandler = (err, req, res, next) => {
  if (err instanceof ZodError) {
    return res.status(400).json({
      error: 'Invalid request',
      details: err.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
    });
  }
  if (err instanceof HttpError) return res.status(err.status).json({ error: err.message });
  if (err.status && err.status < 500) return res.status(err.status).json({ error: 'Invalid request body' });
  const hint = explainDbError(err);
  if (hint) {
    console.error(`DATABASE PROBLEM (${err.code}): ${hint}`);
    return res.status(503).json({ error: config.env === 'production' ? 'Database unavailable' : hint });
  }
  console.error(err);
  res.status(500).json({ error: 'Something went wrong on our side' });
};

module.exports = { HttpError, asyncHandler, deviceAuth, adminAuth, notFound, errorHandler };
