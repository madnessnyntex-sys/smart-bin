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

module.exports = {
  env,
  port: Number(process.env.PORT) || 4000,
  corsOrigin: process.env.CORS_ORIGIN || 'http://localhost:3000',
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
  },
};
