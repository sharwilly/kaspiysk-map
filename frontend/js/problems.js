/* =========================================================
ПРОБЛЕМЫ ГОРОДА — КАРТА
========================================================= */

/* =========================================================
ПРОВЕРКА LEAFLET
========================================================= */

if (typeof L === "undefined") {


console.error(
    "❌ Leaflet не загружен"
);

throw new Error(
    "Leaflet не загружен. Проверь подключение leaflet.js"
);


}

/* =========================================================
API
========================================================= */

const problemsApi =
typeof API_URL !== "undefined"
? API_URL
: "";

if (!problemsApi) {


console.warn(
    "⚠️ API_URL не найден. Проверь common.js"
);


}

/* =========================================================
СОЗДАЁМ КАРТУ
========================================================= */

const mapElement =
document.getElementById("map");

if (!mapElement) {


console.error(
    "❌ Элемент #map не найден"
);

throw new Error(
    "Элемент #map отсутствует в HTML"
);


}

const map = L.map("map", {


maxZoom: 18,

minZoom: 12,

zoomControl: true


}).setView(


[42.8913, 47.6397],

13


);

/* =========================================================
OPENSTREETMAP
========================================================= */

L.tileLayer(
"https://tile.openstreetmap.org/{z}/{x}/{y}.png",
{
maxZoom: 19,


    attribution:
        "© OpenStreetMap contributors"
}


).addTo(map);

/* =========================================================
ПЕРЕМЕННЫЕ
========================================================= */

let tempMarker = null;

let selectedLocation = null;

let selectedAddress = null;

let selectedTooltip = null;

let cityBoundary = null;

let problemMarkers = [];

let outageMarkers = [];

let currentMapFilter = "all";

/* =========================================================
ФОТО
========================================================= */

let selectedPhotos = [];

let currentPhotos = [];

let currentPhotoIndex = 0;

const viewer =
document.getElementById("photoViewer");

const viewerImage =
document.getElementById("viewerImage");

/* =========================================================
КОРОТКИЙ АДРЕС
========================================================= */

function shortAddress(item) {


const addr = item?.address;


if (!addr) {

    return item?.display_name ||
        "Адрес не определён";

}


let street =
    addr.road;


if (street) {

    if (
        street.startsWith("улица ")
    ) {

        street =
            street.replace(
                "улица ",
                "ул. "
            );

    }


    if (
        street.startsWith("проспект ")
    ) {

        street =
            street.replace(
                "проспект ",
                "пр-т "
            );

    }


    if (
        street.startsWith("переулок ")
    ) {

        street =
            street.replace(
                "переулок ",
                "пер. "
            );

    }

}


if (
    street &&
    addr.house_number
) {

    return `${street}, ${addr.house_number}`;

}


return (
    item.display_name ||
    "Адрес не определён"
);


}

/* =========================================================
ФОТО VIEWER
========================================================= */

window.openPhotoViewer =
function (photos, index) {


if (
    !Array.isArray(photos) ||
    photos.length === 0
) {

    return;

}


currentPhotos = photos;

currentPhotoIndex = index;


viewerImage.src =
    currentPhotos[currentPhotoIndex];


viewer.style.display = "flex";


};

function closePhotoViewer() {


viewer.style.display = "none";

viewerImage.src = "";


}

function showNextPhoto() {


if (
    currentPhotos.length === 0
) {

    return;

}


currentPhotoIndex++;


if (
    currentPhotoIndex >=
    currentPhotos.length
) {

    currentPhotoIndex = 0;

}


viewerImage.src =
    currentPhotos[currentPhotoIndex];


}

function showPrevPhoto() {


if (
    currentPhotos.length === 0
) {

    return;

}


currentPhotoIndex--;


if (
    currentPhotoIndex < 0
) {

    currentPhotoIndex =
        currentPhotos.length - 1;

}


viewerImage.src =
    currentPhotos[currentPhotoIndex];


}

document
.getElementById("closeViewer")
?.addEventListener(
"click",
closePhotoViewer
);

document
.getElementById("nextPhoto")
?.addEventListener(
"click",
showNextPhoto
);

document
.getElementById("prevPhoto")
?.addEventListener(
"click",
showPrevPhoto
);

/* Закрытие по фону */

viewer?.addEventListener(
"click",
function (event) {


    if (
        event.target === viewer
    ) {

        closePhotoViewer();

    }

}


);

/* =========================================================
ИКОНКИ ПРОБЛЕМ
========================================================= */

