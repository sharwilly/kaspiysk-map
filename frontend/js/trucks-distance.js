(() => {
    const BACKEND_URL = "https://kaspiysk-map-1.onrender.com";
    const distanceCache = new Map();
    const pendingRequests = new Map();

    function localDateISO(date = new Date()) {
        const offset = date.getTimezoneOffset();
        return new Date(date.getTime() - offset * 60000).toISOString().slice(0, 10);
    }

    function distanceKm(a, b) {
        const R = 6371;
        const toRad = degrees => degrees * Math.PI / 180;
        const dLat = toRad(b.lat - a.lat);
        const dLng = toRad(b.lng - a.lng);
        const lat1 = toRad(a.lat);
        const lat2 = toRad(b.lat);
        const h = Math.sin(dLat / 2) ** 2
            + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
        return 2 * R * Math.asin(Math.sqrt(Math.min(1, h)));
    }

    function calculateDistance(points) {
        const valid = points
            .map(point => ({
                ...point,
                lat: Number(point.lat),
                lng: Number(point.lng)
            }))
            .filter(point =>
                Number.isFinite(point.lat) &&
                Number.isFinite(point.lng) &&
                !Number.isNaN(new Date(point.timestamp).getTime())
            )
            .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

        let totalKm = 0;
        let acceptedSegments = 0;

        for (let i = 1; i < valid.length; i++) {
            const previous = valid[i - 1];
            const current = valid[i];
            const distance = distanceKm(previous, current);
            const elapsedHours = (new Date(current.timestamp) - new Date(previous.timestamp)) / 3600000;

            if (!Number.isFinite(distance) || distance <= 0) continue;
            if (!Number.isFinite(elapsedHours) || elapsedHours <= 0) continue;

            const impliedSpeed = distance / elapsedHours;
            if (impliedSpeed > 120 || distance > 5) continue;

            totalKm += distance;
            acceptedSegments++;
        }

        return {
            totalKm,
            points: valid.length,
            acceptedSegments
        };
    }

    function formatDistance(result) {
        if (!result.points) return "нет GPS-точек";
        if (result.acceptedSegments === 0) return "0,0 км";
        return `${result.totalKm.toFixed(1).replace(".", ",")} км`;
    }

    async function getDistance(vehicle, date) {
        const key = `${vehicle}|${date}`;
        if (distanceCache.has(key)) return distanceCache.get(key);
        if (pendingRequests.has(key)) return pendingRequests.get(key);

        const request = (async () => {
            try {
                const url = `${BACKEND_URL}/trucks/history/${encodeURIComponent(vehicle)}?date=${encodeURIComponent(date)}&_=${Date.now()}`;
                const response = await fetch(url, { cache: "no-store" });
                if (!response.ok) throw new Error(`HTTP ${response.status}`);
                const payload = await response.json();
                if (!Array.isArray(payload.points)) throw new Error("Некорректный ответ истории");

                const result = calculateDistance(payload.points);
                distanceCache.set(key, result);
                return result;
            } finally {
                pendingRequests.delete(key);
            }
        })();

        pendingRequests.set(key, request);
        return request;
    }

    async function updatePopup(content) {
        const button = content.querySelector(".popup-history[data-vehicle]");
        if (!button) return;

        const vehicle = String(button.dataset.vehicle || "").trim();
        if (!vehicle || content.querySelector(".popup-distance")) return;

        const distanceRow = document.createElement("div");
        distanceRow.className = "popup-distance";
        distanceRow.style.cssText = "margin-top:4px;font-weight:600;color:#0f766e";
        distanceRow.textContent = "Пройдено сегодня: рассчитываем…";
        button.parentElement.insertBefore(distanceRow, button);

        const date = localDateISO();

        try {
            const result = await getDistance(vehicle, date);
            if (!document.body.contains(distanceRow)) return;

            distanceRow.textContent = `Пройдено сегодня: ${formatDistance(result)}`;
            distanceRow.title = result.points
                ? `По ${result.points} GPS-точкам за ${date}`
                : `GPS-точек за ${date} нет`;
        } catch (error) {
            console.error("Truck daily distance load failed:", error);
            if (document.body.contains(distanceRow)) {
                distanceRow.textContent = "Пройдено сегодня: нет данных";
            }
        }
    }

    const observer = new MutationObserver(mutations => {
        for (const mutation of mutations) {
            for (const node of mutation.addedNodes) {
                if (!(node instanceof Element)) continue;
                const popup = node.matches(".leaflet-popup-content")
                    ? node
                    : node.querySelector(".leaflet-popup-content");
                if (popup) updatePopup(popup);
            }
        }
    });

    function init() {
        observer.observe(document.body, { childList: true, subtree: true });
        document.querySelectorAll(".leaflet-popup-content").forEach(updatePopup);
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", init, { once: true });
    } else {
        init();
    }
})();
