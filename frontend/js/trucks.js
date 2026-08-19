document.addEventListener("DOMContentLoaded", () => {
    const BACKEND_URL = "https://kaspiysk-map-1.onrender.com";
    const map = L.map("trucks-map", { zoomControl: true }).setView([25.02, 121.46], 12);
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { attribution: "© OpenStreetMap contributors" }).addTo(map);

    const markers = new Map();
    let initialFit = false;
    let currentTrucks = [];
    const els = {
        status: document.getElementById("mapStatus"), count: document.getElementById("truckCount"),
        moving: document.getElementById("movingCount"), updated: document.getElementById("lastUpdated"),
        list: document.getElementById("truckList"), refresh: document.getElementById("refreshTrucks")
    };

    const historyPanel = document.createElement("div");
    historyPanel.className = "truck-history-panel";
    historyPanel.innerHTML = `<div class="history-head"><strong>История маршрута</strong><button type="button" id="closeHistory">×</button></div><div id="historyInfo">Выберите мусоровоз</div>`;
    els.list.parentElement.appendChild(historyPanel);
    document.getElementById("closeHistory").addEventListener("click", () => historyPanel.classList.remove("open"));
    let historyLine = null, historyStart = null, historyEnd = null;

    function esc(value) { return String(value ?? "—").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;"); }
    function setStatus(text) { els.status.textContent = text; }

    function popup(truck) {
        const state = truck.fresh ? "🟢 актуальный GPS" : "🟡 последняя известная позиция";
        return `<div style="min-width:200px"><strong>🚛 Мусоровоз ${esc(truck.vehicle)}</strong><br><span>Статус: ${state}</span><br><span>Маршрут: ${esc(truck.route)}</span><br><span>${esc(truck.location)}</span><br><span>GPS: ${esc(new Date(truck.timestamp).toLocaleString("ru-RU"))}</span><br><button class="popup-history" data-vehicle="${esc(truck.vehicle)}" style="margin-top:6px">Показать маршрут сегодня</button></div>`;
    }

    function drawHistory(points, vehicle, date) {
        if (historyLine) map.removeLayer(historyLine);
        if (historyStart) map.removeLayer(historyStart);
        if (historyEnd) map.removeLayer(historyEnd);
        const latlngs = points.map(p => [Number(p.lat), Number(p.lng)]).filter(p => Number.isFinite(p[0]) && Number.isFinite(p[1]));
        if (latlngs.length < 2) {
            document.getElementById("historyInfo").textContent = `№${vehicle}: за ${date} пока недостаточно GPS-точек.`;
            historyPanel.classList.add("open"); return;
        }
        historyLine = L.polyline(latlngs, { weight: 5, opacity: 0.8 }).addTo(map);
        historyStart = L.circleMarker(latlngs[0], { radius: 7 }).addTo(map).bindTooltip("Начало");
        historyEnd = L.circleMarker(latlngs.at(-1), { radius: 7 }).addTo(map).bindTooltip("Последняя точка");
        map.fitBounds(historyLine.getBounds(), { padding: [40, 40] });
        document.getElementById("historyInfo").innerHTML = `<b>🚛 №${esc(vehicle)}</b><br>${latlngs.length} GPS-точек<br>${esc(date)}<br>${esc(new Date(points[0].timestamp).toLocaleTimeString("ru-RU"))} — ${esc(new Date(points.at(-1).timestamp).toLocaleTimeString("ru-RU"))}`;
        historyPanel.classList.add("open");
    }

    async function showHistory(vehicle) {
        const date = new Date().toISOString().slice(0, 10);
        document.getElementById("historyInfo").textContent = `Загрузка маршрута №${vehicle}…`;
        historyPanel.classList.add("open");
        try {
            const response = await fetch(`${BACKEND_URL}/trucks/history/${encodeURIComponent(vehicle)}?date=${date}`, { cache: "no-store" });
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const payload = await response.json(); drawHistory(payload.points || [], vehicle, date);
        } catch (error) { console.error(error); document.getElementById("historyInfo").textContent = "История маршрута временно недоступна."; }
    }

    function render(trucks) {
        currentTrucks = trucks;
        const activeIds = new Set(trucks.map(t => t.id)); const bounds = [];
        for (const [id, marker] of markers) { if (!activeIds.has(id)) { map.removeLayer(marker); markers.delete(id); } }
        for (const truck of trucks) {
            const position = [Number(truck.lat), Number(truck.lng)]; bounds.push(position);
            let marker = markers.get(truck.id);
            if (!marker) { marker = L.marker(position).addTo(map); markers.set(truck.id, marker); } else marker.setLatLng(position);
            marker.bindPopup(popup(truck));
            marker.off("popupopen").on("popupopen", () => document.querySelector(`.popup-history[data-vehicle="${CSS.escape(String(truck.vehicle))}"]`)?.addEventListener("click", () => showHistory(truck.vehicle)));
        }
        const fresh = trucks.filter(t => t.fresh).length;
        els.count.textContent = trucks.length; els.moving.textContent = fresh;
        els.updated.textContent = `Последняя проверка: ${new Date().toLocaleTimeString("ru-RU")}`;
        els.list.innerHTML = trucks.map(truck => `<div class="truck-item" data-id="${esc(truck.id)}"><div class="truck-item-top"><span class="truck-name">🚛 ${esc(truck.vehicle)}</span><span class="truck-speed">${truck.fresh ? "АКТУАЛЕН" : "ИСТОРИЯ"}</span></div><div class="truck-meta">${esc(truck.route)} · GPS ${esc(new Date(truck.timestamp).toLocaleString("ru-RU"))}</div></div>`).join("");
        els.list.querySelectorAll(".truck-item").forEach(item => item.addEventListener("click", () => { const truck = currentTrucks.find(t => t.id === item.dataset.id); if (!truck) return; map.setView([truck.lat, truck.lng], 15); markers.get(truck.id)?.openPopup(); }));
        if (bounds.length && !initialFit) { map.fitBounds(bounds, { padding: [30, 30] }); initialFit = true; }
    }

    async function loadTrucks() {
        els.refresh.disabled = true; setStatus("Получаем GPS-данные…");
        try {
            const response = await fetch(`${BACKEND_URL}/trucks`, { cache: "no-store" });
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const payload = await response.json();
            if (!Array.isArray(payload.trucks)) throw new Error("Некорректный ответ API");
            render(payload.trucks.slice(0, 12));
            setStatus(payload.trucks.length ? `Показано ${payload.trucks.length} машин${payload.staleFallback ? " · используются последние известные позиции" : ""}` : "Истории GPS пока нет — ждём первую загрузку источника");
        } catch (error) {
            console.error(error); setStatus("Не удалось получить GPS-данные");
            els.list.innerHTML = `<div class="truck-item">Источник временно недоступен. После успешного опроса позиции сохранятся в истории.</div>`;
            els.count.textContent = "—"; els.moving.textContent = "—";
        } finally { els.refresh.disabled = false; }
    }

    els.refresh.addEventListener("click", loadTrucks); loadTrucks(); setInterval(loadTrucks, 2 * 60 * 1000);
});
