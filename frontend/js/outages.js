const container = document.getElementById("outagesList");
const buttons = document.querySelectorAll(".tab-button");
const activeCount = document.getElementById("activeCount");
const monthCount = document.getElementById("monthCount");
const feederCount = document.getElementById("feederCount");
const addressCount = document.getElementById("addressCount");
const avgAddressCount = document.getElementById("avgAddressCount");
const topFeeder = document.getElementById("topFeeder");
const weekTrend = document.getElementById("weekTrend");
const chart = document.getElementById("outageChart");
const feederRanking = document.getElementById("feederRanking");
const typeRanking = document.getElementById("typeRanking");
const heatmapElement = document.getElementById("outageHeatmap");
const heatmapStatus = document.getElementById("heatmapStatus");

let activeOutages = [];
let doneOutages = [];
let outageMap = null;
let outageHeatLayer = null;

function escapeHtml(value) {
    if (value === null || value === undefined) return "";
    return String(value)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

function validDate(value) {
    if (!value) return null;
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
}

function getLast30Days(data) {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    start.setDate(start.getDate() - 30);
    return data.filter(outage => {
        const date = validDate(outage.created_at);
        return date && date >= start;
    });
}

async function loadAllData() {
    try {
        const [activeResponse, doneResponse] = await Promise.all([
            fetch(`${API_URL}/outages`),
            fetch(`${API_URL}/outages/done`)
        ]);

        if (!activeResponse.ok) throw new Error(`Ошибка /outages: ${activeResponse.status}`);
        if (!doneResponse.ok) throw new Error(`Ошибка /outages/done: ${doneResponse.status}`);

        activeOutages = await activeResponse.json();
        doneOutages = await doneResponse.json();

        updateAnalytics();
        renderOutages(activeOutages, "active");
        loadHeatmap();
    } catch (error) {
        console.error("Ошибка загрузки отключений:", error);
        if (container) container.innerHTML = "<p>Ошибка загрузки данных</p>";
    }
}

function updateAnalytics() {
    const allOutages = [...activeOutages, ...doneOutages];
    const monthOutages = getLast30Days(allOutages);

    if (activeCount) activeCount.textContent = activeOutages.length;
    if (monthCount) monthCount.textContent = monthOutages.length;

    const feeders = new Set();
    const addresses = new Set();
    let addressTotal = 0;

    monthOutages.forEach(outage => {
        if (outage.feeder !== null && outage.feeder !== undefined && String(outage.feeder).trim()) {
            feeders.add(String(outage.feeder).trim());
        }
        if (Array.isArray(outage.addresses)) {
            outage.addresses.forEach(address => {
                if (address !== null && address !== undefined && String(address).trim()) {
                    addresses.add(String(address).trim());
                    addressTotal++;
                }
            });
        }
    });

    if (feederCount) feederCount.textContent = feeders.size;
    if (addressCount) addressCount.textContent = addresses.size;
    if (avgAddressCount) {
        avgAddressCount.textContent = monthOutages.length
            ? (addressTotal / monthOutages.length).toFixed(1)
            : "0";
    }

    renderExtraAnalytics(monthOutages);
    renderChart(monthOutages);
}

function renderExtraAnalytics(data) {
    const feederCounts = new Map();
    const typeCounts = new Map();

    data.forEach(outage => {
        const feeder = outage.feeder && String(outage.feeder).trim();
        if (feeder) feederCounts.set(feeder, (feederCounts.get(feeder) || 0) + 1);

        const type = outage.description && String(outage.description).trim();
        if (type) typeCounts.set(type, (typeCounts.get(type) || 0) + 1);
    });

    const sortedFeeders = [...feederCounts.entries()].sort((a, b) => b[1] - a[1]);
    const sortedTypes = [...typeCounts.entries()].sort((a, b) => b[1] - a[1]);

    if (topFeeder) {
        topFeeder.textContent = sortedFeeders.length ? sortedFeeders[0][0] : "—";
        topFeeder.title = sortedFeeders.length ? `${sortedFeeders[0][1]} отключений` : "";
    }

    const last7Start = new Date();
    last7Start.setHours(0, 0, 0, 0);
    last7Start.setDate(last7Start.getDate() - 7);
    const last7 = data.filter(outage => {
        const date = validDate(outage.created_at);
        return date && date >= last7Start;
    }).length;
    if (weekTrend) weekTrend.textContent = last7;

    renderRanking(feederRanking, sortedFeeders, "фидеров");
    renderRanking(typeRanking, sortedTypes, "случаев");
}

function renderRanking(element, entries, suffix) {
    if (!element) return;
    if (!entries.length) {
        element.innerHTML = "<div class=\"ranking-empty\">Нет данных за последние 30 дней</div>";
        return;
    }

    const max = entries[0][1];
    element.innerHTML = entries.slice(0, 8).map(([name, count]) => {
        const width = Math.max(4, (count / max) * 100);
        return `
            <div class="ranking-item">
                <div class="ranking-head">
                    <span>${escapeHtml(name)}</span>
                    <strong>${count} ${suffix}</strong>
                </div>
                <div class="ranking-track">
                    <div class="ranking-bar" style="width:${width}%"></div>
                </div>
            </div>
        `;
    }).join("");
}

function renderChart(data) {
    if (!chart) return;

    const days = [];
    const today = new Date();

    for (let i = 29; i >= 0; i--) {
        const date = new Date(today);
        date.setHours(0, 0, 0, 0);
        date.setDate(today.getDate() - i);
        days.push(date);
    }

    const counts = days.map(day => data.filter(outage => {
        const date = validDate(outage.created_at);
        return date && date.getFullYear() === day.getFullYear() && date.getMonth() === day.getMonth() && date.getDate() === day.getDate();
    }).length);

    const max = Math.max(...counts, 1);

    chart.innerHTML = days.map((day, index) => {
        const count = counts[index];
        const height = count === 0 ? 3 : Math.max(8, (count / max) * 90);
        const label = `${String(day.getDate()).padStart(2, "0")}.${String(day.getMonth() + 1).padStart(2, "0")}`;
        return `
            <div class="chart-day" title="${escapeHtml(label)}: ${count} отключений">
                <div class="chart-count">${count || ""}</div>
                <div class="chart-bar" style="height:${height}px"></div>
                <div class="chart-label">${escapeHtml(label)}</div>
            </div>
        `;
    }).join("");
}

async function loadHeatmap() {
    if (!heatmapElement || typeof L === "undefined" || typeof L.heatLayer !== "function") return;

    if (!outageMap) {
        outageMap = L.map(heatmapElement, {
            center: [42.8913, 47.6397],
            zoom: 13,
            zoomControl: true
        });

        L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
            maxZoom: 19,
            attribution: "© OpenStreetMap contributors"
        }).addTo(outageMap);
    }

    if (heatmapStatus) heatmapStatus.textContent = "Загрузка координат...";

    try {
        const response = await fetch(`${API_URL}/outages/map`);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const outages = await response.json();

        const points = [];
        const bounds = [];

        outages.forEach(outage => {
            if (!Array.isArray(outage.locations)) return;
            outage.locations.forEach(location => {
                const lat = Number(location.latitude);
                const lon = Number(location.longitude);
                if (!Number.isFinite(lat) || !Number.isFinite(lon)) return;
                points.push([lat, lon, 0.65]);
                bounds.push([lat, lon]);
            });
        });

        if (outageHeatLayer) outageMap.removeLayer(outageHeatLayer);
        outageHeatLayer = L.heatLayer(points, {
            radius: 30,
            blur: 24,
            maxZoom: 16,
            max: 1.0,
            minOpacity: 0.35
        }).addTo(outageMap);

        if (bounds.length) {
            outageMap.fitBounds(bounds, { padding: [25, 25], maxZoom: 15 });
        }

        if (heatmapStatus) {
            heatmapStatus.textContent = points.length
                ? `${points.length} адресов с координатами`
                : "Нет координат для активных отключений";
        }

        setTimeout(() => outageMap.invalidateSize(), 100);
    } catch (error) {
        console.error("Ошибка загрузки тепловой карты:", error);
        if (heatmapStatus) heatmapStatus.textContent = "Не удалось загрузить карту";
    }
}

