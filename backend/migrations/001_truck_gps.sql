CREATE TABLE IF NOT EXISTS truck_gps_points (
    id BIGSERIAL PRIMARY KEY,
    vehicle_id TEXT NOT NULL,
    recorded_at TIMESTAMPTZ NOT NULL,
    latitude DOUBLE PRECISION NOT NULL,
    longitude DOUBLE PRECISION NOT NULL,
    route TEXT,
    location TEXT,
    source TEXT NOT NULL DEFAULT 'demo',
    speed DOUBLE PRECISION,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_truck_gps_vehicle_time
    ON truck_gps_points (vehicle_id, recorded_at DESC);

CREATE INDEX IF NOT EXISTS idx_truck_gps_recorded_at
    ON truck_gps_points (recorded_at DESC);

CREATE INDEX IF NOT EXISTS idx_truck_gps_vehicle_date
    ON truck_gps_points (vehicle_id, (recorded_at::date), recorded_at);
