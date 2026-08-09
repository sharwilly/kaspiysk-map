/* =========================================================
ПРОБЛЕМЫ ГОРОДА — КАРТА
========================================================= */

if (typeof L === "undefined") {
    console.error("❌ Leaflet не загружен");
    throw new Error("Leaflet не загружен. Проверь подключение leaflet.js");
}

const problemsApi = typeof API_URL !== "undefined" ? API_URL : "";
if (!problemsApi) console.warn("⚠️ API_URL не найден");

const mapElement = document.getElementById("map");
if (!mapElement) {
    console.error("❌ Элемент #map не найден");
    throw new Error("Элемент #map отсутствует в HTML");
}

const map = L.map("map", {
    maxZoom: 18,
    minZoom: 12,
    zoomControl: true
}).setView([42.8913, 47.6397], 13);

L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: "© OpenStreetMap contributors"
}).addTo(map);

let tempMarker = null;
let selectedLocation = null;
let selectedAddress = null;
let cityBoundary = null;
let problemMarkers = [];
let outageMarkers = [];
let currentMapFilter = "all";
let selectedPhotos = [];
let currentPhotos = [];
let currentPhotoIndex = 0;

const viewer = document.getElementById("photoViewer");
const viewerImage = document.getElementById("viewerImage");

function shortAddress(item) {
    const addr = item?.address;
    if (!addr) return item?.display_name || "Адрес не определён";

    let street = addr.road || "";
    if (street.startsWith("улица ")) street = street.replace("улица ", "ул. ");
    if (street.startsWith("проспект ")) street = street.replace("проспект ", "пр-т ");
    if (street.startsWith("переулок ")) street = street.replace("переулок ", "пер. ");

    if (street && addr.house_number) return `${street}, ${addr.house_number}`;
    return item.display_name || "Адрес не определён";
}

window.openPhotoViewer = function (photos, index) {
    if (!Array.isArray(photos) || photos.length === 0) return;
    currentPhotos = photos;
    currentPhotoIndex = index;
    viewerImage.src = currentPhotos[currentPhotoIndex];
    viewer.style.display = "flex";
};

function closePhotoViewer() {
    viewer.style.display = "none";
    viewerImage.src = "";
}

function showNextPhoto() {
    if (!currentPhotos.length) return;
    currentPhotoIndex = (currentPhotoIndex + 1) % currentPhotos.length;
    viewerImage.src = currentPhotos[currentPhotoIndex];
}

function showPrevPhoto() {
    if (!currentPhotos.length) return;
    currentPhotoIndex = (currentPhotoIndex - 1 + currentPhotos.length) % currentPhotos.length;
    viewerImage.src = currentPhotos[currentPhotoIndex];
}

document.getElementById("closeViewer")?.addEventListener("click", closePhotoViewer);
document.getElementById("nextPhoto")?.addEventListener("click", showNextPhoto);
document.getElementById("prevPhoto")?.addEventListener("click", showPrevPhoto);

viewer?.addEventListener("click", e => {
    if (e.target === viewer) closePhotoViewer();
});

function getProblemIcon(type) {
    const icons = {
        "подтопление": "💧",
        "яма": "🕳",
        "мусор": "🗑",
        "освещение": "💡",
        "другое": "❗",
        "outage": "⚡"
    };
    return icons[type] || "❗";
}

function getStatusName(status) {
    const statuses = {
        new: "Новое",
        accepted: "Принято",
        in_progress: "В работе",
        done: "Выполнено",
        archive: "Архив"
    };
    return statuses[status] || status || "Неизвестно";
}

