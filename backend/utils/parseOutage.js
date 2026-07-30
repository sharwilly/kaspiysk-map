function parseOutage(text) {

    const result = {
        type: "электричество",
        feeder: null,
        substation: "",
        description: "",
        addresses: [],
        restore_time: null,
        status: "active"
    };


    // Фидер
    const feederMatch = text.match(/Фидер[а-я]*[-\s]*(\d+)/i);

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
        text.match(/(?:до|восстановления|работ -)\s*(\d{1,2}:\d{2})/i);


    if (timeMatch) {
        result.restore_time = timeMatch[1];
    }


    // Адреса
    const addressMatch =
        text.match(/(?:адреса:|улицы:|попали следующие адреса:)(.*)/i);


    if (addressMatch) {

        result.addresses = addressMatch[1]
            .replace(" и ", ", ")
            .split(",")
            .map(a => a.trim().replace(/\.$/, ""))
            .filter(Boolean);

    }


    return result;

}


module.exports = parseOutage;