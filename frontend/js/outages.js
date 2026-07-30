const API_URL = "https://kaspiysk-map-1.onrender.com";


fetch(`${API_URL}/outages`)

.then(response => response.json())

.then(data => {


const container =
document.getElementById("outagesList");



if(data.length === 0){

    container.innerHTML =
    "<p>Активных отключений нет</p>";

    return;

}



container.innerHTML = data.map(outage => `


<div class="outage-card">


<h2>
⚡ Фидер-${outage.feeder}
</h2>


<p class="outage-active">
🔴 Активное отключение
</p>


<p>
${outage.description}
</p>


<p>
🕒 Восстановление:
${outage.restore_time || "не указано"}
</p>



<h3>
📍 Затронутые улицы:
</h3>


<div class="address-list">

${outage.addresses
.map(address => `<div>${address}</div>`)
.join("")}


</div>


</div>


`).join("");



});