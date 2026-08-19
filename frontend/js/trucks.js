document.addEventListener("DOMContentLoaded", () => {
    const map = L.map("trucks-map", { zoomControl: true }).setView([25.02, 121.46], 12);
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: "© OpenStreetMap contributors"
    }).addTo(map);

    const markers = new Map();
    let initialFit = false;
    const els = {
        status: document.getElementById("mapStatus"),
        count: document.getElementById("truckCount"),
        moving: document.getElementById("movingCount"),
        updated: document.getElementById("lastUpdated"),
        list: document.getElementById("truckList"),
        refresh: document.getElementById("refreshTrucks")
    };

    function esc(value) {
        return String(value ?? "—").replaceAll("&", "&amp;").replaceAll("<", "&lt;")
            .replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
    }

    function setStatus(text) { els.status.textContent = text; }

    function popup(truck) {
        return `<div style="min-width:190px">
            <strong>🚛 Мусоровоз ${esc(truck.vehicle)}</strong><br>
            <span>Статус: 🟢 на линии</span><br>
            <span>Маршрут: ${esc(truck.route)}</span><br>
            <span>${esc(truck.location)}</span><br>
            <span>GPS: ${esc(truck.timestamp)}</span>
        </div>`;
    }

    function render(trucks) {
        const activeIds = new Set(trucks.map(t => t.id));
        const bounds = [];

        for (const [id, marker] of markers) {
            if (!activeIds.has(id)) {
                map.removeLayer(marker);
                markers.delete(id);
            }
        }

        for (const truck of trucks) {
            const position = [truck.lat, truck.lng];
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

        els.count.textContent = trucks.length;
        els.moving.textContent = trucks.length;
        els.updated.textContent = `Данные API: ${new Date().toLocaleTimeString("ru-RU")}`;

        els.list.innerHTML = trucks.map(truck => `
            <div class="truck-item" data-id="${esc(truck.id)}">
                <div class="truck-item-top">
                    <span class="truck-name">🚛 ${esc(truck.vehicle)}</span>
                    <span class="truck-speed">НА ЛИНИИ</span>
                </div>
                <div class="truck-meta">${esc(truck.route)} · GPS ${esc(truck.timestamp)}</div>
            </div>`).join("");

        els.list.querySelectorAll(".truck-item").forEach(item => {
            item.addEventListener("click", () => {
                const truck = trucks.find(t => t.id === item.dataset.id);
                if (!truck) return;
                map.setView([truck.lat, truck.lng], 15);
                markers.get(truck.id)?.openPopup();
            });
        });

        if (bounds.length && !initialFit) {
            map.fitBounds(bounds, { padding: [30, 30] });
            initialFit = true;
        }
    }

    async function loadTrucks() {
        els.refresh.disabled = true;
        setStatus("Получаем актуальные GPS-данные…");
        try {
            const response = await fetch("/api/trucks", { cache: "no-store" });
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const payload = await response.json();
            if (!Array.isArray(payload.trucks)) throw new Error("Некорректный ответ API");

            render(payload.trucks.slice(0, 12));
            setStatus(payload.trucks.length ? `Показано ${payload.trucks.length} машин` : "Сейчас машин на линии нет");
        } catch (error) {
            console.error(error);
            setStatus("Не удалось получить GPS-данные");
            els.list.innerHTML = `<div class="truck-item">Источник временно недоступен. Попробуйте обновить.</div>`;
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