function getProblemIcon(type) {


const icons = {

    "подтопление": "💧",

    "яма": "🕳",

    "мусор": "🗑",

    "освещение": "💡",

    "другое": "❗"

};


return icons[type] || "❗";


}

/* =========================================================
НАЗВАНИЯ СТАТУСОВ
========================================================= */

function getStatusName(status) {


const statuses = {

    new: "Новое",

    accepted: "Принято",

    in_progress:
        "В работе",

    done:
        "Выполнено",

    archive:
        "Архив"

};


return (
    statuses[status] ||
    status ||
    "Неизвестно"
);


}

/* =========================================================
СОЗДАНИЕ МАРКЕРА ПРОБЛЕМЫ
========================================================= */

function createProblemMarker(problem) {


const icon =
    getProblemIcon(problem.type);


return L.marker(

    [
        Number(problem.latitude),
        Number(problem.longitude)
    ],

    {

        icon: L.divIcon({

            className:
                "problem-marker",

            html: `
                <div style="
                    width:34px;
                    height:34px;
                    border-radius:50%;
                    display:flex;
                    align-items:center;
                    justify-content:center;
                    background:white;
                    border:3px solid #2563eb;
                    box-shadow:0 3px 10px rgba(0,0,0,.25);
                    font-size:18px;
                ">
                    ${icon}
                </div>
            `,

            iconSize:
                [34, 34],

            iconAnchor:
                [17, 17],

            popupAnchor:
                [0, -17]

        })

    }

);


}

/* =========================================================
ФИЛЬТРАЦИЯ
========================================================= */

function applyMapFilter() {


/* -----------------------------------------------------
   ПРОБЛЕМЫ
----------------------------------------------------- */

problemMarkers.forEach(
    item => {

        const marker =
            item.marker;


        const type =
            item.type;


        const visible =
            currentMapFilter === "all" ||
            currentMapFilter === type;


        if (visible) {

            if (
                !map.hasLayer(marker)
            ) {

                marker.addTo(map);

            }

        } else {

            if (
                map.hasLayer(marker)
            ) {

                map.removeLayer(marker);

            }

        }

    }
);


/* -----------------------------------------------------
   ОТКЛЮЧЕНИЯ
----------------------------------------------------- */

outageMarkers.forEach(
    marker => {

        const visible =
            currentMapFilter === "all" ||
            currentMapFilter === "outage";


        if (visible) {

            if (
                !map.hasLayer(marker)
            ) {

                marker.addTo(map);

            }

        } else {

            if (
                map.hasLayer(marker)
            ) {

                map.removeLayer(marker);

            }

        }

    }
);


}

/* =========================================================
ПРОБЛЕМЫ ГОРОДА
========================================================= */

async function loadProblemsOnMap() {


try {

    console.log(
        "📍 Загружаем проблемы..."
    );


    if (!problemsApi) {

        throw new Error(
            "API_URL отсутствует"
        );

    }


    const response =
        await fetch(
            `${problemsApi}/problems/active`
        );


    if (!response.ok) {

        throw new Error(
            `HTTP ${response.status}`
        );

    }


    const problems =
        await response.json();


    console.log(
        "📍 Проблем получено:",
        problems.length
    );


    /* Удаляем старые маркеры */

    problemMarkers.forEach(
        item => {

            if (
                map.hasLayer(
                    item.marker
                )
            ) {

                map.removeLayer(
                    item.marker
                );

            }

        }
    );


    problemMarkers = [];


    /* Создаём новые */

    problems.forEach(
        problem => {


            if (
                problem.status ===
                "done"
            ) {

                return;

            }


            if (
                problem.latitude == null ||
                problem.longitude == null
            ) {

                console.warn(
                    "Проблема без координат:",
                    problem
                );

                return;

            }


            const marker =
                createProblemMarker(
                    problem
                );


            const photos =
                Array.isArray(
                    problem.photos
                )
                    ? problem.photos
                    : [];


            const gallery =
                photos.length

                    ?

            `
                <br>

                <div class="popup-gallery">

                    ${
                        photos
                            .map(
                                (
                                    photo,
                                    index
                                ) => `

                                    <img
                                        src="${photo}"
                                        class="popup-thumb"
                                        alt="Фото проблемы"
                                        onclick='openPhotoViewer(
                                            ${JSON.stringify(
                                                photos
                                            )},
                                            ${index}
                                        )'
                                    >

                                `
                            )
                            .join("")
                    }

                </div>
            `

                    : "";


            const popup = `

                <div class="problem-popup">

                    <div class="problem-title">

                        ${getProblemIcon(
                            problem.type
                        )}

                        ${problem.type || "Проблема"}

                    </div>


                    <div class="problem-description">

                        ${
                            problem.description ||
                            "Описание отсутствует"
                        }

                    </div>


                    <br>


                    <div>

                        📅 <b>Дата:</b>

                        ${
                            problem.created_at
                                ? new Date(
                                    problem.created_at
                                ).toLocaleDateString(
                                    "ru-RU"
                                )
                                : "неизвестно"
                        }

                    </div>


                    <div>

                        📍 <b>Адрес:</b>

                        ${
                            problem.address ||
                            "не определён"
                        }

                    </div>


                    <div>

                        📌 <b>Статус:</b>

                        ${getStatusName(
                            problem.status
                        )}

                    </div>


                    ${gallery}

                </div>

            `;


            marker.bindPopup(
                popup
            );


            if (
                currentMapFilter === "all" ||
                currentMapFilter ===
                problem.type
            ) {

                marker.addTo(map);

            }


            problemMarkers.push({

                marker,

                type:
                    problem.type

            });

        }
    );


    applyMapFilter();


} catch (error) {

    console.error(
        "❌ Ошибка загрузки проблем:",
        error
    );

}


}