function createProblemMarker(problem) {
    const icon = getProblemIcon(problem.type);

    const statusColors = {
        new: "#EF4444",          // 🔴 Новое
        in_progress: "#F59E0B",  // 🟡 В работе
        done: "#22C55E"          // 🟢 Выполнено
    };

    const backgroundColor = statusColors[problem.status] || "#EF4444";

    return L.marker(
        [Number(problem.latitude), Number(problem.longitude)],
        {
            icon: L.divIcon({
                className: "problem-marker",
                html: `
                    <div style="
                        width:34px;
                        height:34px;
                        border-radius:50%;
                        display:flex;
                        align-items:center;
                        justify-content:center;
                        background:${backgroundColor};
                        border:3px solid white;
                        box-shadow:0 3px 10px rgba(0,0,0,.3);
                        font-size:18px;
                        box-sizing:border-box;
                    ">${icon}</div>
                `,
                iconSize: [34, 34],
                iconAnchor: [17, 17],
                popupAnchor: [0, -17]
            })
        }
    );
}

function applyMapFilter() {
    problemMarkers.forEach(item => {
        const visible = currentMapFilter === "all" || currentMapFilter === item.type;
        if (visible) {
            if (!map.hasLayer(item.marker)) item.marker.addTo(map);
        } else if (map.hasLayer(item.marker)) {
            map.removeLayer(item.marker);
        }
    });

    outageMarkers.forEach(marker => {
        const visible = currentMapFilter === "all" || currentMapFilter === "outage";
        if (visible) {
            if (!map.hasLayer(marker)) marker.addTo(map);
        } else if (map.hasLayer(marker)) {
            map.removeLayer(marker);
        }
    });
}

async function loadProblemsOnMap() {
    try {
        if (!problemsApi) throw new Error("API_URL отсутствует");
        const response = await fetch(`${problemsApi}/problems/active`);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const problems = await response.json();

        problemMarkers.forEach(item => {
            if (map.hasLayer(item.marker)) map.removeLayer(item.marker);
        });
        problemMarkers = [];

        problems.forEach(problem => {
            if (problem.status === "done" || problem.latitude == null || problem.longitude == null) return;

            const marker = createProblemMarker(problem);
            const photos = Array.isArray(problem.photos) ? problem.photos : [];
            const gallery = photos.length
                ? `<br><div class="popup-gallery">${photos.map((photo, index) =>
                    `<img src="${photo}" class="popup-thumb" alt="Фото" onclick='openPhotoViewer(${JSON.stringify(photos)}, ${index})'>`
                ).join("")}</div>`
                : "";

            marker.bindPopup(`
                <div class="problem-popup">
                    <div class="problem-title">${getProblemIcon(problem.type)} ${problem.type || "Проблема"}</div>
                    <div class="problem-description">${problem.description || "Описание отсутствует"}</div>
                    <br>
                    <div>📅 <b>Дата:</b> ${problem.created_at ? new Date(problem.created_at).toLocaleDateString("ru-RU") : "неизвестно"}</div>
                    <div>📍 <b>Адрес:</b> ${problem.address || "не определён"}</div>
                    <div>📌 <b>Статус:</b> ${getStatusName(problem.status)}</div>
                    ${gallery}
                </div>
            `);

            if (currentMapFilter === "all" || currentMapFilter === problem.type) marker.addTo(map);
            problemMarkers.push({ marker, type: problem.type });
        });
        applyMapFilter();
    } catch (error) {
        console.error("❌ Ошибка загрузки проблем:", error);
    }
}

document.querySelectorAll(".map-filter").forEach(button => {
    button.addEventListener("click", function () {
        document.querySelectorAll(".map-filter").forEach(btn => btn.classList.remove("active"));
        this.classList.add("active");
        currentMapFilter = this.dataset.filter;
        applyMapFilter();
    });
});

function createOutageIcon() {
    return L.divIcon({
        className: "outage-marker",
        html: `<div class="outage-marker-inner">⚡</div>`,
        iconSize: [38, 38],
        iconAnchor: [19, 19],
        popupAnchor: [0, -20]
    });
}

function formatRestoreTime(time) {
    return time ? `Ожидаемое восстановление: <b>${time}</b>` : "Время восстановления неизвестно";
}

