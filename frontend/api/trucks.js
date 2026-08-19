const BACKEND_URL = "https://kaspiysk-map-1.onrender.com";

module.exports = async (req, res) => {
    if (req.method !== "GET") {
        res.setHeader("Allow", "GET");
        return res.status(405).json({ error: "Method not allowed" });
    }

    try {
        const response = await fetch(`${BACKEND_URL}/trucks`, {
            headers: { Accept: "application/json" },
            signal: AbortSignal.timeout(10000)
        });

        const text = await response.text();
        let payload;
        try {
            payload = JSON.parse(text);
        } catch {
            payload = { error: text || `Backend HTTP ${response.status}` };
        }

        res.setHeader("Cache-Control", "s-maxage=60, stale-while-revalidate=180");
        res.setHeader("Content-Type", "application/json; charset=utf-8");
        return res.status(response.ok ? 200 : response.status).json(payload);
    } catch (error) {
        console.error("Truck proxy error:", error);
        return res.status(502).json({
            error: "Сервер мониторинга временно недоступен",
            details: error.name === "TimeoutError" ? "Тайм-аут backend" : error.message
        });
    }
};