/* =========================================================
ФИЛЬТРЫ
========================================================= */

document
.querySelectorAll(
".map-filter"
)
.forEach(
button => {


        button.addEventListener(
            "click",
            function () {


                document
                    .querySelectorAll(
                        ".map-filter"
                    )
                    .forEach(
                        btn => {

                            btn.classList.remove(
                                "active"
                            );

                        }
                    );


                this.classList.add(
                    "active"
                );


                currentMapFilter =
                    this.dataset.filter;


                console.log(
                    "🔎 Фильтр:",
                    currentMapFilter
                );


                applyMapFilter();

            }
        );

    }
);


/* =========================================================
ОТКЛЮЧЕНИЯ
========================================================= */

function createOutageIcon() {


return L.divIcon({

    className:
        "outage-marker",

    html: `

        <div class="outage-marker-inner">
            ⚡
        </div>

    `,

    iconSize:
        [38, 38],

    iconAnchor:
        [19, 19],

    popupAnchor:
        [0, -20]

});


}

function formatRestoreTime(time) {


if (!time) {

    return "Время восстановления неизвестно";

}


return `
    Ожидаемое восстановление:
    <b>${time}</b>
`;


}

async function loadOutagesOnMap() {


try {

    console.log(
        "⚡ Загружаем отключения..."
    );


    if (!problemsApi) {

        throw new Error(
            "API_URL отсутствует"
        );

    }


    const response =
        await fetch(
            `${problemsApi}/outages/map`
        );


    if (!response.ok) {

        throw new Error(
            `HTTP ${response.status}`
        );

    }


    const outages =
        await response.json();


    console.log(
        "⚡ Отключений получено:",
        outages.length
    );


    /* Удаляем старые */

    outageMarkers.forEach(
        marker => {

            if (
                map.hasLayer(marker)
            ) {

                map.removeLayer(
                    marker
                );

            }

        }
    );


    outageMarkers = [];


    outages.forEach(
        outage => {

            if (
                !Array.isArray(
                    outage.locations
                )
            ) {

                return;

            }


            outage.locations.forEach(
                location => {


                    if (
                        location.latitude == null ||
                        location.longitude == null
                    ) {

                        return;

                    }


                    const marker =
                        L.marker(

                            [
                                Number(
                                    location.latitude
                                ),

                                Number(
                                    location.longitude
                                )
                            ],

                            {

                                icon:
                                    createOutageIcon()

                            }

                        );


                    const popup = `

                        <div class="outage-popup">

                            <div class="outage-title">

                                ⚡ Отключение электроэнергии

                            </div>


                            <div class="outage-address">

                                📍

                                <b>
                                    ${
                                        location.address ||
                                        "Адрес не указан"
                                    }
                                </b>

                            </div>


                            <div class="outage-description">

                                ${
                                    outage.description ||
                                    "Аварийное отключение"
                                }

                            </div>


                            <div class="outage-time">

                                ${formatRestoreTime(
                                    outage.restore_time
                                )}

                            </div>


                            <div class="outage-date">

                                📅 Сообщение:

                                ${
                                    outage.created_at
                                        ? new Date(
                                            outage.created_at
                                        ).toLocaleString(
                                            "ru-RU"
                                        )
                                        : "неизвестно"
                                }

                            </div>

                        </div>

                    `;


                    marker.bindPopup(
                        popup
                    );


                    if (
                        currentMapFilter ===
                            "all" ||
                        currentMapFilter ===
                            "outage"
                    ) {

                        marker.addTo(map);

                    }


                    outageMarkers.push(
                        marker
                    );

                }
            );

        }
    );


    applyMapFilter();


} catch (error) {

    console.error(
        "❌ Ошибка загрузки отключений:",
        error
    );

}


}

