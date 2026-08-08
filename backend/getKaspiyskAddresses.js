const fs = require("fs");

console.log("🚀 Сбор адресов Каспийска из OpenStreetMap");

const SERVERS = [
    "https://overpass.kumi.systems/api/interpreter",
    "https://overpass-api.de/api/interpreter",
    "https://overpass.private.coffee/api/interpreter"
];

// Каспийск
const BBOX = "42.85,47.58,42.93,47.67";


async function requestOverpass(query) {

    for (const server of SERVERS) {

        console.log("");
        console.log("🌐 Сервер:", server);
        console.log("📡 Отправляем запрос...");

        try {

            const response = await fetch(server, {
                method: "POST",

                headers: {
                    "Content-Type": "application/x-www-form-urlencoded",
                    "User-Agent": "OpenKaspiysk/1.0"
                },

                body: new URLSearchParams({
                    data: query
                }),

                signal: AbortSignal.timeout(180000)
            });

            console.log("📥 HTTP:", response.status);

            if (!response.ok) {
                console.log("⚠️ Сервер не ответил нормально");
                continue;
            }

            const data = await response.json();

            console.log(
                "✅ Получено:",
                data.elements.length,
                "объектов"
            );

            return data;

        } catch (error) {

            console.log(
                "❌ Ошибка:",
                error.message
            );

            console.log(
                "➡️ Пробуем следующий сервер..."
            );
        }
    }

    throw new Error(
        "Все серверы Overpass недоступны"
    );
}


/*
========================================
Нормализация улицы
========================================
*/

function normalizeStreet(street) {

    if (!street) {
        return null;
    }

    let result = street.trim();

    result = result.replace(/\s+/g, " ");

    result = result.replace(
        /^улица\s+/i,
        "ул. "
    );

    result = result.replace(
        /^ул\.\s*/i,
        "ул. "
    );

    return result.trim();
}


/*
========================================
Нормализация дома
========================================
*/

function normalizeHouse(house) {

    if (!house) {
        return null;
    }

    return house
        .trim()
        .replace(/\s+/g, "")
        .toUpperCase();
}


/*
========================================
Сортировка домов
========================================
*/

function compareHouses(a, b) {

    const numA =
        parseInt(
            a.match(/^\d+/)?.[0] || "999999"
        );

    const numB =
        parseInt(
            b.match(/^\d+/)?.[0] || "999999"
        );

    if (numA !== numB) {
        return numA - numB;
    }

    return a.localeCompare(b, "ru");
}


/*
========================================
Добавление адреса
========================================
*/

function addAddress(
    addresses,
    street,
    house,
    latitude,
    longitude
) {

    if (
        !street ||
        !house ||
        latitude == null ||
        longitude == null
    ) {
        return;
    }

    street = normalizeStreet(street);
    house = normalizeHouse(house);

    if (!street || !house) {
        return;
    }

    if (!addresses[street]) {
        addresses[street] = {};
    }

    /*
     * Если адрес уже есть,
     * сохраняем новые координаты.
     */

    addresses[street][house] = {
        latitude: Number(latitude),
        longitude: Number(longitude)
    };
}


/*
========================================
Главная функция
========================================
*/

