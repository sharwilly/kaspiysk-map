const pool = require("../db");

const STREET_ALIASES = require("./data/streetAliases");


// =========================================================
// НАСТРОЙКИ
// =========================================================

const NOMINATIM_URL =
    "https://nominatim.openstreetmap.org/search";


// Минимальная задержка между запросами Nominatim
// Nominatim требует бережного использования API.
let lastRequestTime = 0;

const REQUEST_DELAY = 1200;


// =========================================================
// ЗАДЕРЖКА
// =========================================================

function sleep(ms) {

    return new Promise(
        resolve => setTimeout(resolve, ms)
    );

}


// =========================================================
// НОРМАЛИЗАЦИЯ АДРЕСА
// =========================================================

function normalizeAddress(address) {

    return String(address || "")
        .trim()
        .replace(/\s+/g, " ")
        .replace(/[.,;:]+$/u, "")
        .trim();

}


// =========================================================
// ГЕОКОДИРОВАНИЕ
// =========================================================

async function geocodeAddress(address) {

    address =
        normalizeAddress(address);


    if (!address) {

        return null;

    }


    // =====================================================
    // 1. СНАЧАЛА ИЩЕМ В БАЗЕ
    // =====================================================

    const cached =
        await pool.query(
            `
            SELECT
                latitude,
                longitude
            FROM power_outage_locations
            WHERE address = $1
              AND latitude IS NOT NULL
              AND longitude IS NOT NULL
            LIMIT 1
            `,
            [address]
        );


    if (cached.rows.length > 0) {

        console.log(
            "📍 Координаты найдены в кэше:",
            address
        );


        return {

            latitude:
                Number(
                    cached.rows[0].latitude
                ),

            longitude:
                Number(
                    cached.rows[0].longitude
                )

        };

    }


    // =====================================================
    // 2. ЖДЁМ ПЕРЕД ЗАПРОСОМ
    // =====================================================

    const now =
        Date.now();


    const elapsed =
        now - lastRequestTime;


    if (elapsed < REQUEST_DELAY) {

        await sleep(
            REQUEST_DELAY - elapsed
        );

    }


    lastRequestTime =
        Date.now();


    // =====================================================
    // 3. ФОРМИРУЕМ ЗАПРОС
    // =====================================================

    const query =
        `${address}, Каспийск, Республика Дагестан, Россия`;


    const url =
        `${NOMINATIM_URL}?` +
        `format=jsonv2` +
        `&addressdetails=1` +
        `&limit=1` +
        `&q=${encodeURIComponent(query)}`;


    console.log(
        "🌍 Геокодируем:",
        address
    );


    // =====================================================
    // 4. ЗАПРОС К NOMINATIM
    // =====================================================

    let response;

    try {

        response =
            await fetch(
                url,
                {
                    headers: {

                        "User-Agent":
                            "KaspiyskMap/1.0 (city infrastructure project)"

                    }
                }
            );

    } catch (error) {

        console.error(
            "❌ Ошибка запроса Nominatim:",
            error.message
        );

        return null;

    }


    // =====================================================
    // 5. ОБРАБОТКА HTTP ОШИБОК
    // =====================================================

    if (!response.ok) {

        console.error(
            `❌ Nominatim HTTP ${response.status}:`,
            address
        );

        return null;

    }


    // =====================================================
    // 6. ПОЛУЧАЕМ РЕЗУЛЬТАТ
    // =====================================================

    let data;

    try {

        data =
            await response.json();

    } catch (error) {

        console.error(
            "❌ Nominatim вернул некорректный JSON"
        );

        return null;

    }


    if (
        !Array.isArray(data) ||
        data.length === 0
    ) {

        console.log(
            "⚠️ Адрес не найден:",
            address
        );

        return null;

    }


    const item =
        data[0];


    const latitude =
        Number(item.lat);


    const longitude =
        Number(item.lon);


    if (
        !Number.isFinite(latitude) ||
        !Number.isFinite(longitude)
    ) {

        console.log(
            "⚠️ Координаты некорректны:",
            address
        );

        return null;

    }


    // =====================================================
    // 7. ПРОВЕРЯЕМ, ЧТО ТОЧКА В КАСПИЙСКЕ
    // =====================================================

    const resultAddress =
        item.address || {};


    const city =
        resultAddress.city ||
        resultAddress.town ||
        resultAddress.municipality ||
        "";


    if (
        !city ||
        !city
            .toLowerCase()
            .includes("каспийск")
    ) {

        console.log(
            "⚠️ Nominatim вернул другой населённый пункт:",
            address,
            "→",
            city
        );

        return null;

    }


    // =====================================================
    // 8. ВОЗВРАЩАЕМ КООРДИНАТЫ
    // =====================================================

    console.log(
        "✅ Координаты найдены:",
        address,
        "→",
        latitude,
        longitude
    );


    return {

        latitude,
        longitude

    };

}


// =========================================================
// ЭКСПОРТ
// =========================================================

module.exports = geocodeAddress;