/* =========================================================
ГРАНИЦА КАСПИЙСКА
========================================================= */

async function loadCityBoundary() {


try {

    const response =
        await fetch(
            "data/kaspiysk_boundary.geojson"
        );


    if (!response.ok) {

        throw new Error(
            `HTTP ${response.status}`
        );

    }


    cityBoundary =
        await response.json();


    const boundary =
        L.geoJSON(
            cityBoundary,
            {

                style: {

                    color:
                        "#0d6efd",

                    weight: 3,

                    opacity: 1,

                    fillColor:
                        "#0d6efd",

                    fillOpacity:
                        0.03

                },

                interactive:
                    false

            }
        ).addTo(map);


    boundary.bringToBack();


    const bounds =
        boundary.getBounds();


    if (
        bounds.isValid()
    ) {

        map.fitBounds(
            bounds,
            {
                padding:
                    [20, 20]
            }
        );

    }


} catch (error) {

    console.error(
        "❌ Ошибка загрузки границы города:",
        error
    );

}


}

/* =========================================================
КЛИК ПО КАРТЕ
========================================================= */

map.on(
"click",
async function (e) {


    if (!cityBoundary) {

        alert(
            "Граница города ещё не загружена"
        );

        return;

    }


    const point =
        turf.point(
            [
                e.latlng.lng,
                e.latlng.lat
            ]
        );


    const inside =
        turf.booleanPointInPolygon(
            point,
            cityBoundary
        );


    if (!inside) {

        alert(
            "Обращение можно создать только в пределах Каспийска"
        );

        return;

    }


    const latitude =
        e.latlng.lat;


    const longitude =
        e.latlng.lng;


    selectedLocation = {

        latitude,

        longitude

    };


    selectedAddress =
        "Получение адреса...";


    if (tempMarker) {

        map.removeLayer(
            tempMarker
        );

    }


    tempMarker =
        L.marker(
            [
                latitude,
                longitude
            ]
        )
        .addTo(map)
        .bindTooltip(
            "📍 Получение адреса...",
            {
                permanent: true,

                direction: "top",

                offset:
                    [0, -10]
            }
        )
        .openTooltip();


    try {

        const response =
            await fetch(

                `https://nominatim.openstreetmap.org/reverse?format=jsonv2&addressdetails=1&lat=${latitude}&lon=${longitude}`

            );


        if (!response.ok) {

            throw new Error(
                `HTTP ${response.status}`
            );

        }


        const data =
            await response.json();


        selectedAddress =
            shortAddress(data);


    } catch (error) {

        console.error(
            "Ошибка получения адреса:",
            error
        );


        selectedAddress =
            "Адрес не определён";


        document
            .getElementById(
                "addressResults"
            )
            .innerHTML =
            "Выбрано: 📍 Адрес не определён";

    }


    if (tempMarker) {

        tempMarker.unbindTooltip();

        tempMarker.bindTooltip(

            "📍 " +
            selectedAddress,

            {

                permanent: true,

                direction: "top",

                offset:
                    [0, -10]

            }

        ).openTooltip();

    }


    document
        .getElementById(
            "addressResults"
        )
        .innerHTML =
        "Выбрано: 📍 " +
        selectedAddress;


    console.log(
        "📍 Выбрано:",
        selectedLocation,
        selectedAddress
    );

}


);

/* =========================================================
ПОИСК АДРЕСА
========================================================= */