async function loadOutages(type = "active") {
    if (container) container.innerHTML = "Загрузка...";
    const url = type === "done" ? `${API_URL}/outages/done` : `${API_URL}/outages`;

    try {
        const response = await fetch(url);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();
        renderOutages(data, type);
    } catch (error) {
        console.error("Ошибка загрузки:", error);
        if (container) container.innerHTML = "<p>Ошибка загрузки данных</p>";
    }
}

function renderOutages(data, type) {
    if (!container) return;
    if (!Array.isArray(data)) {
        container.innerHTML = "<p>Некорректный формат данных</p>";
        return;
    }
    if (data.length === 0) {
        container.innerHTML = type === "done" ? "<p>Решенных отключений нет</p>" : "<p>Активных отключений нет</p>";
        return;
    }

    container.innerHTML = data.map(outage => {
        const isDone = type === "done";
        const statusText = isDone ? "✅ Отключение устранено" : "🔴 Активное отключение";
        const feeder = outage.feeder || "Не указан";
        const substation = outage.substation || "Не указана";
        const description = outage.description || "Информация отсутствует";
        const restoreTime = outage.restore_time || "Не указано";
        const addresses = Array.isArray(outage.addresses) ? outage.addresses : [];

        const addressHTML = addresses.length ? `
            <h3>📍 Зона отключения</h3>
            <div class="address-list">
                ${addresses.map(address => `<div>${escapeHtml(address)}</div>`).join("")}
            </div>
        ` : "";

        const dateHTML = isDone && outage.created_at ? `
            <p class="date">📅 Зарегистрировано: ${formatDate(outage.created_at)}</p>
        ` : "";

        return `
            <div class="outage-card">
                <h2 class="${isDone ? "outage-done" : "outage-active"}">${statusText}</h2>
                <div class="outage-meta">
                    <div class="outage-meta-item"><span>Фидер</span><strong>${escapeHtml(feeder)}</strong></div>
                    <div class="outage-meta-item"><span>Подстанция</span><strong>${escapeHtml(substation)}</strong></div>
                    <div class="outage-meta-item"><span>Тип</span><strong>${escapeHtml(description)}</strong></div>
                    <div class="outage-meta-item"><span>Восстановление</span><strong>${escapeHtml(restoreTime)}</strong></div>
                </div>
                ${addressHTML}
                ${dateHTML}
            </div>
        `;
    }).join("");
}

function formatDate(value) {
    const date = validDate(value);
    if (!date) return "Неизвестно";
    return date.toLocaleString("ru-RU", {
        day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit"
    });
}

buttons.forEach(button => {
    button.addEventListener("click", () => {
        buttons.forEach(btn => btn.classList.remove("active"));
        button.classList.add("active");
        loadOutages(button.dataset.tab);
    });
});

loadAllData();
