const Module = require('module');
const originalExpress = require('express');
const pool = require('./db');

const SOURCE_URL = 'https://data.ntpc.gov.tw/api/datasets/28ab4122-60e1-4065-98e5-abccb69aaca6/json';
const MAX_TRUCKS = 12;
const STALE_MINUTES = 20;
let tableReady = false;

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

    if (!vehicle || lat === null || lng === null || Math.abs(lat) > 90 || Math.abs(lng) > 180 || Number.isNaN(time.getTime())) {
        return null;
    }

    return {
        vehicle_id: vehicle,
        recorded_at: time.toISOString(),
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
    if (tableReady) return;

    await pool.query(`
        CREATE TABLE IF NOT EXISTS truck_gps_points (
            id BIGSERIAL PRIMARY KEY,
            vehicle_id TEXT NOT NULL,
            recorded_at TIMESTAMPTZ NOT NULL,
            latitude DOUBLE PRECISION NOT NULL,
            longitude DOUBLE PRECISION NOT NULL,
            route TEXT,
            location TEXT,
            source TEXT NOT NULL DEFAULT 'new_taipei_demo',
            speed DOUBLE PRECISION,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
        CREATE INDEX IF NOT EXISTS idx_truck_gps_vehicle_time
            ON truck_gps_points(vehicle_id, recorded_at DESC);
        CREATE INDEX IF NOT EXISTS idx_truck_gps_time
            ON truck_gps_points(recorded_at DESC);
    `);

    tableReady = true;
}

async function pollSource() {
    const response = await fetch(SOURCE_URL, {
        headers: {
            Accept: 'application/json',
            'User-Agent': 'OpenKaspiysk-Demo/1.0'
        },
        signal: AbortSignal.timeout(8000)
    });

    if (!response.ok) throw new Error(`GPS source HTTP ${response.status}`);

    const payload = await response.json();
    const latest = new Map();

    for (const raw of recordsFrom(payload)) {
        const point = normalize(raw);
        if (!point) continue;

        const old = latest.get(point.vehicle_id);
        if (!old || point.recorded_at > old.recorded_at) {
            latest.set(point.vehicle_id, point);
        }
    }

    for (const point of latest.values()) {
        await pool.query(`
            INSERT INTO truck_gps_points
                (vehicle_id, recorded_at, latitude, longitude, route, location, source, speed)
            SELECT $1, $2, $3, $4, $5, $6, 'new_taipei_demo', $7
            WHERE NOT EXISTS (
                SELECT 1 FROM truck_gps_points
                WHERE vehicle_id = $1 AND recorded_at = $2
            )
        `, [
            point.vehicle_id,
            point.recorded_at,
            point.latitude,
            point.longitude,
            point.route,
            point.location,
            point.speed
        ]);
    }
}

async function latestTrucks() {
    const result = await pool.query(`
        SELECT DISTINCT ON (vehicle_id)
            vehicle_id AS id,
            vehicle_id AS vehicle,
            recorded_at AS timestamp,
            latitude AS lat,
            longitude AS lng,
            route,
            location,
            speed,
            EXTRACT(EPOCH FROM (NOW() - recorded_at)) / 60 AS age_minutes
        FROM truck_gps_points
        ORDER BY vehicle_id, recorded_at DESC
    `);

    return result.rows
        .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
        .slice(0, MAX_TRUCKS)
        .map(row => ({
            ...row,
            fresh: Number(row.age_minutes) <= STALE_MINUTES,
            ageMinutes: Math.round(Number(row.age_minutes) * 10) / 10
        }));
}

async function history(vehicleId, date) {
    const result = await pool.query(`
        SELECT
            recorded_at AS timestamp,
            latitude AS lat,
            longitude AS lng,
            route,
            location,
            speed
        FROM truck_gps_points
        WHERE vehicle_id = $1
          AND recorded_at >= $2::date
          AND recorded_at < ($2::date + INTERVAL '1 day')
        ORDER BY recorded_at ASC
    `, [vehicleId, date]);

    return result.rows;
}

function installTruckRoutes(app) {
    if (app.__truckRoutesInstalled) return;
    app.__truckRoutesInstalled = true;

    app.get('/trucks', async (req, res) => {
        try {
            await ensureTable();

            let sourceError = null;
            try {
                await pollSource();
            } catch (error) {
                sourceError = error.message;
                console.error('Truck GPS source error:', error.message);
            }

            const trucks = await latestTrucks();

            res.set('Cache-Control', 'no-store');
            res.json({
                trucks,
                count: trucks.length,
                source: 'Новый Тайбэй (демо)',
                sourceError,
                staleFallback: Boolean(sourceError || trucks.some(t => !t.fresh))
            });
        } catch (error) {
            console.error('Truck API error:', error);
            res.status(500).json({
                error: 'Ошибка GPS-мониторинга',
                details: error.message
            });
        }
    });

    app.get('/trucks/history/:vehicleId', async (req, res) => {
        try {
            await ensureTable();

            const date = /^\d{4}-\d{2}-\d{2}$/.test(req.query.date || '')
                ? req.query.date
                : new Date().toISOString().slice(0, 10);

            res.json({
                vehicle: req.params.vehicleId,
                date,
                points: await history(req.params.vehicleId, date)
            });
        } catch (error) {
            console.error('Truck history error:', error);
            res.status(500).json({
                error: 'Ошибка истории маршрута',
                details: error.message
            });
        }
    });
}

// server.js is started with `node -r ./trucks-init.js server.js`.
// Wrap the Express factory so our routes are installed on the exact app
// instance created by server.js, without rewriting the existing backend.
function wrappedExpress(...args) {
    const app = originalExpress(...args);
    installTruckRoutes(app);
    return app;
}

Object.setPrototypeOf(wrappedExpress, originalExpress);
Object.assign(wrappedExpress, originalExpress);

const expressModule = require.cache[require.resolve('express')];
if (expressModule) {
    expressModule.exports = wrappedExpress;
}
