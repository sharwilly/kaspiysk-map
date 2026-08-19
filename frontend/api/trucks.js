const SOURCE_URL = "https://data.ntpc.gov.tw/api/datasets/28ab4122-60e1-4065-98e5-abccb69aaca6/json";
const MAX_TRUCKS = 12;
const REQUEST_TIMEOUT_MS = 8000;

function value(row, keys) {
    for (const key of keys) {
        if (row && row[key] !== undefined && row[key] !== null && row[key] !== "") {
            return row[key];
        }
    }
    return null;
}

function rowsFrom(payload) {
    if (Array.isArray(payload)) return payload;
    if (payload && Array.isArray(payload.data)) return payload.data;
    if (payload && Array.isArray(payload.records)) return payload.records;
    if (payload?.result && Array.isArray(payload.result.records)) return payload.result.records;
    if (payload?.result && Array.isArray(payload.result)) return payload.result;
    return [];
}

function normalize(row, index) {
    const lat = Number(String(value(row, ["latitude", "lat"]) ?? "").replace(",", "."));
    const lng = Number(String(value(row, ["longitude", "lng", "lon"]) ?? "").replace(",", "."));

    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;

    const vehicle = String(value(row, ["car", "vehicle", "vehicleId"]) || `Демо-${index + 1}`);
    const route = String(value(row, ["lineid", "lineId", "line"]) || "—");
    const timestamp = String(value(row, ["time", "timestamp"]) || "—");
    const location = String(value(row, ["location", "address"]) || "Адрес не указан");
    const city = String(value(row, ["cityname", "cityName"]) || "New Taipei City");

    return {
        id: `${vehicle}-${lat}-${lng}`,
        vehicle,
        route,
        timestamp,
        location,
        city,
        lat,
        lng
    };
}

async function getRows() {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
        const response = await fetch(SOURCE_URL, {
            method: "GET",
            headers: {
                Accept: "application/json",
                "User-Agent": "OpenKaspiysk-demo/1.0"
            },
            signal: controller.signal
        });

        if (!response.ok) {
            throw new Error(`Источник вернул HTTP ${response.status}`);
        }

        const payload = await response.json();
        const rows = rowsFrom(payload);

        if (!rows.length) {
            throw new Error("Источник вернул пустой набор данных");
        }

        return rows;
    } finally {
        clearTimeout(timer);
    }
}

module.exports = async (req, res) => {
    if (req.method !== "GET") {
        res.setHeader("Allow", "GET");
        return res.status(405).json({ error: "Method not allowed" });
    }

    res.setHeader("Cache-Control", "s-maxage=120, stale-while-revalidate=300");
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Content-Type", "application/json; charset=utf-8");

    try {
        const rows = await getRows();
        const trucks = rows
            .map((row, index) => normalize(row, index))
            .filter(Boolean)
            .slice(0, MAX_TRUCKS);

        return res.status(200).json({
            source: "New Taipei City Open Data",
            demo: true,
            limit: MAX_TRUCKS,
            count: trucks.length,
            fetchedAt: new Date().toISOString(),
            trucks
        });
    } catch (error) {
        console.error("Demo trucks API error:", error);
        return res.status(502).json({
            error: "Не удалось получить демонстрационные GPS-данные",
            details: error.name === "AbortError" ? "Тайм-аут источника" : String(error.message || error)
        });
    }
};
