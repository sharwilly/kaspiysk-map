document.addEventListener("DOMContentLoaded", () => {
    const BACKEND_URL = "https://kaspiysk-map.onrender.com";
    const map = L.map("trucks-map", { zoomControl: true, attributionControl: false }).setView([25.02, 121.46], 12);
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { attribution: "© OpenStreetMap contributors" }).addTo(map);

    const markers = new Map();
    let initialFit = false;
    let currentTrucks = [];
    let historyLine = null;
    let historyStart = null;
    let historyEnd = null;
    let historyVehicle = null;
    let historyDate = null;
    let historyLoading = false;

    const els = {
        status: document.getElementById("mapStatus"), count: document.getElementById("truckCount"),
        moving: document.getElementById("movingCount"), updated: document.getElementById("lastUpdated"),
        list: document.getElementById("truckList"), refresh: document.getElementById("refreshTrucks")
    };

    const historyPanel = document.createElement("div");
    historyPanel.className = "truck-history-panel";
    historyPanel.innerHTML = `
        <div class="history-head">
            <div><strong>История маршрута</strong><div id="historyTitle" class="history-subtitle">Выберите машину и дату</div></div>
            <button type="button" id="closeHistory" aria-label="Закрыть">×</button>
        </div>
        <div class="history-controls">
            <label>Мусоровоз<select id="historyVehicle"><option value="">Выберите машину</option></select></label>
            <label>Дата<input id="historyDate" type="date"></label>
            <button type="button" id="loadHistory">Показать маршрут</button>
        </div>
        <div id="historyInfo" class="history-info">Выберите мусоровоз и дату.</div>`;
    els.list.parentElement.appendChild(historyPanel);

    const historyVehicleSelect = document.getElementById("historyVehicle");
    const historyDateInput = document.getElementById("historyDate");
    const historyInfo = document.getElementById("historyInfo");
    const historyTitle = document.getElementById("historyTitle");

    function localDateISO(date = new Date()) {
        const offset = date.getTimezoneOffset();
        return new Date(date.getTime() - offset * 60000).toISOString().slice(0, 10);
    }

    historyDateInput.value = localDateISO();
    historyDateInput.max = localDateISO();

    document.getElementById("closeHistory").addEventListener("click", () => historyPanel.classList.remove("open"));
    document.getElementById("loadHistory").addEventListener("click", () => {
        if (!historyVehicleSelect.value) {
            historyInfo.textContent = "Сначала выберите мусоровоз.";
            return;
        }
        showHistory(historyVehicleSelect.value, historyDateInput.value);
    });

    function esc(value) { return String(value ?? "—").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;"); }
    function setStatus(text) { els.status.textContent = text; }

    function popup(truck) {
        const state = truck.fresh ? "🟢 актуальный GPS" : "🟡 последняя известная позиция";
        const speed = Number.isFinite(Number(truck.speed)) ? `${Number(truck.speed)} км/ч` : "нет данных";
        return `<div style="min-width:210px"><strong>🚛 Мусоровоз ${esc(truck.vehicle)}</strong><br><span>Статус: ${state}</span><br><span>Скорость: ${speed}</span><br><span>Маршрут: ${esc(truck.route)}</span><br><span>${esc(truck.location)}</span><br><span>GPS: ${esc(new Date(truck.timestamp).toLocaleString("ru-RU"))}</span><br><button class="popup-history" data-vehicle="${esc(truck.vehicle)}" style="margin-top:6px">История маршрута</button></div>`;
    }

    function clearHistoryLayers() {
        if (historyLine) map.removeLayer(historyLine);
        if (historyStart) map.removeLayer(historyStart);
        if (historyEnd) map.removeLayer(historyEnd);
        historyLine = historyStart = historyEnd = null;
    }

    function drawHistory(points, vehicle, date) {
        clearHistoryLayers();
        const validPoints = points
            .map(p => ({ ...p, lat: Number(p.lat), lng: Number(p.lng) }))
            .filter(p => Number.isFinite(p.lat) && Number.isFinite(p.lng));
        const latlngs = validPoints.map(p => [p.lat, p.lng]);

        if (latlngs.length < 2) {
            historyInfo.textContent = latlngs.length === 1
                ? `Для №${vehicle} за ${date} сохранена только 1 GPS-точка. Для линии нужно минимум 2.`
                : `Для №${vehicle} за ${date} GPS-точек нет.`;
            historyTitle.textContent = `№${vehicle} · ${date}`;
            historyPanel.classList.add("open");
            return;
        }

        historyLine = L.polyline(latlngs, { weight: 5, opacity: 0.8 }).addTo(map);
        historyStart = L.circleMarker(latlngs[0], { radius: 7 }).addTo(map).bindTooltip("Начало маршрута");
        historyEnd = L.circleMarker(latlngs[latlngs.length - 1], { radius: 7 }).addTo(map).bindTooltip("Последняя точка");
        map.fitBounds(historyLine.getBounds(), { padding: [40, 40] });

        const firstTime = new Date(validPoints[0].timestamp);
        const lastTime = new Date(validPoints[validPoints.length - 1].timestamp);
        historyTitle.textContent = `№${vehicle} · ${date}`;
        historyInfo.innerHTML = `<b>${latlngs.length} GPS-точек</b><br>Период: ${esc(firstTime.toLocaleTimeString("ru-RU"))} — ${esc(lastTime.toLocaleTimeString("ru-RU"))}<br>Начало отмечено точкой, конец — последней GPS-позицией.`;
        historyPanel.classList.add("open");
    }

    async function showHistory(vehicle, date = localDateISO()) {
        if (!vehicle || !date || historyLoading) return;
        historyLoading = true;
        historyVehicle = vehicle;
        historyDate = date;
        historyVehicleSelect.value = vehicle;
        historyDateInput.value = date;
        historyTitle.textContent = `№${vehicle} · ${date}`;
        historyInfo.textContent = "Загрузка GPS-истории…";
        historyPanel.classList.add("open");
        try {
            const response = await fetch(`${BACKEND_URL}/trucks/history/${encodeURIComponent(vehicle)}?date=${encodeURIComponent(date)}`, { cache: "no-store" });
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const payload = await response.json();
            drawHistory(payload.points || [], vehicle, date);
        } catch (error) {
            console.error(error);
            historyInfo.textContent = "История маршрута временно недоступна.";
        } finally {
            historyLoading = false;
        }
    }

    function updateHistoryVehicles(trucks) {
        const previous = historyVehicleSelect.value;
        const vehicles = [...new Map(trucks.map(t => [String(t.vehicle), t.vehicle])).entries()]
            .map(([value, label]) => `<option value="${esc(value)}">№${esc(label)}</option>`).join("");
        historyVehicleSelect.innerHTML = `<option value="">Выберите машину</option>${vehicles}`;
        if (previous && trucks.some(t => String(t.vehicle) === previous)) historyVehicleSelect.value = previous;
        else if (historyVehicle) historyVehicleSelect.value = historyVehicle;
    }

    function render(trucks) {
        currentTrucks = trucks;
        updateHistoryVehicles(trucks);
        const activeIds = new Set(trucks.map(t => t.id));
        const bounds = [];
        for (const [id, marker] of markers) {
            if (!activeIds.has(id)) { map.removeLayer(marker); markers.delete(id); }
        }
        for (const truck of trucks) {
            const position = [Number(truck.lat), Number(truck.lng)];
            if (!Number.isFinite(position[0]) || !Number.isFinite(position[1])) continue;
            bounds.push(position);
            let marker = markers.get(truck.id);
            if (!marker) { marker = L.marker(position).addTo(map); markers.set(truck.id, marker); }
            else marker.setLatLng(position);
            marker.bindPopup(popup(truck));
            marker.off("popupopen").on("popupopen", () => document.querySelector(`.popup-history[data-vehicle="${CSS.escape(String(truck.vehicle))}"]`)?.addEventListener("click", () => showHistory(truck.vehicle, localDateISO())));
        }
        const fresh = trucks.filter(t => t.fresh).length;
        els.count.textContent = trucks.length;
        els.moving.textContent = fresh;
        els.updated.textContent = `Последняя проверка: ${new Date().toLocaleTimeString("ru-RU")}`;
        els.list.innerHTML = trucks.map(truck => `<div class="truck-item" data-id="${esc(truck.id)}"><div class="truck-item-top"><span class="truck-name">🚛 ${esc(truck.vehicle)}</span><span class="truck-speed">${truck.fresh ? "АКТУАЛЕН" : "ИСТОРИЯ"}</span></div><div class="truck-meta">${esc(truck.route)} · GPS ${esc(new Date(truck.timestamp).toLocaleString("ru-RU"))}</div></div>`).join("");
        els.list.querySelectorAll(".truck-item").forEach(item => item.addEventListener("click", () => {
            const truck = currentTrucks.find(t => t.id === item.dataset.id);
            if (!truck) return;
            map.setView([truck.lat, truck.lng], 15);
            markers.get(truck.id)?.openPopup();
        }));
        if (bounds.length && !initialFit) { map.fitBounds(bounds, { padding: [30, 30] }); initialFit = true; }
    }

    async function loadTrucks() {
        els.refresh.disabled = true;
        setStatus("Получаем GPS-данные…");
        try {
            const response = await fetch(`${BACKEND_URL}/trucks`, { cache: "no-store" });
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const payload = await response.json();
            if (!Array.isArray(payload.trucks)) throw new Error("Некорректный ответ API");
            render(payload.trucks.slice(0, 12));
            setStatus(payload.trucks.length ? `Показано ${payload.trucks.length} машин${payload.staleFallback ? " · используются последние известные позиции" : ""}` : "Истории GPS пока нет — ждём первую загрузку источника");
        } catch (error) {
            console.error(error);
            setStatus("Не удалось получить GPS-данные");
            els.list.innerHTML = `<div class="truck-item">Источник временно недоступен. После успешного опроса позиции сохранятся в истории.</div>`;
            els.count.textContent = "—";
            els.moving.textContent = "—";
        } finally {
            els.refresh.disabled = false;
        }
    }

    els.refresh.addEventListener("click", loadTrucks);
    loadTrucks();
    setInterval(loadTrucks, 2 * 60 * 1000);
});
