const parseOutage = require("./utils/parseOutage");

const tests = [

    {
        name: "Дома по улице",
        text: `
        Под отключение попали следующие дома по улице Халилова:
        32, 32А, 32Б, 44
        `
    },

    {
        name: "Обычные адреса",
        text: `
        Под ограничения частично попали следующие адреса:
        ул. Ленина, ул. Омарова, ул. Магомеджанова
        `
    },

    {
        name: "Одна улица + дома",
        text: `
        Под ограничения попали дома по улице Акулиничева:
        13, 13А
        `
    },

    {
        name: "ТП + адреса",
        text: `
        Аварийное отключение ТП 109 до 18:00.
        Под ограничения попали дома по улице Акулиничева:
        13, 13А
        `
    }

];


for (const test of tests) {

    console.log("\n======================================");
    console.log(test.name);
    console.log("======================================");

    const result = parseOutage(test.text);

    console.log("Адреса:");
    console.log(result.addresses);

    console.log("ТП:");
    console.log(result.transformer_points);

    console.log("Время:");
    console.log(result.restore_time);
}