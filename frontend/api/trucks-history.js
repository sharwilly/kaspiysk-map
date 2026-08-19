const BACKEND_URL = "https://kaspiysk-map-1.onrender.com";

module.exports = async (req, res) => {
    if (req.method !== "GET") {
        res.setHeader("Allow", "GET");
        return res.status(405).json({ error: "Method not allowed" });
    }

    const vehicle = String(req.query.vehicle || "").trim();
    const date = String(req.query.date || "").trim();

    if (!vehicle || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        return res.status(400).json({ error: "Нужны vehicle и date в формате YYYY-MM-DD" });
    }

    try {
        const response = await fetch(
            `${BACKEND_URL}/trucks/history/${encodeURIComponent(vehicle)}?date=${encodeURIComponent(date)}`,
            { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(10000) }
        );
        const text = await response.text();
        let payload;
        try { payload = JSON.parse(text); } catch { payload = { error: text }; }

        res.setHeader("Cache-Control", "s-maxage=30, stale-while-revalidate=120");
        res.setHeader("Content-Type", "application/json; charset=utf-8");
        return res.status(response.ok ? 200 : response.status).json(payload);
    } catch (error) {
        return res.status(502).json({ error: "Сервер истории маршрутов недоступен" });
    }
};
