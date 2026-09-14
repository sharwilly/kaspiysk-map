document.addEventListener("DOMContentLoaded", () => {
    const mapWrap = document.querySelector(".trucks-map-wrap");
    const button = document.querySelector(".truck-map-fullscreen");
    const mapElement = document.getElementById("trucks-map");
    if (!mapWrap || !button) return;

    const style = document.createElement("style");
    style.textContent = `
        .trucks-map-wrap.fullscreen-fallback {
            position: fixed !important;
            inset: 0 !important;
            z-index: 99999 !important;
            width: 100vw !important;
            height: 100dvh !important;
            min-height: 100dvh !important;
            border-radius: 0 !important;
            margin: 0 !important;
            background: #e8eef5 !important;
        }
        .trucks-map-wrap.fullscreen-fallback #trucks-map {
            width: 100% !important;
            height: 100% !important;
            min-height: 100dvh !important;
        }
        .trucks-map-wrap.fullscreen-fallback .truck-map-fullscreen {
            top: max(14px, env(safe-area-inset-top)) !important;
            right: max(14px, env(safe-area-inset-right)) !important;
        }
        body.map-fallback-open { overflow: hidden !important; }
    `;
    document.head.appendChild(style);

    let fallbackActive = false;

    function invalidateMap() {
        if (window.L && mapElement) {
            const map = window.L.DomUtil.get(mapElement)?._leaflet_map;
            if (map && map.invalidateSize) setTimeout(() => map.invalidateSize(true), 120);
        }
        window.dispatchEvent(new Event("resize"));
    }

    function setFallback(active) {
        fallbackActive = active;
        mapWrap.classList.toggle("fullscreen-fallback", active);
        document.body.classList.toggle("map-fallback-open", active);
        button.innerHTML = active ? "<span aria-hidden=\"true\">×</span>" : "<span aria-hidden=\"true\">⛶</span>";
        button.setAttribute("aria-label", active ? "Выйти из полноэкранного режима" : "Открыть карту на весь экран");
        button.title = active ? "Выйти из полноэкранного режима" : "На весь экран";
        invalidateMap();
    }

    button.addEventListener("click", () => {
        setTimeout(() => {
            if (!document.fullscreenElement && !document.webkitFullscreenElement) {
                setFallback(!fallbackActive);
            }
        }, 80);
    });

    document.addEventListener("fullscreenchange", () => {
        if (document.fullscreenElement) setFallback(false);
        else if (fallbackActive) setFallback(false);
    });

    document.addEventListener("webkitfullscreenchange", () => {
        if (document.webkitFullscreenElement) setFallback(false);
        else if (fallbackActive) setFallback(false);
    });

    document.addEventListener("keydown", event => {
        if (event.key === "Escape" && fallbackActive) setFallback(false);
    });
});