async function loadOutagesOnMap() {
    try {
        if (!problemsApi) throw new Error("API_URL отсутствует");
        const response = await fetch(`${problemsApi}/outages/map`);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const outages = await response.json();

        outageMarkers.forEach(marker => {
            if (map.hasLayer(marker)) map.removeLayer(marker);
        });
        outageMarkers = [];

        outages.forEach(outage => {
            if (!Array.isArray(outage.locations)) return;
            outage.locations.forEach(location => {
                if (location.latitude == null || location.longitude == null) return;

                const marker = L.marker(
                    [Number(location.latitude), Number(location.longitude)],
                    { icon: createOutageIcon() }
                );

                marker.bindPopup(`
                    <div class="outage-popup">
                        <div class="outage-title">⚡ Отключение электроэнергии</div>
                        <div class="outage-address">📍 <b>${location.address || "Адрес не указан"}</b></div>
                        <div class="outage-description">${outage.description || "Аварийное отключение"}</div>
                        <div class="outage-time">${formatRestoreTime(outage.restore_time)}</div>
                        <div class="outage-date">📅 Сообщение: ${outage.created_at ? new Date(outage.created_at).toLocaleString("ru-RU") : "неизвестно"}</div>
                    </div>
                `);

                if (currentMapFilter === "all" || currentMapFilter === "outage") marker.addTo(map);
                outageMarkers.push(marker);
            });
        });
        applyMapFilter();
    } catch (error) {
        console.error("❌ Ошибка загрузки отключений:", error);
    }
}

async function loadCityBoundary() {
    try {
        const response = await fetch("data/kaspiysk_boundary.geojson");
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        cityBoundary = await response.json();

        const boundary = L.geoJSON(cityBoundary, {
            style: { color: "#0d6efd", weight: 3, opacity: 1, fillColor: "#0d6efd", fillOpacity: 0.03 },
            interactive: false
        }).addTo(map);

        boundary.bringToBack();
        const bounds = boundary.getBounds();
        if (bounds.isValid()) map.fitBounds(bounds, { padding: [20, 20] });
    } catch (error) {
        console.error("❌ Ошибка загрузки границы города:", error);
    }
}

map.on("click", async function (e) {
    if (!cityBoundary) {
        alert("Граница города ещё не загружена");
        return;
    }

    const point = turf.point([e.latlng.lng, e.latlng.lat]);
    if (!turf.booleanPointInPolygon(point, cityBoundary)) {
        alert("Обращение можно создать только в пределах Каспийска");
        return;
    }

    const { lat: latitude, lng: longitude } = e.latlng;
    selectedLocation = { latitude, longitude };
    selectedAddress = "Получение адреса...";

    if (tempMarker) map.removeLayer(tempMarker);
    tempMarker = L.marker([latitude, longitude])
        .addTo(map)
        .bindTooltip("📍 Получение адреса...", { permanent: true, direction: "top", offset: [0, -10] })
        .openTooltip();

    try {
        const response = await fetch(
            `https://nominatim.openstreetmap.org/reverse?format=jsonv2&addressdetails=1&lat=${latitude}&lon=${longitude}`,
            { headers: { "User-Agent": "KaspiyskMap/1.0" } }
        );
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();
        selectedAddress = shortAddress(data);
    } catch (error) {
        console.error("Ошибка получения адреса:", error);
        selectedAddress = "Адрес не определён";
    }

    if (tempMarker) {
        tempMarker.unbindTooltip();
        tempMarker.bindTooltip("📍 " + selectedAddress, {
            permanent: true, direction: "top", offset: [0, -10]
        }).openTooltip();
    }

    document.getElementById("addressResults").innerHTML = "Выбрано: 📍 " + selectedAddress;
});

