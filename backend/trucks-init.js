const express = require('express');
const pool = require('./db');

const SOURCE_URL = 'https://data.ntpc.gov.tw/api/datasets/28ab4122-60e1-4065-98e5-abccb69aaca6/json';
const STALE_MINUTES = 20;
const POLL_INTERVAL_MS = 2 * 60 * 1000;
const MOSCOW_TIME_ZONE = 'Europe/Moscow';

// History is collected by GitHub Actions. The web process may still perform a
// throttled fallback poll when /trucks is requested, but it no longer starts a
// second permanent timer that competes with the collector.
const WEB_BACKGROUND_POLLING = process.env.TRUCKS_BACKGROUND_POLLING === 'true';

let tableReady = false;
let dbAvailable = null;
let pollingStarted = false;
let lastPollAt = 0;
const memoryPoints = new Map();

function num(value) {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
}

function normalize(raw) {
    if (!raw || typeof raw !== 'object') return null;
    const vehicle = String(raw.car ?? raw.vehicle ?? raw.vehicle_id ?? raw.id ?? '').trim();
    const lat = num(raw.latitude ?? raw.lat ?? raw.Latitude);
    const lng = num(raw.longitude ?? raw.lng ?? raw.lon ?? raw.Longitude);
    const time = new Date(raw.time ?? raw.timestamp ?? raw.recorded_at ?? Date.now());
    if (!vehicle || lat === null || lng === null || Math.abs(lat) > 90 || Math.abs(lng) > 180 || Number.isNaN(time.getTime())) return null;
    return {
        vehicle_id: vehicle,
        source_recorded_at: time.toISOString(),
        latitude: lat,
        longitude: lng,
        route: String(raw.lineid ?? raw.route ?? raw.line ?? '').trim() || null,
        location: String(raw.location ?? '').trim() || null,
        speed: num(raw.speed ?? raw.SpeedValue)
    };
}

function recordsFrom(payload) {
    if (Array.isArray(payload)) return payload;
    for (const key of ['data', 'records', 'result', 'results']) {
        if (Array.isArray(payload?.[key])) return payload[key];
    }
    return [];
}

