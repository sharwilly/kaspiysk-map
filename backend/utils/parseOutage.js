const feederMap = require("./feederMap");

function parseOutage(text) {

    // =========================================================
    // 1. НОРМАЛИЗАЦИЯ ТЕКСТА
    // =========================================================

    text = String(text || "")
        .replace(/\r?\n/g, " ")
        .replace(/\u00A0/g, " ")
        .replace(/\s+/g, " ")
        .trim();


    // =========================================================
    // 2. ПУСТОЙ РЕЗУЛЬТАТ
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
    // 3. ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ
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


    function addTransformerPoint(value) {

        if (!value) {
            return;
        }


        let tp = String(value)
            .trim()
            .replace(/\s+/g, " ")
            .replace(/[.,;:]+$/u, "")
            .trim();


        if (!tp) {
            return;
        }


        /*
         * Удаляем случайно захваченное время.
         *
         * Например:
         *
         * ТП 109 до 18:00
         *
         * должно стать:
         *
         * ТП-109
         */

        tp = tp
            .replace(
                /\s+до\s+\d{1,2}:\d{2}.*$/iu,
                ""
            )
            .trim();


        /*
         * Убираем слова, которые вообще
         * не относятся к названию ТП.
         */

        tp = tp
            .replace(
                /\s+(?:и|а\s+также)\s*$/iu,
                ""
            )
            .trim();


        if (!tp) {
            return;
        }


        /*
         * ТП 43 -> ТП-43
         *
         * ТП 103-а -> ТП-103-а
         *
         * ТП Каспийская гавань -> ТП-Каспийская гавань
         */

        if (!/^ТП\b/iu.test(tp)) {
            tp = `ТП-${tp}`;
        }


        tp = tp.replace(
            /^ТП\s+/iu,
            "ТП-"
        );


        /*
         * Убираем двойные дефисы.
         */

        tp = tp.replace(
            /^ТП--+/iu,
            "ТП-"
        );


        if (!result.transformer_points.includes(tp)) {

            result.transformer_points.push(
                tp
            );
        }
    }


    // =========================================================
    // 4. ПОЛНОЕ ВОССТАНОВЛЕНИЕ
    // =========================================================

    const allFeedersWorking =

        /все\s+фидер[а-яё]*\s+(?:в\s+работ[еа]|работают|в\s+рабочем\s+состоянии)/iu.test(text) ||

        /все\s+фидер[а-яё]*\s+включен[а-яё]*/iu.test(text) ||

        /все\s+фидер[а-яё]*\s+восстановлен[а-яё]*/iu.test(text) ||

        /электроснабжение\s+восстановлено\s+полностью/iu.test(text) ||

        /электроснабжение\s+восстановлено\s+в\s+полном\s+объ[её]ме/iu.test(text);


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
    // 5. ФИДЕРЫ
    // =========================================================

    // ---------------------------------------------------------
    // Фидер-6 ЗТМ
    // ---------------------------------------------------------

    const feederNumberZtmAfterMatches = [
        ...text.matchAll(
            /Фидер[а-яё]*\s*-?\s*(\d+)\s*ЗТМ\b/giu
        )
    ];


    for (const match of feederNumberZtmAfterMatches) {

        addFeeder(
            `ЗТМ-${match[1]}`
        );
    }


    // ---------------------------------------------------------
    // Фидеры 3,5,7 ЗТМ
    // ---------------------------------------------------------

    const feederNumbersZtmAfterMatches = [
        ...text.matchAll(
            /Фидер[а-яё]*\s*-?\s*((?:\d+\s*[,;]\s*)+\d+)\s*ЗТМ\b/giu
        )
    ];


    for (const match of feederNumbersZtmAfterMatches) {

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
    // Фидеры ЗТМ 3,5,7
    // ---------------------------------------------------------

    const feederZtmMatches = [
        ...text.matchAll(
            /Фидер[а-яё]*\s+ЗТМ\s*-?\s*((?:\d+\s*[,;]\s*)+\d+)/giu
        )
    ];


    for (const match of feederZtmMatches) {

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
    // Фидер ЗТМ-3 / Фидер ЗТМ 3
    // ---------------------------------------------------------

    const singleZtmMatches = [
        ...text.matchAll(
            /Фидер[а-яё]*\s*-?\s*ЗТМ\s*-?\s*(\d+)/giu
        )
    ];


    for (const match of singleZtmMatches) {

        addFeeder(
            `ЗТМ-${match[1]}`
        );
    }


    // ---------------------------------------------------------
    // Обычные фидеры
    // ---------------------------------------------------------

    const normalFeederMatches = [
        ...text.matchAll(
            /Фидер[а-яё]*\s*-?\s*(\d+(?:\s*[,;]\s*\d+)*)/giu
        )
    ];


    for (const match of normalFeederMatches) {

        const fullMatch =
            match[0];


        const afterNumber =
            text.substring(
                match.index + fullMatch.length,
                match.index + fullMatch.length + 10
            );


        if (
            /^\s*ЗТМ\b/iu.test(afterNumber)
        ) {
            continue;
        }


        const numbers =
            match[1]
                .split(/[,;]/)
                .map(x => x.trim())
                .filter(Boolean);


        for (const number of numbers) {

            addFeeder(number);
        }
    }


    // =========================================================
    // 6. ТРАНСФОРМАТОРНЫЕ ПОДСТАНЦИИ
    // =========================================================
    //
    // Поддерживаем:
    //
    // ТП-43
    // ТП 43
    // ТП 103-а
    // ТП-103-а
    // ТП-Каспийская гавань
    // ТП Каспийская гавань
    // ТП-43 и ТП-Каспийская гавань
    // ТП - Прогресс 2 до 17:30
    // ТП 109 до 18:00
    //
    // ВАЖНО:
    // "до 17:30" не попадает в название ТП.
    // =========================================================

    const tpMatches = [
        ...text.matchAll(
            /ТП\s*[-–—]?\s*([0-9]+(?:\s*[-–—]\s*[А-ЯЁA-Zа-яёa-z0-9]+)?|[А-ЯЁA-Zа-яёa-z][^,.;]*?)(?=\s+до\s+\d{1,2}:\d{2}|\s+и\s+ТП\b|\s*,\s*ТП\b|\s+ТП\b|\s+Под\s+(?:отключение|ограничение)|[.,;]|$)/giu
        )
    ];


    for (const match of tpMatches) {

        let value =
            match[1]
                .trim()
                .replace(/\s+/g, " ")
                .replace(/[.,;:]+$/u, "")
                .trim();


        /*
         * Защита от времени.
         */

        value =
            value
                .replace(
                    /\s+до\s+\d{1,2}:\d{2}.*$/iu,
                    ""
                )
                .trim();


        if (!value) {
            continue;
        }


        addTransformerPoint(value);
    }


    /*
     * Дополнительная защита для сложных ТП.
     *
     * Например:
     *
     * "аварийное отключение ТП 103-а."
     */

    if (
        result.transformer_points.length === 0
    ) {

        const simpleTpMatches = [
            ...text.matchAll(
                /\bТП\s*[-–—]?\s*([0-9]+(?:\s*[-–—]\s*[А-ЯЁA-Zа-яёa-z0-9]+)?)/giu
            )
        ];


        for (const match of simpleTpMatches) {

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
        result.transformer_points[0] || null;


    // =========================================================
    // 7. ТИП ОТКЛЮЧЕНИЯ
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


    /*
     * Ограничение электроснабжения без слова
     * "аварийное" считаем emergency, как раньше.
     */

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
    // 8. ОКОНЧАНИЕ РАБОТ
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
    // 9. ПОДСТАНЦИЯ
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
    // 10. ВРЕМЯ ВОССТАНОВЛЕНИЯ
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


    for (const pattern of timePatterns) {

        const match =
            text.match(pattern);


        if (match) {

            result.restore_time =
                match[1];

            break;
        }
    }


    // =========================================================
    // 11. АДРЕСА
    // =========================================================
    //
    // Поддерживаем:
    //
    // Под отключение попали следующие адреса:
    // ул. Ленина, ул. Омарова
    //
    // Под ограничения частично попали следующие адреса:
    // ул. Западная, ул. Каспийская
    //
    // Под ограничения попали следующие дома по улице Акулиничева:
    // 13, 13А
    //
    // Под отключение попали следующие дома по улице Халилова:
    // 32, 32А, 32Б, 44
    //
    // Под ограничения попали дома по улице Акулиничева:
    // 13, 13А
    // =========================================================

    const addressPatterns = [

        // -----------------------------------------------------
        // Дома по улице
        // -----------------------------------------------------
        {
            regex:
                /(?:Под\s+ограничени[яе]|Под\s+отключени[ея])\s+попали\s+(?:следующие\s+)?дома\s+по\s+улице\s+([^:]+?)\s*:\s*([\s\S]*?)(?=(?:Ориентировочное|Аварийная|Аварийные|Дальнейшая|На\s+место|Работы|Всего\s+\d+|$))/iu,

            streetHouse: true
        },


        // -----------------------------------------------------
        // Дома по улице
        // "Под ограничения попали дома..."
        // -----------------------------------------------------
        {
            regex:
                /(?:Под\s+ограничени[яе]|Под\s+отключени[ея])\s+(?:попали|попадает|попадают)\s+(?:следующие\s+)?дома\s+по\s+улице\s+([^:]+?)\s*:\s*([\s\S]*?)(?=(?:Ориентировочное|Аварийная|Аварийные|Дальнейшая|На\s+место|Работы|Всего\s+\d+|$))/iu,

            streetHouse: true
        },


        // -----------------------------------------------------
        // Дома по улице с "следующие"
        // -----------------------------------------------------
        {
            regex:
                /(?:Под\s+ограничени[яе]|Под\s+отключени[ея])\s+(?:попали|попадает|попадают)\s+(?:следующие\s+)?дома\s+по\s+улице\s+([^:]+?)\s*:\s*([\s\S]*)$/iu,

            streetHouse: true
        },


        // -----------------------------------------------------
        // Адреса
        // -----------------------------------------------------
        {
            regex:
                /(?:Под\s+отключени(?:е|я)|Под\s+ограничени(?:е|я))(?:\s+частично)?\s+(?:попали|попадает|попадают)(?:\s+следующие)?(?:\s+адреса|\s+улицы)?\s*:\s*([\s\S]*?)(?=(?:Ориентировочное|Аварийная|Аварийные|Дальнейшая|На\s+место|Работы\s+проводятся|Работы\s+заверш|Всего\s+\d+|$))/iu,

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
        // "следующие адреса"
        // -----------------------------------------------------
        {
            regex:
                /Под\s+ограничения\s+частично\s+попали\s+следующие\s+адреса\s*:\s*([\s\S]*?)(?=(?:Ориентировочное|Аварийная|Дальнейшая|На\s+место|Работы|$))/iu,

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
        // "следующие адреса:"
        // -----------------------------------------------------
        {
            regex:
                /следующие\s+адреса\s*:\s*([\s\S]*?)(?=(?:Ориентировочное|Аварийная|Дальнейшая|На\s+место|Работы|$))/iu,

            streetHouse: false
        }
    ];


    let addressMatch = null;
    let addressIsStreetHouse = false;


    for (const pattern of addressPatterns) {

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
    // 12. ОБРАБОТКА АДРЕСОВ
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
                addressMatch[1]
                    .trim()
                    .replace(/\s+/g, " ");


            let houses =
                addressMatch[2]
                    .trim()
                    .replace(/\s+/g, " ");


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


            /*
             * Разбиваем дома:
             *
             * 32, 32А, 32Б, 44
             */

            const houseNumbers =
                houses
                    .split(/\s*,\s*/)
                    .map(x =>
                        x
                            .trim()
                            .replace(/[.;]+$/u, "")
                    )
                    .filter(Boolean);


            /*
             * Формируем один нормальный адрес:
             *
             * ул. Халилова дома - 32, 32А, 32Б, 44
             */

            if (street && houseNumbers.length) {

                addresses.push(
                    `${normalizeStreet(street)} дома - ${houseNumbers.join(", ")}`
                );
            }
        }


        // =====================================================
        // ОБЫЧНЫЙ ФОРМАТ
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


            /*
             * Нормализация дефисов.
             */

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


            /*
             * Разбиваем по запятым.
             */

            addresses =
                addressesText
                    .split(/\s*,\s*/)
                    .map(address =>
                        address.trim()
                    )
                    .filter(Boolean);


            /*
             * Объединяем номера домов.
             */

            const mergedAddresses = [];

            let currentStreet = null;


            for (const address of addresses) {

                const looksLikeHouseNumber =

                    /^\d+\s*[А-ЯЁA-Z]?(?:\s*[-–—]\s*\d+\s*[А-ЯЁA-Z]?)?\.?$/iu.test(address);


                if (
                    looksLikeHouseNumber &&
                    currentStreet
                ) {

                    currentStreet =
                        `${currentStreet}, ${address.replace(/\.$/, "")}`;


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


            /*
             * Обработка "и".
             *
             * Например:
             *
             * ул. Ленина и ул. Омарова
             */

            addresses =
                addresses.flatMap(address => {

                    if (
                        /\s+и\s+/iu.test(address)
                    ) {

                        return address
                            .split(/\s+и\s+/iu)
                            .map(x =>
                                x.trim()
                            )
                            .filter(Boolean);
                    }

                    return [address];
                });
        }


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
                    /дальнейшая\s+информация/iu.test(address)
                ) {
                    return false;
                }


                if (
                    /работы\s+проводятся/iu.test(address)
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
    // 13. FALLBACK ДЛЯ FEEDER
    // =========================================================
    //
    // Для ТП feederMap НЕ используем.
    // =========================================================

    const badAddresses =

        result.addresses.length === 0 ||


        result.addresses.some(address =>

            address.length < 4 ||

            /^ул\.?$/iu.test(address) ||

            /^адреса$/iu.test(address) ||

            /аварийн|бригада|информация/iu.test(address)
        );


    if (
        badAddresses &&
        result.feeders.length
    ) {

        const mappedAddresses = [];


        for (const feeder of result.feeders) {

            if (
                feederMap[feeder]
            ) {

                mappedAddresses.push(
                    ...feederMap[feeder]
                );

                continue;
            }


            const numberMatch =
                feeder.match(/(\d+)$/);


            if (numberMatch) {

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
    // 14. ФИНАЛЬНАЯ НОРМАЛИЗАЦИЯ
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


    result.transformer_point =
        result.transformer_points[0] || null;


    // =========================================================
    // 15. ФИНАЛЬНЫЙ ЛОГ
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
// НОРМАЛИЗАЦИЯ НАЗВАНИЯ УЛИЦЫ
// =============================================================

function normalizeStreet(street) {

    street =
        String(street || "")
            .trim()
            .replace(/\s+/g, " ")
            .replace(/[.,;:]+$/u, "")
            .trim();


    /*
     * Если Telegram написал:
     *
     * Акулиничева
     *
     * превращаем в:
     *
     * ул. Акулиничева
     */

    if (
        !/^ул\.?\s+/iu.test(street) &&
        !/^улиц[аеуы]\s+/iu.test(street)
    ) {

        street =
            `ул. ${street}`;
    }


    return street;
}


module.exports = parseOutage;