document.getElementById("findAddress").addEventListener("click", async function () {
    const text = document.getElementById("problemAddress").value.trim();
    if (!text) {
        alert("Введите адрес");
        return;
    }

    const query = `${text}, Каспийск, Республика Дагестан, Россия`;
    const container = document.getElementById("addressResults");
    container.innerHTML = "🔎 Ищем адрес...";

    try {
        const response = await fetch(
            `https://nominatim.openstreetmap.org/search?format=jsonv2&addressdetails=1&q=${encodeURIComponent(query)}&limit=50`,
            { headers: { "User-Agent": "KaspiyskMap/1.0" } }
        );
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();

        const filteredData = data.filter(item => {
            const addr = item.address;
            return addr?.road && addr.house_number &&
                (addr.city === "Каспийск" || addr.town === "Каспийск" || addr.municipality === "Каспийск");
        });

        filteredData.sort((a, b) => {
            const getType = item => {
                const road = item.address.road.toLowerCase();
                if (road === "улица кирова") return { type: 1, line: 0 };
                if (road === "переулок кирова") return { type: 2, line: 0 };
                const lineMatch = road.match(/(\d+)-я линия/);
                if (lineMatch) return { type: 3, line: Number(lineMatch[1]) };
                return { type: 4, line: 999 };
            };
            const aInfo = getType(a), bInfo = getType(b);
            return aInfo.type !== bInfo.type ? aInfo.type - bInfo.type : aInfo.line - bInfo.line;
        });

        if (!filteredData.length) {
            container.innerHTML = "Адрес не найден";
            return;
        }

        const uniqueData = filteredData.filter((item, index, self) => {
            const key = item.address.road + "_" + item.address.house_number;
            return index === self.findIndex(t => t.address.road + "_" + t.address.house_number === key);
        });

        if (uniqueData.length === 1) {
            selectAddressResult(uniqueData[0]);
            return;
        }

        container.innerHTML = "";
        uniqueData.forEach(item => {
            const button = document.createElement("button");
            button.type = "button";
            button.textContent = "📍 " + shortAddress(item);
            button.addEventListener("click", () => selectAddressResult(item));
            container.appendChild(button);
        });
    } catch (error) {
        console.error("❌ Ошибка поиска адреса:", error);
        container.innerHTML = "Ошибка поиска адреса";
    }
});

function selectAddressResult(item) {
    const latitude = Number(item.lat);
    const longitude = Number(item.lon);
    selectedLocation = { latitude, longitude };
    selectedAddress = shortAddress(item);

    if (tempMarker) map.removeLayer(tempMarker);
    tempMarker = L.marker([latitude, longitude])
        .addTo(map)
        .bindTooltip("📍 " + selectedAddress, { permanent: true, direction: "top", offset: [0, -10] })
        .openTooltip();

    map.setView([latitude, longitude], 17);
    document.getElementById("addressResults").innerHTML = "Выбрано: 📍 " + selectedAddress;
}

