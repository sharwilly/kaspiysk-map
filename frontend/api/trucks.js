const DATASET_URL = "https://data.gov.tw/api/v2/rest/dataset/83558";
const MAX_TRUCKS = 12;

function toNumber(value) {
    if (value === null || value === undefined || value === "") return NaN;
    return Number(String(value).replace(",", "."));
}

function collectRecords(value, result = []) {
    if (Array.isArray(value)) {
        for (const item of value) collectRecords(item, result);
        return result;
    }

    if (!value || typeof value !== "object") return result;

    const longitude = toNumber(value.X ?? value.x ?? value.longitude ?? value.lon);
    const latitude = toNumber(value.Y ?? value.y ?? value.latitude ?? value.lat);

    if (
        Number.isFinite(latitude) &&
        Number.isFinite(longitude) &&
        Math.abs(latitude) <= 90 &&
        Math.abs(longitude) <= 180
    ) {
        result.push(value);
    }

    for (const child of Object.values(value)) {
        if (child && typeof child === "object") collectRecords(child, result);
    }

    return result;
}

function findUrls(value, result = []) {
    if (!value || typeof value !== "object") return result;

    if (Array.isArray(value)) {
        value.forEach(item => findUrls(item, result));
        return result;
    }

    for (const [key, child] of Object.entries(value)) {
        if (
            typeof child === "string" &&
            child.startsWith("http") &&
            /download|resource|json/i.test(key)
        ) {
            result.push(child);
        }

        if (child && typeof child === "object") findUrls(child, result);
    }

    return result;
}

function normalize(record) {
    const longitude = toNumber(record.X ?? record.x ?? record.longitude ?? record.lon);
    const latitude = toNumber(record.Y ?? record.y ?? record.latitude ?? record.lat);

    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
    if (Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return null;

    const car = record.car ?? record.Car ?? record.vehicle ?? record.vehicle_id;
    if (!car) return null;

    const speed = toNumber(record.SpeedValue ?? record.speed ?? record.Speed);

    return {
        id: String(car),
        vehicle: String(car),
        line: String(record.lineid ?? record.linid ?? record.line ?? "—"),
        latitude,
        longitude,
        speed: Number.isFinite(speed) ? speed : 0,
        timestamp: String(record.time ?? record.Time ?? record.timestamp ?? "—"),
        overSpeed: record.OverSpeed ?? record.overspeed ?? record.over_speed ?? false,
        location: String(record.location ?? "")
    };
}

async function getJson(url) {
    const response = await fetch(url, {
        headers: { "Accept": "application/json" }
    });

    if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
    }

    return response.json();
}

module.exports = async (req, res) => {
    if (req.method !== "GET") {
        res.setHeader("Allow", "GET");
        return res.status(405).json({ error: "Method not allowed" });
    }

    // Vercel cache: не опрашиваем внешний источник при каждом открытии страницы.
    res.setHeader(
        "Cache-Control",
        "s-maxage=120, stale-while-revalidate=300"
    );

    try {
        const metadata = await getJson(DATASET_URL);
        const urls = [...new Set(findUrls(metadata))];

        if (!urls.length) {
            throw new Error("В метаданных не найден ресурс GPS-данных");
        }

        let rawRecords = [];

        for (const url of urls) {
            try {
                const data = await getJson(url);
                const records = collectRecords(data);
                if (records.length) {
                    rawRecords = records;
                    break;
                }
            } catch (error) {
                console.warn("Не удалось получить ресурс:", url, error.message);
            }
        }

        const unique = new Map();

        for (const raw of rawRecords) {
            const truck = normalize(raw);
            if (!truck) continue;

            // Оставляем только одну актуальную позицию каждой машины.
            const previous = unique.get(truck.id);
            if (!previous || truck.timestamp >= previous.timestamp) {
                unique.set(truck.id, truck);
            }
        }

        const trucks = [...unique.values()]
            .sort((a, b) => a.vehicle.localeCompare(b.vehicle))
            .slice(0, MAX_TRUCKS);

        return res.status(200).json({
            source: "Taichung City Government open data",
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
