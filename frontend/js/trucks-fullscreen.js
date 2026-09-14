document.addEventListener("DOMContentLoaded", () => {
    const mapWrap = document.querySelector(".trucks-map-wrap");
    const button = document.querySelector(".truck-map-fullscreen");
    if (!mapWrap || !button) return;

    const style = document.createElement("style");
    style.textContent = `
        .trucks-map-wrap.fullscreen-fallback {
            position: fixed !important;
            inset: 0 !important;
            z-index: 99999 !important;
            width: 100vw !important;
            height: 100vh !important;
            height: 100dvh !important;
            min-height: 100vh !important;
            min-height: 100dvh !important;
            margin: 0 !important;
            border-radius: 0 !important;
            background: #e8eef5 !important;
        }
        .trucks-map-wrap.fullscreen-fallback #trucks-map {
            width: 100% !important;
            height: 100vh !important;
            height: 100dvh !important;
            min-height: 100vh !important;
            min-height: 100dvh !important;
        }
        .trucks-map-wrap.fullscreen-fallback .truck-map-fullscreen {
            top: max(14px, env(safe-area-inset-top)) !important;
            right: max(14px, env(safe-area-inset-right)) !important;
        }
        body.map-fallback-open { overflow: hidden !important; }
    `;
    document.head.appendChild(style);

    let active = false;

    function resizeMap() {
        window.dispatchEvent(new Event("resize"));
        setTimeout(() => window.dispatchEvent(new Event("resize")), 250);
    }

    function updateButton() {
        button.innerHTML = active
            ? "<span aria-hidden=\"true\">×</span>"
            : "<span aria-hidden=\"true\">⛶</span>";
        button.setAttribute("aria-label", active
            ? "Выйти из полноэкранного режима"
            : "Открыть карту на весь экран");
        button.title = active ? "Выйти из полноэкранного режима" : "На весь экран";
    }

    function setActive(next) {
        active = Boolean(next);
        mapWrap.classList.toggle("fullscreen-fallback", active);
        document.body.classList.toggle("map-fallback-open", active);
        updateButton();
        resizeMap();
    }

    // Перехватываем клик раньше обработчика из trucks.js.
    // Так кнопка одинаково работает в Safari/iOS и обычных браузерах.
    button.addEventListener("click", event => {
        event.preventDefault();
        event.stopImmediatePropagation();
        setActive(!active);
    }, true);

    document.addEventListener("keydown", event => {
        if (event.key === "Escape" && active) {
            event.preventDefault();
            setActive(false);
        }
    });

    window.addEventListener("orientationchange", resizeMap);
    window.addEventListener("resize", () => {
        if (active) setTimeout(() => window.dispatchEvent(new Event("resize")), 50);
    });

    updateButton();
});
