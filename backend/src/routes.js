const express = require('express');
const rateLimit = require('express-rate-limit');
const config = require('./config');
const { pool, withTransaction } = require('./db');
const { HttpError, asyncHandler, deviceAuth, userAuth, userOrAdminAuth } = require('./middleware');
const {
  detectionBody, simulateBody, updateDetectionBody, idParam, rangeQuery, refillBody, registerBody, loginBody,
} = require('./schemas');
const { decideAction, giveBackRice, correctDetection } = require('./rewards');
const { hashPassword, verifyPassword, DUMMY_HASH, signToken, sameSecret } = require('./auth');

const router = express.Router();

// stops people guessing passwords or invite codes: 10 failed tries per 15 minutes per address
const authLimiter = rateLimit({
  windowMs: 15 * 60_000,
  limit: 10,
  skipSuccessfulRequests: true,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many attempts. Try again in 15 minutes.' },
});
const FALLBACK_ITEM = 'Unrecognized';

// Logs a detection and takes the rice out of the hopper in one transaction.
async function recordDetection(deviceId, { item, confidence }) {
  return withTransaction(async (conn) => {
    // lock the device row so two detections can't both spend the last of the rice
    const [devices] = await conn.query(
      'SELECT id, rice_stock_grams FROM devices WHERE id = ? FOR UPDATE', [deviceId]);
    if (!devices.length) throw new HttpError(404, 'Device not found');
    const stock = devices[0].rice_stock_grams;

    // a label the camera model sends that we don't know is still worth keeping as data
    let [types] = await conn.query('SELECT * FROM waste_types WHERE name = ?', [item]);
    if (!types.length) [types] = await conn.query('SELECT * FROM waste_types WHERE name = ?', [FALLBACK_ITEM]);
    const type = types[0];

    const { action, riceGrams } = decideAction({
      recyclable: !!type.is_recyclable,
      rewardGrams: type.rice_grams,
      stockGrams: stock,
    });

    const [result] = await conn.query(
      'INSERT INTO detections (device_id, waste_type_id, confidence, rice_grams) VALUES (?, ?, ?, ?)',
      [deviceId, type.id, confidence ?? null, riceGrams]);
    await conn.query(
      'UPDATE devices SET rice_stock_grams = rice_stock_grams - ?, last_seen_at = NOW() WHERE id = ?',
      [riceGrams, deviceId]);

    return { id: result.insertId, item: type.name, action, rice_grams: riceGrams, stock_left: stock - riceGrams };
  });
}

// Finds a detection and locks its device and itself for the rest of the transaction.
// The device is locked first, the same order recordDetection uses, so two requests can't deadlock.
async function lockDetection(conn, id) {
  const [found] = await conn.query('SELECT device_id FROM detections WHERE id = ?', [id]);
  if (!found.length) throw new HttpError(404, 'Detection not found');
  const [[device]] = await conn.query(
    'SELECT id, rice_stock_grams, rice_capacity_grams FROM devices WHERE id = ? FOR UPDATE', [found[0].device_id]);
  // look again now that we hold the lock, in case someone deleted it a moment ago
  const [rows] = await conn.query('SELECT id, rice_grams FROM detections WHERE id = ? FOR UPDATE', [id]);
  if (!rows.length) throw new HttpError(404, 'Detection not found');
  return { detection: rows[0], device };
}

router.get('/health',asyncHandler(async (req, res) => {
  await pool.query('SELECT 1');
  res.json({ status: 'ok' });
}));

// ---- called by the bin (needs x-api-key) ----
router.post('/device/detections', deviceAuth, asyncHandler(async (req, res) => {
  const body = detectionBody.parse(req.body);
  res.status(201).json(await recordDetection(req.device.id, body));
}));

router.post('/device/heartbeat', deviceAuth, asyncHandler(async (req, res) => {
  await pool.query('UPDATE devices SET last_seen_at = NOW() WHERE id = ?', [req.device.id]);
  res.json({ ok: true });
}));

