// создаём карту
const map = L.map('map', {

    maxZoom: 18,
    minZoom: 12

}).setView(
    [42.8913, 47.6397],
    13
);
map.attributionControl.remove();

let tempMarker = null; // Временный маркер для отображения выбранной точки
let selectedLocation = null; // Выбранная точка на карте
let selectedAddress = null; // Выбранный адрес
let selectedTooltip = null;

function shortAddress(item){

    const addr = item.address;

    if (!addr) {
        return item.display_name;
    }


    let street = addr.road;

    if (street) {

        if (street.startsWith("улица ")) {
            street = street.replace("улица ", "ул. ");
        }

        if (street.startsWith("проспект ")) {
            street = street.replace("проспект ", "пр-т ");
        }

        if (street.startsWith("переулок ")) {
            street = street.replace("переулок ", "пер. ");
        }

    }


    if (street && addr.house_number) {

        return `${street}, ${addr.house_number}`;

    }


    return item.display_name;

}

let selectedPhotos = [];
let currentPhotos = [];
let currentPhotoIndex = 0;


const viewer = document.getElementById("photoViewer");
const viewerImage = document.getElementById("viewerImage");

console.log("Дошли до OPV");
window.openPhotoViewer = function(photos,index){

    currentPhotos = photos;

    currentPhotoIndex = index;

    viewerImage.src =
        currentPhotos[currentPhotoIndex];

    viewer.style.display = "flex";

}

console.log("Функция объявлена");
console.log(
    "Проверка:",
    window.openPhotoViewer
);


function closePhotoViewer(){

    viewer.style.display = "none";

}


function showNextPhoto(){

    currentPhotoIndex++;

    if(currentPhotoIndex >= currentPhotos.length){
        currentPhotoIndex = 0;
    }

    viewerImage.src =
        currentPhotos[currentPhotoIndex];

}


function showPrevPhoto(){

    currentPhotoIndex--;

    if(currentPhotoIndex < 0){
        currentPhotoIndex = currentPhotos.length - 1;
    }

    viewerImage.src =
        currentPhotos[currentPhotoIndex];

}


document
.getElementById("closeViewer")
.onclick = closePhotoViewer;


document
.getElementById("nextPhoto")
.onclick = showNextPhoto;


document
.getElementById("prevPhoto")
.onclick = showPrevPhoto;

// подключаем подложку OpenStreetMap
L.tileLayer(
'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
{
    attribution: '&copy; OpenStreetMap contributors'
}
).addTo(map);

// получаем проблемы из нашего API
// =========================================================
// ПРОБЛЕМЫ ГОРОДА НА КАРТЕ
// =========================================================

let problemMarkers = [];

