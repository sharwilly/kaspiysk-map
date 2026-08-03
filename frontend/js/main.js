const API_URL = "https://kaspiysk-map-1.onrender.com";


fetch(`${API_URL}/outages`)
.then(response => response.json())
.then(data => {


    const summary =
    document.getElementById("outageSummary");


    if (!data.length) {

        summary.innerHTML =
        "🟢 Активных отключений нет";

        return;

    }


    const last = data[0];


    summary.innerHTML = `

    🔴 Активных отключений:
    ${data.length}

    <br>

    Последнее:
    Фидер-${last.feeder}

    `;


})
.catch(error => {

    console.log(error);

});

function loadProblemsSummary(){

    fetch(`${API_URL}/problems/counts`)
    .then(response => response.json())
    .then(data => {

        const count = data.active;

        let icon = "🟢";


        if(count >= 50 && count < 100){

            icon = "🟡";

        }


        if(count >= 100){

            icon = "🔴";

        }


        document.getElementById("problemsSummary").innerHTML =
            `${icon} Количество проблем: ${count}`;

    })
    .catch(error => {

        console.error(error);

        document.getElementById("problemsSummary").innerHTML =
            "⚪ Нет данных";

    });

}

loadProblemsSummary();

const problemsSummary = document.getElementById("problemsSummary");

if (problemsSummary) {

    loadProblemsSummary();

}

const outageSummary = document.getElementById("outageSummary");

if (outageSummary) {

    loadOutagesSummary();

}