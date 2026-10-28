// Creates the tables and starter data in a database that already exists.
// Use it for a hosted MySQL (the provider gives you a ready-made database and usually
// doesn't allow CREATE DATABASE). It runs schema.sql without its CREATE DATABASE / USE lines,
// so schema.sql stays the only copy of the schema.
//
//   cd backend
//   (set DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, DB_NAME, DB_SSL in .env or in the terminal)
//   BIN_API_KEY=<a long random secret> npm run db:init
//
// BIN_API_KEY becomes the key the bin must send (x-api-key). Without it the starter bin keeps
// the public key "dev-bin-key-change-me", which anyone who reads the README knows.
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
const config = require('../src/config');

const DEV_KEY_NOTE = 'Bin 01 still uses the public dev key "dev-bin-key-change-me".';
const isLocal = ['127.0.0.1', 'localhost', '::1'].includes(config.db.host);
const binKey = process.env.BIN_API_KEY || '';

// Takes out the CREATE DATABASE and USE lines. Exported so it can be tested.
function schemaWithoutDatabaseLines(sql) {
  return sql
    .replace(/^\s*CREATE DATABASE[^;]*;\s*$/gim, '')
    .replace(/^\s*USE [^;]*;\s*$/gim, '');
}

async function main() {
  if (binKey && binKey.length < 20) {
    throw new Error('BIN_API_KEY must be at least 20 characters. Use something long and random.');
  }
  if (!isLocal && !binKey) {
    throw new Error(`${config.db.host} is not your own computer, so ${DEV_KEY_NOTE} Anyone could send fake detections to your API. Set BIN_API_KEY to a long random secret and run again.`);
  }

  const schema = schemaWithoutDatabaseLines(fs.readFileSync(path.join(__dirname, '../schema.sql'), 'utf8'));
  const { connectionLimit, ...connection } = config.db;
  const conn = await mysql.createConnection({ ...connection, multipleStatements: true });
  try {
    await conn.query(schema);
    console.log(`Tables are ready in "${config.db.database}" on ${config.db.host}.`);
    if (binKey) {
      await conn.query("UPDATE devices SET api_key_hash = SHA2(?, 256) WHERE name = 'Bin 01'", [binKey]);
      console.log('Bin 01 now uses your BIN_API_KEY. Put the same value in bridge/.env as DEVICE_API_KEY.');
    } else {
      console.log(`Note: ${DEV_KEY_NOTE} That is fine on your own computer, change it before going online.`);
    }
  } finally {
    await conn.end();
  }
}

if (require.main === module) {
  main().catch((err) => {
    console.error(`\nDatabase setup failed: ${err.message}`);
    process.exit(1);
  });
}

module.exports = { schemaWithoutDatabaseLines };
