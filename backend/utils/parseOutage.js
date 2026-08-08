const feederMap = require("./feederMap");

function parseOutage(text) {

    // =========================================================
    // НОРМАЛИЗАЦИЯ ТЕКСТА
    // =========================================================

    text = String(text || "")
        .replace(/\r?\n/g, " ")
        .replace(/\s+/g, " ")
        .trim();


    // =========================================================
    // ПОЛНОЕ ВОССТАНОВЛЕНИЕ
    // =========================================================

    const allFeedersWorking =

        /все\s+фидер[а-яё]*\s+(?:в\s+работ[еа]|работают|в\s+рабочем\s+состоянии)/iu.test(text) ||

        /все\s+фидер[а-яё]*\s+включен[а-яё]*/iu.test(text) ||

        /все\s+фидер[а-яё]*\s+восстановлен[а-яё]*/iu.test(text) ||

        /электроснабжение\s+восстановлено\s+полностью/iu.test(text) ||

        /электроснабжение\s+восстановлено\s+в\s+полном\s+объ[её]ме/iu.test(text);


    if (allFeedersWorking) {

        return {

            type: "электричество",

            feeder: null,

            feeders: [],

            transformer_points: [],

            substation: "",

            description: "Все фидеры в работе",

            addresses: [],

            address_source: "telegram",

            restore_time: null,

            status: "completed",

            outage_type: null,

            all_feeders_working: true
        };
    }


    // =========================================================
    // РЕЗУЛЬТАТ
    // =========================================================

    const result = {

        type: "электричество",

        feeder: null,

        feeders: [],

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
    // ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ
    // =========================================================

    function unique(array) {

        return [...new Set(array)];

    }


    function normalizeFeeder(value) {

        if (!value) {
            return null;
        }

        value = String(value)
            .trim()
            .toUpperCase()
            .replace(/\s+/g, " ");


        const ztmMatch =
            value.match(/^ЗТМ\s*-?\s*(\d+)$/iu);


        if (ztmMatch) {

            return `ЗТМ-${ztmMatch[1]}`;

        }


        return value;

    }


    function addFeeder(value) {

        const feeder =
            normalizeFeeder(value);


        if (!feeder) {
            return;
        }


        if (!result.feeders.includes(feeder)) {

            result.feeders.push(feeder);

        }

    }


    // =========================================================
    // ФИДЕРЫ
    // =========================================================

    /*
        Поддерживаем:

        Фидер 3
        Фидер-3
        Фидеры 3,5,7

        Фидер ЗТМ 3
        Фидер ЗТМ-3

        Фидер-3 ЗТМ
        Фидер 3 ЗТМ

        Фидеры ЗТМ 3,5,7,9,15
    */


    // ---------------------------------------------------------
    // 1. Фидер-6 ЗТМ
    // ---------------------------------------------------------

    const feederNumberZtmAfterMatches = [

        ...text.matchAll(
            /Фидер[а-яё]*\s*-?\s*(\d+)\s*ЗТМ\b/giu
        )

    ];


    for (
        const match of feederNumberZtmAfterMatches
    ) {

        addFeeder(
            `ЗТМ-${match[1]}`
        );

    }


    // ---------------------------------------------------------
    // 2. Фидеры 3,5,7 ЗТМ
    // ---------------------------------------------------------

    const feederNumbersZtmAfterMatches = [

        ...text.matchAll(
            /Фидер[а-яё]*\s*-?\s*((?:\d+\s*[,;]\s*)+\d+)\s*ЗТМ\b/giu
        )

    ];


    for (
        const match of feederNumbersZtmAfterMatches
    ) {

        const numbers =
            match[1]
                .split(/[,;]/)
                .map(x => x.trim())
                .filter(Boolean);


        for (const number of numbers) {

            addFeeder(
                `ЗТМ-${number}`
            );

        }

    }


    // ---------------------------------------------------------
    // 3. Фидеры ЗТМ 3,5,7
    // ---------------------------------------------------------

    const feederZtmMatches = [

        ...text.matchAll(
            /Фидер[а-яё]*\s+ЗТМ\s*-?\s*((?:\d+\s*[,;]\s*)+\d+)/giu
        )

    ];


    for (
        const match of feederZtmMatches
    ) {

        const numbers =
            match[1]
                .split(/[,;]/)
                .map(x => x.trim())
                .filter(Boolean);


        for (const number of numbers) {

            addFeeder(
                `ЗТМ-${number}`
            );

        }

    }


    // ---------------------------------------------------------
    // 4. Фидер ЗТМ-3 / Фидер ЗТМ 3
    // ---------------------------------------------------------

    const singleZtmMatches = [

        ...text.matchAll(
            /Фидер[а-яё]*\s*-?\s*ЗТМ\s*-?\s*(\d+)/giu
        )

    ];


    for (
        const match of singleZtmMatches
    ) {

        addFeeder(
            `ЗТМ-${match[1]}`
        );

    }


    // ---------------------------------------------------------
    // 5. Обычные фидеры
    //
    // Выполняем ПОСЛЕ специальных ЗТМ-конструкций.
    // ---------------------------------------------------------

    const normalFeederMatches = [

        ...text.matchAll(
            /Фидер[а-яё]*\s*-?\s*(\d+(?:\s*[,;]\s*\d+)*)/giu
        )

    ];


    for (
        const match of normalFeederMatches
    ) {

        const fullMatch =
            match[0];


        // Если после номера стоит ЗТМ,
        // этот фидер уже обработан выше.

        const afterNumber =
            text.substring(
                match.index + fullMatch.length,
                match.index + fullMatch.length + 10
            );


        if (/^\s*ЗТМ\b/iu.test(afterNumber)) {
            continue;
        }


        const numbers =
            match[1]
                .split(/[,;]/)
                .map(x => x.trim())
                .filter(Boolean);


        for (const number of numbers) {

            if (
                !result.feeders.includes(
                    `ЗТМ-${number}`
                )
            ) {

                addFeeder(number);

            }

        }

    }


    result.feeders =
        unique(result.feeders);


    result.feeder =
        result.feeders[0] || null;


    // =========================================================
    // ТРАНСФОРМАТОРНЫЕ ПОДСТАНЦИИ
    // =========================================================

    /*
        Поддерживаем:

        ТП-43
        ТП 43
        ТП-Каспийская гавань
        ТП Каспийская гавань

        ТП-43 и ТП-Каспийская гавань
    */


    const transformerMatches = [

        ...text.matchAll(
            /ТП\s*[-–—]?\s*([А-ЯЁA-Z0-9][А-ЯЁA-Z0-9\s-]*?)(?=\s+и\s+ТП|\s*,\s*ТП|[.,:;]|$)/giu
        )

    ];


    for (
        const match of transformerMatches
    ) {

        let value =
            match[1]
                .trim()
                .replace(/\s+/g, " ");


        if (!value) {
            continue;
        }


        value =
            value.replace(
                /[-–—]+$/u,
                ""
            ).trim();


        const transformer =
            `ТП-${value}`;


        if (
            !result.transformer_points.includes(
                transformer
            )
        ) {

            result.transformer_points.push(
                transformer
            );

        }

    }


    result.transformer_points =
        unique(result.transformer_points);


    // =========================================================
    // ТИП ОТКЛЮЧЕНИЯ
    // =========================================================

    const isPlanned =

        /планов(?:ое|ая|ому|ым|ых)/iu.test(text) ||

        /планов[а-яё]*\s+отключен/iu.test(text) ||

        /планов[а-яё]*\s+работ/iu.test(text) ||

        /плановые\s+работы/iu.test(text);


    const isEmergency =

        /аварийн/iu.test(text) ||

        /обрыв/iu.test(text) ||

        /земля\s+на\s+линии/iu.test(text) ||

        /повреждени[ея].*(?:линии|кабел)/iu.test(text) ||

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
            /обрыв|земля\s+на\s+линии|повреждени[ея]/iu.test(text)
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
    // ОКОНЧАНИЕ РАБОТ
    // =========================================================

    const isCompleted =

        /работ[а-яё]*\s+(?:завершен|оконч|законч)/iu.test(text) ||

        /завершен[а-яё]*\s+(?:аварийн|ремонтн|восстановительн)[а-яё]*\s+работ/iu.test(text) ||

        /электроснабжени[ея]\s+(?:полностью\s+)?восстановлен/iu.test(text) ||

        /подача\s+электроэнергии\s+восстановлен/iu.test(text) ||

        /электроэнергия\s+(?:полностью\s+)?восстановлен/iu.test(text) ||

        /ограничени[ея]\s+(?:электроснабжения\s+)?снят/iu.test(text) ||

        /аварийн(?:ые|ых)\s+работ[ыа]\s+(?:завершен|оконч|законч)/iu.test(text) ||

        /все\s+фидер[а-яё]*\s+(?:в\s+работ[еа]|работают)/iu.test(text);


    if (isCompleted) {

        result.status =
            "completed";


        result.description =
            "Электроснабжение восстановлено";

    }


    // =========================================================
    // ПОДСТАНЦИЯ
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
    // ВРЕМЯ ВОССТАНОВЛЕНИЯ
    // =========================================================

    const timePatterns = [

        /ориентировочное\s+время\s+завершения\s+работ[^\d]*(\d{1,2}:\d{2})/iu,

        /время\s+завершения\s+работ[^\d]*(\d{1,2}:\d{2})/iu,

        /завершения\s+работ[^\d]*(\d{1,2}:\d{2})/iu,

        /работ[а-яё]*\s+до[^\d]*(\d{1,2}:\d{2})/iu,

        /восстановлен[а-яё]*[^\d]*(\d{1,2}:\d{2})/iu,

        /до[^\d]*(\d{1,2}:\d{2})/iu,

        /в\s+(\d{1,2}:\d{2})/iu

    ];


    for (
        const pattern of timePatterns
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
    // ПОИСК АДРЕСОВ
    // =========================================================

    const addressPatterns = [

        /(?:Под отключени(?:е|я)(?:\s+частично)?\s+(?:попали|попадает|попадают))(?:\s+следующие)?(?:\s+адреса|\s+улицы)?\s*:\s*([\s\S]*?)(?=(?:Ориентировочное|Аварийная|Аварийные|Дальнейшая|На место|Работы проводятся|Работы заверш|Всего\s+\d+|$))/iu,

        /Под ограничения частично попали следующие улицы\s*:\s*([\s\S]*?)(?=(?:Ориентировочное|Аварийная|Дальнейшая|На место|Работы|$))/iu,

        /Под ограничения частично попали следующие адреса\s*:\s*([\s\S]*?)(?=(?:Ориентировочное|Аварийная|Дальнейшая|На место|Работы|$))/iu,

        /ограничение электроснабжения по следующим адресам\s*:\s*([\s\S]*?)(?=(?:Ориентировочное|Аварийная|Дальнейшая|На место|Работы|$))/iu,

        /следующие адреса\s*:\s*([\s\S]*?)(?=(?:Ориентировочное|Аварийная|Дальнейшая|На место|Работы|$))/iu

    ];


    let addressMatch = null;


    for (
        const pattern of addressPatterns
    ) {

        const match =
            text.match(pattern);


        if (match) {

            addressMatch =
                match;

            break;

        }

    }


    if (addressMatch) {

        let addressesText =
            addressMatch[1];


        // =====================================================
        // ОЧИСТКА
        // =====================================================

        addressesText = addressesText

            .replace(/\r?\n/g, " ")

            .replace(/\s+/g, " ")

            .replace(/Аварийная бригада.*$/iu, "")

            .replace(/Аварийные бригады.*$/iu, "")

            .replace(/Дальнейшая информация.*$/iu, "")

            .replace(/На место выехала.*$/iu, "")

            .replace(/На место выехали.*$/iu, "")

            .replace(/Работы проводятся.*$/iu, "")

            .replace(/Работы будут.*$/iu, "")

            .replace(/Работы завершены.*$/iu, "")

            .replace(/Ориентировочное.*$/iu, "")

            .replace(/Всего\s+\d+.*$/iu, "")

            .trim();


        // =====================================================
        // НОРМАЛИЗАЦИЯ ДЕФИСОВ
        // =====================================================

        addressesText =
            addressesText
                .replace(/\s*[-–—]\s*/g, " - ")
                .replace(/\s+/g, " ")
                .trim();


        // =====================================================
        // РАЗБИВКА АДРЕСОВ
        // =====================================================

        let addresses =
            addressesText
                .split(/\s*,\s*/)
                .map(address =>
                    address.trim()
                )
                .filter(Boolean);


        // =====================================================
        // ОБЪЕДИНЕНИЕ НОМЕРОВ ДОМОВ
        //
        // Было:
        //
        // ул. Ленина дома - 33
        // 33А
        // 33Б
        //
        // Становится:
        //
        // ул. Ленина дома - 33, 33А, 33Б
        // =====================================================

        const mergedAddresses = [];

        let currentStreet = null;


        for (const address of addresses) {

            const looksLikeHouseNumber =
                /^\d+\s*[А-ЯЁA-Z]?(?:\s*[-–—]\s*\d+\s*[А-ЯЁA-Z]?)?$/iu.test(address);


            const looksLikeStreet =
                /^(?:ул\.?|улица|просп\.?|проспект|пер\.?|переулок|ш\.?|шоссе|мкр\.?|микрорайон|снт)\b/iu.test(address);


            if (
                looksLikeHouseNumber &&
                currentStreet
            ) {

                currentStreet =
                    `${currentStreet}, ${address}`;

                mergedAddresses[
                    mergedAddresses.length - 1
                ] = currentStreet;

                continue;
            }


            currentStreet =
                address;

            mergedAddresses.push(
                address
            );

        }


        addresses =
            mergedAddresses;


        // =====================================================
        // ОБРАБОТКА "И"
        // =====================================================

        addresses =
            addresses.flatMap(address => {

                if (
                    /\s+и\s+/iu.test(address)
                ) {

                    return address
                        .split(/\s+и\s+/iu)
                        .map(x => x.trim())
                        .filter(Boolean);

                }

                return [address];

            });


        // =====================================================
        // УДАЛЕНИЕ МУСОРА
        // =====================================================

        addresses =
            addresses.filter(address => {

                if (
                    /^ул\.?$/iu.test(address)
                ) {
                    return false;
                }


                if (
                    /^адреса$/iu.test(address)
                ) {
                    return false;
                }


                if (
                    /^улицы$/iu.test(address)
                ) {
                    return false;
                }


                if (
                    /аварийн(?:ая|ые|ой|ых)/iu.test(address)
                ) {
                    return false;
                }


                if (
                    /дальнейшая информация/iu.test(address)
                ) {
                    return false;
                }


                if (
                    /работы проводятся/iu.test(address)
                ) {
                    return false;
                }


                if (
                    address.length < 3
                ) {
                    return false;
                }


                return true;

            });


        result.addresses =
            unique(addresses);


        if (
            result.addresses.length
        ) {

            result.address_source =
                "telegram";

        }

    }


    // =========================================================
    // ПРОВЕРКА АДРЕСОВ
    // =========================================================

    const badAddresses =

        result.addresses.length === 0 ||

        result.addresses.some(address =>

            address.length < 4 ||

            /^ул\.?$/iu.test(address) ||

            /^адреса$/iu.test(address) ||

            /аварийн|бригада|информация/iu.test(address)

        );


    // =========================================================
    // FALLBACK: feederMap
    // =========================================================

    /*
        feederMap используем только когда Telegram
        не дал нормальные адреса.

        Для ТП НЕ используем feederMap.
    */

    if (
        badAddresses &&
        result.feeders.length
    ) {

        const mappedAddresses = [];


        for (
            const feeder of result.feeders
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
                unique(mappedAddresses);

            result.address_source =
                "feederMap";

        }

    }


    // =========================================================
    // ФИНАЛЬНАЯ НОРМАЛИЗАЦИЯ
    // =========================================================

    result.feeders =
        unique(
            result.feeders
        );


    result.transformer_points =
        unique(
            result.transformer_points
        );


    result.feeder =
        result.feeders[0] || null;


    return result;

}


module.exports = parseOutage;