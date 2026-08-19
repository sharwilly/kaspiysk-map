const express = require('express');
const pool = require('./db');

const SOURCE_URL = 'https://data.ntpc.gov.tw/api/datasets/28ab4122-60e1-4065-98e5-abccb69aaca6/json';
const MAX_TRUCKS = 12;
const FALLBACK_AGE_MINUTES = 24 * 60;
const TABLE_SQL = `
CREATE TABLE IF NOT EXISTS truck_gps_points (
  id BIGSERIAL PRIMARY KEY,
  vehicle_id TEXT NOT NULL,
  recorded_at TIMESTAMPTZ NOT NULL,
  latitude DOUBLE PRECISION NOT NULL,
  longitude DOUBLE PRECISION NOT NULL,
  route TEXT,
  location TEXT,
  source TEXT NOT NULL DEFAULT 'new_taipei',
  speed DOUBLE PRECISION,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_truck_gps_vehicle_time ON truck_gps_points(vehicle_id, recorded_at DESC);
CREATE INDEX IF NOT EXISTS idx_truck_gps_recorded_at ON truck_gps_points(recorded_at DESC);
`;

let dbReady;
async function ensureDb() {
  if (!dbReady) {
    dbReady = pool.query(TABLE_SQL).catch(err => {
      dbReady = null;
      throw err;
    });
  }
  return dbReady;
}

