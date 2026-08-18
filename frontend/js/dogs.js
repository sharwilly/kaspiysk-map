/* =========================================================
   БЕЗДОМНЫЕ СОБАКИ — КАРТА
========================================================= */

if (typeof L === "undefined") {
    console.error("Leaflet не загружен");
    throw new Error("Leaflet не загружен");
}

const SUPABASE_URL = "https://vllyfjyibdtbcvdmpskg.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZsbHlmanlpYmR0YmN2ZG1wc2tnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODcwNzgxODIsImV4cCI6MjEwMjY1NDE4Mn0.rcWp9OMOZMogt6dgngy6iMuTO5FnvUQZqVr1p9Zj5XU";

const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const mapElement = document.getElementById("map");
if (!mapElement) throw new Error("Элемент #map не найден");

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
let dogMarkers = [];
let selectedPhotoFile = null;

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

function closePhotoViewer() {
    viewer.style.display = "none";
    viewerImage.src = "";
}

document.getElementById("closeViewer")?.addEventListener("click", closePhotoViewer);
viewer?.addEventListener("click", e => {
    if (e.target === viewer) closePhotoViewer();
});

function createDogMarker(sighting) {
    return L.marker(
        [Number(sighting.latitude), Number(sighting.longitude)],
        {
            icon: L.divIcon({
                className: "dog-marker",
                html: `<div class="dog-marker-inner">🐕</div>`,
                iconSize: [38, 38],
                iconAnchor: [19, 19],
                popupAnchor: [0, -20]
            })
        }
    );
}

async function loadDogSightings() {
    try {
        const { data, error } = await supabase
            .from("dog_sightings")
            .select("*")
            .order("created_at", { ascending: false });

        if (error) throw error;

        dogMarkers.forEach(marker => {
            if (map.hasLayer(marker)) map.removeLayer(marker);
        });
        dogMarkers = [];

        data.forEach(sighting => {
            if (sighting.latitude == null || sighting.longitude == null) return;

            const marker = createDogMarker(sighting);

            const photoHtml = sighting.photo_url
                ? `<br><div class="popup-gallery"><img src="${sighting.photo_url}" class="popup-thumb" alt="Фото собаки" onclick='document.getElementById("viewerImage").src="${sighting.photo_url}";document.getElementById("photoViewer").style.display="flex";'></div>`
                : "";

            marker.bindPopup(`
                <div class="dog-popup">
                    <div class="dog-title">🐾 Бездомная собака</div>
                    <div class="dog-description">${sighting.description || "Описание отсутствует"}</div>
                    <br>
                    <div>📅 <b>Дата:</b> ${sighting.created_at ? new Date(sighting.created_at).toLocaleDateString("ru-RU") : "неизвестно"}</div>
                    ${photoHtml}
                </div>
            `);

            marker.addTo(map);
            dogMarkers.push(marker);
        });
    } catch (error) {
        console.error("Ошибка загрузки отметок собак:", error);
    }
}

async function loadCityBoundary() {
    try {
        const response = await fetch("data/kaspiysk_boundary.geojson");
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        cityBoundary = await response.json();

        const boundary = L.geoJSON(cityBoundary, {
            style: { color: "#14B8A6", weight: 3, opacity: 1, fillColor: "#14B8A6", fillOpacity: 0.03 },
            interactive: false
        }).addTo(map);

        boundary.bringToBack();
        const bounds = boundary.getBounds();
        if (bounds.isValid()) map.fitBounds(bounds, { padding: [20, 20] });
    } catch (error) {
        console.error("Ошибка загрузки границы города:", error);
    }
}