document
.getElementById(
"findAddress"
)
.addEventListener(
"click",
async function () {


        const text =
            document
                .getElementById(
                    "problemAddress"
                )
                .value
                .trim();


        if (!text) {

            alert(
                "Введите адрес"
            );

            return;

        }


        const query =
            `${text}, Каспийск, Республика Дагестан, Россия`;


        const container =
            document.getElementById(
                "addressResults"
            );


        container.innerHTML =
            "🔎 Ищем адрес...";


        try {

            const response =
                await fetch(

                    `https://nominatim.openstreetmap.org/search?format=jsonv2&addressdetails=1&q=${encodeURIComponent(query)}&limit=50`

                );


            if (!response.ok) {

                throw new Error(
                    `HTTP ${response.status}`
                );

            }


            const data =
                await response.json();


            console.log(
                data.map(
                    item =>
                        item.address?.road
                )
            );


            const filteredData =
                data.filter(
                    item => {

                        const addr =
                            item.address;


                        if (!addr) {

                            return false;

                        }


                        return (

                            addr.road &&

                            addr.house_number &&

                            (
                                addr.city ===
                                "Каспийск" ||

                                addr.town ===
                                "Каспийск" ||

                                addr.municipality ===
                                "Каспийск"

                            )

                        );

                    }
                );


            filteredData.sort(
                (a, b) => {


                    function getType(
                        item
                    ) {

                        const road =
                            item.address.road
                                .toLowerCase();


                        if (
                            road ===
                            "улица кирова"
                        ) {

                            return {
                                type: 1,
                                line: 0
                            };

                        }


                        if (
                            road ===
                            "переулок кирова"
                        ) {

                            return {
                                type: 2,
                                line: 0
                            };

                        }


                        const lineMatch =
                            road.match(
                                /(\d+)-я линия/
                            );


                        if (lineMatch) {

                            return {

                                type: 3,

                                line:
                                    Number(
                                        lineMatch[1]
                                    )

                            };

                        }


                        return {

                            type: 4,

                            line: 999

                        };

                    }


                    const aInfo =
                        getType(a);


                    const bInfo =
                        getType(b);


                    if (
                        aInfo.type !==
                        bInfo.type
                    ) {

                        return (
                            aInfo.type -
                            bInfo.type
                        );

                    }


                    return (
                        aInfo.line -
                        bInfo.line
                    );

                }
            );


            if (
                filteredData.length ===
                0
            ) {

                container.innerHTML =
                    "Адрес не найден";

                return;

            }


            const uniqueData =
                filteredData.filter(
                    (
                        item,
                        index,
                        self
                    ) => {


                        const addr =
                            item.address;


                        const key =
                            addr.road +
                            "_" +
                            addr.house_number;


                        return (
                            index ===
                            self.findIndex(
                                t => {

                                    const other =
                                        t.address.road +
                                        "_" +
                                        t.address.house_number;


                                    return (
                                        key ===
                                        other
                                    );

                                }
                            )
                        );

                    }
                );


            /* -----------------------------------------
               ОДИН РЕЗУЛЬТАТ
            ----------------------------------------- */

            if (
                uniqueData.length ===
                1
            ) {

                selectAddressResult(
                    uniqueData[0]
                );

                return;

            }


            /* -----------------------------------------
               НЕСКОЛЬКО РЕЗУЛЬТАТОВ
            ----------------------------------------- */

            container.innerHTML = "";


            uniqueData.forEach(
                item => {


                    const button =
                        document.createElement(
                            "button"
                        );


                    button.type =
                        "button";


                    button.textContent =
                        "📍 " +
                        shortAddress(
                            item
                        );


                    button.addEventListener(
                        "click",
                        function () {

                            selectAddressResult(
                                item
                            );

                        }
                    );


                    container.appendChild(
                        button
                    );

                }
            );


        } catch (error) {

            console.error(
                "❌ Ошибка поиска адреса:",
                error
            );


            container.innerHTML =
                "Ошибка поиска адреса";

        }

    }
);


/* =========================================================
ВЫБОР АДРЕСА
========================================================= */

function selectAddressResult(item) {


const latitude =
    Number(item.lat);


const longitude =
    Number(item.lon);


selectedLocation = {

    latitude,

    longitude

};


selectedAddress =
    shortAddress(item);


if (tempMarker) {

    map.removeLayer(
        tempMarker
    );

}


tempMarker =
    L.marker(
        [
            latitude,
            longitude
        ]
    )
    .addTo(map)
    .bindTooltip(
        "📍 " +
        selectedAddress,
        {

            permanent: true,

            direction: "top",

            offset:
                [0, -10]

        }
    )
    .openTooltip();


map.setView(

    [
        latitude,
        longitude
    ],

    17

);


document
    .getElementById(
        "addressResults"
    )
    .innerHTML =
    "Выбрано: 📍 " +
    selectedAddress;


}

/* =========================================================
ОТПРАВКА ПРОБЛЕМЫ
========================================================= */

