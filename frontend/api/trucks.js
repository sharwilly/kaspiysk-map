const SOURCE_URL = "https://data.ntpc.gov.tw/api/datasets/28AB4122-60E1-4065-98E5-ABCCB69AACA6/json/";
const MAX_TRUCKS = 12;

function value(row, keys) {
    for (const key of keys) {
        if (row && row[key] !== undefined && row[key] !== null && row[key] !== "") return row[key];
    }
    return null;
}

function rowsFrom(payload) {
    if (Array.isArray(payload)) return payload;
    if (Array.isArray(payload.data)) return payload.data;
    if (Array.isArray(payload.records)) return payload.records;
    if (payload.result && Array.isArray(payload.result.records)) return payload.result.records;
    if (Array.isArray(payload.result)) return payload.result;
    return [];
}

function normalize(row, index) {
    const lat = Number(value(row, ["latitude", "lat"]));
    const lng = Number(value(row, ["longitude", "lng", "lon"]));
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;

    const timestamp = String(value(row, ["time", "timestamp"]) || "—");
    const gpsTime = new Date(timestamp).getTime();

    // Не показываем явно устаревшие позиции.
    if (Number.isFinite(gpsTime) && Date.now() - gpsTime > 20 * 60 * 1000) return null;

    const vehicle = String(value(row, ["car", "vehicle", "vehicleId"]) || "Без номера");

    return {
        id: `${vehicle}-${index}`,
        vehicle,
        route: String(value(row, ["lineid", "lineId", "line"]) || "—"),
        timestamp,
        location: String(value(row, ["location", "address"]) || "Адрес не указан"),
        city: String(value(row, ["cityname", "cityName"]) || "New Taipei City"),
        lat,
        lng
    };
}

module.exports = async (req, res) => {
    if (req.method !== "GET") {
        res.setHeader("Allow", "GET");
        return res.status(405).json({ error: "Method not allowed" });
    }

    // CDN-кэш Vercel: максимум один запрос к источнику примерно раз в 2 минуты.
    res.setHeader("Cache-Control", "s-maxage=120, stale-while-revalidate=300");
    res.setHeader("Access-Control-Allow-Origin", "*");

    try {
        const response = await fetch(SOURCE_URL, {
            headers: { Accept: "application/json" }
        });

        if (!response.ok) throw new Error(`Источник вернул HTTP ${response.status}`);

        const payload = await response.json();
        const trucks = rowsFrom(payload)
            .map((row, index) => normalize(row, index))
            .filter(Boolean)
            .slice(0, MAX_TRUCKS);

        return res.status(200).json({
            source: "New Taipei City Open Data",
            demo: true,
            limit: MAX_TRUCKS,
            updatedAt: new Date().toISOString(),
            trucks
        });
    } catch (error) {
        console.error("Demo trucks API error:", error);
        return res.status(502).json({
            error: "Не удалось получить демонстрационные GPS-данные"
        });
    }
};
