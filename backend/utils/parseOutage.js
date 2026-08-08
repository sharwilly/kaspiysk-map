const feederMap = require("./feederMap");

function parseOutage(text) {

    // =========================================================
    // Нормализация текста
    // =========================================================

    text = String(text || "")
        .replace(/\r?\n/g, " ")
        .replace(/\s+/g, " ")
        .trim();


    // =========================================================
    // Результат
    // =========================================================

    const result = {
        type: "электричество",

        // Первый фидер — для совместимости со старым кодом
        feeder: null,

        // Все найденные фидеры
        feeders: [],

        substation: "",

        description: "",

        addresses: [],

        address_source: null,

        restore_time: null,

        // active / completed
        status: "active",

        // planned / emergency
        outage_type: null
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

        // ЗТМ 3 -> ЗТМ-3
        // ЗТМ-3 -> ЗТМ-3
        // 3 -> 3

        const ztmMatch = value.match(/^ЗТМ\s*-?\s*(\d+)$/i);

        if (ztmMatch) {
            return `ЗТМ-${ztmMatch[1]}`;
        }

        return value;
    }


    function addFeeder(value) {

        const feeder = normalizeFeeder(value);

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
        Фидерам 3,5,7
        Фидерам ЗТМ 3,5,7,9,15
        Фидеры ЗТМ-3, ЗТМ-5
        Фидер ЗТМ 3
    */


    // ---------------------------------------------------------
    // 1. Вариант:
    //
    // Фидерам ЗТМ 3,5,7,9,15
    // Фидеры ЗТМ-3, ЗТМ-5
    // ---------------------------------------------------------

    const feederZtmMatches = [

        ...text.matchAll(
            /Фидер[а-я]*\s+(?:ЗТМ\s*-?\s*)?((?:\d+\s*[,;]\s*)+\d+)/giu
        )

    ];


    for (const match of feederZtmMatches) {

        const numbers = match[1]
            .split(/[,;]/)
            .map(x => x.trim())
            .filter(Boolean);

        for (const number of numbers) {

            // Проверяем, был ли перед цифрами ЗТМ
            const before = match[0]
                .substring(
                    0,
                    match[0].indexOf(match[1])
                );

            if (/ЗТМ/i.test(before)) {
                addFeeder(`ЗТМ-${number}`);
            } else {
                addFeeder(number);
            }
        }
    }


    // ---------------------------------------------------------
    // 2. Отдельные конструкции:
    //
    // Фидер ЗТМ-3
    // Фидер ЗТМ 3
    // Фидер-ЗТМ-3
    // ---------------------------------------------------------

    const singleZtmMatches = [

        ...text.matchAll(
            /Фидер[а-я]*\s*-?\s*ЗТМ\s*-?\s*(\d+)/giu
        )

    ];


    for (const match of singleZtmMatches) {
        addFeeder(`ЗТМ-${match[1]}`);
    }


    // ---------------------------------------------------------
    // 3. Обычные фидеры:
    //
    // Фидер 3
    // Фидер-3
    // Фидеры 3, 5, 7
    //
    // Здесь не добавляем ЗТМ автоматически.
    // ---------------------------------------------------------

    const normalFeederMatches = [

        ...text.matchAll(
            /Фидер[а-я]*\s*-?\s*(\d+(?:\s*[,;]\s*\d+)*)/giu
        )

    ];


    for (const match of normalFeederMatches) {

        const numbers = match[1]
            .split(/[,;]/)
            .map(x => x.trim())
            .filter(Boolean);

        for (const number of numbers) {

            // Если этот номер уже был добавлен как ЗТМ,
            // не добавляем второй вариант.
            if (!result.feeders.includes(`ЗТМ-${number}`)) {
                addFeeder(number);
            }
        }
    }


    // ---------------------------------------------------------
    // Убираем дубли
    // ---------------------------------------------------------

    result.feeders = unique(result.feeders);

    result.feeder = result.feeders[0] || null;


    // =========================================================
    // ТИП ОТКЛЮЧЕНИЯ
    // =========================================================

    const isPlanned =

        /планов(?:ое|ая|ому|ым|ых)/iu.test(text) ||

        /планов[а-я]* отключен/iu.test(text) ||

        /планов[а-я]* работ/iu.test(text) ||

        /плановые работы/iu.test(text);


    const isEmergency =

        /аварийн/iu.test(text) ||

        /обрыв/iu.test(text) ||

        /земля на линии/iu.test(text) ||

        /повреждени[ея].*(?:линии|кабел)/iu.test(text) ||

        /аварийно/iu.test(text);


    if (isPlanned) {

        result.outage_type = "planned";

        result.description =
            "Плановое отключение электроэнергии";

    } else if (isEmergency) {

        result.outage_type = "emergency";

        if (/обрыв|земля на линии|повреждени[ея]/iu.test(text)) {

            result.description =
                "Аварийное отключение. Повреждение линии электропередачи";

        } else {

            result.description =
                "Аварийное отключение";
        }

    } else {

        // Если тип не указан явно
        result.outage_type = "emergency";

        result.description =
            "Отключение электроэнергии";
    }


    // =========================================================
    // ОКОНЧАНИЕ РАБОТ
    // =========================================================

    /*
        Распознаём сообщения вроде:

        Аварийные работы завершены
        Работы завершены
        Работы окончены
        Электроснабжение восстановлено
        Электроснабжение восстановлено в полном объёме
        Ограничение снято
        Подача электроэнергии восстановлена
    */

    const isCompleted =

        /работ[а-я]*\s+(?:завершен|оконч|законч)/iu.test(text) ||

        /завершен[а-я]*\s+(?:аварийн|ремонтн|восстановительн)[а-я]*\s+работ/iu.test(text) ||

        /электроснабжени[ея]\s+(?:полностью\s+)?восстановлен/iu.test(text) ||

        /подача\s+электроэнергии\s+восстановлен/iu.test(text) ||

        /электроэнергия\s+(?:полностью\s+)?восстановлен/iu.test(text) ||

        /ограничени[ея]\s+(?:электроснабжения\s+)?снят/iu.test(text) ||

        /аварийн(?:ые|ых)\s+работ[ыа]\s+(?:завершен|оконч|законч)/iu.test(text);


    if (isCompleted) {

        result.status = "completed";

        result.description =
            "Электроснабжение восстановлено";
    }


    // =========================================================
    // ПОДСТАНЦИЯ
    // =========================================================

    /*
        Например:

        на ПС 110 кВ ЗТМ
        на ПС 110кВ ЗТМ
        на подстанции ЗТМ
    */

    const substationMatch = text.match(
        /(?:ПС|подстанци[яи])\s*(?:[-–—]?\s*)?(\d+\s*кВ)?\s*([А-ЯA-ZЁ0-9-]{2,})/iu
    );


    if (substationMatch) {

        const voltage = substationMatch[1]
            ? substationMatch[1].replace(/\s+/g, " ")
            : "";

        const name = substationMatch[2];

        result.substation = `ПС${voltage ? " " + voltage : ""} ${name}`
            .replace(/\s+/g, " ")
            .trim();
    }


    // Более простой fallback для ПС 110 кВ ЗТМ
    if (!result.substation) {

        const simpleSubstation = text.match(
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

    /*
        Поддерживаем:

        до 13:30
        работы до 13:30
        завершения работ - 13:30
        ориентировочное время завершения работ - 13:30
        восстановление в 13:30
    */

    const timePatterns = [

        /ориентировочное\s+время\s+завершения\s+работ[^\d]*(\d{1,2}:\d{2})/iu,

        /время\s+завершения\s+работ[^\d]*(\d{1,2}:\d{2})/iu,

        /завершения\s+работ[^\d]*(\d{1,2}:\d{2})/iu,

        /работ[а-я]*\s+до[^\d]*(\d{1,2}:\d{2})/iu,

        /восстановлен[а-я]*[^\d]*(\d{1,2}:\d{2})/iu,

        /до[^\d]*(\d{1,2}:\d{2})/iu,

        /в\s+(\d{1,2}:\d{2})/iu
    ];


    for (const pattern of timePatterns) {

        const match = text.match(pattern);

        if (match) {

            result.restore_time = match[1];

            break;
        }
    }


    // =========================================================
    // ПОИСК АДРЕСОВ
    // =========================================================

    /*
        Поддерживаем конструкции:

        Под отключение попали следующие адреса:
        Под отключение попали:
        Под отключение попадают:
        Под ограничения частично попали следующие улицы:
        Под ограничения частично попали следующие адреса:
        ограничение электроснабжения по следующим адресам:
        следующие адреса:
    */

    const addressPatterns = [

        /(?:Под отключени(?:е|я)(?:\s+частично)?\s+(?:попали|попадает|попадают))(?:\s+следующие)?(?:\s+адреса|\s+улицы)?\s*:\s*([\s\S]*?)(?=(?:Ориентировочное|Аварийная|Аварийные|Дальнейшая|На место|Работы проводятся|Работы заверш|Всего\s+\d+|$))/iu,

        /Под ограничения частично попали следующие улицы\s*:\s*([\s\S]*?)(?=(?:Ориентировочное|Аварийная|Дальнейшая|На место|Работы|$))/iu,

        /Под ограничения частично попали следующие адреса\s*:\s*([\s\S]*?)(?=(?:Ориентировочное|Аварийная|Дальнейшая|На место|Работы|$))/iu,

        /ограничение электроснабжения по следующим адресам\s*:\s*([\s\S]*?)(?=(?:Ориентировочное|Аварийная|Дальнейшая|На место|Работы|$))/iu,

        /следующие адреса\s*:\s*([\s\S]*?)(?=(?:Ориентировочное|Аварийная|Дальнейшая|На место|Работы|$))/iu
    ];


    let addressMatch = null;


    for (const pattern of addressPatterns) {

        const match = text.match(pattern);

        if (match) {

            addressMatch = match;

            break;
        }
    }


    if (addressMatch) {

        let addressesText = addressMatch[1];


        // =====================================================
        // Очистка адресов
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

            .replace(/\.$/, "")

            .trim();


        // =====================================================
        // Разбиваем адреса
        // =====================================================

        let addresses = addressesText

            .replace(/\s+и\s+/giu, ", ")

            .split(",")

            .map(address => address.trim())

            .filter(address => address.length > 2);


        // =====================================================
        // Удаляем явно не являющийся адресом мусор
        // =====================================================

        addresses = addresses.filter(address => {

            if (/^ул\.?$/iu.test(address)) {
                return false;
            }

            if (/^адреса$/iu.test(address)) {
                return false;
            }

            if (/^улицы$/iu.test(address)) {
                return false;
            }

            if (/аварийн(?:ая|ые|ой|ых)/iu.test(address)) {
                return false;
            }

            if (/дальнейшая информация/iu.test(address)) {
                return false;
            }

            if (/работы проводятся/iu.test(address)) {
                return false;
            }

            return true;
        });


        result.addresses = unique(addresses);


        if (result.addresses.length) {

            result.address_source = "telegram";
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

            /аварийн|бригада|информация/i.test(address)
        );


    // =========================================================
    // FALLBACK: feederMap
    // =========================================================

    /*
        Если Telegram не дал нормальные адреса,
        пытаемся получить их из feederMap.

        Для нескольких фидеров объединяем адреса всех фидеров.
    */

    if (badAddresses && result.feeders.length) {

        const mappedAddresses = [];


        for (const feeder of result.feeders) {

            if (feederMap[feeder]) {

                mappedAddresses.push(
                    ...feederMap[feeder]
                );

                continue;
            }


            // Если в feederMap ключ хранится без ЗТМ,
            // пробуем номер отдельно.

            const numberMatch = feeder.match(
                /(\d+)$/
            );


            if (numberMatch) {

                const number = numberMatch[1];

                if (feederMap[number]) {

                    mappedAddresses.push(
                        ...feederMap[number]
                    );
                }
            }
        }


        if (mappedAddresses.length) {

            result.addresses = unique(mappedAddresses);

            result.address_source = "feederMap";
        }
    }


    // =========================================================
    // ФИНАЛЬНАЯ НОРМАЛИЗАЦИЯ
    // =========================================================

    result.feeders = unique(
        result.feeders
    );


    result.feeder =
        result.feeders[0] || null;


    // Если это сообщение о завершении работ,
    // время восстановления уже фактически наступило,
    // поэтому restore_time оставляем только если оно явно указано.


    return result;
}


module.exports = parseOutage;