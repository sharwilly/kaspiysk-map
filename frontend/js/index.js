// создаём карту
const map = L.map('map', {

    maxZoom: 18,
    minZoom: 12

}).setView(
    [42.8913, 47.6397],
    13
);

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

// подключаем подложку OpenStreetMap
L.tileLayer(
'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
{
    attribution: '&copy; OpenStreetMap contributors'
}
).addTo(map);


// получаем проблемы из нашего API
fetch(`${API_URL}/problems`)
.then(response => response.json())
.then(data => {

    data.forEach(problem => {

        if (problem.status === "done") {
            return;
        }

        L.marker([
            problem.latitude,
            problem.longitude
        ])
        .addTo(map)
        .bindPopup(`
            <b>${problem.type}</b><br>
            ${problem.description}<br>
        `);

    });

});

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

    const photos =
        document.getElementById("photos").files;

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

    for (let i = 0; i < photos.length; i++) {

        formData.append(
            "photos",
            photos[i]
        );

    }

    const response = await fetch(
        `${API_URL}/problems`,
        {
            method: "POST",
            body: formData
        }
    );


    const problem = await response.json();


    // добавляем новый постоянный маркер

    L.marker([
        problem.latitude,
        problem.longitude
    ])
    .addTo(map)
    .bindPopup(`
        <b>${problem.type}</b><br>
        ${problem.description}<br>
        Статус: ${problem.status}
    `);


    showSuccessMessage(problem.id);


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

document
.getElementById("photos")
.addEventListener("change", function(){


    const preview =
    document.getElementById("photoPreview");


    preview.innerHTML = "";


    const files = this.files;


    for(let i = 0; i < files.length; i++){


        const img =
        document.createElement("img");


        img.src =
        URL.createObjectURL(files[i]);


        img.className =
        "preview-photo";


        preview.appendChild(img);

    }


});

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