// ---- dashboard login (no token needed, that's how you get one) ----
// Creating an account needs the invite code from REGISTER_CODE in .env.
router.post('/auth/register', authLimiter, asyncHandler(async (req, res) => {
  const { email, password, inviteCode } = registerBody.parse(req.body);
  if (!config.registerCode) throw new HttpError(403, 'Registration is turned off');
  if (!sameSecret(inviteCode, config.registerCode)) throw new HttpError(403, 'Wrong invite code');

  let result;
  try {
    [result] = await pool.query(
      'INSERT INTO users (email, password_hash) VALUES (?, ?)', [email, await hashPassword(password)]);
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') throw new HttpError(409, 'That email is already registered');
    throw err;
  }
  const user = { id: result.insertId, email };
  res.status(201).json({ token: signToken(user), user: { email } });
}));

router.post('/auth/login', authLimiter, asyncHandler(async (req, res) => {
  const { email, password } = loginBody.parse(req.body);
  const [rows] = await pool.query('SELECT id, email, password_hash FROM users WHERE email = ?', [email]);
  const user = rows[0];
  // always run one password check, even for an unknown email, and give one message for both cases
  const ok = await verifyPassword(password, user ? user.password_hash : DUMMY_HASH);
  if (!user || !ok) throw new HttpError(401, 'Invalid email or password');
  res.json({ token: signToken(user), user: { email: user.email } });
}));

// lets the dashboard check that its saved token still works
router.get('/auth/me', userAuth, (req, res) => res.json({ email: req.user.email }));

// ---- dashboard reads (need a logged-in user) ----
router.get('/waste-types', userAuth, asyncHandler(async (req, res) => {
  const [rows] = await pool.query('SELECT * FROM waste_types ORDER BY name');
  res.json(rows);
}));

router.get('/devices', userAuth, asyncHandler(async (req, res) => {
  const [rows] = await pool.query(`
    SELECT id, name, location, rice_stock_grams, rice_capacity_grams, last_seen_at,
           (last_seen_at IS NOT NULL AND last_seen_at > NOW() - INTERVAL 2 MINUTE) AS online
    FROM devices ORDER BY id`);
  res.json(rows.map((r) => ({ ...r, online: !!r.online })));
}));

router.get('/detections/recent', userAuth, asyncHandler(async (req, res) => {
  const [rows] = await pool.query(`
    SELECT d.id, w.name, w.category, w.is_recyclable, d.confidence, d.rice_grams, d.created_at, dev.name AS device
    FROM detections d
    JOIN waste_types w ON w.id = d.waste_type_id
    JOIN devices dev ON dev.id = d.device_id
    ORDER BY d.id DESC LIMIT 10`);
  res.json(rows);
}));

// ---- fix mistakes in the detection log (need a logged-in user) ----
// Both only correct the records and the hopper count. Rice that already came out stays out.

// Changes which item a detection was (e.g. the camera said "Soda can" but it was a wrapper).
// The rice for the old item goes back, and the new item is judged like a fresh detection.
router.patch('/detections/:id', userAuth, asyncHandler(async (req, res) => {
  const id = idParam.parse(req.params.id);
  const { item } = updateDetectionBody.parse(req.body);

  res.json(await withTransaction(async (conn) => {
    const { detection, device } = await lockDetection(conn, id);
    const [types] = await conn.query('SELECT * FROM waste_types WHERE name = ?', [item]);
    if (!types.length) throw new HttpError(400, `Unknown item "${item}"`);
    const type = types[0];

    const fixed = correctDetection({
      oldRiceGrams: detection.rice_grams,
      recyclable: !!type.is_recyclable,
      rewardGrams: type.rice_grams,
      stockGrams: device.rice_stock_grams,
      capacityGrams: device.rice_capacity_grams,
    });
    await conn.query('UPDATE detections SET waste_type_id = ?, rice_grams = ? WHERE id = ?',
      [type.id, fixed.riceGrams, id]);
    await conn.query('UPDATE devices SET rice_stock_grams = ? WHERE id = ?', [fixed.stockGrams, device.id]);

    return { id, item: type.name, action: fixed.action, rice_grams: fixed.riceGrams, stock_left: fixed.stockGrams };
  }));
}));