async function loadProblemsOnMap() {

    try {

        console.log("📍 Загружаем проблемы...");

        const response =
            await fetch(
                `${API_URL}/problems/active`
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

        // Удаляем старые маркеры

        problemMarkers.forEach(
            marker => map.removeLayer(marker)
        );

        problemMarkers = [];

        problems.forEach(problem => {

            // Выполненные проблемы не показываем

            if (problem.status === "done") {
                return;
            }

            // Создаём маркер

            const marker =
                createProblemMarker(problem);

            // Popup

            const popup = `

                <div class="problem-popup">

                    <div class="problem-title">

                        ${getProblemIcon(problem.type)}
                        ${problem.type}

                    </div>

                    <div class="problem-description">

                        ${problem.description || "Описание отсутствует"}

                    </div>

                    <br>

                    <div>

                        📅 <b>Дата:</b>

                        ${
                            new Date(
                                problem.created_at
                            ).toLocaleDateString(
                                "ru-RU"
                            )
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

                        ${getStatusName(problem.status)}

                    </div>

                    ${
                        problem.photos &&
                        problem.photos.length
                        ?
                        `

                        <br>

                        <div class="popup-gallery">

                            ${
                                problem.photos
                                .map(
                                    (photo, index) => `

                                        <img
                                            src="${photo}"
                                            class="popup-thumb"
                                            onclick='openPhotoViewer(
                                                ${JSON.stringify(problem.photos)},
                                                ${index}
                                            )'
                                        >

                                    `
                                )
                                .join("")
                            }

                        </div>

                        `
                        :
                        ""
                    }

                </div>

            `;

            marker
                .bindPopup(popup);

            marker
                .addTo(map);

            problemMarkers.push(marker);

        });

    }

    catch (error) {

        console.error(
            "❌ Ошибка загрузки проблем:",
            error
        );

    }

}

loadProblemsOnMap();

// =========================================================
// ОТКЛЮЧЕНИЯ ЭЛЕКТРОЭНЕРГИИ НА КАРТЕ
// =========================================================

let outageMarkers = [];


function createOutageIcon() {

    return L.divIcon({

        className: "outage-marker",

        html: `
            <div class="outage-marker-inner">
                ⚡
            </div>
        `,

        iconSize: [38, 38],

        iconAnchor: [19, 19],

        popupAnchor: [0, -20]

    });

}


function formatRestoreTime(time) {

    if (!time) {

        return "Время восстановления неизвестно";

    }

    return `Ожидаемое восстановление: <b>${time}</b>`;

}


async function loadOutagesOnMap() {

    try {

        console.log(
            "⚡ Загружаем отключения..."
        );


        const response =
            await fetch(
                `${API_URL}/outages/map`
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


        // Удаляем старые маркеры

        outageMarkers.forEach(
            marker => map.removeLayer(marker)
        );


        outageMarkers = [];


        outages.forEach(outage => {

            if (!outage.locations) {
                return;
            }


            outage.locations.forEach(location => {

                const marker =
                    L.marker(

                        [
                            location.latitude,
                            location.longitude
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

                            📍 <b>
                                ${location.address}
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
                                new Date(
                                    outage.created_at
                                ).toLocaleString(
                                    "ru-RU"
                                )
                            }

                        </div>

                    </div>

                `;


                marker
                    .bindPopup(popup);


                marker.addTo(map);


                outageMarkers.push(
                    marker
                );

            });

        });


    } catch (error) {

        console.error(
            "❌ Ошибка загрузки отключений:",
            error
        );

    }

}


loadOutagesOnMap();

let cityBoundary = null; // Граница города

fetch("data/kaspiysk_boundary.geojson")
.then(response => response.json())
.then(data => {

cityBoundary = data; // Сохраняем границу города для дальнейшего использования

const boundary = L.geoJSON(data, {
    style: {
            color: "#0d6efd",
            weight: 3,
            opacity: 1,
            fillColor: "#0d6efd",
            fillOpacity: 0.03
    },
    interactive: false
}).addTo(map);

boundary.bringToBack(); // Отправляем границу на задний план

// Автоматически приблизить карту к границе
map.fitBounds(
    boundary.getBounds(),
    {
        padding: [20, 20]
    }
);

});

// Клик по карте
map.on("click", async function (e) {

if (!cityBoundary) {
    alert("Граница города ещё не загружена");
    return;
}


const point = turf.point([
    e.latlng.lng,
    e.latlng.lat
]);


const inside = turf.booleanPointInPolygon(
    point,
    cityBoundary
);


if (!inside) {
    alert("Обращение можно создать только в пределах Каспийска");
    return;
}


const latitude = e.latlng.lat;
const longitude = e.latlng.lng;


selectedLocation = {
    latitude,
    longitude
};

try {

    const response = await fetch(
        `https://nominatim.openstreetmap.org/reverse?format=jsonv2&addressdetails=1&lat=${latitude}&lon=${longitude}`
    );


    const data = await response.json();

    selectedAddress = shortAddress(data);


    document.getElementById("addressResults").innerHTML = "";


} catch(error) {

    console.log("Ошибка получения адреса:", error);

    selectedAddress = "Адрес не определён";

    document.getElementById("addressResults").innerHTML =
        "Выбрано: 📍 Адрес не определён";

}


if (tempMarker) {
    map.removeLayer(tempMarker);
}


tempMarker = L.marker([
    latitude,
    longitude
])
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


console.log(selectedLocation);

});

document
.getElementById("findAddress")
.addEventListener("click", async function(){


const text =
document.getElementById("problemAddress").value;


if (!text) {

    alert("Введите адрес");

    return;

}


const query =
`${text}, Каспийск, Республика Дагестан, Россия`;


const response = await fetch(

    `https://nominatim.openstreetmap.org/search?format=jsonv2&addressdetails=1&q=${encodeURIComponent(query)}&limit=50`

);


const data =
await response.json();

console.log(
    data.map(item => item.address?.road)
);

const filteredData = data.filter(item => {

    const addr = item.address;

    if (!addr) {
        return false;
    }


    return (
        addr.road &&
        addr.house_number &&
        addr.city === "Каспийск"
    );

});

filteredData.sort((a, b) => {

    function getType(item) {

        const road = item.address.road.toLowerCase();


        // обычная улица
        if (
            road === "улица кирова"
        ) {
            return {
                type: 1,
                line: 0
            };
        }


        // переулок
        if (
            road === "переулок кирова"
        ) {
            return {
                type: 2,
                line: 0
            };
        }


        // линии
        const lineMatch =
            road.match(/(\d+)-я линия/);


        if (lineMatch) {

            return {
                type: 3,
                line: Number(lineMatch[1])
            };

        }


        return {
            type: 4,
            line: 999
        };

    }


    const aInfo = getType(a);
    const bInfo = getType(b);


    // сначала тип адреса

    if (aInfo.type !== bInfo.type) {

        return aInfo.type - bInfo.type;

    }


    // потом номер линии

    return aInfo.line - bInfo.line;

});



const container =
document.getElementById("addressResults");


container.innerHTML = "";



if (data.length === 0) {

    container.innerHTML =
    "Адрес не найден";

    return;

}

const uniqueData = filteredData.filter(
    (item, index, self) => {

        const addr =
            item.address.road +
            "_" +
            item.address.house_number;


        return index === self.findIndex(t => {

            const other =
                t.address.road +
                "_" +
                t.address.house_number;


            return addr === other;

        });

    }
);

if (uniqueData.length === 1) {

    const item = uniqueData[0];


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


    if(tempMarker){

        map.removeLayer(tempMarker);

    }


    tempMarker =
    L.marker([
        latitude,
        longitude
    ])
    .addTo(map)
    .bindTooltip(
        "📍 " + shortAddress(item),
        {
            permanent:true,
            direction:"top",
            offset:[0,-10]
        }
    )
    .openTooltip();


    map.setView(
        [
            latitude,
            longitude
        ],
        16
    );


    container.innerHTML =
        "Выбрано: 📍 " + shortAddress(item);


    return;

}

uniqueData.forEach((item)=>{


    const button =
    document.createElement("button");


    button.innerHTML =
    "📍 " + shortAddress(item);



    button.style.display =
    "block";


    button.style.marginTop =
    "5px";



    button.onclick = function(){


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



        if(tempMarker){

            map.removeLayer(tempMarker);

        }



        tempMarker =
        L.marker([

            latitude,
            longitude

        ])
        .addTo(map);



        map.setView(
            [
                latitude,
                longitude
            ],
            17
        );



        container.innerHTML =
        "Выбрано: 📍 " + shortAddress(item);


    };



    container.appendChild(button);


});


});


document
.getElementById("saveProblem")
.addEventListener("click", async function () {

    const saveButton = document.getElementById("saveProblem");
    const serverNotice = document.getElementById("serverNotice");

    if (!selectedLocation) {

        alert(
        "Укажите место на карте или введите адрес"
        );

        return;

    }


    const type = document.getElementById("problemType").value;
    const description = document.getElementById("problemDescription").value;

    if (!type) {

        alert("Выберите тип проблемы");

        return;

    }

    const photos = selectedPhotos;

    if (photos.length > 3) {

        alert(
            "Можно загрузить максимум 3 фотографии"
        );

        return;

    }

    const formData = new FormData();


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

    selectedPhotos.forEach(file => {

        formData.append(
            "photos",
            file
        );

    });

    console.log("Отправляем на:", `${API_URL}/problems`);

    saveButton.disabled = true;
    saveButton.textContent = "⏳ Отправляем...";

    const loadingTimer = setTimeout(() => {

        serverNotice.classList.remove("hidden");

    }, 10000);

    const response = await fetch(
        `${API_URL}/problems`,
        {
            method: "POST",
            body: formData
        }
    );

    const problem = await response.json();

    clearTimeout(loadingTimer);

    serverNotice.classList.add("hidden");

    saveButton.disabled = false;
    saveButton.textContent = "Отправить";

    const marker = createProblemMarker(problem)
        .addTo(map);
    marker.bindPopup(`
        <b>${getProblemIcon(problem.type)} ${problem.type}</b>

        ${problem.description}

        <br><br>

        📅 <b>Дата:</b>
        ${new Date(problem.created_at).toLocaleDateString("ru-RU")}

        <br>

        📍 <b>Адрес:</b>
        ${problem.address || "не определён"}

        <br>

        📌 <b>Статус:</b>
        ${getStatusName(problem.status)}


        ${
            problem.photos && problem.photos.length
            ?
            `
            <br><br>

            <div class="popup-gallery">

                ${problem.photos.map((photo,index)=>`

                    <img
                        src="${photo}"
                        class="popup-thumb"
                        onclick='openPhotoViewer(${JSON.stringify(problem.photos)}, ${index})'
                    >

                `).join("")}

            </div>
            `
            :
            ""
        }

    `);


});

window.addEventListener("resize", function(){
    map.invalidateSize();
});

document
.querySelectorAll(".type-button")
.forEach(button => {


    button.addEventListener("click", function(){


        document
        .querySelectorAll(".type-button")
        .forEach(btn => {

            btn.classList.remove("active");

        });


        this.classList.add("active");


        document
        .getElementById("problemType")
        .value =
        this.dataset.type;


    });


});

document
.getElementById("myLocation")
.addEventListener("click", function(){


    if (!navigator.geolocation) {

        alert("Геолокация не поддерживается");

        return;

    }


    navigator.geolocation.getCurrentPosition(
        
        function(position){


            const latitude =
            position.coords.latitude;


            const longitude =
            position.coords.longitude;



            selectedLocation = {

                latitude,
                longitude

            };


            if(tempMarker){

                map.removeLayer(tempMarker);

            }


            tempMarker =
            L.marker([

                latitude,
                longitude

            ])
            .addTo(map)
            .bindPopup("📍 Вы здесь")
            .openPopup();



            map.setView(

                [
                    latitude,
                    longitude
                ],

                17

            );


            document
            .getElementById("addressResults")
            .innerHTML =
            "Выбрано: 📍 Моё местоположение";


        },


        function(error){

            alert(
                "Не удалось определить местоположение"
            );

        }

    );


});

const photoInput = document.getElementById("photos");
const photoPreview = document.getElementById("photoPreview");

photoInput.addEventListener("change", () => {

    const files = Array.from(photoInput.files);

    selectedPhotos = [
        ...selectedPhotos,
        ...files
    ].slice(0,3);


    renderPhotoPreview();

});


function renderPhotoPreview(){

    photoPreview.innerHTML = "";


    selectedPhotos.forEach((file,index)=>{

        const url = URL.createObjectURL(file);


        const block = document.createElement("div");

        block.className = "photo-item";


        block.innerHTML = `

            <img src="${url}">

            <button
                type="button"
                onclick="removePhoto(${index})">
                ❌
            </button>

        `;


        photoPreview.appendChild(block);

    });

}


function removePhoto(index){

    selectedPhotos.splice(index,1);

    renderPhotoPreview();

}

function showSuccessMessage(id){


    const message =
    document.createElement("div");


    message.className =
    "success-message";


    message.innerHTML = `

        <div>

            ✅ Спасибо!

            <br><br>

            Ваше обращение №${id} принято.

        </div>

    `;


    document.body.appendChild(message);


    setTimeout(()=>{

        message.remove();

    },4000);


}

window.addEventListener("load", ()=>{

    setTimeout(()=>{

        map.invalidateSize();

    },300);

});

console.log("index.js загружен");
console.log("openPhotoViewer:", window.openPhotoViewer);