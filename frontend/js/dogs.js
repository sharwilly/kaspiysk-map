/* =========================================================
   БЕЗДОМНЫЕ СОБАКИ — КАРТА
   Архитектура такая же, как у problems:
   Vercel → Express API → PostgreSQL/PostGIS → Cloudinary
========================================================= */

(() => {
    "use strict";

    if (typeof L === "undefined") {
        console.error("Leaflet не загружен");
        return;
    }

    const api = typeof API_URL !== "undefined" ? API_URL : "";
    if (!api) {
        console.error("API_URL не найден");
        return;
    }

    const mapElement = document.getElementById("map");
    if (!mapElement) {
        console.error("Элемент #map не найден");
        return;
    }

    const map = L.map(mapElement, {
        maxZoom: 18,
        minZoom: 12,
        zoomControl: true
    }).setView([42.8913, 47.6397], 13);

    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution: "© OpenStreetMap contributors"
    }).addTo(map);

    const refreshMapSize = () => map.invalidateSize({ pan: false });
    requestAnimationFrame(refreshMapSize);
    setTimeout(refreshMapSize, 300);
    setTimeout(refreshMapSize, 1000);
    window.addEventListener("resize", refreshMapSize);

    let tempMarker = null;
    let selectedLocation = null;
    let selectedAddress = null;
    let cityBoundary = null;
    let dogMarkers = [];
    let selectedPhotoFile = null;

    const viewer = document.getElementById("photoViewer");
    const viewerImage = document.getElementById("viewerImage");

    function escapeHtml(value) {
        return String(value ?? "")
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }

    function shortAddress(item) {
        const addr = item?.address;
        if (!addr) return item?.display_name || "Адрес не определён";

        let street = addr.road || "";
        if (street.startsWith("улица ")) street = street.replace("улица ", "ул. ");
        if (street.startsWith("проспект ")) street = street.replace("проспект ", "пр-т ");
        if (street.startsWith("переулок ")) street = street.replace("переулок ", "пер. ");
        if (street.startsWith("бульвар ")) street = street.replace("бульвар ", "бул. ");
        if (street.startsWith("площадь ")) street = street.replace("площадь ", "пл. ");

        if (street && addr.house_number) return `${street}, ${addr.house_number}`;
        return item.display_name || "Адрес не определён";
    }

    function closePhotoViewer() {
        if (!viewer || !viewerImage) return;
        viewer.style.display = "none";
        viewerImage.src = "";
    }

    document.getElementById("closeViewer")?.addEventListener("click", closePhotoViewer);
    viewer?.addEventListener("click", event => {
        if (event.target === viewer) closePhotoViewer();
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
            const response = await fetch(`${api}/dogs`);
            if (!response.ok) throw new Error(`HTTP ${response.status}`);

            const sightings = await response.json();

            dogMarkers.forEach(marker => {
                if (map.hasLayer(marker)) map.removeLayer(marker);
            });
            dogMarkers = [];

            (sightings || []).forEach(sighting => {
                if (sighting.latitude == null || sighting.longitude == null) return;

                const marker = createDogMarker(sighting);
                const photos = Array.isArray(sighting.photos) ? sighting.photos : [];
                const gallery = photos.length
                    ? `<br><div class="popup-gallery">${photos.map(photo =>
                        `<img src="${escapeHtml(photo)}" class="popup-thumb" alt="Фото собаки">`
                    ).join("")}</div>`
                    : "";

                marker.bindPopup(`
                    <div class="dog-popup">
                        <div class="dog-title">🐾 Бездомная собака</div>
                        <div class="dog-description">${escapeHtml(sighting.description || "Описание отсутствует")}</div>
                        <br>
                        <div>📅 <b>Дата:</b> ${sighting.created_at ? new Date(sighting.created_at).toLocaleDateString("ru-RU") : "неизвестно"}</div>
                        <div>📍 <b>Адрес:</b> ${escapeHtml(sighting.address || "не определён")}</div>
                        ${sighting.landmark ? `<div>🏷 <b>Ориентир:</b> ${escapeHtml(sighting.landmark)}</div>` : ""}
                        ${gallery}
                    </div>
                `);

                marker.on("popupopen", () => {
                    const popup = marker.getPopup()?.getElement();
                    popup?.querySelectorAll(".popup-thumb").forEach((image, index) => {
                        image.addEventListener("click", () => {
                            if (!viewer || !viewerImage) return;
                            viewerImage.src = photos[index];
                            viewer.style.display = "flex";
                        });
                    });
                });

                marker.addTo(map);
                dogMarkers.push(marker);
            });
        } catch (error) {
            console.error("Ошибка загрузки отметок собак:", error);
        }
    }

    async function loadCityBoundary() {
        try {
            const response = await fetch("data/kaspiysk_boundary.geojson", {
                cache: "no-cache"
            });

            if (!response.ok) throw new Error(`HTTP ${response.status}`);

            cityBoundary = await response.json();

            const boundary = L.geoJSON(cityBoundary, {
                style: {
                    color: "#14B8A6",
                    weight: 3,
                    opacity: 1,
                    fillColor: "#14B8A6",
                    fillOpacity: 0.03
                },
                interactive: false
            }).addTo(map);

            boundary.bringToBack();

            const bounds = boundary.getBounds();
            if (bounds.isValid()) map.fitBounds(bounds, { padding: [20, 20] });

            refreshMapSize();
        } catch (error) {
            console.error("Ошибка загрузки границы города:", error);
        }
    }

    function setSelectedLocation(latitude, longitude, label) {
        selectedLocation = { latitude, longitude };
        selectedAddress = label || null;

        if (tempMarker) map.removeLayer(tempMarker);

        tempMarker = L.marker([latitude, longitude])
            .addTo(map)
            .bindTooltip("📍 " + (label || "Выбранная точка"), {
                permanent: true,
                direction: "top",
                offset: [0, -10]
            })
            .openTooltip();

        const result = document.getElementById("addressResults");
        if (result) result.textContent = "Выбрано: 📍 " + (label || "точка на карте");
    }

    map.on("click", async event => {
        if (!cityBoundary) {
            alert("Граница города ещё не загружена. Попробуйте через секунду.");
            return;
        }

        if (typeof turf === "undefined") {
            alert("Не удалось загрузить модуль проверки границы города.");
            return;
        }

        const point = turf.point([event.latlng.lng, event.latlng.lat]);
        if (!turf.booleanPointInPolygon(point, cityBoundary)) {
            alert("Отметку можно создать только в пределах Каспийска");
            return;
        }

        const { lat: latitude, lng: longitude } = event.latlng;
        setSelectedLocation(latitude, longitude, "Получение адреса...");

        try {
            const response = await fetch(
                `https://nominatim.openstreetmap.org/reverse?format=jsonv2&addressdetails=1&lat=${latitude}&lon=${longitude}`,
                { headers: { "User-Agent": "KaspiyskMap/1.0" } }
            );
            if (!response.ok) throw new Error(`HTTP ${response.status}`);

            selectedAddress = shortAddress(await response.json());
            setSelectedLocation(latitude, longitude, selectedAddress);
        } catch (error) {
            console.warn("Не удалось определить адрес:", error);
            setSelectedLocation(latitude, longitude, "Адрес не определён");
        }
    });

    document.getElementById("findAddress")?.addEventListener("click", async () => {
        const input = document.getElementById("dogAddress");
        const container = document.getElementById("addressResults");
        const text = input?.value.trim() || "";

        if (!text) {
            alert("Введите адрес");
            return;
        }

        if (container) container.textContent = "🔎 Ищем адрес...";

        const query = `${text}, Каспийск, Республика Дагестан, Россия`;

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

            const uniqueData = filteredData.filter((item, index, self) => {
                const key = item.address.road + "_" + item.address.house_number;
                return index === self.findIndex(t =>
                    t.address.road + "_" + t.address.house_number === key
                );
            });

            if (!uniqueData.length) {
                if (container) container.textContent = "Адрес не найден";
                return;
            }

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
            if (container) container.textContent = "Ошибка поиска адреса";
        }
    });

    function selectAddressResult(item) {
        const latitude = Number(item.lat);
        const longitude = Number(item.lon);

        if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
            alert("У адреса нет корректных координат");
            return;
        }

        setSelectedLocation(latitude, longitude, shortAddress(item));
        map.setView([latitude, longitude], 17);
    }

    document.getElementById("myLocation")?.addEventListener("click", () => {
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

                setSelectedLocation(latitude, longitude, "Моё местоположение");
                map.setView([latitude, longitude], 17);

                try {
                    const response = await fetch(
                        `https://nominatim.openstreetmap.org/reverse?format=jsonv2&addressdetails=1&lat=${latitude}&lon=${longitude}`,
                        { headers: { "User-Agent": "KaspiyskMap/1.0" } }
                    );
                    if (response.ok) {
                        const address = shortAddress(await response.json());
                        setSelectedLocation(latitude, longitude, address);
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

    photoInput?.addEventListener("change", () => {
        const file = photoInput.files?.[0];
        if (!file) return;

        if (!file.type.startsWith("image/")) {
            alert("Можно загружать только изображения");
            photoInput.value = "";
            return;
        }

        if (file.size > 5 * 1024 * 1024) {
            alert("Размер фото не должен превышать 5 МБ");
            photoInput.value = "";
            return;
        }

        selectedPhotoFile = file;
        renderPhotoPreview();
    });

    function renderPhotoPreview() {
        if (!photoPreview) return;
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
            URL.revokeObjectURL(url);
            selectedPhotoFile = null;
            photoInput.value = "";
            renderPhotoPreview();
        });

        block.appendChild(image);
        block.appendChild(removeButton);
        photoPreview.appendChild(block);
    }

    document.getElementById("saveDog")?.addEventListener("click", async () => {
        const saveButton = document.getElementById("saveDog");
        const serverNotice = document.getElementById("serverNotice");

        if (!selectedLocation) {
            alert("Укажите место на карте или найдите адрес");
            return;
        }

        const description = document.getElementById("dogDescription")?.value.trim() || "";
        const formData = new FormData();

        formData.append("latitude", String(selectedLocation.latitude));
        formData.append("longitude", String(selectedLocation.longitude));
        formData.append("description", description);

        if (selectedPhotoFile) {
            formData.append("photos", selectedPhotoFile);
        }

        saveButton.disabled = true;
        saveButton.textContent = "⏳ Отправляем...";
        const loadingTimer = setTimeout(() => serverNotice?.classList.remove("hidden"), 5000);

        try {
            const response = await fetch(`${api}/dogs`, {
                method: "POST",
                body: formData
            });

            const data = await response.json().catch(() => null);

            if (!response.ok) {
                throw new Error(data?.error || `HTTP ${response.status}`);
            }

            clearTimeout(loadingTimer);
            serverNotice?.classList.add("hidden");

            const container = document.getElementById("container");
            if (container) {
                const success = document.createElement("div");
                success.className = "success-message";
                success.innerHTML = `<div>✅ Спасибо!<br><small>Отметка о собаке добавлена на карту.</small></div>`;
                container.appendChild(success);
                setTimeout(() => success.remove(), 2500);
            }

            document.getElementById("dogDescription").value = "";
            if (photoInput) photoInput.value = "";
            selectedPhotoFile = null;
            renderPhotoPreview();

            if (tempMarker) {
                map.removeLayer(tempMarker);
                tempMarker = null;
            }

            selectedLocation = null;
            selectedAddress = null;
            const result = document.getElementById("addressResults");
            if (result) result.textContent = "";

            await loadDogSightings();
        } catch (error) {
            clearTimeout(loadingTimer);
            serverNotice?.classList.add("hidden");
            console.error("Ошибка отправки отметки:", error);
            alert(error.message || "Не удалось отправить отметку. Попробуйте ещё раз.");
        } finally {
            saveButton.disabled = false;
            saveButton.textContent = "🚀 Отправить отметку";
        }
    });

    Promise.allSettled([
        loadCityBoundary(),
        loadDogSightings()
    ]).then(() => refreshMapSize());
})();