document.getElementById("saveProblem").addEventListener("click", async function () {
    const saveButton = document.getElementById("saveProblem");
    const serverNotice = document.getElementById("serverNotice");

    if (!selectedLocation) {
        alert("Укажите место на карте или введите адрес");
        return;
    }

    const type = document.getElementById("problemType").value;
    const description = document.getElementById("problemDescription").value.trim();

    if (!type) {
        alert("Выберите тип проблемы");
        return;
    }
    if (selectedPhotos.length > 3) {
        alert("Можно загрузить максимум 3 фотографии");
        return;
    }
    if (!problemsApi) {
        alert("API сервера не настроен");
        return;
    }

    const formData = new FormData();
    formData.append("type", type);
    formData.append("description", description);
    formData.append("longitude", selectedLocation.longitude);
    formData.append("latitude", selectedLocation.latitude);
    if (selectedAddress) formData.append("address", selectedAddress);
    selectedPhotos.forEach(file => formData.append("photos", file));

    saveButton.disabled = true;
    saveButton.textContent = "⏳ Отправляем...";

    const loadingTimer = setTimeout(() => serverNotice.classList.remove("hidden"), 10000);

    try {
        const response = await fetch(`${problemsApi}/problems`, { method: "POST", body: formData });
        if (!response.ok) {
            let message = `HTTP ${response.status}`;
            try {
                const errorData = await response.json();
                if (errorData.message) message = errorData.message;
            } catch (_) {}
            throw new Error(message);
        }

        const problem = await response.json();
        clearTimeout(loadingTimer);
        serverNotice.classList.add("hidden");

        if (problem.latitude != null && problem.longitude != null) {
            const marker = createProblemMarker(problem);
            const photos = Array.isArray(problem.photos) ? problem.photos : [];
            const gallery = photos.length
                ? `<br><br><div class="popup-gallery">${photos.map((photo, index) =>
                    `<img src="${photo}" class="popup-thumb" alt="Фото" onclick='openPhotoViewer(${JSON.stringify(photos)}, ${index})'>`
                ).join("")}</div>`
                : "";

            marker.bindPopup(`
                <div class="problem-popup">
                    <div class="problem-title">${getProblemIcon(problem.type)} ${problem.type}</div>
                    <div class="problem-description">${problem.description || "Описание отсутствует"}</div>
                    <br>
                    📅 <b>Дата:</b> ${problem.created_at ? new Date(problem.created_at).toLocaleDateString("ru-RU") : "сейчас"}<br>
                    📍 <b>Адрес:</b> ${problem.address || selectedAddress || "не определён"}<br>
                    📌 <b>Статус:</b> ${getStatusName(problem.status)}
                    ${gallery}
                </div>
            `);
            marker.addTo(map);
            problemMarkers.push({ marker, type: problem.type });
            applyMapFilter();
        }

        selectedPhotos = [];
        renderPhotoPreview();
        document.getElementById("problemDescription").value = "";
        document.getElementById("photos").value = "";
        document.querySelectorAll(".type-button").forEach(btn => btn.classList.remove("active"));
        document.getElementById("problemType").value = "";

        if (tempMarker) {
            map.removeLayer(tempMarker);
            tempMarker = null;
        }
        selectedLocation = null;
        selectedAddress = null;
        document.getElementById("addressResults").innerHTML = "";
        showSuccessMessage(problem.id);
    } catch (error) {
        clearTimeout(loadingTimer);
        serverNotice.classList.add("hidden");
        console.error("❌ Ошибка отправки:", error);
        alert("Не удалось отправить обращение.\n\n" + error.message);
    } finally {
        saveButton.disabled = false;
        saveButton.textContent = "🚀 Отправить обращение";
    }
});

document.querySelectorAll(".type-button").forEach(button => {
    button.addEventListener("click", function () {
        document.querySelectorAll(".type-button").forEach(btn => btn.classList.remove("active"));
        this.classList.add("active");
        document.getElementById("problemType").value = this.dataset.type;
    });
});

document.getElementById("myLocation").addEventListener("click", function () {
    if (!navigator.geolocation) {
        alert("Геолокация не поддерживается вашим браузером");
        return;
    }

    navigator.geolocation.getCurrentPosition(
        async position => {
            const { latitude, longitude } = position.coords;

            if (cityBoundary && typeof turf !== "undefined") {
                const point = turf.point([longitude, latitude]);
                if (!turf.booleanPointInPolygon(point, cityBoundary)) {
                    alert("Ваше местоположение находится за пределами Каспийска");
                    return;
                }
            }

            selectedLocation = { latitude, longitude };
            selectedAddress = "Моё местоположение";

            if (tempMarker) map.removeLayer(tempMarker);
            tempMarker = L.marker([latitude, longitude]).addTo(map).bindPopup("📍 Вы здесь").openPopup();
            map.setView([latitude, longitude], 17);
            document.getElementById("addressResults").innerHTML = "Выбрано: 📍 Моё местоположение";

            try {
                const response = await fetch(
                    `https://nominatim.openstreetmap.org/reverse?format=jsonv2&addressdetails=1&lat=${latitude}&lon=${longitude}`,
                    { headers: { "User-Agent": "KaspiyskMap/1.0" } }
                );
                if (response.ok) {
                    const data = await response.json();
                    selectedAddress = shortAddress(data);
                    document.getElementById("addressResults").innerHTML = "Выбрано: 📍 " + selectedAddress;
                }
            } catch (error) {
                console.warn("Не удалось определить адрес:", error);
            }
        },
        error => {
            let message = "Не удалось определить местоположение";
            if (error.code === error.PERMISSION_DENIED) message = "Доступ к геолокации запрещён.";
            if (error.code === error.POSITION_UNAVAILABLE) message = "Местоположение сейчас недоступно.";
            if (error.code === error.TIMEOUT) message = "Время ожидания геолокации истекло.";
            alert(message);
        },
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
    );
});