map.on("click", async function (e) {
    if (!cityBoundary) {
        alert("Граница города ещё не загружена");
        return;
    }

    const point = turf.point([e.latlng.lng, e.latlng.lat]);
    if (!turf.booleanPointInPolygon(point, cityBoundary)) {
        alert("Отметку можно создать только в пределах Каспийска");
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
    const text = document.getElementById("dogAddress").value.trim();
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
        console.error("Ошибка поиска адреса:", error);
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

const photoInput = document.getElementById("dogPhoto");
const photoPreview = document.getElementById("photoPreview");

photoInput.addEventListener("change", function () {
    const file = photoInput.files[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
        alert("Размер фото не должен превышать 5 МБ");
        photoInput.value = "";
        return;
    }

    selectedPhotoFile = file;
    renderPhotoPreview();
});

function renderPhotoPreview() {
    photoPreview.innerHTML = "";
    if (!selectedPhotoFile) return;

    const url = URL.createObjectURL(selectedPhotoFile);
    const block = document.createElement("div");
    block.className = "photo-item";
    const image = document.createElement("img");
    image.src = url;
    image.alt = "Предпросмотр";
    const removeButton = document.createElement("button");
    removeButton.type = "button";
    removeButton.textContent = "❌";
    removeButton.addEventListener("click", () => {
        selectedPhotoFile = null;
        photoInput.value = "";
        renderPhotoPreview();
    });
    block.appendChild(image);
    block.appendChild(removeButton);
    photoPreview.appendChild(block);
}

function fileToBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}

document.getElementById("saveDog").addEventListener("click", async function () {
    const saveButton = document.getElementById("saveDog");
    const serverNotice = document.getElementById("serverNotice");

    if (!selectedLocation) {
        alert("Укажите место на карте или введите адрес");
        return;
    }

    const description = document.getElementById("dogDescription").value.trim();

    let photoUrl = null;
    if (selectedPhotoFile) {
        try {
            photoUrl = await fileToBase64(selectedPhotoFile);
        } catch (err) {
            alert("Не удалось обработать фото");
            return;
        }
    }

    saveButton.disabled = true;
    saveButton.textContent = "⏳ Отправляем...";

    const loadingTimer = setTimeout(() => serverNotice.classList.remove("hidden"), 5000);

    try {
        const { data, error } = await supabase
            .from("dog_sightings")
            .insert({
                latitude: selectedLocation.latitude,
                longitude: selectedLocation.longitude,
                description: description || null,
                photo_url: photoUrl
            })
            .select()
            .single();

        if (error) throw error;

        clearTimeout(loadingTimer);
        serverNotice.classList.add("hidden");

        const marker = createDogMarker(data);
        const photoHtml = data.photo_url
            ? `<br><div class="popup-gallery"><img src="${data.photo_url}" class="popup-thumb" alt="Фото собаки" onclick='document.getElementById("viewerImage").src="${data.photo_url}";document.getElementById("photoViewer").style.display="flex";'></div>`
            : "";

        marker.bindPopup(`
            <div class="dog-popup">
                <div class="dog-title">🐾 Бездомная собака</div>
                <div class="dog-description">${data.description || "Описание отсутствует"}</div>
                <br>
                📅 <b>Дата:</b> ${data.created_at ? new Date(data.created_at).toLocaleDateString("ru-RU") : "сейчас"}<br>
                ${photoHtml}
            </div>
        `);
        marker.addTo(map);
        dogMarkers.push(marker);

        selectedPhotoFile = null;
        renderPhotoPreview();
        document.getElementById("dogDescription").value = "";
        document.getElementById("dogPhoto").value = "";

        if (tempMarker) {
            map.removeLayer(tempMarker);
            tempMarker = null;
        }
        selectedLocation = null;
        selectedAddress = null;
        document.getElementById("addressResults").innerHTML = "";
        showSuccessMessage(data.id);
    } catch (error) {
        clearTimeout(loadingTimer);
        serverNotice.classList.add("hidden");
        console.error("Ошибка отправки:", error);
        alert("Не удалось отправить отметку.\n\n" + error.message);
    } finally {
        saveButton.disabled = false;
        saveButton.textContent = "🚀 Отправить отметку";
    }
});

function showSuccessMessage(id) {
    const message = document.createElement("div");
    message.className = "success-message";
    message.innerHTML = `<div>✅ Спасибо!<br><br>Ваша отметка о бездомной собаке сохранена.</div>`;
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
});

async function initDogsPage() {
    console.log("🚀 dogs.js загружен");

    await loadCityBoundary();
    await loadDogSightings();
    invalidateMapSize();

    console.log("✅ Страница бездомных собак инициализирована");
}

initDogsPage();

setInterval(async () => {
    console.log("🔄 Обновляем карту...");
    await loadDogSightings();
}, 300000);

map.attributionControl.remove();
