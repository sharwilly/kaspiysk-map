const saveOutage = require("./saveOutage");


const outage = {

    type: "электричество",
    feeder: "4",
    substation: "",
    description: "Аварийное отключение. Обрыв линии электропередачи",
    addresses: [
        "ул. Омарова",
        "ул.Батманова",
        "ул.Насрутдинова"
    ],
    restore_time: null,
    status: "active"

};


saveOutage(outage);