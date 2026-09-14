document.addEventListener("DOMContentLoaded", () => {
    const BACKEND_URL = "https://kaspiysk-map-1.onrender.com";
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
    let routeFocusVehicle = null;

    const els = {
        status: document.getElementById("mapStatus"), count: document.getElementById("truckCount"),
        moving: document.getElementById("movingCount"), updated: document.getElementById("lastUpdated"),
        list: document.getElementById("truckList"), refresh: document.getElementById("refreshTrucks")
    };

    const mapWrap = document.querySelector(".trucks-map-wrap");
    const fullscreenButton = document.createElement("button");
    fullscreenButton.type = "button";
    fullscreenButton.className = "truck-map-fullscreen";
    fullscreenButton.setAttribute("aria-label", "Открыть карту на весь экран");
    fullscreenButton.title = "На весь экран";
    fullscreenButton.innerHTML = "<span aria-hidden=\"true\">⛶</span>";
    mapWrap?.appendChild(fullscreenButton);

    const fullscreenStyle = document.createElement("style");
    fullscreenStyle.textContent = `
        .truck-map-fullscreen {
            position:absolute; z-index:600; top:18px; right:18px;
            width:40px; height:40px; display:grid; place-items:center;
            border:1px solid rgba(15,23,42,.10); border-radius:12px;
            background:rgba(255,255,255,.92); color:#334155;
            box-shadow:0 8px 24px rgba(15,23,42,.12);
            backdrop-filter:blur(14px); -webkit-backdrop-filter:blur(14px);
            cursor:pointer; font-size:22px; line-height:1;
            transition:transform .18s ease, color .18s ease, background .18s ease;
        }
        .truck-map-fullscreen:hover { background:#fff; color:#2563eb; transform:scale(1.04); }
        .truck-map-fullscreen:active { transform:scale(.96); }
        .trucks-map-wrap:fullscreen { width:100vw; height:100vh; min-height:100vh; background:#e8eef5; }
        .trucks-map-wrap:fullscreen #trucks-map { width:100%; height:100%; min-height:100vh; }
        .trucks-map-wrap:fullscreen .map-status { bottom:18px; left:18px; }
        .trucks-map-wrap:fullscreen .truck-map-fullscreen { top:18px; right:18px; }
        @media (max-width:520px) {
            .truck-map-fullscreen { top:12px; right:12px; width:38px; height:38px; }
        }
    `;
    document.head.appendChild(fullscreenStyle);

    function setMarkerVisibility() {
        for (const truck of currentTrucks) {
            const marker = markers.get(truck.id);
            if (!marker) continue;
            const vehicle = cleanVehicleId(truck.vehicle);
            marker.setOpacity(routeFocusVehicle && vehicle !== routeFocusVehicle ? 0 : 1);
        }
    }

    function clearRouteFocus() {
        routeFocusVehicle = null;
        setMarkerVisibility();
    }

    function enterFullscreen() {
        if (!mapWrap) return;
        if (document.fullscreenElement === mapWrap) {
            document.exitFullscreen?.();
            return;
        }
        const request = mapWrap.requestFullscreen?.() || mapWrap.webkitRequestFullscreen?.();
        if (request?.catch) request.catch(error => console.warn("Fullscreen unavailable:", error));
    }

    function updateFullscreenButton() {
        const active = document.fullscreenElement === mapWrap;
        fullscreenButton.innerHTML = active ? "<span aria-hidden=\"true\">×</span>" : "<span aria-hidden=\"true\">⛶</span>";
        fullscreenButton.setAttribute("aria-label", active ? "Выйти из полноэкранного режима" : "Открыть карту на весь экран");
        fullscreenButton.title = active ? "Выйти из полноэкранного режима" : "На весь экран";
        setTimeout(() => map.invalidateSize(), 100);
    }

    fullscreenButton.addEventListener("click", enterFullscreen);
    document.addEventListener("fullscreenchange", updateFullscreenButton);
    document.addEventListener("webkitfullscreenchange", updateFullscreenButton);

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

    function cleanVehicleId(value) {
        return String(value ?? "").replace(/^\s*(?:🚛\s*)?(?:мусоровоз\s*)?(?:№\s*)?/i, "").trim();
    }

    function vehicleLabel(value) {
        return `№${cleanVehicleId(value)}`;
    }

    function distanceKm(a, b) {
        const R = 6371;
        const toRad = degrees => degrees * Math.PI / 180;
        const dLat = toRad(b.lat - a.lat);
        const dLng = toRad(b.lng - a.lng);
        const lat1 = toRad(a.lat);
        const lat2 = toRad(b.lat);
        const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
        return 2 * R * Math.asin(Math.sqrt(Math.min(1, h)));
    }

    function calculateRouteDistance(points) {
        let totalKm = 0;
        let acceptedSegments = 0;
        for (let i = 1; i < points.length; i++) {
            const previous = points[i - 1];
            const current = points[i];
            const distance = distanceKm(previous, current);
            const elapsedHours = (new Date(current.timestamp) - new Date(previous.timestamp)) / 3600000;
            if (!Number.isFinite(distance) || distance <= 0 || !Number.isFinite(elapsedHours) || elapsedHours <= 0) continue;
            const impliedSpeed = distance / elapsedHours;
            if (impliedSpeed > 120 || distance > 5) continue;
            totalKm += distance;
            acceptedSegments++;
        }
        return { totalKm, acceptedSegments };
    }

    historyDateInput.value = localDateISO();
    historyDateInput.max = localDateISO();

    document.getElementById("closeHistory").addEventListener("click", () => {
        historyPanel.classList.remove("open");
        clearHistoryLayers();
        clearRouteFocus();
    });

    document.getElementById("loadHistory").addEventListener("click", () => {
        const vehicle = cleanVehicleId(historyVehicleSelect.value);
        const date = historyDateInput.value || localDateISO();
        if (!vehicle) {
            historyInfo.textContent = "Сначала выберите мусоровоз.";
            return;
        }
        showHistory(vehicle, date);
    });

    function esc(value) { return String(value ?? "—").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;"); }
    function setStatus(text) { els.status.textContent = text; }

    function popup(truck) {
        const state = truck.fresh ? "🟢 актуальный GPS" : "🟡 последняя известная позиция";
        const speed = Number.isFinite(Number(truck.speed)) ? `${Number(truck.speed)} км/ч` : "нет данных";
        const vehicle = cleanVehicleId(truck.vehicle);
        return `<div style="min-width:210px"><strong>🚛 Мусоровоз ${esc(vehicle)}</strong><br><span>Статус: ${state}</span><br><span>Скорость: ${speed}</span><br><span>Маршрут: ${esc(truck.route)}</span><br><span>${esc(truck.location)}</span><br><span>GPS: ${esc(new Date(truck.timestamp).toLocaleString("ru-RU"))}</span><br><button class="popup-history" data-vehicle="${esc(vehicle)}" style="margin-top:6px">История маршрута</button></div>`;
    }

    function clearHistoryLayers() {
        if (historyLine) map.removeLayer(historyLine);
        if (historyStart) map.removeLayer(historyStart);
        if (historyEnd) map.removeLayer(historyEnd);
        historyLine = historyStart = historyEnd = null;
    }

    function drawHistory(points, vehicle, date) {
        clearHistoryLayers();
        clearRouteFocus();
        const validPoints = points
            .map(p => ({ ...p, lat: Number(p.lat), lng: Number(p.lng) }))
            .filter(p => Number.isFinite(p.lat) && Number.isFinite(p.lng))
            .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
        const latlngs = validPoints.map(p => [p.lat, p.lng]);

        if (latlngs.length < 2) {
            historyInfo.textContent = latlngs.length === 1
                ? `Для ${vehicleLabel(vehicle)} за ${date} сохранена только 1 GPS-точка. Для линии нужно минимум 2.`
                : `Для ${vehicleLabel(vehicle)} за ${date} GPS-точек нет.`;
            historyTitle.textContent = `${vehicleLabel(vehicle)} · ${date}`;
            historyPanel.classList.add("open");
            return;
        }

        routeFocusVehicle = cleanVehicleId(vehicle);
        setMarkerVisibility();

        historyLine = L.polyline(latlngs, { weight: 5, opacity: 0.8 }).addTo(map);
        historyStart = L.circleMarker(latlngs[0], { radius: 7 }).addTo(map).bindTooltip("Начало маршрута");
        historyEnd = L.circleMarker(latlngs[latlngs.length - 1], { radius: 7 }).addTo(map).bindTooltip("Последняя точка");
        map.fitBounds(historyLine.getBounds(), { padding: [40, 40] });

        const firstTime = new Date(validPoints[0].timestamp);
        const lastTime = new Date(validPoints[validPoints.length - 1].timestamp);
        const distance = calculateRouteDistance(validPoints);
        const distanceText = distance.acceptedSegments
            ? `${distance.totalKm.toFixed(1).replace(".", ",")} км по GPS-треку`
            : "недостаточно корректных интервалов для оценки расстояния";

        historyTitle.textContent = `${vehicleLabel(vehicle)} · ${date}`;
        historyInfo.innerHTML = `<b>${latlngs.length} GPS-точек</b><br>Период: ${esc(firstTime.toLocaleTimeString("ru-RU"))} — ${esc(lastTime.toLocaleTimeString("ru-RU"))}<br><b>Пройдено: ${esc(distanceText)}</b><br><span class="history-distance-note">Расстояние рассчитано между последовательными GPS-точками; редкие подозрительные скачки отфильтрованы.</span>`;
        historyPanel.classList.add("open");
    }

    async function showHistory(vehicle, date = localDateISO()) {
        vehicle = cleanVehicleId(vehicle);
        if (!vehicle || !date || historyLoading) return;

        const current = currentTrucks.find(t => cleanVehicleId(t.vehicle) === vehicle);
        const canonicalVehicle = cleanVehicleId(current?.vehicle || vehicle);

        historyLoading = true;
        historyVehicle = canonicalVehicle;
        historyDate = date;
        historyVehicleSelect.value = canonicalVehicle;
        historyDateInput.value = date;
        historyTitle.textContent = `${vehicleLabel(canonicalVehicle)} · ${date}`;
        historyInfo.textContent = "Загрузка GPS-истории…";
        historyPanel.classList.add("open");
        try {
            const url = `${BACKEND_URL}/trucks/history/${encodeURIComponent(canonicalVehicle)}?date=${encodeURIComponent(date)}&_=${Date.now()}`;
            const response = await fetch(url, { cache: "no-store" });
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const payload = await response.json();
            if (!Array.isArray(payload.points)) throw new Error("Некорректный ответ истории");
            historyInfo.textContent = payload.points.length
                ? `Получено ${payload.points.length} GPS-точек. Строим маршрут…`
                : `API вернул 0 GPS-точек для ${vehicleLabel(canonicalVehicle)} за ${date}.`;
            drawHistory(payload.points, canonicalVehicle, date);
        } catch (error) {
            console.error("Truck history load failed:", error);
            historyInfo.textContent = `История маршрута временно недоступна: ${error.message}`;
        } finally {
            historyLoading = false;
        }
    }

    function updateHistoryVehicles(trucks) {
        const previous = cleanVehicleId(historyVehicleSelect.value);
        const seen = new Set();
        const options = [];
        for (const truck of trucks) {
            const vehicle = cleanVehicleId(truck.vehicle);
            if (!vehicle || seen.has(vehicle)) continue;
            seen.add(vehicle);
            options.push(`<option value="${esc(vehicle)}">${esc(vehicleLabel(vehicle))}</option>`);
        }
        historyVehicleSelect.innerHTML = `<option value="">Выберите машину</option>${options.join("")}`;
        const wanted = previous || cleanVehicleId(historyVehicle);
        if (wanted && seen.has(wanted)) historyVehicleSelect.value = wanted;
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
            marker.off("popupopen").on("popupopen", () => document.querySelector(`.popup-history[data-vehicle="${CSS.escape(cleanVehicleId(truck.vehicle))}"]`)?.addEventListener("click", () => showHistory(truck.vehicle, localDateISO())));
        }
        setMarkerVisibility();
        const fresh = trucks.filter(t => t.fresh).length;
        els.count.textContent = trucks.length;
        els.moving.textContent = fresh;
        els.updated.textContent = `Последняя проверка: ${new Date().toLocaleTimeString("ru-RU")}`;
        els.list.innerHTML = trucks.map(truck => `<div class="truck-item" data-id="${esc(truck.id)}"><div class="truck-item-top"><span class="truck-name">🚛 ${esc(cleanVehicleId(truck.vehicle))}</span><span class="truck-speed">${truck.fresh ? "АКТУАЛЕН" : "ПОСЛЕДНЯЯ ПОЗИЦИЯ"}</span></div><div class="truck-meta">${esc(truck.route)} · GPS ${esc(new Date(truck.timestamp).toLocaleString("ru-RU"))}</div></div>`).join("");
        els.list.querySelectorAll(".truck-item").forEach(item => item.addEventListener("click", () => {
            const truck = currentTrucks.find(t => t.id === item.dataset.id);
            if (!truck) return;
            map.setView([truck.lat, truck.lng], 15);
            markers.get(truck.id)?.openPopup();
        }));
        if (bounds.length && !initialFit && !routeFocusVehicle) { map.fitBounds(bounds, { padding: [30, 30] }); initialFit = true; }
    }

    async function loadTrucks() {
        els.refresh.disabled = true;
        setStatus("Получаем GPS-данные…");
        try {
            const response = await fetch(`${BACKEND_URL}/trucks`, { cache: "no-store" });
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const payload = await response.json();
            if (!Array.isArray(payload.trucks)) throw new Error("Некорректный ответ API");
            render(payload.trucks);
            setStatus(payload.trucks.length ? `Показано ${payload.trucks.length} машин${payload.staleFallback ? " · часть позиций устарела" : ""}` : "Истории GPS пока нет — ждём первую загрузку источника");
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
