const feederMap = require("./feederMap");

function parseOutage(text) {

    const result = {
        type: "электричество",
        feeder: null,
        substation: "",
        description: "",
        addresses: [],
        address_source: null,
        restore_time: null,
        status: "active"
    };


    // =========================
    // Фидер
    // =========================

    const feederMatch = text.match(
        /Фидер[а-я]*\s*[-]?\s*(\d+)/i
    );

    if (feederMatch) {
        result.feeder = feederMatch[1];
    }



    // =========================
    // Описание
    // =========================

    if (/обрыв|земля на линии/i.test(text)) {

        result.description =
            "Аварийное отключение. Повреждение линии электропередачи";

    } else {

        result.description =
            "Аварийное отключение";

    }



    // =========================
    // Время восстановления
    // =========================

    const timeMatch = text.match(
        /(?:до|завершения.*?работ|работы.*?до|восстановления)[^\d]*(\d{1,2}:\d{2})/i
    );

    if (timeMatch) {

        result.restore_time = timeMatch[1];

    }



    // =========================
    // Поиск адресов
    // =========================

    const addressMatch = text.match(

        /(?:Под отключени(?:е|я)(?:\s+частично)?\s+(?:попали|попадает)|Под отключение попадают(?:\s+улицы)?|Под ограничения частично попали следующие улицы:|Под ограничения частично попали следующие адреса:|ограничение электроснабжения по следующим адресам:|следующие адреса:)\s*([\s\S]*?)(?=(?:Ориентировочное|Аварийная|Дальнейшая|На место|Работы|Всего\s+\d+|$))/i

    );



    if (addressMatch) {


        let addressesText = addressMatch[1];


        addressesText = addressesText

            .replace(/\r?\n/g, " ")

            .replace(/\s+/g, " ")

            // удаляем хвосты сообщений

            .replace(/Аварийная бригада.*$/i, "")

            .replace(/Дальнейшая информация.*$/i, "")

            .replace(/На место выехала.*$/i, "")

            .replace(/Работы проводятся.*$/i, "")

            .replace(/Ориентировочное.*$/i, "")

            .replace(/Всего\s+\d+.*$/i, "")

            .replace(/\.$/, "")

            .trim();



        result.addresses = [

            ...new Set(

                addressesText

                    .replace(/\s+и\s+/gi, ", ")

                    .split(",")

                    .map(a => a.trim())

                    .filter(a => a.length > 2)

            )

        ];



        if (result.addresses.length) {

            result.address_source = "telegram";

        }

    }



    // =========================
    // Проверка адресов
    // =========================

    const badAddresses =

        result.addresses.length === 0 ||

        result.addresses.some(address =>

            address.length < 4 ||

            /^ул\.?$/i.test(address) ||

            /аварийн|бригада|информация/i.test(address)

        );




    // =========================
    // Если Telegram дал мусор
    // берем карту фидеров
    // =========================

    if (

        badAddresses &&

        result.feeder &&

        feederMap[result.feeder]

    ) {


        result.addresses = [

            ...feederMap[result.feeder]

        ];


        result.address_source = "feederMap";

    }



    return result;

}


module.exports = parseOutage;