async function main() {

    /*
    ========================================
    1. Здания
    ========================================
    */

    console.log("");
    console.log("🏠 Ищем здания с адресами...");

    const buildingsQuery = `
[out:json][timeout:120];

way
["building"]
["addr:housenumber"]
["addr:street"]
(${BBOX});

out center tags;
`;

    let buildingData;

    try {

        buildingData =
            await requestOverpass(
                buildingsQuery
            );

    } catch (error) {

        console.error(
            "❌ Не удалось получить здания:",
            error.message
        );

        return;
    }


    /*
    ========================================
    2. Адресные точки
    ========================================
    */

    console.log("");
    console.log("📍 Ищем адресные точки...");

    const nodesQuery = `
[out:json][timeout:120];

node
["addr:housenumber"]
["addr:street"]
(${BBOX});

out tags;
`;

    let nodeData;

    try {

        nodeData =
            await requestOverpass(
                nodesQuery
            );

    } catch (error) {

        console.log(
            "⚠️ Адресные точки получить не удалось"
        );

        nodeData = {
            elements: []
        };
    }


    /*
    ========================================
    3. Обрабатываем
    ========================================
    */

    console.log("");
    console.log("🔄 Обрабатываем адреса...");

    const addresses = {};

    /*
    ----------------------------------------
    Здания
    ----------------------------------------
    */

    console.log(
        `🏠 Обрабатываем ${buildingData.elements.length} зданий...`
    );

    let buildingProcessed = 0;

    for (
        const element
        of buildingData.elements
    ) {

        const tags =
            element.tags || {};

        if (!element.center) {
            continue;
        }

        addAddress(
            addresses,
            tags["addr:street"],
            tags["addr:housenumber"],
            element.center.lat,
            element.center.lon
        );

        buildingProcessed++;

        if (
            buildingProcessed % 1000 === 0
        ) {

            console.log(
                `   обработано зданий: ${buildingProcessed}`
            );
        }
    }

    console.log(
        `✅ Зданий обработано: ${buildingProcessed}`
    );


    /*
    ----------------------------------------
    Адресные точки
    ----------------------------------------
    */

    console.log(
        `📍 Обрабатываем ${nodeData.elements.length} адресных точек...`
    );

    let nodesProcessed = 0;

    for (
        const element
        of nodeData.elements
    ) {

        const tags =
            element.tags || {};

        addAddress(
            addresses,
            tags["addr:street"],
            tags["addr:housenumber"],
            element.lat,
            element.lon
        );

        nodesProcessed++;
    }

    console.log(
        `✅ Адресных точек обработано: ${nodesProcessed}`
    );


    /*
    ========================================
    4. Добавляем известные координаты вручную
    ========================================
    */

    console.log("");
    console.log("📌 Добавляем известные координаты...");

    addAddress(
        addresses,
        "ул. Ленина",
        "33Б",
        42.897914,
        47.629638
    );

    console.log(
        "✅ ул. Ленина, 33Б → 42.897914 47.629638"
    );


    /*
    ========================================
    5. Статистика
    ========================================
    */

    const streets =
        Object.keys(addresses);

    let totalAddresses = 0;

    for (
        const street
        of streets
    ) {

        totalAddresses +=
            Object.keys(
                addresses[street]
            ).length;
    }

    console.log("");
    console.log(
        `🏙️ Уникальных улиц найдено: ${streets.length}`
    );

    console.log(
        `🏠 Уникальных адресов найдено: ${totalAddresses}`
    );


    /*
    ========================================
    6. Сортировка
    ========================================
    */

    const sorted = {};

    streets
        .sort((a, b) =>
            a.localeCompare(b, "ru")
        )
        .forEach(street => {

            sorted[street] = {};

            const houses =
                Object.keys(
                    addresses[street]
                ).sort(compareHouses);

            for (const house of houses) {

                sorted[street][house] =
                    addresses[street][house];
            }
        });


    /*
    ========================================
    7. Сохраняем JSON
    ========================================
    */

    fs.mkdirSync(
        "./data",
        {
            recursive: true
        }
    );

    const output =
        "./data/kaspiysk-addresses.json";

    console.log("");
    console.log("💾 Сохраняем JSON...");

    fs.writeFileSync(
        output,
        JSON.stringify(
            sorted,
            null,
            2
        ),
        "utf8"
    );


    /*
    ========================================
    8. Финал
    ========================================
    */

    console.log("");
    console.log("================================");
    console.log("✅ ГОТОВО");
    console.log("================================");

    console.log(
        "🏙️ Улиц:",
        streets.length
    );

    console.log(
        "🏠 Адресов:",
        totalAddresses
    );

    console.log(
        "💾 Файл:",
        output
    );

    console.log("================================");
}


main().catch(error => {

    console.error("");
    console.error("❌ КРИТИЧЕСКАЯ ОШИБКА:");
    console.error(error);

});