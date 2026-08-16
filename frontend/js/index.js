const API = API_URL;


// ===============================
// ОТКЛЮЧЕНИЯ
// ===============================

fetch(`${API_URL}/outages`)
.then(response => response.json())
.then(data => {


    const summary =
    document.getElementById("outageSummary");


    const mini =
    document.getElementById("outagesCount");



    if(mini){

        mini.innerHTML = data.length;

    }



    if(summary){


        if (!data.length) {

            summary.innerHTML =
            "🟢 Активных отключений нет";

        }
        else {


            const last = data[0];


            summary.innerHTML = `

            🔴 Активных отключений:
            ${data.length}

            <br>

            Последнее:
            Фидер-${last.feeder}

            `;

        }

    }


})
.catch(error => {

    console.log(error);

});




// ===============================
// ПРОБЛЕМЫ
// ===============================

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



    const summary =
    document.getElementById("problemsSummary");


    if(summary){

        summary.innerHTML =
        `${icon} Количество проблем: ${count}`;

    }



    const mini =
    document.getElementById("problemsCount");


    if(mini){

        mini.innerHTML = count;

    }


})
.catch(error => {

    console.error(error);


    const summary =
    document.getElementById("problemsSummary");


    if(summary){

        summary.innerHTML =
        "⚪ Нет данных";

    }


});