const fetch = require('node-fetch');

const SOURCE_URL = 'https://data.ntpc.gov.tw/api/datasets/28ab4122-60e1-4065-98e5-abccb69aaca6/json';
const MAX_TRUCKS = 12;
const MAX_AGE_MINUTES = 20;

function toNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function normalize(raw) {
  if (!raw || typeof raw !== 'object') return null;

  const lat = toNumber(raw.latitude ?? raw.lat ?? raw.Latitude);
  const lng = toNumber(raw.longitude ?? raw.lng ?? raw.lon ?? raw.Longitude);
  if (lat === null || lng === null || Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;

  const vehicle = String(raw.car ?? raw.vehicle ?? raw.vehicle_id ?? raw.id ?? '').trim();
  if (!vehicle) return null;

  const recordedAt = new Date(raw.time ?? raw.timestamp ?? raw.recorded_at ?? Date.now());
  if (Number.isNaN(recordedAt.getTime())) return null;

  return {
    vehicleId: vehicle,
    recordedAt: recordedAt.toISOString(),
    latitude: lat,
    longitude: lng,
    route: String(raw.lineid ?? raw.route ?? raw.line ?? '').trim() || null,
    location: String(raw.location ?? '').trim() || null,
    speed: toNumber(raw.speed ?? raw.SpeedValue)
  };
}

async function fetchSource() {
  const response = await fetch(SOURCE_URL, {
    headers: { Accept: 'application/json', 'User-Agent': 'OpenKaspiysk-Demo/1.0' },
    timeout: 8000
  });
  if (!response.ok) throw new Error(`Source HTTP ${response.status}`);
  return response.json();
}

function extractRecords(payload) {
  if (Array.isArray(payload)) return payload;
  for (const key of ['data', 'records', 'result', 'results']) {
    if (Array.isArray(payload?.[key])) return payload[key];
  }
  return [];
}

function normalizeLatest(payload) {
  const latest = new Map();
  for (const raw of extractRecords(payload)) {
    const point = normalize(raw);
    if (!point) continue;
    const previous = latest.get(point.vehicleId);
    if (!previous || new Date(point.recordedAt) > new Date(previous.recordedAt)) {
      latest.set(point.vehicleId, point);
    }
  }
  return [...latest.values()].sort((a, b) => new Date(b.recordedAt) - new Date(a.recordedAt));
}

function isFresh(point) {
  return (Date.now() - new Date(point.recordedAt).getTime()) / 60000 <= MAX_AGE_MINUTES;
}

module.exports = { fetchSource, normalizeLatest, isFresh, MAX_TRUCKS, MAX_AGE_MINUTES };
