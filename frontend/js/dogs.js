/* =========================================================
   БЕЗДОМНЫЕ СОБАКИ — КАРТА
========================================================= */

(() => {
    "use strict";

    // ---------------------------------------------------------
    // MAP
    // ---------------------------------------------------------
    if (typeof L === "undefined") {
        console.error("Leaflet не загружен");
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

    // Leaflet иногда получает неправильный размер контейнера,
    // если header/components меняют высоту после инициализации.
    const refreshMapSize = () => map.invalidateSize({ pan: false });
    requestAnimationFrame(refreshMapSize);
    setTimeout(refreshMapSize, 300);
    setTimeout(refreshMapSize, 1000);
    window.addEventListener("resize", refreshMapSize);

    // ---------------------------------------------------------
    // SUPABASE
    // ---------------------------------------------------------
    const SUPABASE_URL = "https://vllyfjyibdtbcvdmpskg.supabase.co";
    const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJ6WEJoYmFzZSIsImlhdCI6MTc4NzA3ODE4MiwiZXhwIjoxNzAyNjQxNDg0fQ.rcWp9OMOZMogt6dgngy6iMuTO5FnvUQZqVr1p9Zj5XJ";

    let supabase = null;
    if (window.supabase && typeof window.supabase.createClient === "function") {
        try {
            supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
        } catch (error) {
            console.error("Не удалось создать Supabase client:", error);
        }
    } else {
        console.warn("Supabase CDN не загрузился. Карта продолжит работать, но отметки собак не будут загружены.");
    }

    // ---------------------------------------------------------
    // STATE
    // ---------------------------------------------------------
    let tempMarker = null;
    let selectedLocation = null;
    let selectedAddress = null;
    let cityBoundary = null;
    let dogMarkers = [];
    let selectedPhotoFile = null;

    const viewer = document.getElementById("photoViewer");
    const viewerImage = document.getElementById("viewerImage");

    // ---------------------------------------------------------
    // HELPERS
    // ---------------------------------------------------------
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

    // ---------------------------------------------------------
    // DOG SIGHTINGS
    // ---------------------------------------------------------
    async function loadDogSightings() {
        if (!supabase) return;

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

            (data || []).forEach(sighting => {
                if (sighting.latitude == null || sighting.longitude == null) return;

                const marker = createDogMarker(sighting);
                const photoHtml = sighting.photo_url
                    ? `<br><div class="popup-gallery"><img src="${sighting.photo_url}" class="popup-thumb" alt="Фото собаки"></div>`
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

                if (sighting.photo_url) {
                    marker.on("popupopen", () => {
                        const popup = marker.getPopup()?.getElement();
                        const image = popup?.querySelector(".popup-thumb");
                        image?.addEventListener("click", () => {
                            if (!viewer || !viewerImage) return;
                            viewerImage.src = sighting.photo_url;
                            viewer.style.display = "flex";
                        });
                    });
                }

                marker.addTo(map);
                dogMarkers.push(marker);
            });
        } catch (error) {
            console.error("Ошибка загрузки отметок собак:", error);
        }
    }

    // ---------------------------------------------------------
    // CITY BOUNDARY
    // ---------------------------------------------------------
    async function loadCityBoundary() {
        try {
            // Relative to /dogs.html and therefore correct for Vercel's
            // frontend root: /data/kaspiysk_boundary.geojson
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
            if (bounds.isValid()) {
                map.fitBounds(bounds, { padding: [20, 20] });
            }

            refreshMapSize();
        } catch (error) {
            console.error("Ошибка загрузки границы города:", error);
            // Граница нужна только для ограничения кликов.
            // Карта и базовые тайлы всё равно должны работать.
        }
    }

    // ---------------------------------------------------------
    // MAP CLICK
    // ---------------------------------------------------------
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
        selectedLocation = { latitude, longitude };
        selectedAddress = "Получение адреса...";

        if (tempMarker) map.removeLayer(tempMarker);

        tempMarker = L.marker([latitude, longitude])
            .addTo(map)
            .bindTooltip("📍 Получение адреса...", {
                permanent: true,
                direction: "top",
                offset: [0, -10]
            })
            .openTooltip();

        try {
            const response = await fetch(
                `https://nominatim.openstreetmap.org/reverse?format=jsonv2&addressdetails=1&lat=${latitude}&lon=${longitude}`,
                { headers: { "User-Agent": "KaspiyskMap/1.0" } }
            );
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            selectedAddress = shortAddress(await response.json());
        } catch (error) {
            console.error("Ошибка получения адреса:", error);
            selectedAddress = "Адрес не определён";
        }

        tempMarker.unbindTooltip();
        tempMarker.bindTooltip("📍 " + selectedAddress, {
            permanent: true,
            direction: "top",
            offset: [0, -10]
        }).openTooltip();

        const result = document.getElementById("addressResults");
        if (result) result.textContent = "Выбрано: 📍 " + selectedAddress;
    });

    // ---------------------------------------------------------
    // ADDRESS SEARCH
    // ---------------------------------------------------------
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
                return index === self.findIndex(t => t.address.road + "_" + t.address.house_number === key);
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
        selectedLocation = { latitude, longitude };
        selectedAddress = shortAddress(item);

        if (tempMarker) map.removeLayer(tempMarker);

        tempMarker = L.marker([latitude, longitude])
            .addTo(map)
            .bindTooltip("📍 " + selectedAddress, {
                permanent: true,
                direction: "top",
                offset: [0, -10]
            })
            .openTooltip();

        map.setView([latitude, longitude], 17);

        const container = document.getElementById("addressResults");
        if (container) container.textContent = "Выбрано: 📍 " + selectedAddress;
    }

    // ---------------------------------------------------------
    // MY LOCATION
    // ---------------------------------------------------------
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

                selectedLocation = { latitude, longitude };
                selectedAddress = "Моё местоположение";

                if (tempMarker) map.removeLayer(tempMarker);
                tempMarker = L.marker([latitude, longitude])
                    .addTo(map)
                    .bindPopup("📍 Вы здесь")
                    .openPopup();

                map.setView([latitude, longitude], 17);

                const result = document.getElementById("addressResults");
                if (result) result.textContent = "Выбрано: 📍 Моё местоположение";

                try {
                    const response = await fetch(
                        `https://nominatim.openstreetmap.org/reverse?format=jsonv2&addressdetails=1&lat=${latitude}&lon=${longitude}`,
                        { headers: { "User-Agent": "KaspiyskMap/1.0" } }
                    );
                    if (response.ok) {
                        selectedAddress = shortAddress(await response.json());
                        if (result) result.textContent = "Выбрано: 📍 " + selectedAddress;
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

    // ---------------------------------------------------------
    // PHOTO
    // ---------------------------------------------------------
    const photoInput = document.getElementById("dogPhoto");
    const photoPreview = document.getElementById("photoPreview");

    photoInput?.addEventListener("change", () => {
        const file = photoInput.files?.[0];
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

    function fileToBase64(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = reject;
            reader.readAsDataURL(file);
        });
    }

    // ---------------------------------------------------------
    // SAVE
    // ---------------------------------------------------------
    document.getElementById("saveDog")?.addEventListener("click", async () => {
        const saveButton = document.getElementById("saveDog");
        const serverNotice = document.getElementById("serverNotice");

        if (!selectedLocation) {
            alert("Укажите место на карте или найдите адрес");
            return;
        }

        if (!supabase) {
            alert("Сервис отправки отметок временно недоступен. Карта работает, но отправить отметку сейчас нельзя.");
            return;
        }

        const description = document.getElementById("dogDescription")?.value.trim() || "";

        let photoUrl = null;
        if (selectedPhotoFile) {
            try {
                photoUrl = await fileToBase64(selectedPhotoFile);
            } catch (error) {
                console.error(error);
                alert("Не удалось обработать фото");
                return;
            }
        }

        saveButton.disabled = true;
        saveButton.textContent = "⏳ Отправляем...";

        const loadingTimer = setTimeout(() => serverNotice?.classList.remove("hidden"), 5000);

        try {
            const { error } = await supabase
                .from("dog_sightings")
                .insert({
                    latitude: selectedLocation.latitude,
                    longitude: selectedLocation.longitude,
                    description: description || null,
                    photo_url: photoUrl
                });

            if (error) throw error;

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
            alert("Не удалось отправить отметку. Попробуйте ещё раз.");
        } finally {
            saveButton.disabled = false;
            saveButton.textContent = "🚀 Отправить отметку";
        }
    });

    // ---------------------------------------------------------
    // STARTUP
    // ---------------------------------------------------------
    Promise.allSettled([
        loadCityBoundary(),
        loadDogSightings()
    ]).then(() => {
        refreshMapSize();
    });
})();