// Removes a wrong detection and puts its rice back into the hopper count.
router.delete('/detections/:id', userAuth, asyncHandler(async (req, res) => {
  const id = idParam.parse(req.params.id);

  res.json(await withTransaction(async (conn) => {
    const { detection, device } = await lockDetection(conn, id);
    const stockLeft = giveBackRice({
      stockGrams: device.rice_stock_grams,
      capacityGrams: device.rice_capacity_grams,
      riceGrams: detection.rice_grams,
    });
    await conn.query('UPDATE devices SET rice_stock_grams = ? WHERE id = ?', [stockLeft, device.id]);
    await conn.query('DELETE FROM detections WHERE id = ?', [id]);
    return { id, rice_returned_grams: stockLeft - device.rice_stock_grams, stock_left: stockLeft };
  }));
}));

router.get('/summary', userAuth, asyncHandler(async (req, res) => {
  const q = rangeQuery.parse(req.query);
  const where = ['d.created_at >= NOW() - INTERVAL ? DAY'];
  const params = [q.days];
  if (q.deviceId) { where.push('d.device_id = ?'); params.push(q.deviceId); }
  const base = `FROM detections d JOIN waste_types w ON w.id = d.waste_type_id WHERE ${where.join(' AND ')}`;

  const [totalsRes, itemsRes, dailyRes] = await Promise.all([
    pool.query(`SELECT COUNT(*) AS total, COALESCE(SUM(w.is_recyclable), 0) AS recyclable,
                       COALESCE(SUM(d.rice_grams), 0) AS rice_grams ${base}`, params),
    pool.query(`SELECT w.name, w.category, w.is_recyclable, COUNT(*) AS count
                ${base} GROUP BY w.id ORDER BY count DESC, w.name`, params),
    pool.query(`SELECT DATE_FORMAT(d.created_at, '%Y-%m-%d') AS day, COUNT(*) AS count,
                       SUM(d.rice_grams) AS rice_grams ${base} GROUP BY day ORDER BY day`, params),
  ]);

  const t = totalsRes[0][0];
  res.json({
    days: q.days,
    totals: { total: Number(t.total), recyclable: Number(t.recyclable), rice_grams: Number(t.rice_grams) },
    byItem: itemsRes[0].map((r) => ({ ...r, is_recyclable: !!r.is_recyclable, count: Number(r.count) })),
    daily: dailyRes[0].map((r) => ({ day: r.day, count: Number(r.count), rice_grams: Number(r.rice_grams) })),
  });
}));

// ---- refill (dashboard login token or ADMIN_TOKEN) ----
router.post('/devices/:id/refill', userOrAdminAuth, asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id < 1) throw new HttpError(400, 'Invalid device id');
  const { grams } = refillBody.parse(req.body);
  const [result] = await pool.query(
    'UPDATE devices SET rice_stock_grams = LEAST(rice_capacity_grams, rice_stock_grams + ?) WHERE id = ?', [grams, id]);
  if (!result.affectedRows) throw new HttpError(404, 'Device not found');
  const [[device]] = await pool.query('SELECT id, name, rice_stock_grams FROM devices WHERE id = ?', [id]);
  res.json(device);
}));

// ---- dev only: fakes what the bin would send so the dashboard can be demoed without hardware ----
if (config.env !== 'production') {
  router.post('/dev/simulate', userAuth, asyncHandler(async (req, res) => {
    const { item, deviceId } = simulateBody.parse(req.body);
    let id = deviceId;
    if (!id) {
      const [rows] = await pool.query('SELECT id FROM devices ORDER BY id LIMIT 1');
      if (!rows.length) throw new HttpError(404, 'No devices registered');
      id = rows[0].id;
    }
    const confidence = Math.round((0.8 + Math.random() * 0.19) * 100) / 100;
    res.status(201).json(await recordDetection(id, { item, confidence }));
  }));
}

module.exports = router;