const photoInput = document.getElementById("photos");
const photoPreview = document.getElementById("photoPreview");

photoInput.addEventListener("change", function () {
    const files = Array.from(photoInput.files);
    const total = selectedPhotos.length + files.length;
    if (total > 3) {
        alert("Можно загрузить максимум 3 фотографии");
        selectedPhotos = [...selectedPhotos, ...files].slice(0, 3);
    } else {
        selectedPhotos = [...selectedPhotos, ...files];
    }
    renderPhotoPreview();
});

function renderPhotoPreview() {
    photoPreview.innerHTML = "";
    selectedPhotos.forEach((file, index) => {
        const url = URL.createObjectURL(file);
        const block = document.createElement("div");
        block.className = "photo-item";
        const image = document.createElement("img");
        image.src = url;
        image.alt = "Предпросмотр";
        const removeButton = document.createElement("button");
        removeButton.type = "button";
        removeButton.textContent = "❌";
        removeButton.addEventListener("click", () => removePhoto(index));
        block.appendChild(image);
        block.appendChild(removeButton);
        photoPreview.appendChild(block);
    });
}

function removePhoto(index) {
    if (index < 0 || index >= selectedPhotos.length) return;
    selectedPhotos.splice(index, 1);
    renderPhotoPreview();
}

function showSuccessMessage(id) {
    const message = document.createElement("div");
    message.className = "success-message";
    message.innerHTML = `<div>✅ Спасибо!<br><br>Ваше обращение №${id} принято.</div>`;
    document.body.appendChild(message);
    setTimeout(() => message.remove(), 4000);
}

function invalidateMapSize() {
    setTimeout(() => map.invalidateSize(true), 100);
    setTimeout(() => map.invalidateSize(true), 500);
}

window.addEventListener("resize", invalidateMapSize);
window.addEventListener("load", invalidateMapSize);

document.addEventListener("keydown", e => {
    if (e.key === "Escape") closePhotoViewer();
    if (e.key === "ArrowRight") showNextPhoto();
    if (e.key === "ArrowLeft") showPrevPhoto();
});

function loadLocationFromURL() {
    const params = new URLSearchParams(window.location.search);

    const lat = Number(params.get("lat"));
    const lon = Number(params.get("lon"));
    const address = params.get("address");

    if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
        return false;
    }

    selectedLocation = {
        latitude: lat,
        longitude: lon
    };

    selectedAddress = address
        ? decodeURIComponent(address)
        : "Адрес не определён";

    if (tempMarker) {
        map.removeLayer(tempMarker);
    }

    tempMarker = L.marker([lat, lon])
        .addTo(map)
        .bindTooltip(
            "📍 " + selectedAddress,
            {
                permanent: true,
                direction: "top",
                offset: [0, -10]
            }
        )
        .openTooltip();

    map.setView([lat, lon], 17);

    const addressResults = document.getElementById("addressResults");

    if (addressResults) {
        addressResults.innerHTML =
            "Выбрано: 📍 " + selectedAddress;
    }

    // Убираем параметры из адресной строки
    window.history.replaceState({}, document.title, "problems.html");

    return true;
}

async function initProblemsPage() {
    console.log("🚀 problems.js загружен");

    await loadCityBoundary();

    const locationFromURL = loadLocationFromURL();

    await Promise.allSettled([
        loadProblemsOnMap(),
        loadOutagesOnMap()
    ]);

    if (locationFromURL) {
        map.setView(
            [selectedLocation.latitude, selectedLocation.longitude],
            17
        );
    }

    invalidateMapSize();

    console.log("✅ Страница проблем инициализирована");
}

initProblemsPage();

setInterval(async () => {
    console.log("🔄 Обновляем карту...");
    await Promise.allSettled([loadProblemsOnMap(), loadOutagesOnMap()]);
}, 300000);

map.attributionControl.remove();