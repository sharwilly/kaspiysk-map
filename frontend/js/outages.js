const API_URL = "https://kaspiysk-map-1.onrender.com";


const container =
document.getElementById("outagesList");


const buttons =
document.querySelectorAll(".tab-button");



async function loadOutages(type = "active"){


    container.innerHTML =
    "Загрузка...";


    let url;


    if(type === "done"){

        url = `${API_URL}/outages/done`;

    } else {

        url = `${API_URL}/outages`;

    }



    try {


        const response =
        await fetch(url);


        const data =
        await response.json();



        renderOutages(data, type);



    } catch(error){


        console.error(error);


        container.innerHTML =
        "<p>Ошибка загрузки данных</p>";

    }

}





function renderOutages(data, type){


    if(data.length === 0){


        container.innerHTML =

        type === "done"

        ?
        "<p>Решенных отключений нет</p>"

        :
        "<p>Активных отключений нет</p>";


        return;

    }



    container.innerHTML = data.map(outage => `



<div class="outage-card">


<h2>
⚡ Фидер-${outage.feeder || "не указан"}
</h2>



<p class="${type === "done" ? "outage-done" : "outage-active"}">


${type === "done"

?
"✅ Отключение устранено"

:

"🔴 Активное отключение"

}


</p>



<p>
${outage.description}
</p>



<p>
🕒 Время восстановления:
${outage.restore_time || "не указано"}
</p>



<h3>
📍 Затронутые улицы:
</h3>



<div class="address-list">

${
(outage.addresses || [])
.map(address =>
<div>${address}</div>
)
.join("")
}


</div>



${
type === "done"

?

`
<p class="date">
🗓 Создано:
${new Date(outage.created_at)
.toLocaleString("ru-RU")}
</p>
`

:

""

}



</div>



`).join("");



}





buttons.forEach(button=>{


button.addEventListener("click",()=>{


buttons.forEach(btn=>
btn.classList.remove("active")
);


button.classList.add("active");



loadOutages(
button.dataset.tab
);



});


});



// первая загрузка

loadOutages();