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


    // Фидер
    const feederMatch = text.match(/Фидер[а-я]*\s*[-]?\s*(\d+)/i);

    if (feederMatch) {
        result.feeder = feederMatch[1];
    }


    // Описание
    if (text.includes("обрыв")) {

        result.description =
            "Аварийное отключение. Обрыв линии электропередачи";

    } else {

        result.description =
            "Аварийное отключение";

    }


    // Время восстановления
    const timeMatch =
        text.match(/(?:до|восстановления|работ\s*-\s*|завершения.*?работ\s*-\s*)(\d{1,2}:\d{2})/i);


    if (timeMatch) {
        result.restore_time = timeMatch[1];
    }


    // Адреса

    // Вариант 1: "Затронутые улицы: ..."
    let addressMatch = text.match(
        /(?:адреса:|улицы:|попали(?:\s+частично)?(?:\s+следующие)?\s+адреса:?|Под отключения попали(?:\s+частично)?)([\s\S]*?)(?=\n(?:Ориентировочное|Аварийная бригада|Дальнейшая информация|На место выехала|Работы проводятся|$))/i
    );



    // Вариант 2: Telegram "Под отключения попали ..."
    if (!addressMatch) {

        addressMatch =
            text.match(/Под отключения попали\s+(.+?)(?:\.|Ориентировочное|$)/i);

    }


    if (addressMatch) {

        let addressesText = addressMatch[1];

        addressesText = addressesText
            .replace(/Аварийная бригада.*$/i, "")
            .replace(/Дальнейшая информация.*$/i, "")
            .replace(/Ориентировочное время.*$/i, "")
            .replace(/На место выехала.*$/i, "")
            .replace(/Работы проводятся.*$/i, "")
            .replace(/\.$/, "");

        result.addresses = addressesText
            .replace(/\s+и\s+/gi, ", ")
            .split(",")
            .map(a => a.trim())
            .filter(Boolean);

        if (result.addresses.length) {
            result.address_source = "telegram";
        }

    }

    // Если адреса не нашли или нашли некорректно — берём из словаря

    if (
        (!result.addresses.length ||
        result.addresses.some(a => a.length < 4)) &&
        result.feeder &&
        feederMap[result.feeder]
    ) {

        result.addresses = [...feederMap[result.feeder]];
        result.address_source = "feederMap";

    }


    return result;

}


module.exports = parseOutage;