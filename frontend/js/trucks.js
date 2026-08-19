document.addEventListener("DOMContentLoaded", () => {
    const map = L.map("trucks-map", { zoomControl: true })
        .setView([24.1477, 120.6736], 12);

    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: "© OpenStreetMap contributors"
    }).addTo(map);

    const markers = new Map();
    let allTrucks = [];
    let initialFitDone = false;

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

    function escapeHtml(value) {
        return String(value ?? "")
            .replaceAll("&", "&amp;")
            .replaceAll("<", "&lt;")
            .replaceAll(">", "&gt;")
            .replaceAll('"', "&quot;")
            .replaceAll("'", "&#039;");
    }

    function popup(truck) {
        const speed = Math.round(Number(truck.speed || 0) * 10) / 10;
        const moving = speed > 2;
        const overspeed = truck.overSpeed === true || truck.overSpeed === "1" || truck.overSpeed === 1;

        return `
            <div style="min-width:190px">
                <strong>🚛 Мусоровоз ${escapeHtml(truck.vehicle)}</strong><br>
                <span>Скорость: ${speed} км/ч</span><br>
                <span>Статус: ${moving ? "🟢 движется" : "🟡 стоит"}</span><br>
                <span>Маршрут: ${escapeHtml(truck.line)}</span><br>
                <span>GPS: ${escapeHtml(truck.timestamp)}</span>
                ${truck.location ? `<br><span>${escapeHtml(truck.location)}</span>` : ""}
                ${overspeed ? "<br><b>⚠️ Превышение скорости</b>" : ""}
            </div>
        `;
    }

    function render(trucks) {
        allTrucks = trucks;
        els.count.textContent = trucks.length;
        els.moving.textContent = trucks.filter(t => Number(t.speed) > 2).length;
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
            const position = [Number(truck.latitude), Number(truck.longitude)];
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
            .slice()
            .sort((a, b) => Number(b.speed) - Number(a.speed))
            .map(truck => `
                <div class="truck-item" data-truck-id="${escapeHtml(truck.id)}">
                    <div class="truck-item-top">
                        <span class="truck-name">🚛 ${escapeHtml(truck.vehicle)}</span>
                        <span class="truck-speed">${Math.round(Number(truck.speed || 0))} км/ч</span>
                    </div>
                    <div class="truck-meta">
                        ${Number(truck.speed) > 2 ? "В движении" : "Стоит"} · маршрут ${escapeHtml(truck.line)}
                    </div>
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

        if (bounds.length && !initialFitDone) {
            map.fitBounds(bounds, { padding: [30, 30] });
            initialFitDone = true;
        }
    }

    async function loadTrucks() {
        setStatus("Получаем GPS-данные…");
        els.refresh.disabled = true;

        try {
            const response = await fetch("/api/trucks", { cache: "no-store" });
            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || `HTTP ${response.status}`);
            }

            if (!Array.isArray(data.trucks) || data.trucks.length === 0) {
                throw new Error("Сервер не вернул ни одной машины");
            }

            render(data.trucks);
            setStatus(`Демонстрационные данные · ${data.trucks.length} машин`);
        } catch (error) {
            console.error("Ошибка загрузки мусоровозов:", error);
            setStatus("Не удалось получить GPS-данные. Попробуйте обновить.");
            els.list.innerHTML = `<div class="truck-item">Ошибка загрузки GPS-данных</div>`;
            els.count.textContent = "—";
            els.moving.textContent = "—";
        } finally {
            els.refresh.disabled = false;
        }
    }

    els.refresh.addEventListener("click", loadTrucks);
    loadTrucks();
    setInterval(loadTrucks, 10 * 60 * 1000);
});
