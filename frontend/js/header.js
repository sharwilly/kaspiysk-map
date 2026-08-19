const header = document.getElementById("header-container");

if (header) {
    header.innerHTML = `
        <header class="site-header">
            <div class="header-inner">
                <a href="index.html" class="logo">Открытый Каспийск</a>
            </div>
        </header>
    `;
}

fetch("components/header.html")
    .then(response => {
        if (!response.ok) throw new Error(`Ошибка header: ${response.status}`);
        return response.text();
    })
    .then(data => {
        const container = document.getElementById("header-container");
        if (!container) return;

        container.innerHTML = data;

        const currentPage = document.body.dataset.page;
        const activeLink = document.querySelector(
            `.main-nav a[data-page="${CSS.escape(currentPage || "")}"]`
        );

        if (activeLink) {
            activeLink.classList.add("active");
        }

        if (typeof initWeather === "function") {
            initWeather();
        }
    })
    .catch(error => {
        console.error("Ошибка загрузки шапки:", error);
    });
