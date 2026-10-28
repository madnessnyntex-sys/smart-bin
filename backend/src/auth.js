// Password and login-token helpers for the dashboard users.
// Kept free of database code so they can be tested on their own.
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const config = require('./config');

const TOKEN_LIFETIME = '8h';
const COST = 10; // how slow the password hash is on purpose. Higher = harder to brute-force.

// Passwords are never stored. We store this one-way hash instead.
const hashPassword = (password) => bcrypt.hash(password, COST);
const verifyPassword = (password, hash) => bcrypt.compare(password, hash);

// A hash of a password nobody has. Login compares against it when the email doesn't exist,
// so "unknown email" takes as long as "wrong password" and can't be told apart by timing.
const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', COST);

// The token says who the user is and when it stops working. It is signed with JWT_SECRET,
// so changing any part of it makes it invalid.
const signToken = (user) =>
  jwt.sign({ sub: user.id, email: user.email }, config.jwtSecret, { algorithm: 'HS256', expiresIn: TOKEN_LIFETIME });

// Returns { id, email } for a good token, or null for a bad, expired or tampered one.
function verifyToken(token) {
  try {
    const payload = jwt.verify(token, config.jwtSecret, { algorithms: ['HS256'] });
    return { id: payload.sub, email: payload.email };
  } catch {
    return null;
  }
}

// Compares two secrets without leaking, through timing, how many characters matched.
function sameSecret(a, b) {
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

module.exports = { hashPassword, verifyPassword, DUMMY_HASH, signToken, verifyToken, sameSecret };
