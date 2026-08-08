const feederMap = require("./feederMap");


// =============================================================
// НОРМАЛИЗАЦИЯ НАЗВАНИЯ УЛИЦЫ
// =============================================================

function normalizeStreet(street) {

    street =
        String(street || "")
            .trim()
            .replace(/\s+/g, " ")
            .replace(/[.,;:]+$/u, "")
            .trim();


    if (!street) {
        return "";
    }


    // Уже есть сокращение "ул."
    if (/^ул\.?\s+/iu.test(street)) {

        return street
            .replace(/^ул\.?\s*/iu, "ул. ")
            .trim();
    }


    // Уже написано "улица"
    if (/^улиц[аеуы]\s+/iu.test(street)) {

        return street
            .replace(/^улиц[аеуы]\s*/iu, "ул. ")
            .trim();
    }


    // Проспект
    if (/^проспект\s+/iu.test(street)) {

        return street
            .replace(/^проспект\s*/iu, "пр-т ")
            .trim();
    }


    // Переулок
    if (/^переулок\s+/iu.test(street)) {

        return street
            .replace(/^переулок\s*/iu, "пер. ")
            .trim();
    }


    // Улица без типа
    return `ул. ${street}`;
}


// =============================================================
// НОРМАЛИЗАЦИЯ НОМЕРА ДОМА
// =============================================================

function normalizeHouseNumber(value) {

    if (!value) {
        return "";
    }


    return String(value)
        .trim()
        .replace(/\s+/g, "")
        .replace(/[.,;:]+$/u, "")
        .toUpperCase();
}


// =============================================================
// ПРОВЕРКА: ЯВЛЯЕТСЯ ЛИ СТРОКА НОМЕРОМ ДОМА
// =============================================================

function isHouseNumber(value) {

    if (!value) {
        return false;
    }


    return /^\d+\s*[А-ЯЁA-Z]?(?:\s*[-–—]\s*\d+\s*[А-ЯЁA-Z]?)?$/iu
        .test(
            String(value).trim()
        );
}


// =============================================================
// РАЗБИВАЕМ НОМЕРА ДОМОВ
//
// "33, 33А, 33Б"
// ->
// ["33", "33А", "33Б"]
// =============================================================

function splitHouseNumbers(text) {

    if (!text) {
        return [];
    }


    return String(text)
        .split(/\s*,\s*/)
        .map(normalizeHouseNumber)
        .filter(Boolean)
        .filter(isHouseNumber);
}


// =============================================================
// ДОБАВЛЕНИЕ АДРЕСОВ УЛИЦА + ДОМ
// =============================================================

function buildStreetHouseAddresses(street, houses) {

    const normalizedStreet =
        normalizeStreet(street);


    if (!normalizedStreet) {
        return [];
    }


    const houseNumbers =
        Array.isArray(houses)
            ? houses
            : splitHouseNumbers(houses);


    return houseNumbers
        .map(normalizeHouseNumber)
        .filter(Boolean)
        .map(
            house =>
                `${normalizedStreet}, ${house}`
        );
}


// =============================================================
// УНИКАЛИЗАЦИЯ
// =============================================================

function unique(array) {

    return [
        ...new Set(
            array.filter(Boolean)
        )
    ];
}


// =============================================================
// НОРМАЛИЗАЦИЯ ФИДЕРА
// =============================================================

function normalizeFeeder(value) {

    if (!value) {
        return null;
    }


    value =
        String(value)
            .trim()
            .toUpperCase()
            .replace(/\s+/g, " ");


    const ztmMatch =
        value.match(
            /^ЗТМ\s*-?\s*(\d+)$/iu
        );


    if (ztmMatch) {

        return `ЗТМ-${ztmMatch[1]}`;
    }


    return value;
}


// =============================================================
// НОРМАЛИЗАЦИЯ ТРАНСФОРМАТОРНОЙ ПОДСТАНЦИИ
// =============================================================