async function ensureTable() {
    if (tableReady) return true;
    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS truck_gps_points (
                id BIGSERIAL PRIMARY KEY,
                vehicle_id TEXT NOT NULL,
                recorded_at TIMESTAMPTZ NOT NULL,
                source_recorded_at TIMESTAMPTZ,
                latitude DOUBLE PRECISION NOT NULL,
                longitude DOUBLE PRECISION NOT NULL,
                route TEXT,
                location TEXT,
                source TEXT NOT NULL DEFAULT 'new_taipei_demo',
                speed DOUBLE PRECISION,
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            );
            ALTER TABLE truck_gps_points
                ADD COLUMN IF NOT EXISTS source_recorded_at TIMESTAMPTZ;
            CREATE INDEX IF NOT EXISTS idx_truck_gps_vehicle_time ON truck_gps_points(vehicle_id, recorded_at DESC);
            CREATE INDEX IF NOT EXISTS idx_truck_gps_time ON truck_gps_points(recorded_at DESC);
            CREATE INDEX IF NOT EXISTS idx_truck_gps_vehicle_source_time ON truck_gps_points(vehicle_id, source_recorded_at DESC);
        `);
        tableReady = true;
        dbAvailable = true;
        return true;
    } catch (error) {
        dbAvailable = false;
        console.warn('Truck history DB unavailable; using in-memory GPS history:', error.message);
        return false;
    }
}

async function persistPoint(point) {
    // The source refreshes every ~2 minutes. Render and GitHub Actions can
    // legitimately poll the same snapshot, so deduplicate identical source
    // observations instead of creating duplicate history points.
    await pool.query(`
        INSERT INTO truck_gps_points
            (vehicle_id, recorded_at, source_recorded_at, latitude, longitude, route, location, source, speed)
        SELECT $1, $2, $3, $4, $5, $6, $7, 'new_taipei_demo', $8
        WHERE NOT EXISTS (
            SELECT 1
            FROM truck_gps_points
            WHERE vehicle_id = $1
              AND source_recorded_at = $3
              AND latitude = $4
              AND longitude = $5
        )
    `, [point.vehicle_id, point.recorded_at, point.source_recorded_at, point.latitude, point.longitude, point.route, point.location, point.speed]);
}

async function pollSource({ force = false } = {}) {
    if (!force && Date.now() - lastPollAt < POLL_INTERVAL_MS) {
        return { sourceError: null, count: 0, skipped: true };
    }

    const response = await fetch(SOURCE_URL, {
        headers: { Accept: 'application/json', 'User-Agent': 'OpenKaspiysk-Demo/1.0' },
        signal: AbortSignal.timeout(8000)
    });
    if (!response.ok) throw new Error(`GPS source HTTP ${response.status}`);

    const payload = await response.json();
    const latest = new Map();
    for (const raw of recordsFrom(payload)) {
        const point = normalize(raw);
        if (!point) continue;
        const old = latest.get(point.vehicle_id);
        if (!old || point.source_recorded_at > old.source_recorded_at) latest.set(point.vehicle_id, point);
    }

    const polledAt = new Date().toISOString();
    const snapshots = [...latest.values()].map(point => ({ ...point, recorded_at: polledAt }));

    for (const point of snapshots) {
        memoryPoints.set(`${point.vehicle_id}|${point.source_recorded_at}|${point.latitude}|${point.longitude}`, point);
    }
    lastPollAt = Date.now();

    const hasDb = await ensureTable();
    if (hasDb) {
        for (const point of snapshots) {
            try {
                await persistPoint(point);
            } catch (error) {
                console.warn('Could not persist truck GPS point:', error.message);
                dbAvailable = false;
                break;
            }
        }
    }

    return { sourceError: null, count: snapshots.length, skipped: false, recordedAt: polledAt };
}

function startBackgroundPolling() {
    if (!WEB_BACKGROUND_POLLING || pollingStarted) return;
    pollingStarted = true;
    const run = async () => {
        try {
            const result = await pollSource();
            console.log(`[trucks] background poll: ${result.count ?? 0} vehicles; history=${dbAvailable ? 'postgresql' : 'memory'}`);
        } catch (error) {
            console.error('[trucks] background poll failed:', error.message);
        }
    };
    run();
    setInterval(run, POLL_INTERVAL_MS).unref();
}

async function publishedTruckSnapshot() {
    const response = await fetch('https://raw.githubusercontent.com/sharwilly/kaspiysk-map/gps-data/trucks-latest.json', {
        headers: { Accept: 'application/json', 'User-Agent': 'OpenKaspiysk-Demo/1.0' },
        signal: AbortSignal.timeout(8000)
    });
    if (!response.ok) throw new Error(`GPS snapshot HTTP ${response.status}`);
    const payload = await response.json();
    if (!Array.isArray(payload.trucks)) throw new Error('Invalid GPS snapshot');
    return payload.trucks;
}

async function latestTrucks() {
    if (!dbAvailable) await ensureTable();
    const byVehicle = new Map();

    for (const point of memoryPoints.values()) {
        const old = byVehicle.get(point.vehicle_id);
        if (!old || point.recorded_at > old.recorded_at) byVehicle.set(point.vehicle_id, point);
    }

    if (dbAvailable) {
        try {
            const result = await pool.query(`
                SELECT DISTINCT ON (vehicle_id)
                    vehicle_id, recorded_at, latitude, longitude, route, location, speed
                FROM truck_gps_points
                ORDER BY vehicle_id, recorded_at DESC
            `);
            for (const row of result.rows) {
                const old = byVehicle.get(row.vehicle_id);
                if (!old || new Date(row.recorded_at) > new Date(old.recorded_at)) byVehicle.set(row.vehicle_id, row);
            }
        } catch (error) {
            dbAvailable = false;
        }
    }

    return [...byVehicle.values()]
        .sort((a, b) => new Date(b.recorded_at) - new Date(a.recorded_at))
        .map(row => {
            const ageMinutes = Math.max(0, (Date.now() - new Date(row.recorded_at).getTime()) / 60000);
            return {
                id: row.vehicle_id,
                vehicle: row.vehicle_id,
                timestamp: row.recorded_at,
                lat: Number(row.latitude),
                lng: Number(row.longitude),
                route: row.route || null,
                location: row.location || null,
                speed: row.speed == null ? null : Number(row.speed),
                fresh: ageMinutes <= STALE_MINUTES,
                ageMinutes: Math.round(ageMinutes * 10) / 10
            };
        });
}

async function history(vehicleId, date) {
    if (dbAvailable) {
        try {
            // The UI sends a Kaspiysk calendar date. Use the project's local
            // timezone rather than UTC so points around 00:00 are not shown on
            // the wrong day.
            const result = await pool.query(`
                SELECT recorded_at AS timestamp, latitude AS lat, longitude AS lng, route, location, speed
                FROM truck_gps_points
                WHERE vehicle_id = $1
                  AND (recorded_at AT TIME ZONE '${MOSCOW_TIME_ZONE}')::date = $2::date
                ORDER BY recorded_at ASC
            `, [vehicleId, date]);
            return result.rows;
        } catch (error) {
            console.error('Truck history DB query failed:', error.message);
            dbAvailable = false;
        }
    }
    return [...memoryPoints.values()]
        .filter(point => point.vehicle_id === vehicleId && new Intl.DateTimeFormat('en-CA', { timeZone: MOSCOW_TIME_ZONE }).format(new Date(point.recorded_at)) === date)
        .sort((a, b) => new Date(a.recorded_at) - new Date(b.recorded_at))
        .map(point => ({ timestamp: point.recorded_at, lat: point.latitude, lng: point.longitude, route: point.route, location: point.location, speed: point.speed }));
}

function installTruckRoutes(app) {
    if (app.__truckRoutesInstalled) return;
    app.__truckRoutesInstalled = true;
    startBackgroundPolling();

    app.get('/trucks/poll', async (req, res) => {
        try {
            const result = await pollSource({ force: true });
            res.set('Cache-Control', 'no-store');
            res.json({ ok: true, ...result, storage: dbAvailable ? 'postgresql' : 'memory' });
        } catch (error) {
            console.error('Truck GPS poll error:', error.message);
            res.status(502).json({ ok: false, error: error.message, storage: dbAvailable ? 'postgresql' : 'memory' });
        }
    });

    app.get('/trucks', async (req, res) => {
        try {
            let sourceError = null;
  let trucks;
  try {
      trucks = await publishedTruckSnapshot();
  } catch (error) {
      sourceError = error.message;
      trucks = await latestTrucks();
  }
            res.set('Cache-Control', 'no-store');
            res.json({ trucks, count: trucks.length, source: 'Новый Тайбэй (демо)', sourceError, storage: dbAvailable ? 'postgresql' : 'memory', staleFallback: trucks.some(t => !t.fresh) });
        } catch (error) {
            console.error('Truck API error:', error);
            res.status(500).json({ error: 'Ошибка GPS-мониторинга', details: error.message });
        }
    });

    app.get('/trucks/history/:vehicleId', async (req, res) => {
        try {
            const date = /^\d{4}-\d{2}-\d{2}$/.test(req.query.date || '') ? req.query.date : new Date().toISOString().slice(0, 10);
            const points = await history(req.params.vehicleId, date);
            res.set('Cache-Control', 'no-store');
            res.json({ vehicle: req.params.vehicleId, date, points, count: points.length, storage: dbAvailable ? 'postgresql' : 'memory' });
        } catch (error) {
            console.error('Truck history error:', error);
            res.status(500).json({ error: 'Ошибка истории маршрута', details: error.message });
        }
    });
}

if (require.main !== module) {
    const originalListen = express.application.listen;
    if (!express.application.__kaspiyskTruckListenPatched) {
        express.application.__kaspiyskTruckListenPatched = true;
        express.application.listen = function patchedListen(...args) {
            installTruckRoutes(this);
            return originalListen.apply(this, args);
        };
    }
}

module.exports = { installTruckRoutes, pollSource };