document
.getElementById(
"saveProblem"
)
.addEventListener(
"click",
async function () {


        const saveButton =
            document.getElementById(
                "saveProblem"
            );


        const serverNotice =
            document.getElementById(
                "serverNotice"
            );


        if (!selectedLocation) {

            alert(
                "Укажите место на карте или введите адрес"
            );

            return;

        }


        const type =
            document
                .getElementById(
                    "problemType"
                )
                .value;


        const description =
            document
                .getElementById(
                    "problemDescription"
                )
                .value
                .trim();


        if (!type) {

            alert(
                "Выберите тип проблемы"
            );

            return;

        }


        if (
            selectedPhotos.length >
            3
        ) {

            alert(
                "Можно загрузить максимум 3 фотографии"
            );

            return;

        }


        if (!problemsApi) {

            alert(
                "API сервера не настроен"
            );

            return;

        }


        const formData =
            new FormData();


        formData.append(
            "type",
            type
        );


        formData.append(
            "description",
            description
        );


        formData.append(
            "longitude",
            selectedLocation.longitude
        );


        formData.append(
            "latitude",
            selectedLocation.latitude
        );


        /*
           В исходной версии selectedAddress
           получался, но не отправлялся.
           Оставляем отправку только если
           backend принимает address.
        */

        if (selectedAddress) {

            formData.append(
                "address",
                selectedAddress
            );

        }


        selectedPhotos.forEach(
            file => {

                formData.append(
                    "photos",
                    file
                );

            }
        );


        console.log(
            "📤 Отправляем на:",
            `${problemsApi}/problems`
        );


        saveButton.disabled =
            true;


        saveButton.textContent =
            "⏳ Отправляем...";


        const loadingTimer =
            setTimeout(
                () => {

                    serverNotice
                        .classList
                        .remove(
                            "hidden"
                        );

                },

                10000
            );


        try {

            const response =
                await fetch(

                    `${problemsApi}/problems`,

                    {

                        method:
                            "POST",

                        body:
                            formData

                    }

                );


            if (!response.ok) {

                let message =
                    `HTTP ${response.status}`;


                try {

                    const errorData =
                        await response.json();


                    if (
                        errorData.message
                    ) {

                        message =
                            errorData.message;

                    }

                } catch (_) {}


                throw new Error(
                    message
                );

            }


            const problem =
                await response.json();


            clearTimeout(
                loadingTimer
            );


            serverNotice
                .classList
                .add(
                    "hidden"
                );


            saveButton.disabled =
                false;


            saveButton.textContent =
                "🚀 Отправить обращение";


            /* -----------------------------------------
               Добавляем новый маркер
            ----------------------------------------- */

            if (
                problem.latitude != null &&
                problem.longitude != null
            ) {

                const marker =
                    createProblemMarker(
                        problem
                    );


                const photos =
                    Array.isArray(
                        problem.photos
                    )
                        ? problem.photos
                        : [];


                const gallery =
                    photos.length

                        ?

                `
                    <br><br>

                    <div class="popup-gallery">

                        ${
                            photos
                                .map(
                                    (
                                        photo,
                                        index
                                    ) => `

                                        <img
                                            src="${photo}"
                                            class="popup-thumb"
                                            alt="Фото проблемы"
                                            onclick='openPhotoViewer(
                                                ${JSON.stringify(
                                                    photos
                                                )},
                                                ${index}
                                            )'
                                        >

                                    `
                                )
                                .join("")
                        }

                    </div>
                `

                        : "";


                marker.bindPopup(`

                    <div class="problem-popup">

                        <div class="problem-title">

                            ${getProblemIcon(
                                problem.type
                            )}

                            ${problem.type}

                        </div>


                        <div class="problem-description">

                            ${
                                problem.description ||
                                "Описание отсутствует"
                            }

                        </div>


                        <br>


                        📅 <b>Дата:</b>

                        ${
                            problem.created_at
                                ? new Date(
                                    problem.created_at
                                ).toLocaleDateString(
                                    "ru-RU"
                                )
                                : "сейчас"
                        }


                        <br>


                        📍 <b>Адрес:</b>

                        ${
                            problem.address ||
                            selectedAddress ||
                            "не определён"
                        }


                        <br>


                        📌 <b>Статус:</b>

                        ${getStatusName(
                            problem.status
                        )}


                        ${gallery}

                    </div>

                `);


                marker.addTo(map);


                problemMarkers.push({

                    marker,

                    type:
                        problem.type

                });


                applyMapFilter();

            }


            /* -----------------------------------------
               Очищаем форму
            ----------------------------------------- */

            selectedPhotos = [];

            renderPhotoPreview();


            document
                .getElementById(
                    "problemDescription"
                )
                .value = "";


            document
                .getElementById(
                    "photos"
                )
                .value = "";


            document
                .querySelectorAll(
                    ".type-button"
                )
                .forEach(
                    button => {

                        button.classList.remove(
                            "active"
                        );

                    }
                );


            document
                .getElementById(
                    "problemType"
                )
                .value = "";


            if (tempMarker) {

                map.removeLayer(
                    tempMarker
                );

                tempMarker =
                    null;

            }


            selectedLocation =
                null;


            selectedAddress =
                null;


            document
                .getElementById(
                    "addressResults"
                )
                .innerHTML = "";


            showSuccessMessage(
                problem.id
            );


        } catch (error) {

            clearTimeout(
                loadingTimer
            );


            serverNotice
                .classList
                .add(
                    "hidden"
                );


            console.error(
                "❌ Ошибка отправки:",
                error
            );


            alert(
                "Не удалось отправить обращение.\n\n" +
                error.message
            );


        } finally {

            saveButton.disabled =
                false;


            saveButton.textContent =
                "🚀 Отправить обращение";

        }

    }
);


