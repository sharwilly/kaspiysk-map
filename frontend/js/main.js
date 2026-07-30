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