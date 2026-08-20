const express = require('express');
const pool = require('./db');

const SOURCE_URL = 'https://data.ntpc.gov.tw/api/datasets/28ab4122-60e1-4065-98e5-abccb69aaca6/json';
const MAX_TRUCKS = 12;
const STALE_MINUTES = 20;
const POLL_INTERVAL_MS = 2 * 60 * 1000;

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
    if (tableReady || dbAvailable === false) return false;
    try {
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
            CREATE INDEX IF NOT EXISTS idx_truck_gps_vehicle_time ON truck_gps_points(vehicle_id, recorded_at DESC);
            CREATE INDEX IF NOT EXISTS idx_truck_gps_time ON truck_gps_points(recorded_at DESC);
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

async function pollSource() {
    if (Date.now() - lastPollAt < POLL_INTERVAL_MS) return { sourceError: null };

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
        if (!old || point.recorded_at > old.recorded_at) latest.set(point.vehicle_id, point);
    }

    for (const point of latest.values()) {
        memoryPoints.set(`${point.vehicle_id}|${point.recorded_at}`, point);
    }
    lastPollAt = Date.now();

    const hasDb = await ensureTable();
    if (hasDb) {
        for (const point of latest.values()) {
            try {
                await pool.query(`
                    INSERT INTO truck_gps_points
                        (vehicle_id, recorded_at, latitude, longitude, route, location, source, speed)
                    SELECT $1, $2, $3, $4, $5, $6, 'new_taipei_demo', $7
                    WHERE NOT EXISTS (
                        SELECT 1 FROM truck_gps_points WHERE vehicle_id = $1 AND recorded_at = $2
                    )
                `, [point.vehicle_id, point.recorded_at, point.latitude, point.longitude, point.route, point.location, point.speed]);
            } catch (error) {
                console.warn('Could not persist truck GPS point:', error.message);
                dbAvailable = false;
                break;
            }
        }
    }

    return { sourceError: null, count: latest.size };
}

function startBackgroundPolling() {
    if (pollingStarted) return;
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

async function latestTrucks() {
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
        .slice(0, MAX_TRUCKS)
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
            const result = await pool.query(`
                SELECT recorded_at AS timestamp, latitude AS lat, longitude AS lng, route, location, speed
                FROM truck_gps_points
                WHERE vehicle_id = $1
                  AND recorded_at >= $2::date
                  AND recorded_at < ($2::date + INTERVAL '1 day')
                ORDER BY recorded_at ASC
            `, [vehicleId, date]);
            return result.rows;
        } catch (error) {
            dbAvailable = false;
        }
    }
    return [...memoryPoints.values()]
        .filter(point => point.vehicle_id === vehicleId && point.recorded_at.slice(0, 10) === date)
        .sort((a, b) => new Date(a.recorded_at) - new Date(b.recorded_at))
        .map(point => ({ timestamp: point.recorded_at, lat: point.latitude, lng: point.longitude, route: point.route, location: point.location, speed: point.speed }));
}

function installTruckRoutes(app) {
    if (app.__truckRoutesInstalled) return;
    app.__truckRoutesInstalled = true;
    startBackgroundPolling();

    app.get('/trucks', async (req, res) => {
        try {
            let sourceError = null;
            try {
                ({ sourceError } = await pollSource());
            } catch (error) {
                sourceError = error.message;
                console.error('Truck GPS source error:', error.message);
            }
            const trucks = await latestTrucks();
            res.set('Cache-Control', 'no-store');
            res.json({ trucks, count: trucks.length, max: MAX_TRUCKS, source: 'Новый Тайбэй (демо)', sourceError, storage: dbAvailable ? 'postgresql' : 'memory', staleFallback: trucks.some(t => !t.fresh) });
        } catch (error) {
            console.error('Truck API error:', error);
            res.status(500).json({ error: 'Ошибка GPS-мониторинга', details: error.message });
        }
    });

    app.get('/trucks/history/:vehicleId', async (req, res) => {
        try {
            const date = /^\d{4}-\d{2}-\d{2}$/.test(req.query.date || '') ? req.query.date : new Date().toISOString().slice(0, 10);
            res.json({ vehicle: req.params.vehicleId, date, points: await history(req.params.vehicleId, date), storage: dbAvailable ? 'postgresql' : 'memory' });
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

module.exports = { installTruckRoutes };