/* =========================================================
ТИП ПРОБЛЕМЫ
========================================================= */

document
.querySelectorAll(
".type-button"
)
.forEach(
button => {


        button.addEventListener(
            "click",
            function () {


                document
                    .querySelectorAll(
                        ".type-button"
                    )
                    .forEach(
                        btn => {

                            btn.classList.remove(
                                "active"
                            );

                        }
                    );


                this.classList.add(
                    "active"
                );


                document
                    .getElementById(
                        "problemType"
                    )
                    .value =
                    this.dataset.type;

            }
        );

    }
);


/* =========================================================
МОЁ МЕСТОПОЛОЖЕНИЕ
========================================================= */

document
.getElementById(
"myLocation"
)
.addEventListener(
"click",
function () {


        if (
            !navigator.geolocation
        ) {

            alert(
                "Геолокация не поддерживается вашим браузером"
            );

            return;

        }


        navigator.geolocation.getCurrentPosition(

            async function (
                position
            ) {


                const latitude =
                    position.coords.latitude;


                const longitude =
                    position.coords.longitude;


                /* Проверяем границу */

                if (
                    cityBoundary &&
                    typeof turf !==
                    "undefined"
                ) {

                    const point =
                        turf.point(
                            [
                                longitude,
                                latitude
                            ]
                        );


                    const inside =
                        turf.booleanPointInPolygon(
                            point,
                            cityBoundary
                        );


                    if (!inside) {

                        alert(
                            "Ваше местоположение находится за пределами Каспийска"
                        );

                        return;

                    }

                }


                selectedLocation = {

                    latitude,

                    longitude

                };


                selectedAddress =
                    "Моё местоположение";


                if (tempMarker) {

                    map.removeLayer(
                        tempMarker
                    );

                }


                tempMarker =
                    L.marker(
                        [
                            latitude,
                            longitude
                        ]
                    )
                    .addTo(map)
                    .bindPopup(
                        "📍 Вы здесь"
                    )
                    .openPopup();


                map.setView(

                    [
                        latitude,
                        longitude
                    ],

                    17

                );


                document
                    .getElementById(
                        "addressResults"
                    )
                    .innerHTML =
                    "Выбрано: 📍 Моё местоположение";


                /*
                   Пытаемся получить адрес,
                   но сама отправка от этого
                   не зависит.
                */

                try {

                    const response =
                        await fetch(

                            `https://nominatim.openstreetmap.org/reverse?format=jsonv2&addressdetails=1&lat=${latitude}&lon=${longitude}`

                        );


                    if (
                        response.ok
                    ) {

                        const data =
                            await response.json();


                        selectedAddress =
                            shortAddress(
                                data
                            );


                        document
                            .getElementById(
                                "addressResults"
                            )
                            .innerHTML =
                            "Выбрано: 📍 " +
                            selectedAddress;

                    }

                } catch (error) {

                    console.warn(
                        "Не удалось определить адрес:",
                        error
                    );

                }

            },


            function (error) {

                console.error(
                    "Geolocation error:",
                    error
                );


                let message =
                    "Не удалось определить местоположение";


                if (
                    error.code ===
                    error.PERMISSION_DENIED
                ) {

                    message =
                        "Доступ к геолокации запрещён. Разрешите доступ в браузере.";

                }


                if (
                    error.code ===
                    error.POSITION_UNAVAILABLE
                ) {

                    message =
                        "Местоположение сейчас недоступно.";

                }


                if (
                    error.code ===
                    error.TIMEOUT
                ) {

                    message =
                        "Время ожидания геолокации истекло.";

                }


                alert(
                    message
                );

            },

            {

                enableHighAccuracy:
                    true,

                timeout:
                    10000,

                maximumAge:
                    60000

            }

        );

    }
);


