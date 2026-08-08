const feederMap = require("./feederMap");

function parseOutage(text) {

    // =========================================================
    // 1. НОРМАЛИЗАЦИЯ ТЕКСТА
    // =========================================================

    text = String(text || "")
        .replace(/\r?\n/g, " ")
        .replace(/\s+/g, " ")
        .trim();


    // =========================================================
    // 2. ПОЛНОЕ ВОССТАНОВЛЕНИЕ
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

            transformer_point: null,
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
    // 3. РЕЗУЛЬТАТ
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
    // 4. ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ
    // =========================================================

    function unique(array) {

        return [
            ...new Set(
                array
                    .filter(Boolean)
                    .map(x => String(x).trim())
                    .filter(Boolean)
            )
        ];
    }


    // =========================================================
    // НОРМАЛИЗАЦИЯ ФИДЕРА
    // =========================================================

    function normalizeFeeder(value) {

        if (!value) {
            return null;
        }


        value = String(value)
            .trim()
            .toUpperCase()
            .replace(/\s+/g, " ");


        // ЗТМ 3
        // ЗТМ-3
        // ЗТМ 15

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
    // НОРМАЛИЗАЦИЯ ТП
    // =========================================================

    function addTransformerPoint(value) {

        if (!value) {
            return;
        }


        let tp =
            String(value)
                .trim()
                .replace(/\s+/g, " ")
                .replace(/[.,;:]+$/u, "")
                .trim();


        if (!tp) {
            return;
        }


        // Удаляем случайно захваченное время
        tp =
            tp.replace(
                /\s+до\s+\d{1,2}:\d{2}.*$/iu,
                ""
            )
            .trim();


        // Удаляем случайно захваченный следующий текст
        tp =
            tp.replace(
                /\s+(?:Под\s+отключение|Под\s+ограничени[яе]).*$/iu,
                ""
            )
            .trim();


        if (!tp) {
            return;
        }


        // Если уже начинается с ТП — ничего не добавляем
        if (!/^ТП\b/iu.test(tp)) {

            tp =
                `ТП-${tp}`;
        }


        // ТП 43 -> ТП-43
        tp =
            tp.replace(
                /^ТП\s+/iu,
                "ТП-"
            );


        // ТП - 43 -> ТП-43
        tp =
            tp.replace(
                /^ТП\s*[-–—]\s*/iu,
                "ТП-"
            );


        tp =
            tp.replace(/\s+/g, " ")
                .trim();


        if (!result.transformer_points.includes(tp)) {

            result.transformer_points.push(tp);
        }
    }


    // =========================================================
    // 5. ФИДЕРЫ
    // =========================================================

    // ---------------------------------------------------------
    // Фидер-6 ЗТМ
    // Фидера-6 ЗТМ
    // Фидер 6 ЗТМ
    // ---------------------------------------------------------

    const feederNumberZtmAfterMatches = [
        ...text.matchAll(
            /Фидер[а-яё]*\s*[-–—]?\s*(\d+)\s*ЗТМ\b/giu
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
            /Фидер[а-яё]*\s*[-–—]?\s*((?:\d+\s*[,;]\s*)+\d+)\s*ЗТМ\b/giu
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
    // Фидер ЗТМ-3
    // Фидер ЗТМ 3
    // ---------------------------------------------------------

    const singleZtmMatches = [
        ...text.matchAll(
            /Фидер[а-яё]*\s*[-–—]?\s*ЗТМ\s*-?\s*(\d+)/giu
        )
    ];


    for (const match of singleZtmMatches) {

        addFeeder(
            `ЗТМ-${match[1]}`
        );
    }


    // ---------------------------------------------------------
    // Обычные фидеры
    //
    // ВАЖНО:
    // Не захватываем число, если сразу после него стоит ЗТМ.
    // Это предотвращает:
    //
    // Фидер-6 ЗТМ
    //
    // -> "6"
    //
    // ---------------------------------------------------------

    const normalFeederMatches = [
        ...text.matchAll(
            /Фидер[а-яё]*\s*[-–—]?\s*(\d+(?:\s*[,;]\s*\d+)*)(?!\s*ЗТМ\b)/giu
        )
    ];


    for (const match of normalFeederMatches) {

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
    // Поддерживает:
    //
    // ТП-43
    // ТП 43
    // ТП 103-а
    // ТП 109
    // ТП-Каспийская гавань
    // ТП Каспийская гавань
    // ТП-43 и ТП-Каспийская гавань
    //
    // Также корректно обрезает:
    //
    // ТП 109 до 18:00
    //
    // и:
    //
    // ТП 103-а. Под отключение...
    //
    // =========================================================

    const tpMatches = [
        ...text.matchAll(
            /ТП\s*[-–—]?\s*([^,.;]+?)(?=\s+и\s+ТП\b|\s*,\s*ТП\b|\s+ТП\b|\s+до\s+\d{1,2}:\d{2}\b|\s+Под\s+отключение\b|\s+Под\s+ограничени[яе]\b|[.,;]|$)/giu
        )
    ];


    for (const match of tpMatches) {

        let value =
            match[1]
                .trim()
                .replace(/\s+/g, " ")
                .replace(/[.,;:]+$/u, "")
                .trim();


        if (!value) {
            continue;
        }


        // Защита от случайного захвата времени
        value =
            value
                .replace(
                    /\s+до\s+\d{1,2}:\d{2}.*$/iu,
                    ""
                )
                .trim();


        // Защита от захвата служебного текста
        value =
            value
                .replace(
                    /\s+(?:Под\s+отключение|Под\s+ограничени[яе]).*$/iu,
                    ""
                )
                .trim();


        // Убираем союз в конце
        value =
            value
                .replace(
                    /\s+(?:и|а также)\s*$/iu,
                    ""
                )
                .trim();


        if (!value) {
            continue;
        }


        addTransformerPoint(value);
    }


    result.transformer_points =
        unique(result.transformer_points);


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

        /электроснабжени[яе]\s+.*?\s+до\s+(\d{1,2}:\d{2})/iu,

        /ограничени[ея]\s+.*?\s+до\s+(\d{1,2}:\d{2})/iu,

        /отключени[ея]\s+.*?\s+до\s+(\d{1,2}:\d{2})/iu,

        /до\s+(\d{1,2}:\d{2})/iu
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
    // 11. ПОИСК АДРЕСОВ
    // =========================================================

    // ---------------------------------------------------------
    // 11.1 ДОМА ПО КОНКРЕТНОЙ УЛИЦЕ
    //
    // Примеры:
    //
    // Под ограничения попали дома по улице Акулиничева:
    // 13, 13А
    //
    // Под отключение попали следующие дома по улице Халилова:
    // 32, 32А, 32Б, 44.
    //
    // Результат:
    //
    // "ул. Акулиничева - 13, 13А"
    //
    // "ул. Халилова - 32, 32А, 32Б, 44"
    // ---------------------------------------------------------

    const streetHouseMatches = [
        ...text.matchAll(
            /(?:Под\s+ограничени[яе]|Под\s+отключени[ея])\s+попали\s+(?:следующие\s+)?дома\s+по\s+улице\s+([^:]+)\s*:\s*([\s\S]*?)(?=\s*(?:Ориентировочное|Аварийная|Аварийные|Дальнейшая|На\s+место|Работы|Всего\s+\d+|$))/iu
        )
    ];


    if (streetHouseMatches.length) {

        const addresses = [];


        for (const match of streetHouseMatches) {

            const street =
                match[1]
                    .trim()
                    .replace(/\s+/g, " ")
                    .replace(/^улица\s+/iu, "")
                    .trim();


            let houses =
                match[2]
                    .trim()
                    .replace(/\s+/g, " ")
                    .replace(/[.,;]+$/u, "")
                    .trim();


            if (!street || !houses) {
                continue;
            }


            // Защита от захвата следующего текста
            houses =
                houses
                    .replace(
                        /\s+(?:Ориентировочное|Аварийная|Аварийные|Дальнейшая|На\s+место|Работы|Всего\s+\d+).*$/iu,
                        ""
                    )
                    .trim();


            addresses.push(
                `ул. ${street} - ${houses}`
            );
        }


        if (addresses.length) {

            result.addresses =
                unique(addresses);

            result.address_source =
                "telegram";
        }
    }


    // ---------------------------------------------------------
    // 11.2 ОБЫЧНЫЕ АДРЕСА
    //
    // Этот блок используется только если специальный
    // парсер домов по улице ничего не нашёл.
    // ---------------------------------------------------------

    const addressPatterns = [

        /(?:Под\s+отключени[ея](?:\s+частично)?\s+(?:попали|попадает|попадают))(?:\s+следующие)?(?:\s+адреса|\s+улицы)?\s*:\s*([\s\S]*?)(?=(?:Ориентировочное|Аварийная|Аварийные|Дальнейшая|На\s+место|Работы\s+проводятся|Работы\s+заверш|Всего\s+\d+|$))/iu,


        /(?:Под\s+ограничени[яе](?:\s+частично)?\s+(?:попали|попадает|попадают))(?:\s+следующие)?(?:\s+адреса|\s+улицы)?\s*:\s*([\s\S]*?)(?=(?:Ориентировочное|Аварийная|Аварийные|Дальнейшая|На\s+место|Работы\s+проводятся|Работы\s+заверш|Всего\s+\d+|$))/iu,


        /Под\s+ограничения\s+частично\s+попали\s+следующие\s+улицы\s*:\s*([\s\S]*?)(?=(?:Ориентировочное|Аварийная|Дальнейшая|На\s+место|Работы|$))/iu,


        /Под\s+ограничения\s+частично\s+попали\s+следующие\s+адреса\s*:\s*([\s\S]*?)(?=(?:Ориентировочное|Аварийная|Дальнейшая|На\s+место|Работы|$))/iu,


        /ограничение\s+электроснабжения\s+по\s+следующим\s+адресам\s*:\s*([\s\S]*?)(?=(?:Ориентировочное|Аварийная|Дальнейшая|На\s+место|Работы|$))/iu,


        /следующие\s+адреса\s*:\s*([\s\S]*?)(?=(?:Ориентировочное|Аварийная|Дальнейшая|На\s+место|Работы|$))/iu
    ];


    let addressMatch = null;


    for (const pattern of addressPatterns) {

        const match =
            text.match(pattern);


        if (match) {

            addressMatch =
                match;

            break;
        }
    }


    // ВАЖНО:
    // Не перезаписываем уже найденные адреса
    // из блока "дома по улице".

    if (
        addressMatch &&
        result.addresses.length === 0
    ) {

        let addressesText =
            addressMatch[1];


        // -----------------------------------------------------
        // Очистка
        // -----------------------------------------------------

        addressesText =
            addressesText

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


        // -----------------------------------------------------
        // Нормализация дефисов
        // -----------------------------------------------------

        addressesText =
            addressesText
                .replace(/\s*[-–—]\s*/g, " - ")
                .replace(/\s+/g, " ")
                .trim();


        // -----------------------------------------------------
        // Разбивка по запятым
        // -----------------------------------------------------

        let addresses =
            addressesText
                .split(/\s*,\s*/)
                .map(address => address.trim())
                .filter(Boolean);


        // -----------------------------------------------------
        // Объединение номеров домов
        // -----------------------------------------------------

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


        // -----------------------------------------------------
        // Обработка "и"
        // -----------------------------------------------------

        addresses =
            addresses.flatMap(address => {

                if (
                    /\s+и\s+(?=ул\.|улиц|мкр\.|пер\.|просп|пл\.|дом)/iu.test(address)
                ) {

                    return address
                        .split(/\s+и\s+(?=ул\.|улиц|мкр\.|пер\.|просп|пл\.|дом)/iu)
                        .map(x => x.trim())
                        .filter(Boolean);
                }


                return [address];
            });


        // -----------------------------------------------------
        // Удаление мусора
        // -----------------------------------------------------

        addresses =
            addresses.filter(address => {

                if (/^ул\.?$/iu.test(address)) {
                    return false;
                }


                if (/^адреса$/iu.test(address)) {
                    return false;
                }


                if (/^улицы$/iu.test(address)) {
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


                if (address.length < 3) {
                    return false;
                }


                return true;
            });


        result.addresses =
            unique(addresses);


        if (result.addresses.length) {

            result.address_source =
                "telegram";
        }
    }


    // =========================================================
    // 12. ПРОВЕРКА АДРЕСОВ
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
    // 13. FALLBACK: feederMap
    // =========================================================
    //
    // Для ТП feederMap НЕ используется.
    // =========================================================

    if (
        badAddresses &&
        result.feeders.length &&
        result.transformer_points.length === 0
    ) {

        const mappedAddresses = [];


        for (const feeder of result.feeders) {

            if (feederMap[feeder]) {

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


                if (feederMap[number]) {

                    mappedAddresses.push(
                        ...feederMap[number]
                    );
                }
            }
        }


        if (mappedAddresses.length) {

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
        unique(result.feeders);


    result.transformer_points =
        unique(result.transformer_points);


    result.feeder =
        result.feeders[0] || null;


    result.transformer_point =
        result.transformer_points[0] || null;


    // =========================================================
    // 15. ФИНАЛЬНЫЙ ВЫВОД
    // =========================================================

    console.log(
        "РАСПАРСЕНО ОТКЛЮЧЕНИЕ:",
        {
            feeders: result.feeders,

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


module.exports = parseOutage;