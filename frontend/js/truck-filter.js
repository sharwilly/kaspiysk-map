(() => {
    const FILTER_KEY = "kaspiysk-truck-filter";
    const originalFetch = window.fetch.bind(window);
    let filterMode = (() => {
        try {
            return localStorage.getItem(FILTER_KEY) === "active" ? "active" : "all";
        } catch {
            return "all";
        }
    })();

    window.__truckFilterMode = filterMode;

    function isActiveTruck(truck) {
        return truck?.fresh === true || truck?.fresh === "true";
    }

    function isTrucksEndpoint(input) {
        try {
            const rawUrl = typeof input === "string" ? input : input?.url;
            const url = new URL(rawUrl, window.location.href);
            return url.pathname === "/trucks";
        } catch {
            return false;
        }
    }

    window.fetch = async (input, init) => {
        const response = await originalFetch(input, init);
        if (filterMode !== "active" || !isTrucksEndpoint(input)) return response;

        try {
            const payload = await response.clone().json();
            if (!Array.isArray(payload?.trucks)) return response;

            const filtered = payload.trucks.filter(isActiveTruck);
            const wrapped = {
                ...payload,
                trucks: filtered,
                filter: {
                    mode: "active",
                    total: payload.trucks.length,
                    shown: filtered.length
                }
            };

            return new Response(JSON.stringify(wrapped), {
                status: response.status,
                statusText: response.statusText,
                headers: new Headers(response.headers)
            });
        } catch {
            return response;
        }
    };

    function setFilterMode(value) {
        filterMode = value === "active" ? "active" : "all";
        window.__truckFilterMode = filterMode;
        try {
            localStorage.setItem(FILTER_KEY, filterMode);
        } catch {
            // Ignore storage restrictions.
        }
    }

    function createFilter() {
        const panel = document.querySelector(".trucks-panel");
        const stats = document.querySelector(".truck-stats");
        if (!panel || !stats || document.getElementById("truckFilter")) return;

        const wrap = document.createElement("div");
        wrap.className = "truck-filter";
        wrap.innerHTML = `
            <label for="truckFilter">Показать</label>
            <select id="truckFilter" aria-label="Фильтр мусоровозов">
                <option value="all">Все мусоровозы</option>
                <option value="active">Только активные</option>
            </select>`;

        stats.before(wrap);
        const select = wrap.querySelector("select");
        select.value = filterMode;
        select.addEventListener("change", () => {
            setFilterMode(select.value);
            document.getElementById("refreshTrucks")?.click();
        });
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", createFilter, { once: true });
    } else {
        createFilter();
    }
})();
