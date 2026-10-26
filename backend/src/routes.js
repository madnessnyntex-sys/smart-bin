const express = require('express');
const config = require('./config');
const { pool, withTransaction } = require('./db');
const { HttpError, asyncHandler, deviceAuth, adminAuth } = require('./middleware');
const { detectionBody, simulateBody, rangeQuery, refillBody } = require('./schemas');
const { decideAction } = require('./rewards');

const router = express.Router();
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

router.get('/health', asyncHandler(async (req, res) => {
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

// ---- dashboard reads ----
router.get('/waste-types', asyncHandler(async (req, res) => {
  const [rows] = await pool.query('SELECT * FROM waste_types ORDER BY name');
  res.json(rows);
}));

router.get('/devices', asyncHandler(async (req, res) => {
  const [rows] = await pool.query(`
    SELECT id, name, location, rice_stock_grams, rice_capacity_grams, last_seen_at,
           (last_seen_at IS NOT NULL AND last_seen_at > NOW() - INTERVAL 2 MINUTE) AS online
    FROM devices ORDER BY id`);
  res.json(rows.map((r) => ({ ...r, online: !!r.online })));
}));

router.get('/detections/recent', asyncHandler(async (req, res) => {
  const [rows] = await pool.query(`
    SELECT d.id, w.name, w.category, w.is_recyclable, d.confidence, d.rice_grams, d.created_at, dev.name AS device
    FROM detections d
    JOIN waste_types w ON w.id = d.waste_type_id
    JOIN devices dev ON dev.id = d.device_id
    ORDER BY d.id DESC LIMIT 10`);
  res.json(rows);
}));

router.get('/summary', asyncHandler(async (req, res) => {
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

// ---- admin ----
router.post('/devices/:id/refill', adminAuth, asyncHandler(async (req, res) => {
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
  router.post('/dev/simulate', asyncHandler(async (req, res) => {
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
