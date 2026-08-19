document.addEventListener("DOMContentLoaded", () => {
    const map = L.map("trucks-map", {
        zoomControl: true
    }).setView([24.1477, 120.6736], 12);

    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: "© OpenStreetMap contributors"
    }).addTo(map);

    const markers = new Map();
    let allTrucks = [];

    const metadataUrl = "https://data.gov.tw/api/v2/rest/dataset/83558";

    const els = {
        status: document.getElementById("mapStatus"),
        count: document.getElementById("truckCount"),
        moving: document.getElementById("movingCount"),
        updated: document.getElementById("lastUpdated"),
        list: document.getElementById("truckList"),
        refresh: document.getElementById("refreshTrucks")
    };

    function setStatus(text) {
        els.status.textContent = text;
    }

    function number(value) {
        if (value === null || value === undefined || value === "") return NaN;
        return Number(String(value).replace(",", "."));
    }

    function collectRecords(value, output = []) {
        if (Array.isArray(value)) {
            for (const item of value) collectRecords(item, output);
            return output;
        }

        if (!value || typeof value !== "object") return output;

        const x = number(value.X ?? value.x ?? value.longitude ?? value.lon);
        const y = number(value.Y ?? value.y ?? value.latitude ?? value.lat);

        if (Number.isFinite(x) && Number.isFinite(y)) {
            if (Math.abs(x) <= 180 && Math.abs(y) <= 90) output.push(value);
        }

        for (const child of Object.values(value)) {
            if (child && typeof child === "object") collectRecords(child, output);
        }

        return output;
    }

    function findResourceUrls(metadata) {
        const urls = [];

        function walk(value) {
            if (!value || typeof value !== "object") return;
            if (Array.isArray(value)) {
                value.forEach(walk);
                return;
            }

            for (const [key, child] of Object.entries(value)) {
                if (
                    typeof child === "string" &&
                    /resourceDownloadUrl|downloadURL|downloadUrl/i.test(key) &&
                    child.startsWith("http")
                ) {
                    urls.push(child);
                }
                if (child && typeof child === "object") walk(child);
            }
        }

        walk(metadata);
        return [...new Set(urls)];
    }

    function normalizeRecord(record) {
        const longitude = number(record.X ?? record.x ?? record.longitude ?? record.lon);
        const latitude = number(record.Y ?? record.y ?? record.latitude ?? record.lat);

        if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
        if (Math.abs(longitude) > 180 || Math.abs(latitude) > 90) return null;

        const car = record.car ?? record.Car ?? record.vehicle ?? record.vehicle_id ?? "Без номера";
        const speed = number(record.SpeedValue ?? record.speed ?? record.Speed);
        const time = record.time ?? record.Time ?? record.timestamp ?? "";
        const line = record.lineid ?? record.linid ?? record.line ?? "";
        const overSpeed = record.OverSpeed ?? record.overspeed ?? record.over_speed;

        return {
            id: String(car) + "_" + String(line),
            car: String(car),
            line: String(line || "—"),
            latitude,
            longitude,
            speed: Number.isFinite(speed) ? speed : 0,
            time: String(time || "—"),
            overSpeed
        };
    }

    function deduplicate(records) {
        const map = new Map();
        for (const record of records) {
            const normalized = normalizeRecord(record);
            if (!normalized) continue;
            const existing = map.get(normalized.id);
            if (!existing || new Date(normalized.time) >= new Date(existing.time)) {
                map.set(normalized.id, normalized);
            }
        }
        return [...map.values()];
    }

    function popup(truck) {
        const speed = Math.round(truck.speed * 10) / 10;
        const moving = speed > 2;
        const overspeed = truck.overSpeed === true || truck.overSpeed === "1" || truck.overSpeed === 1;

        return `
            <div style="min-width:180px">
                <strong>🚛 Мусоровоз ${escapeHtml(truck.car)}</strong><br>
                <span>Скорость: ${speed} км/ч</span><br>
                <span>Статус: ${moving ? "🟢 движется" : "🟡 стоит"}</span><br>
                <span>Маршрут: ${escapeHtml(truck.line)}</span><br>
                <span>Время: ${escapeHtml(truck.time)}</span>
                ${overspeed ? "<br><b>⚠️ Превышение скорости</b>" : ""}
            </div>
        `;
    }

    function render(trucks) {
        allTrucks = trucks;
        els.count.textContent = trucks.length;
        els.moving.textContent = trucks.filter(t => t.speed > 2).length;
        els.updated.textContent = `Обновлено: ${new Date().toLocaleTimeString("ru-RU")}`;

        const bounds = [];
        const activeIds = new Set(trucks.map(t => t.id));

        for (const [id, marker] of markers) {
            if (!activeIds.has(id)) {
                map.removeLayer(marker);
                markers.delete(id);
            }
        }

        for (const truck of trucks) {
            const position = [truck.latitude, truck.longitude];
            bounds.push(position);

            let marker = markers.get(truck.id);
            if (!marker) {
                marker = L.marker(position).addTo(map);
                markers.set(truck.id, marker);
            } else {
                marker.setLatLng(position);
            }

            marker.bindPopup(popup(truck));
        }

        els.list.innerHTML = trucks
            .sort((a, b) => b.speed - a.speed)
            .map(truck => `
                <div class="truck-item" data-truck-id="${escapeHtml(truck.id)}">
                    <div class="truck-item-top">
                        <span class="truck-name">🚛 ${escapeHtml(truck.car)}</span>
                        <span class="truck-speed">${Math.round(truck.speed)} км/ч</span>
                    </div>
                    <div class="truck-meta">${truck.speed > 2 ? "В движении" : "Стоит"} · маршрут ${escapeHtml(truck.line)}</div>
                </div>
            `)
            .join("");

        els.list.querySelectorAll(".truck-item").forEach(item => {
            item.addEventListener("click", () => {
                const truck = allTrucks.find(t => t.id === item.dataset.truckId);
                if (!truck) return;
                map.setView([truck.latitude, truck.longitude], 15);
                markers.get(truck.id)?.openPopup();
            });
        });

        if (bounds.length && !map._trucksInitialFit) {
            map.fitBounds(bounds, { padding: [30, 30] });
            map._trucksInitialFit = true;
        }
    }

    function escapeHtml(value) {
        return String(value)
            .replaceAll("&", "&amp;")
            .replaceAll("<", "&lt;")
            .replaceAll(">", "&gt;")
            .replaceAll('"', "&quot;")
            .replaceAll("'", "&#039;");
    }

    async function loadTrucks() {
        setStatus("Получаем открытые данные…");

        try {
            const metadataResponse = await fetch(metadataUrl, { cache: "no-store" });
            if (!metadataResponse.ok) throw new Error(`Metadata HTTP ${metadataResponse.status}`);

            const metadata = await metadataResponse.json();
            const resourceUrls = findResourceUrls(metadata);
            if (!resourceUrls.length) throw new Error("Не найден URL ресурса в метаданных");

            let records = [];

            for (const resourceUrl of resourceUrls) {
                try {
                    const response = await fetch(resourceUrl, { cache: "no-store" });
                    if (!response.ok) continue;
                    const contentType = response.headers.get("content-type") || "";
                    const text = await response.text();

                    let data;
                    try {
                        data = JSON.parse(text);
                    } catch {
                        continue;
                    }

                    records = deduplicate(collectRecords(data));
                    if (records.length) break;

                    if (contentType.includes("json")) continue;
                } catch (error) {
                    console.warn("Ресурс недоступен:", resourceUrl, error);
                }
            }

            if (!records.length) {
                throw new Error("API вернул данные, но координаты машин не найдены");
            }

            render(records);
            setStatus(`Загружено ${records.length} машин`);
        } catch (error) {
            console.error("Ошибка загрузки мусоровозов:", error);
            setStatus("Не удалось получить данные. Нажмите ↻ и попробуйте снова.");
            els.list.innerHTML = `<div class="truck-item">Ошибка загрузки GPS-данных</div>`;
            els.count.textContent = "—";
            els.moving.textContent = "—";
        }
    }

    els.refresh.addEventListener("click", loadTrucks);
    loadTrucks();
    setInterval(loadTrucks, 10 * 60 * 1000);
});
