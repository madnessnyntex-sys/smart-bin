require('dotenv').config();

const env = process.env.NODE_ENV || 'development';

// Secret used to sign login tokens. Anyone who knows it can forge a login,
// so a real one is required in production. In development we fall back to a known value.
let jwtSecret = process.env.JWT_SECRET || '';
if (!jwtSecret) {
  if (env === 'production') throw new Error('JWT_SECRET must be set in production');
  jwtSecret = 'dev-only-secret-change-me';
  console.warn('JWT_SECRET is not set, using an insecure dev secret. Set it in backend/.env.');
} else if (env === 'production' && jwtSecret.length < 32) {
  throw new Error('JWT_SECRET must be at least 32 characters in production');
}

// Hosted databases (and most cloud MySQL services) require an encrypted connection.
// DB_SSL=true turns it on. DB_SSL_CA is only needed if the provider gives you its own certificate
// (paste the PEM text, with \n for the line breaks).
const dbSsl = process.env.DB_SSL === 'true'
  ? { rejectUnauthorized: true, ...(process.env.DB_SSL_CA && { ca: process.env.DB_SSL_CA.replace(/\\n/g, '\n') }) }
  : undefined;

module.exports = {
  env,
  port: Number(process.env.PORT) || 4000,
  // Websites allowed to call this API. Several can be listed, separated by commas.
  corsOrigins: (process.env.CORS_ORIGIN || 'http://localhost:3000').split(',').map((o) => o.trim()).filter(Boolean),
  // On Vercel the request reaches us through Vercel's proxy. Trusting one proxy hop lets us see
  // the visitor's real address (the rate limiter needs it). Vercel sets VERCEL=1 by itself.
  trustProxy: process.env.VERCEL ? 1 : 0,
  adminToken: process.env.ADMIN_TOKEN || '',
  jwtSecret,
  // New accounts must send this code. If it is empty, registration is switched off.
  registerCode: process.env.REGISTER_CODE || '',
  db: {
    host: process.env.DB_HOST || '127.0.0.1',
    port: Number(process.env.DB_PORT) || 3306,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'smart_bin',
    ssl: dbSsl,
    // On Vercel every busy moment can start a new copy of the API, and each copy opens its own
    // connections. A small number each keeps the database under its connection limit.
    connectionLimit: Number(process.env.DB_POOL_SIZE) || (process.env.VERCEL ? 3 : 10),
  },
};
