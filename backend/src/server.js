const config = require('./config');
const { createApp } = require('./app');
const { pool, explainDbError } = require('./db');

const server = createApp().listen(config.port, () =>
  console.log(`Smart bin API on http://localhost:${config.port} (${config.env})`));

pool
  .query('SELECT COUNT(*) AS n FROM devices')
  .then(() => console.log('Database connected.'))
  .catch((err) => console.error(`\nDATABASE PROBLEM (${err.code || 'unknown'}): ${explainDbError(err) || err.message}\n`));

function shutdown() {
  server.close(async () => {
    await pool.end();
    process.exit(0);
  });
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
