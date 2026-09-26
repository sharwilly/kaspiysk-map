document.addEventListener("DOMContentLoaded", () => {
    const BACKEND_URL = "https://kaspiysk-map-1.onrender.com";
    const list = document.getElementById("weeklyActivityList");
    const status = document.getElementById("weeklyActivityStatus");
    const threshold = document.getElementById("weeklyActivityThreshold");
    const refresh = document.getElementById("weeklyActivityRefresh");
    const total = document.getElementById("weeklyActivityTotal");
    const enough = document.getElementById("weeklyActivityEnough");
    if (!list || !status || !threshold) return;

    const esc = value => String(value ?? "").replace(/[&<>"']/g, c => ({
        "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;"
    }[c]));
    const formatKm = km => Number(km || 0).toFixed(1).replace(".", ",") + " км";

    function render(activity) {
        const minKm = Number(threshold.value) || 50;
        const sorted = [...activity].sort((a, b) => b.totalKm - a.totalKm);
        total.textContent = sorted.length;
        enough.textContent = sorted.filter(item => item.totalKm >= minKm).length;

        if (!sorted.length) {
            list.innerHTML = "<div class="weekly-empty">За последние 7 дней GPS-история пока не накоплена.</div>";
            return;
        }

        list.innerHTML = sorted.map((item, index) => {
            const dailyMap = new Map((item.dailyKm || []).map(day => [day.date, day.km]));
            const dayLabels = [];
            for (let i = 6; i >= 0; i--) {
                const date = new Date();
                date.setDate(date.getDate() - i);
                const key = date.toISOString().slice(0, 10);
                const km = dailyMap.get(key) || 0;
                dayLabels.push("<span title="" + key + ": " + formatKm(km) + "" class="" + (km > 0 ? "has-km" : "") + "">" + (km > 0 ? Math.round(km) : "·") + "</span>");
            }
            const enoughClass = item.totalKm >= minKm ? " is-enough" : "";
            return "<div class="weekly-truck" + enoughClass + "" data-total-km="" + item.totalKm + ""><div class="weekly-truck-main"><span class="weekly-rank">" + (index + 1) + "</span><div class="weekly-truck-name"><strong>🚛 " + esc(item.vehicle) + "</strong><span>" + item.activeDays + " дн. с движением · " + item.points + " GPS-точек</span></div><strong class="weekly-km">" + formatKm(item.totalKm) + "</strong></div><div class="weekly-days">" + dayLabels.join("") + "</div></div>";
        }).join("");
    }

    async function load() {
        refresh?.classList.add("is-loading");
        status.textContent = "Считаем километраж…";
        try {
            const response = await fetch(BACKEND_URL + "/trucks/activity?days=7&_=" + Date.now(), { cache: "no-store" });
            if (!response.ok) throw new Error("HTTP " + response.status);
            const payload = await response.json();
            if (!Array.isArray(payload.activity)) throw new Error("Некорректный ответ API");
            render(payload.activity);
            status.textContent = "За последние 7 дней · " + payload.count + " машин с историей";
        } catch (error) {
            console.error("Weekly truck activity error:", error);
            status.textContent = "История за неделю пока недоступна";
            list.innerHTML = "<div class="weekly-empty">Не удалось загрузить недельную активность: " + esc(error.message) + "</div>";
            total.textContent = "—";
            enough.textContent = "—";
        } finally {
            refresh?.classList.remove("is-loading");
        }
    }

    threshold.addEventListener("change", () => {
        const rows = [...list.querySelectorAll(".weekly-truck")];
        const minKm = Number(threshold.value) || 50;
        rows.forEach(row => row.classList.toggle("is-dimmed", Number(row.dataset.totalKm) < minKm));
        enough.textContent = rows.filter(row => Number(row.dataset.totalKm) >= minKm).length;
    });

    refresh?.addEventListener("click", load);
    load();
});