/* =========================================================
ФОТО
========================================================= */

const photoInput =
document.getElementById(
"photos"
);

const photoPreview =
document.getElementById(
"photoPreview"
);

photoInput.addEventListener(
"change",
function () {


    const files =
        Array.from(
            photoInput.files
        );


    selectedPhotos = [

        ...selectedPhotos,

        ...files

    ].slice(0, 3);


    if (
        files.length +
        selectedPhotos.length >
        3
    ) {

        alert(
            "Можно загрузить максимум 3 фотографии"
        );

    }


    renderPhotoPreview();

}


);

/* =========================================================
ПРЕВЬЮ ФОТО
========================================================= */

function renderPhotoPreview() {


photoPreview.innerHTML =
    "";


selectedPhotos.forEach(
    (file, index) => {


        const url =
            URL.createObjectURL(
                file
            );


        const block =
            document.createElement(
                "div"
            );


        block.className =
            "photo-item";


        const image =
            document.createElement(
                "img"
            );


        image.src =
            url;


        image.alt =
            "Предпросмотр фотографии";


        const removeButton =
            document.createElement(
                "button"
            );


        removeButton.type =
            "button";


        removeButton.textContent =
            "❌";


        removeButton.addEventListener(
            "click",
            function () {

                removePhoto(
                    index
                );

            }
        );


        block.appendChild(
            image
        );


        block.appendChild(
            removeButton
        );


        photoPreview.appendChild(
            block
        );


    }
);


}

/* =========================================================
УДАЛЕНИЕ ФОТО
========================================================= */

function removePhoto(index) {


if (
    index < 0 ||
    index >=
    selectedPhotos.length
) {

    return;

}


selectedPhotos.splice(
    index,
    1
);


renderPhotoPreview();


}

/* =========================================================
УСПЕШНАЯ ОТПРАВКА
========================================================= */

function showSuccessMessage(id) {


const message =
    document.createElement(
        "div"
    );


message.className =
    "success-message";


message.innerHTML = `

    <div>

        ✅ Спасибо!

        <br><br>

        Ваше обращение
        №${id}
        принято.

    </div>

`;


document.body.appendChild(
    message
);


setTimeout(
    () => {

        message.remove();

    },

    4000

);


}

/* =========================================================
ОБНОВЛЕНИЕ РАЗМЕРА КАРТЫ
========================================================= */

function invalidateMapSize() {


setTimeout(
    () => {

        map.invalidateSize(
            true
        );

    },

    100

);


setTimeout(
    () => {

        map.invalidateSize(
            true
        );

    },

    500

);


}

window.addEventListener(
"resize",
invalidateMapSize
);

window.addEventListener(
"load",
function () {


    invalidateMapSize();

}


);

/* =========================================================
ESC — ЗАКРЫТЬ ФОТО
========================================================= */

document.addEventListener(
"keydown",
function (event) {


    if (
        event.key ===
        "Escape"
    ) {

        closePhotoViewer();

    }


    if (
        event.key ===
        "ArrowRight"
    ) {

        showNextPhoto();

    }


    if (
        event.key ===
        "ArrowLeft"
    ) {

        showPrevPhoto();

    }

}


);

/* =========================================================
ЗАПУСК
========================================================= */

async function initProblemsPage() {


console.log(
    "🚀 problems.js загружен"
);


/*
   Сначала загружаем границу.
   Это важно: пользователь не сможет
   поставить точку до её загрузки.
*/

await loadCityBoundary();


/*
   Затем загружаем данные карты.
*/

await Promise.allSettled([

    loadProblemsOnMap(),

    loadOutagesOnMap()

]);


/*
   Ещё раз пересчитываем размер карты.
*/

invalidateMapSize();


console.log(
    "✅ Страница проблем инициализирована"
);


}

/* =========================================================
ПЕРВЫЙ ЗАПУСК
========================================================= */

initProblemsPage();

/* =========================================================
АВТООБНОВЛЕНИЕ
========================================================= */

setInterval(
async function () {


    console.log(
        "🔄 Обновляем карту..."
    );


    await Promise.allSettled([

        loadProblemsOnMap(),

        loadOutagesOnMap()

    ]);

},

60000


);
