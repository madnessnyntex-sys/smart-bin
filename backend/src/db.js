const mysql = require('mysql2/promise');
const config = require('./config');

const pool = mysql.createPool({
  ...config.db,
  waitForConnections: true,
  decimalNumbers: true,
});

// runs fn inside a transaction, rolls back if it throws
async function withTransaction(fn) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const result = await fn(conn);
    await conn.commit();
    return result;
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

// plain-english reasons for the database errors people actually hit during setup
const HINTS = {
  ECONNREFUSED: "Can't connect to MySQL. Make sure MySQL is running, and check DB_HOST in backend/.env.",
  ENOTFOUND: "Can't find the MySQL server. Check DB_HOST in backend/.env.",
  ER_ACCESS_DENIED_ERROR: 'MySQL refused the login. Check DB_USER and DB_PASSWORD in backend/.env.',
  ER_BAD_DB_ERROR: 'The smart_bin database does not exist yet. Run backend/schema.sql in MySQL Workbench.',
  ER_NO_SUCH_TABLE: 'A table is missing. Run backend/schema.sql in MySQL Workbench (drop the old smart_bin database first if you ran an older version).',
  ER_BAD_FIELD_ERROR: 'The tables are from an older version. Drop the smart_bin database and run backend/schema.sql again.',
};
const explainDbError = (err) => HINTS[err.code] || null;

module.exports = { pool, withTransaction, explainDbError };