function normalizeTransformerPoint(value) {

    if (!value) {
        return null;
    }


    let tp =
        String(value)
            .trim()
            .replace(/\s+/g, " ")
            .replace(/[.,;:]+$/u, "")
            .trim();


    if (!tp) {
        return null;
    }


    // Удаляем случайно захваченное время
    tp =
        tp.replace(
            /\s+до\s+\d{1,2}:\d{2}.*$/iu,
            ""
        )
        .trim();


    // Удаляем завершающее "и"
    tp =
        tp.replace(
            /\s+(?:и|а\s+также)\s*$/iu,
            ""
        )
        .trim();


    if (!tp) {
        return null;
    }


    if (!/^ТП\b/iu.test(tp)) {

        tp =
            `ТП-${tp}`;
    }


    tp =
        tp.replace(
            /^ТП\s+/iu,
            "ТП-"
        );


    tp =
        tp.replace(
            /^ТП--+/iu,
            "ТП-"
        );


    return tp;
}


// =============================================================
// ОСНОВНОЙ PARSER
// =============================================================

function parseOutage(text) {

    // =========================================================
    // 1. НОРМАЛИЗАЦИЯ ТЕКСТА
    // =========================================================

    text =
        String(text || "")
            .replace(/\r?\n/g, " ")
            .replace(/\u00A0/g, " ")
            .replace(/\s+/g, " ")
            .trim();


    // =========================================================
    // 2. РЕЗУЛЬТАТ
    // =========================================================

    const result = {

        type: "электричество",

        feeder: null,
        feeders: [],

        transformer_point: null,
        transformer_points: [],

        substation: "",

        description: "",

        addresses: [],
        address_source: null,

        restore_time: null,

        status: "active",

        outage_type: null,

        all_feeders_working: false
    };


    // =========================================================
    // 3. ДОБАВЛЕНИЕ ФИДЕРА
    // =========================================================

    function addFeeder(value) {

        const feeder =
            normalizeFeeder(value);


        if (!feeder) {
            return;
        }


        if (!result.feeders.includes(feeder)) {

            result.feeders.push(
                feeder
            );
        }
    }


    // =========================================================
    // 4. ДОБАВЛЕНИЕ ТП
    // =========================================================

    function addTransformerPoint(value) {

        const tp =
            normalizeTransformerPoint(value);


        if (!tp) {
            return;
        }


        if (
            !result.transformer_points.includes(tp)
        ) {

            result.transformer_points.push(
                tp
            );
        }
    }


    // =========================================================
    // 5. ПОЛНОЕ ВОССТАНОВЛЕНИЕ
    // =========================================================

    const allFeedersWorking =

        /все\s+фидер[а-яё]*\s+(?:в\s+работ[еа]|работают|в\s+рабочем\s+состоянии)/iu
            .test(text)

        ||

        /все\s+фидер[а-яё]*\s+включен[а-яё]*/iu
            .test(text)

        ||

        /все\s+фидер[а-яё]*\s+восстановлен[а-яё]*/iu
            .test(text)

        ||

        /электроснабжение\s+восстановлено\s+полностью/iu
            .test(text)

        ||

        /электроснабжение\s+восстановлено\s+в\s+полном\s+объ[её]ме/iu
            .test(text);


    if (allFeedersWorking) {

        result.description =
            "Все фидеры в работе";

        result.status =
            "completed";

        result.all_feeders_working =
            true;

        return result;
    }


    // =========================================================
    // 6. ФИДЕРЫ
    // =========================================================

    // Фидер-6 ЗТМ
    const feederNumberZtmAfterMatches = [
        ...text.matchAll(
            /Фидер[а-яё]*\s*-?\s*(\d+)\s*ЗТМ\b/giu
        )
    ];


    for (
        const match
        of feederNumberZtmAfterMatches
    ) {

        addFeeder(
            `ЗТМ-${match[1]}`
        );
    }


    // Фидеры 3,5,7 ЗТМ
    const feederNumbersZtmAfterMatches = [
        ...text.matchAll(
            /Фидер[а-яё]*\s*-?\s*((?:\d+\s*[,;]\s*)+\d+)\s*ЗТМ\b/giu
        )
    ];


    for (
        const match
        of feederNumbersZtmAfterMatches
    ) {

        const numbers =
            match[1]
                .split(/[,;]/)
                .map(
                    x => x.trim()
                )
                .filter(Boolean);


        for (const number of numbers) {

            addFeeder(
                `ЗТМ-${number}`
            );
        }
    }


    // Фидеры ЗТМ 3,5,7
    const feederZtmMatches = [
        ...text.matchAll(
            /Фидер[а-яё]*\s+ЗТМ\s*-?\s*((?:\d+\s*[,;]\s*)+\d+)/giu
        )
    ];


    for (
        const match
        of feederZtmMatches
    ) {

        const numbers =
            match[1]
                .split(/[,;]/)
                .map(
                    x => x.trim()
                )
                .filter(Boolean);


        for (const number of numbers) {

            addFeeder(
                `ЗТМ-${number}`
            );
        }
    }


    // Фидер ЗТМ-3 / Фидер ЗТМ 3
    const singleZtmMatches = [
        ...text.matchAll(
            /Фидер[а-яё]*\s*-?\s*ЗТМ\s*-?\s*(\d+)/giu
        )
    ];


    for (
        const match
        of singleZtmMatches
    ) {

        addFeeder(
            `ЗТМ-${match[1]}`
        );
    }


    // Обычные фидеры
    const normalFeederMatches = [
        ...text.matchAll(
            /Фидер[а-яё]*\s*-?\s*(\d+(?:\s*[,;]\s*\d+)*)/giu
        )
    ];


    for (
        const match
        of normalFeederMatches
    ) {

        const fullMatch =
            match[0];


        const afterNumber =
            text.substring(
                match.index +
                fullMatch.length,

                match.index +
                fullMatch.length +
                10
            );


        if (
            /^\s*ЗТМ\b/iu
                .test(afterNumber)
        ) {

            continue;
        }


        const numbers =
            match[1]
                .split(/[,;]/)
                .map(
                    x => x.trim()
                )
                .filter(Boolean);


        for (
            const number
            of numbers
        ) {

            addFeeder(number);
        }
    }


    // =========================================================
    // 7. ТРАНСФОРМАТОРНЫЕ ПОДСТАНЦИИ
    // =========================================================

    const tpMatches = [
        ...text.matchAll(
            /ТП\s*[-–—]?\s*([0-9]+(?:\s*[-–—]\s*[А-ЯЁA-Zа-яёa-z0-9]+)?|[А-ЯЁA-Zа-яёa-z][^,.;]*?)(?=\s+до\s+\d{1,2}:\d{2}|\s+и\s+ТП\b|\s*,\s*ТП\b|\s+ТП\b|\s+Под\s+(?:отключение|ограничение)|[.,;]|$)/giu
        )
    ];


    for (
        const match
        of tpMatches
    ) {

        let value =
            match[1]
                .trim()
                .replace(/\s+/g, " ")
                .replace(/[.,;:]+$/u, "")
                .trim();


        value =
            value.replace(
                /\s+до\s+\d{1,2}:\d{2}.*$/iu,
                ""
            )
            .trim();


        if (!value) {
            continue;
        }


        addTransformerPoint(value);
    }


    // Fallback для простых ТП
    if (
        result.transformer_points.length === 0
    ) {

        const simpleTpMatches = [
            ...text.matchAll(
                /\bТП\s*[-–—]?\s*([0-9]+(?:\s*[-–—]\s*[А-ЯЁA-Zа-яёa-z0-9]+)?)/giu
            )
        ];


        for (
            const match
            of simpleTpMatches
        ) {

            addTransformerPoint(
                match[1]
            );
        }
    }


    result.transformer_points =
        unique(
            result.transformer_points
        );


    result.transformer_point =
        result.transformer_points[0] ||
        null;


    // =========================================================
    // 8. ТИП ОТКЛЮЧЕНИЯ
    // =========================================================

    const isPlanned =

        /планов(?:ое|ая|ому|ым|ых)/iu
            .test(text)

        ||

        /планов[а-яё]*\s+отключен/iu
            .test(text)

        ||

        /планов[а-яё]*\s+работ/iu
            .test(text)

        ||

        /плановые\s+работы/iu
            .test(text);


    const isEmergency =

        /аварийн/iu.test(text)

        ||

        /обрыв/iu.test(text)

        ||

        /земля\s+на\s+линии/iu.test(text)

        ||

        /повреждени[ея].*(?:линии|кабел)/iu.test(text)

        ||

        /аварийно/iu.test(text);


    if (isPlanned) {

        result.outage_type =
            "planned";

        result.description =
            "Плановое отключение электроэнергии";

    } else if (isEmergency) {

        result.outage_type =
            "emergency";


        if (
            /обрыв|земля\s+на\s+линии|повреждени[ея]/iu
                .test(text)
        ) {

            result.description =
                "Аварийное отключение. Повреждение линии электропередачи";

        } else {

            result.description =
                "Аварийное отключение";
        }

    } else {

        result.outage_type =
            "emergency";

        result.description =
            "Отключение электроэнергии";
    }


    // =========================================================
    // 9. ОКОНЧАНИЕ РАБОТ
    // =========================================================

    const isCompleted =

        /работ[а-яё]*\s+(?:завершен|оконч|законч)/iu
            .test(text)

        ||

        /завершен[а-яё]*\s+(?:аварийн|ремонтн|восстановительн)[а-яё]*\s+работ/iu
            .test(text)

        ||

        /электроснабжени[ея]\s+(?:полностью\s+)?восстановлен/iu
            .test(text)

        ||

        /подача\s+электроэнергии\s+восстановлен/iu
            .test(text)

        ||

        /электроэнергия\s+(?:полностью\s+)?восстановлен/iu
            .test(text)

        ||

        /ограничени[ея]\s+(?:электроснабжения\s+)?снят/iu
            .test(text)

        ||

        /аварийн(?:ые|ых)\s+работ[ыа]\s+(?:завершен|оконч|законч)/iu
            .test(text)

        ||

        /все\s+фидер[а-яё]*\s+(?:в\s+работ[еа]|работают)/iu
            .test(text);


    if (isCompleted) {

        result.status =
            "completed";

        result.description =
            "Электроснабжение восстановлено";
    }


    // =========================================================
    // 10. ПОДСТАНЦИЯ
    // =========================================================

    const substationMatch =
        text.match(
            /(?:ПС|подстанци[яи])\s*(?:[-–—]?\s*)?(\d+\s*кВ)?\s*([А-ЯA-ZЁ0-9-]{2,})/iu
        );


    if (substationMatch) {

        const voltage =
            substationMatch[1]
                ? substationMatch[1]
                    .replace(/\s+/g, " ")
                : "";


        const name =
            substationMatch[2];


        result.substation =
            `ПС${voltage ? " " + voltage : ""} ${name}`
                .replace(/\s+/g, " ")
                .trim();
    }


    if (!result.substation) {

        const simpleSubstation =
            text.match(
                /ПС\s*(\d+\s*кВ\s+[А-ЯA-ZЁ0-9-]+)/iu
            );


        if (simpleSubstation) {

            result.substation =
                `ПС ${simpleSubstation[1]}`
                    .replace(/\s+/g, " ")
                    .trim();
        }
    }


    // =========================================================
    // 11. ВРЕМЯ ВОССТАНОВЛЕНИЯ
    // =========================================================

    const timePatterns = [

        /ориентировочное\s+время\s+завершения\s+работ[^\d]*(\d{1,2}:\d{2})/iu,

        /время\s+завершения\s+работ[^\d]*(\d{1,2}:\d{2})/iu,

        /завершения\s+работ[^\d]*(\d{1,2}:\d{2})/iu,

        /работ[а-яё]*\s+до[^\d]*(\d{1,2}:\d{2})/iu,

        /ограничени[ея].*?\s+до\s+(\d{1,2}:\d{2})/iu,

        /отключени[ея].*?\s+до\s+(\d{1,2}:\d{2})/iu,

        /восстановлен[а-яё]*[^\d]*(\d{1,2}:\d{2})/iu,

        /до\s+(\d{1,2}:\d{2})/iu,

        /в\s+(\d{1,2}:\d{2})/iu
    ];


    for (
        const pattern
        of timePatterns
    ) {

        const match =
            text.match(pattern);


        if (match) {

            result.restore_time =
                match[1];

            break;
        }
    }


    // =========================================================
    // 12. ИЗВЛЕЧЕНИЕ АДРЕСОВ
    // =========================================================
    //
    // Главная новая часть.
    //
    // Примеры:
    //
    // ул. Ленина, 33, 33А, 33Б
    //
    // превращается в:
    //
    // ул. Ленина, 33
    // ул. Ленина, 33А
    // ул. Ленина, 33Б
    //
    // =========================================================

    const addressPatterns = [

        // -----------------------------------------------------
        // "дома по улице Халилова: 32, 32А, 32Б"
        // -----------------------------------------------------
        {
            regex:
                /(?:Под\s+ограничени[яе]|Под\s+отключени[ея])\s+(?:попали|попадает|попадают)\s+(?:следующие\s+)?дома\s+по\s+улице\s+([^:]+?)\s*:\s*([\s\S]*?)(?=(?:Ориентировочное|Аварийная|Аварийные|Дальнейшая|На\s+место|Работы|Всего\s+\d+|$))/iu,

            streetHouse: true
        },


        // -----------------------------------------------------
        // "дома по улице..."
        // -----------------------------------------------------
        {
            regex:
                /(?:Под\s+ограничени[яе]|Под\s+отключени[ея])\s+(?:попали|попадает|попадают)\s+(?:следующие\s+)?дома\s+по\s+улице\s+([^:]+?)\s*:\s*([\s\S]*)$/iu,

            streetHouse: true
        },


        // -----------------------------------------------------
        // "следующие адреса:"
        // -----------------------------------------------------
        {
            regex:
                /(?:Под\s+отключени(?:е|я)|Под\s+ограничени(?:е|я))(?:\s+частично)?\s+(?:попали|попадает|попадают)(?:\s+следующие)?(?:\s+адреса|\s+улицы)?\s*:\s*([\s\S]*?)(?=(?:Ориентировочное|Аварийная|Аварийные|Дальнейшая|На\s+место|Работы\s+проводятся|Работы\s+заверш|Всего\s+\d+|$))/iu,

            streetHouse: false
        },


        // -----------------------------------------------------
        // "ограничение электроснабжения по следующим адресам"
        // -----------------------------------------------------
        {
            regex:
                /ограничение\s+электроснабжения\s+по\s+следующим\s+адресам\s*:\s*([\s\S]*?)(?=(?:Ориентировочное|Аварийная|Дальнейшая|На\s+место|Работы|$))/iu,

            streetHouse: false
        },


        // -----------------------------------------------------
        // "следующие улицы"
        // -----------------------------------------------------
        {
            regex:
                /Под\s+ограничения\s+частично\s+попали\s+следующие\s+улицы\s*:\s*([\s\S]*?)(?=(?:Ориентировочное|Аварийная|Дальнейшая|На\s+место|Работы|$))/iu,

            streetHouse: false
        },


        // -----------------------------------------------------
        // Просто "следующие адреса:"
        // -----------------------------------------------------
        {
            regex:
                /следующие\s+адреса\s*:\s*([\s\S]*?)(?=(?:Ориентировочное|Аварийная|Дальнейшая|На\s+место|Работы|$))/iu,

            streetHouse: false
        }
    ];


    let addressMatch = null;
    let addressIsStreetHouse = false;


    for (
        const pattern
        of addressPatterns
    ) {

        const match =
            text.match(pattern.regex);


        if (match) {

            addressMatch =
                match;

            addressIsStreetHouse =
                pattern.streetHouse;

            break;
        }
    }


    // =========================================================
    // 13. ОБРАБОТКА АДРЕСОВ
    // =========================================================

    if (addressMatch) {

        let addresses = [];


        // =====================================================
        // ФОРМАТ:
        //
        // дома по улице Халилова:
        // 32, 32А, 32Б, 44
        // =====================================================

        if (addressIsStreetHouse) {

            const street =
                normalizeStreet(
                    addressMatch[1]
                );


            let houses =
                addressMatch[2]
                    .trim()
                    .replace(/\s+/g, " ");


            // Удаляем хвост сообщения
            houses =
                houses

                    .replace(
                        /Аварийная\s+бригада.*$/iu,
                        ""
                    )

                    .replace(
                        /Аварийные\s+бригады.*$/iu,
                        ""
                    )

                    .replace(
                        /Дальнейшая\s+информация.*$/iu,
                        ""
                    )

                    .replace(
                        /На\s+место\s+выехал[аи].*$/iu,
                        ""
                    )

                    .replace(
                        /Работы\s+проводятся.*$/iu,
                        ""
                    )

                    .replace(
                        /Работы\s+будут.*$/iu,
                        ""
                    )

                    .replace(
                        /Работы\s+завершены.*$/iu,
                        ""
                    )

                    .replace(
                        /Ориентировочное.*$/iu,
                        ""
                    )

                    .replace(
                        /Всего\s+\d+.*$/iu,
                        ""
                    )

                    .trim();


            const houseNumbers =
                splitHouseNumbers(
                    houses
                );


            addresses =
                buildStreetHouseAddresses(
                    street,
                    houseNumbers
                );
        }


        // =====================================================
        // ОБЫЧНЫЙ ФОРМАТ
        //
        // Например:
        //
        // ул. Ленина, 33, 33А, 33Б,
        // ул. Омарова, 12
        // =====================================================

        else {

            let addressesText =
                addressMatch[1];


            addressesText =
                addressesText

                    .replace(/\r?\n/g, " ")

                    .replace(/\s+/g, " ")

                    .replace(
                        /Аварийная\s+бригада.*$/iu,
                        ""
                    )

                    .replace(
                        /Аварийные\s+бригады.*$/iu,
                        ""
                    )

                    .replace(
                        /Дальнейшая\s+информация.*$/iu,
                        ""
                    )

                    .replace(
                        /На\s+место\s+выехала.*$/iu,
                        ""
                    )

                    .replace(
                        /На\s+место\s+выехали.*$/iu,
                        ""
                    )

                    .replace(
                        /Работы\s+проводятся.*$/iu,
                        ""
                    )

                    .replace(
                        /Работы\s+будут.*$/iu,
                        ""
                    )

                    .replace(
                        /Работы\s+завершены.*$/iu,
                        ""
                    )

                    .replace(
                        /Ориентировочное.*$/iu,
                        ""
                    )

                    .replace(
                        /Всего\s+\d+.*$/iu,
                        ""
                    )

                    .trim();


            // =================================================
            // Убираем лишние дефисы
            // =================================================

            addressesText =
                addressesText
                    .replace(
                        /\s*[-–—]\s*/g,
                        " - "
                    )
                    .replace(
                        /\s+/g,
                        " "
                    )
                    .trim();


            // =================================================
            // Разбиваем запятые
            // =================================================

            const parts =
                addressesText
                    .split(/\s*,\s*/)
                    .map(
                        x => x.trim()
                    )
                    .filter(Boolean);


            // =================================================
            // ГЛАВНЫЙ АЛГОРИТМ
            //
            // Ищем улицу.
            //
            // Если следующий элемент —
            // номер дома, добавляем его к улице.
            //
            // Если подряд идут:
            //
            // Ленина
            // 33
            // 33А
            // 33Б
            //
            // получаем:
            //
            // Ленина, 33
            // Ленина, 33А
            // Ленина, 33Б
            // =================================================

            let currentStreet = null;


            for (
                let i = 0;
                i < parts.length;
                i++
            ) {

                let part =
                    parts[i]
                        .trim();


                if (!part) {
                    continue;
                }


                // ---------------------------------------------
                // Разделитель "и"
                // ---------------------------------------------

                if (
                    /\s+и\s+/iu.test(part)
                ) {

                    const splitByAnd =
                        part
                            .split(
                                /\s+и\s+/iu
                            )
                            .map(
                                x => x.trim()
                            )
                            .filter(Boolean);


                    for (
                        const item
                        of splitByAnd
                    ) {

                        if (
                            isHouseNumber(item) &&
                            currentStreet
                        ) {

                            addresses.push(
                                ...buildStreetHouseAddresses(
                                    currentStreet,
                                    [item]
                                )
                            );

                        } else {

                            currentStreet =
                                normalizeStreet(
                                    item
                                );


                            if (
                                currentStreet
                            ) {

                                addresses.push(
                                    currentStreet
                                );
                            }
                        }
                    }


                    continue;
                }


                // ---------------------------------------------
                // Если это номер дома
                // ---------------------------------------------

                if (
                    isHouseNumber(part)
                ) {

                    if (
                        currentStreet
                    ) {

                        addresses.push(
                            ...buildStreetHouseAddresses(
                                currentStreet,
                                [part]
                            )
                        );
                    }


                    continue;
                }


                // ---------------------------------------------
                // Это новая улица
                // ---------------------------------------------

                currentStreet =
                    normalizeStreet(
                        part
                    );


                if (
                    currentStreet
                ) {

                    /*
                     * Пока не добавляем улицу.
                     *
                     * Она будет добавлена только если
                     * для неё не нашлось номера дома.
                     */
                }
            }


            // =================================================
            // Если были только улицы без домов
            // =================================================

            if (
                addresses.length === 0 &&
                parts.length
            ) {

                addresses =
                    parts.map(
                        normalizeStreet
                    );
            }


            // =================================================
            // ВАЖНЫЙ FALLBACK:
            //
            // Если в строке есть:
            //
            // "ул. Ленина 33, 33А, 33Б"
            //
            // без запятой между улицей и первым домом,
            // предыдущая логика могла получить:
            //
            // "ул. Ленина 33"
            //
            // Поэтому дополнительно разбираем такие случаи.
            // =================================================

            const expandedAddresses = [];


            for (
                const address
                of addresses
            ) {

                const match =
                    address.match(
                        /^(.*?\D)\s+(\d+\s*[А-ЯЁA-Z]?)$/iu
                    );


                if (
                    match &&
                    !isHouseNumber(address)
                ) {

                    const street =
                        normalizeStreet(
                            match[1]
                        );


                    const house =
                        normalizeHouseNumber(
                            match[2]
                        );


                    expandedAddresses.push(
                        `${street}, ${house}`
                    );

                } else {

                    expandedAddresses.push(
                        address
                    );
                }
            }


            addresses =
                expandedAddresses;
        }


        // =====================================================
        // 14. ДОПОЛНИТЕЛЬНОЕ РАЗВИТИЕ АДРЕСОВ
        //
        // Если получилось:
        //
        // ул. Ленина, 33, 33А, 33Б
        //
        // повторно разбираем такие строки.
        // =====================================================

        const finalAddresses = [];


        for (
            const address
            of addresses
        ) {

            const match =
                address.match(
                    /^(.*?),\s*(\d+(?:\s*[А-ЯЁA-Z])?(?:\s*[-–—]\s*\d+(?:\s*[А-ЯЁA-Z])?)?)$/iu
                );


            if (match) {

                const street =
                    normalizeStreet(
                        match[1]
                    );


                const house =
                    normalizeHouseNumber(
                        match[2]
                    );


                if (
                    street &&
                    house
                ) {

                    finalAddresses.push(
                        `${street}, ${house}`
                    );


                    continue;
                }
            }


            finalAddresses.push(
                address
            );
        }


        // =====================================================
        // 15. УДАЛЕНИЕ МУСОРА
        // =====================================================

        addresses =
            finalAddresses.filter(
                address => {

                    if (
                        !address
                    ) {
                        return false;
                    }


                    if (
                        /^ул\.?$/iu
                            .test(address)
                    ) {
                        return false;
                    }


                    if (
                        /^адреса$/iu
                            .test(address)
                    ) {
                        return false;
                    }


                    if (
                        /^улицы$/iu
                            .test(address)
                    ) {
                        return false;
                    }


                    if (
                        /аварийн(?:ая|ые|ой|ых)/iu
                            .test(address)
                    ) {
                        return false;
                    }


                    if (
                        /дальнейшая\s+информация/iu
                            .test(address)
                    ) {
                        return false;
                    }


                    if (
                        /работы\s+проводятся/iu
                            .test(address)
                    ) {
                        return false;
                    }


                    if (
                        address.length < 3
                    ) {
                        return false;
                    }


                    return true;
                }
            );


        result.addresses =
            unique(
                addresses
            );


        if (
            result.addresses.length
        ) {

            result.address_source =
                "telegram";
        }
    }


    // =========================================================
    // 16. FALLBACK ПО FEEDER MAP
    // =========================================================

    const badAddresses =

        result.addresses.length === 0

        ||

        result.addresses.some(
            address =>

                address.length < 4

                ||

                /^ул\.?$/iu.test(address)

                ||

                /^адреса$/iu.test(address)

                ||

                /аварийн|бригада|информация/iu
                    .test(address)
        );


    if (
        badAddresses &&
        result.feeders.length
    ) {

        const mappedAddresses = [];


        for (
            const feeder
            of result.feeders
        ) {

            if (
                feederMap[feeder]
            ) {

                mappedAddresses.push(
                    ...feederMap[feeder]
                );

                continue;
            }


            const numberMatch =
                feeder.match(
                    /(\d+)$/
                );


            if (
                numberMatch
            ) {

                const number =
                    numberMatch[1];


                if (
                    feederMap[number]
                ) {

                    mappedAddresses.push(
                        ...feederMap[number]
                    );
                }
            }
        }


        if (
            mappedAddresses.length
        ) {

            result.addresses =
                unique(
                    mappedAddresses
                );

            result.address_source =
                "feederMap";
        }
    }


    // =========================================================
    // 17. ФИНАЛЬНАЯ НОРМАЛИЗАЦИЯ
    // =========================================================

    result.feeders =
        unique(
            result.feeders
        );


    result.transformer_points =
        unique(
            result.transformer_points
        );


    result.addresses =
        unique(
            result.addresses
        );


    result.feeder =
        result.feeders[0] ||
        null;


    result.transformer_point =
        result.transformer_points[0] ||
        null;


    // =========================================================
    // 18. ФИНАЛЬНЫЙ ЛОГ
    // =========================================================

    console.log(
        "РАСПАРСЕНО ОТКЛЮЧЕНИЕ:",
        {
            feeders:
                result.feeders,

            transformer_points:
                result.transformer_points,

            outage_type:
                result.outage_type,

            status:
                result.status,

            substation:
                result.substation,

            restore_time:
                result.restore_time,

            addresses:
                result.addresses
        }
    );


    return result;
}


// =============================================================
// EXPORT
// =============================================================

module.exports = parseOutage;