function number(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function normalize(raw) {
  const latitude = number(raw?.latitude ?? raw?.lat ?? raw?.Latitude);
  const longitude = number(raw?.longitude ?? raw?.lng ?? raw?.lon ?? raw?.Longitude);
  const vehicleId = String(raw?.car ?? raw?.vehicle ?? raw?.vehicle_id ?? raw?.id ?? '').trim();
  if (!vehicleId || latitude === null || longitude === null || Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return null;

  const date = new Date(raw?.time ?? raw?.timestamp ?? raw?.recorded_at ?? Date.now());
  if (Number.isNaN(date.getTime())) return null;

  return {
    vehicleId,
    recordedAt: date.toISOString(),
    latitude,
    longitude,
    route: String(raw?.lineid ?? raw?.route ?? raw?.line ?? '').trim() || null,
    location: String(raw?.location ?? '').trim() || null,
    speed: number(raw?.speed ?? raw?.SpeedValue)
  };
}

function records(payload) {
  if (Array.isArray(payload)) return payload;
  for (const key of ['data', 'records', 'result', 'results']) {
    if (Array.isArray(payload?.[key])) return payload[key];
  }
  return [];
}

async function fetchLive() {
  const response = await fetch(SOURCE_URL, {
    headers: { Accept: 'application/json', 'User-Agent': 'OpenKaspiysk-Demo/1.0' },
    signal: AbortSignal.timeout(8000)
  });
  if (!response.ok) throw new Error(`GPS source HTTP ${response.status}`);
  const payload = await response.json();
  const latest = new Map();
  for (const raw of records(payload)) {
    const point = normalize(raw);
    if (!point) continue;
    const old = latest.get(point.vehicleId);
    if (!old || new Date(point.recordedAt) > new Date(old.recordedAt)) latest.set(point.vehicleId, point);
  }
  return [...latest.values()].sort((a, b) => new Date(b.recordedAt) - new Date(a.recordedAt));
}

async function save(points) {
  if (!points.length) return;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const p of points) {
      await client.query(
        `INSERT INTO truck_gps_points(vehicle_id, recorded_at, latitude, longitude, route, location, source, speed)
         SELECT $1,$2,$3,$4,$5,$6,$7,$8
         WHERE NOT EXISTS (
           SELECT 1 FROM truck_gps_points WHERE vehicle_id=$1 AND recorded_at=$2
         )`,
        [p.vehicleId, p.recordedAt, p.latitude, p.longitude, p.route, p.location, 'new_taipei', p.speed]
      );
    }
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

async function latestStored(limit) {
  const result = await pool.query(
    `SELECT DISTINCT ON (vehicle_id)
       vehicle_id AS "vehicleId", recorded_at AS "recordedAt", latitude, longitude,
       route, location, source, speed
     FROM truck_gps_points
     WHERE recorded_at >= NOW() - INTERVAL '${FALLBACK_AGE_MINUTES} minutes'
     ORDER BY vehicle_id, recorded_at DESC`
  );
  return result.rows.sort((a, b) => new Date(b.recordedAt) - new Date(a.recordedAt)).slice(0, limit);
}

function decorate(point, live) {
  const ageMinutes = Math.max(0, (Date.now() - new Date(point.recordedAt).getTime()) / 60000);
  return {
    ...point,
    latitude: Number(point.latitude),
    longitude: Number(point.longitude),
    speed: point.speed == null ? null : Number(point.speed),
    ageMinutes: Math.round(ageMinutes * 10) / 10,
    status: live ? 'live' : 'last_known',
    statusLabel: live ? 'Актуальный GPS' : 'Последняя известная позиция'
  };
}

async function trucksHandler(req, res) {
  try {
    await ensureDb();
    let live = [];
    let sourceError = null;
    try {
      live = await fetchLive();
      await save(live);
    } catch (err) {
      sourceError = err.message;
      console.error('Truck GPS source:', err.message);
    }

    const liveIds = new Set(live.map(x => x.vehicleId));
    let points = live.slice(0, MAX_TRUCKS).map(x => decorate(x, true));

    if (points.length < MAX_TRUCKS) {
      const stored = await latestStored(MAX_TRUCKS * 2);
      for (const point of stored) {
        if (points.length >= MAX_TRUCKS) break;
        if (liveIds.has(point.vehicleId)) continue;
        points.push(decorate(point, false));
      }
    }

    res.json({
      trucks: points,
      count: points.length,
      requested: MAX_TRUCKS,
      source: 'Новый Тайбэй (демо)',
      sourceError
    });
  } catch (err) {
    console.error('GET /trucks:', err);
    res.status(500).json({ error: 'Не удалось получить данные мусоровозов', details: err.message });
  }
}

async function historyHandler(req, res) {
  try {
    await ensureDb();
    const vehicleId = String(req.params.vehicleId || '').trim();
    if (!vehicleId) return res.status(400).json({ error: 'Не указан vehicleId' });

    const date = /^\d{4}-\d{2}-\d{2}$/.test(req.query.date || '') ? req.query.date : new Date().toISOString().slice(0, 10);
    const result = await pool.query(
      `SELECT id, vehicle_id AS "vehicleId", recorded_at AS "recordedAt", latitude, longitude,
              route, location, source, speed
       FROM truck_gps_points
       WHERE vehicle_id=$1 AND recorded_at >= $2::date AND recorded_at < ($2::date + INTERVAL '1 day')
       ORDER BY recorded_at ASC`,
      [vehicleId, date]
    );

    res.json({
      vehicleId,
      date,
      count: result.rows.length,
      points: result.rows.map(p => ({ ...p, latitude: Number(p.latitude), longitude: Number(p.longitude), speed: p.speed == null ? null : Number(p.speed) }))
    });
  } catch (err) {
    console.error('GET /trucks/history:', err);
    res.status(500).json({ error: 'Не удалось получить историю маршрута', details: err.message });
  }
}

const originalListen = express.application.listen;
if (!express.application.__kaspiyskTruckRoutes) {
  express.application.__kaspiyskTruckRoutes = true;
  express.application.listen = function (...args) {
    if (!this.__kaspiyskTruckRoutesInstalled) {
      this.__kaspiyskTruckRoutesInstalled = true;
      this.get('/trucks', trucksHandler);
      this.get('/trucks/history/:vehicleId', historyHandler);
      console.log('Truck API installed: GET /trucks, GET /trucks/history/:vehicleId');
    }
    return originalListen.apply(this, args);
  };
}
