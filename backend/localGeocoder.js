const data = require("./data/kaspiysk-addresses.json");
const aliases = require("./data/streetAliases.js");

/**
 * Нормализация текста.
 *
 * Приводим разные варианты написания
 * к более сопоставимому виду:
 *
 * "УЛ. ХАЛИЛОВА"
 * "ул. Халилова"
 * "улица Халилова"
 *
 * → "ул. халилова"
 */
function normalizeText(text) {

    if (!text) {
        return "";
    }

    return String(text)
        .toLowerCase()
        .replace(/ё/g, "е")
        .replace(/["'«»]/g, "")
        .replace(/\s+/g, " ")
        .replace(/^улица\s+/i, "ул. ")
        .replace(/^ул\.\s*/i, "ул. ")
        .trim();
}


/**
 * Получаем OSM-названия улицы,
 * соответствующие названию из Telegram.
 *
 * Сначала используем aliases.js.
 * Если алиаса нет — ищем прямое совпадение
 * среди улиц локальной базы.
 */
function getOsmStreets(street) {

    const normalized = normalizeText(street);

    if (!normalized) {
        return [];
    }

    /**
     * 1. Поиск через aliases.js
     */
    for (const [telegramStreet, osmStreets] of Object.entries(aliases)) {

        if (
            normalizeText(telegramStreet) === normalized
        ) {

            return Array.isArray(osmStreets)
                ? osmStreets
                : [];
        }
    }


    /**
     * 2. Прямое совпадение
     */
    return Object.keys(data).filter(
        osmStreet =>
            normalizeText(osmStreet) === normalized
    );
}


/**
 * Нормализация номера дома.
 *
 * Например:
 *
 * "32 б"  → "32Б"
 * "32Б"   → "32Б"
 * "32 а"  → "32А"
 * "32/1"  → "32/1"
 */
function normalizeHouse(house) {

    if (!house) {
        return null;
    }

    return String(house)
        .replace(/\s+/g, "")
        .toUpperCase()
        .replace(/Е/g, "Е");
}


/**
 * Разбираем адрес:
 *
 * "ул. Халилова, 32Б"
 *
 * →
 *
 * street = "ул. Халилова"
 * house  = "32Б"
 */
function parseAddress(address) {

    if (!address) {
        return {
            street: "",
            house: null
        };
    }

    address = String(address)
        .trim()
        .replace(/\s+/g, " ");


    /**
     * Сначала вариант:
     *
     * ул. Халилова, 32Б
     */
    let match = address.match(
        /^(.+?),\s*(\d+[А-ЯA-Zа-яa-z]*(?:\/\d+)?)$/u
    );


    /**
     * Затем вариант без запятой:
     *
     * ул. Халилова 32Б
     */
    if (!match) {

        match = address.match(
            /^(.+?)\s+(\d+[А-ЯA-Zа-яa-z]*(?:\/\d+)?)$/u
        );
    }


    if (!match) {

        return {
            street: address,
            house: null
        };
    }


    return {
        street: match[1].trim(),
        house: normalizeHouse(match[2])
    };
}


/**
 * Геокодирование конкретного адреса
 * или всей улицы.
 *
 * Примеры:
 *
 * geocode("ул. Халилова, 32")
 *
 * geocode("ул. Халилова, 32Б")
 *
 * geocode("ул. Халилова")
 */
function geocode(address) {

    if (!address) {
        return null;
    }


    const originalAddress = String(address).trim();

    const {
        street,
        house
    } = parseAddress(originalAddress);


    /**
     * Находим соответствующие названия
     * улицы в локальном JSON.
     */
    const osmStreets = getOsmStreets(street);


    if (osmStreets.length === 0) {
        return null;
    }


    /**
     * ==========================================
     * КОНКРЕТНЫЙ ДОМ
     * ==========================================
     */
    if (house) {

        for (const osmStreet of osmStreets) {

            const houses = data[osmStreet];

            if (!houses) {
                continue;
            }


            /**
             * Прямое совпадение.
             *
             * Например:
             *
             * houses["32"]
             * houses["32А"]
             * houses["32Б"]
             */
            if (houses[house]) {

                const coords = houses[house];

                return {
                    address: originalAddress,
                    street,
                    house,
                    latitude: coords.latitude,
                    longitude: coords.longitude,
                    osmStreet
                };
            }
        }


        /**
         * Дом не найден.
         *
         * ВАЖНО:
         *
         * Мы НЕ возвращаем координаты
         * соседнего дома.
         *
         * Например:
         *
         * Халилова, 32Б
         *
         * если 32Б отсутствует в базе,
         * результат будет null.
         */
        return null;
    }


    /**
     * ==========================================
     * ТОЛЬКО УЛИЦА
     * ==========================================
     *
     * Например:
     *
     * geocode("ул. Ленина")
     *
     * возвращает все известные дома улицы.
     */
    const points = [];

    for (const osmStreet of osmStreets) {

        const houses = data[osmStreet];

        if (!houses) {
            continue;
        }


        for (
            const [houseNumber, coords]
            of Object.entries(houses)
        ) {

            points.push({
                address: `${street}, ${houseNumber}`,
                street,
                house: houseNumber,
                latitude: coords.latitude,
                longitude: coords.longitude,
                osmStreet
            });
        }
    }


    return points.length > 0
        ? points
        : null;
}


module.exports = {
    geocode,
    getOsmStreets,
    normalizeText,
    parseAddress
};