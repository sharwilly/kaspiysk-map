const API = "https://kaspiysk-map-1.onrender.com";

let currentMode = "active";

let currentData = [];

let filters = {
    search: "",
    status: "",
    priority: "",
    type: "",
};

const problemIcons = {

    "подтопление": "🌊",

    "мусор": "🗑",

    "яма": "🕳",

    "освещение": "💡",

    "другое": "❗"

};


async function apiRequest(url, options = {}) {

    options.headers = {
        "Content-Type": "application/json",
        "x-admin-key": localStorage.getItem("adminKey"),
        ...(options.headers || {})
    };


    const response = await fetch(
        API + url,
        options
    );


    return await response.json();
}

function loginAdmin(){

    const password =
        document.getElementById("adminPassword").value;


    localStorage.setItem(
        "adminKey",
        password
    );


    alert("Вход выполнен");

    location.reload();

}

function logoutAdmin(){

    localStorage.removeItem("adminKey");

    location.reload();

}

function getStatusText(status) {

    switch(status) {

        case "new":
            return "🚨 Новое";

        case "in_progress":
            return "⚙️ В работе";

        case "done":
            return "✅ Выполнено";

        default:
            return status;
    }

}

function getPriorityClass(priority) {

    switch(priority) {

        case "high":
            return "priority-high";

        case "medium":
            return "priority-medium";

        case "low":
            return "priority-low";

        default:
            return "";
    }

}

function getProblemTime(problem) {

    const created = new Date(problem.created_at);


    if (problem.status === "done" && problem.resolved_at) {

        const resolved = new Date(problem.resolved_at);

        const diff = resolved - created;


        const hours = Math.floor(
            diff / (1000 * 60 * 60)
        );


        const days = Math.floor(
            hours / 24
        );


        const restHours = hours % 24;


        if (days > 0) {

            return `✅ Решено за: ${days} д. ${restHours} ч.`;
        }
            
        return `✅ Решено за: ${hours} ч.`;

    }


    const now = new Date();

    const diff = now - created;


    const hours = Math.floor(
        diff / (1000 * 60 * 60)
    );


    const days = Math.floor(
        hours / 24
    );


    const restHours = hours % 24;


    if (days > 0) {

        return `⏳ Открыто: ${days} д. ${restHours} ч.`;

    }


    return `⏳ Открыто: ${hours} ч.`;

}

function getTypeText(type) {

    const types = {

        "подтопление": "Подтопление",
        "яма": "Яма",
        "мусор": "Мусор",
        "освещение": "Освещение",
        "другое": "Другое"

    };


    return types[type] || type;

}

function loadCounts() {

    fetch(`${API}/problems/counts`)
        .then(response => response.json())
        .then(data => {

            document.getElementById("activeCount").innerText = data.active;

            document.getElementById("archiveCount").innerText = data.archive;

        });
    fetch(`${API}/outages`)
    .then(r=>r.json())
    .then(data=>{

        document.getElementById("outagesCount").innerText =
            data.length;

    });

}


function loadActive() {

    currentMode = "active";

    Promise.all([

        fetch(`${API}/problems/active`)
            .then(r => r.json()),

        fetch(`${API}/outages`)
            .then(r => r.json())

    ])
    .then(([problems, outages]) => {


        const outageProblems = outages.map(outage => ({

            id: "outage_" + outage.id,

            type: "электричество",

            address:
                (outage.addresses || []).join(", "),

            description:
                outage.description,

            priority: "high",

            status:
                outage.status === "done"
                ?
                "done"
                :
                "new",

            outage: true,

            feeder:
                outage.feeder,

            created_at:
                outage.created_at,

            restore_time:
                outage.restore_time,

            addresses:
                outage.addresses

        }));


        const all = [
            ...problems,
            ...outageProblems
        ];


        document.getElementById("activeCount").innerText =
            all.length;


        currentData = all;


        updateTabs();

        renderFilters();

        connectFilterEvents();

        applyFilters();


    })
    .catch(error => {

        console.error(
            "Ошибка загрузки:",
            error
        );

        document.getElementById("problems").innerHTML =
            "Ошибка загрузки данных";

    });

}



function loadArchive() {

    currentMode = "archive";

    fetch(`${API}/problems/archive`)
        .then(response => response.json())
        .then(data => {


            document.getElementById("archiveCount").innerText = data.length;

            currentMode = "archive";
            
            currentData = data;

            updateTabs();

            renderFilters();

            connectFilterEvents();

            applyFilters();

        });

}

function refreshProblems(){

    if(currentMode === "active"){

        loadActive();

    }
    else{

        loadArchive();

    }

    loadCounts();

}

function createProblemCard(problem) {

    const photosHtml = (problem.photos || [])
    .map((photo, index) => `
        <img
            src="${photo}"
            class="problem-photo"
            onclick='openPhoto(${JSON.stringify(problem.photos)}, ${index})'
        >
    `)
    .join("");

    return `
    
    <div class="problem-card ${getPriorityClass(problem.priority)}">

        <div class="problem-top">

            <div class="problem-info">

                <h3>

                ${problemIcons[problem.type] || "❗"}
                ${getTypeText(problem.type)}

                </h3>

                <p>
                📍 ${problem.address || "Адрес неизвестен"}
                </p>
                ${
                problem.outage
                ?
                `
                <p>
                ⚡ Фидер-${problem.feeder}
                </p>

                <p>
                🕒 Восстановление:
                ${problem.restore_time || "не указано"}
                </p>
                `
                :
                ""
                }

                <p>
                🕒 Создано:
                ${new Date(problem.created_at).toLocaleString("ru-RU")}
                </p>

                <p>
                ${getProblemTime(problem)}
                </p>

                ${
                    problem.landmark
                    ?
                    `
                    <p>
                    🔎 Ориентир:
                    ${problem.landmark}
                    </p>
                    `
                    :
                    ""
                }

                <p>
                ${problem.description}
                </p>

            </div>

            <div class="photo-gallery">

                ${photosHtml}

            </div>

        </div>

        ${
        !problem.outage
        ?
        `
        <p>
        <a class="admin-button"
        href="admin_map.html?id=${problem.id}">
        📍 Открыть на карте
        </a>
        </p>
        `
        :
        ""
        }

        ${
        !problem.outage
        ?
        `
        <p>
            Приоритет:

            <select id="priority-${problem.id}">

                <option value="low"
                    ${problem.priority === "low" ? "selected" : ""}>
                    Низкий
                </option>

                <option value="medium"
                    ${problem.priority === "medium" ? "selected" : ""}>
                    Средний
                </option>

                <option value="high"
                    ${problem.priority === "high" ? "selected" : ""}>
                    Высокий
                </option>

            </select>


            <button 
            class="save-button"
            onclick="changePriority(${problem.id})">

                Сохранить

            </button>

        </p>
         `
        :
        ""
        }
        ${
        problem.outage && problem.status !== "done"
        ?
        `
        <button
        class="done-button"
        onclick="finishOutage(${problem.id})">

            Завершить вручную

        </button>
        `
        :
        ""
        }


        ${
            !problem.outage && problem.status === "new"
            ?
            `
            <button 
            class="work-button"
            onclick="changeStatus(${problem.id}, 'in_progress')">

                В работу

            </button>
            `
            :
            ""
        }


        ${
            !problem.outage && problem.status === "in_progress"
            ?
            `
            <button 
            class="done-button"
            onclick="finishProblem(${problem.id})">

                Выполнено

            </button>
            `
            :
            ""
        }

        


        ${
            !problem.outage && problem.status === "done"
            ?
            `
            <button 
            class="restore-button"
            onclick="restoreProblem(${problem.id})">

                Вернуть в активные

            </button>
            `
            :
            ""
        }


        ${
            problem.status === "done"
            ?
            `
            <p>
                Выполнено:
                ${
                    problem.resolved_at
                    ?
                    new Date(problem.resolved_at).toLocaleString()
                    :
                    "нет данных"
                }
            </p>

            <p>
                Комментарий:
                ${problem.resolution_comment}
            </p>
            `
            :
            ""
        }


    </div>

    `;

}

function showProblems(data) {
    
    console.log(data[0]);

    const container = document.getElementById("problems");

    container.innerHTML = "";

    data.forEach(problem => {

        container.innerHTML += createProblemCard(problem);

    });

}

function applyFilters() {

    filters.search =
        document.getElementById("searchAddress").value;

    filters.status =
        document.getElementById("statusFilter")?.value || "";

    filters.priority =
        document.getElementById("priorityFilter")?.value || "";

    filters.type =
        document.getElementById("typeFilter")?.value || "";


    const filtered = currentData.filter(problem => {


        const addressMatch =
            (problem.address || "")
            .toLowerCase()
            .includes(filters.search.toLowerCase());


        const statusMatch =
            !filters.status ||
            problem.status === filters.status;

        const priorityMatch =
            !filters.priority ||
            problem.priority === filters.priority;


        const typeMatch =
            !filters.type ||
            problem.type === filters.type;

        return addressMatch && statusMatch && priorityMatch && typeMatch;


    });


    showProblems(filtered);

}

function updateTabs() {

    document
        .getElementById("activeTab")
        .classList
        .toggle(
            "active",
            currentMode === "active"
        );

    document
        .getElementById("outagesTab")
        .classList
        .toggle(
            "active",
            currentMode === "outages"
        );

    document
        .getElementById("archiveTab")
        .classList
        .toggle(
            "active",
            currentMode === "archive"
        );

}

function renderFilters() {

    const container =
        document.getElementById("filters");

    if (currentMode === "active") {

        container.innerHTML = `

            <div class="filters">

                <input
                    id="searchAddress"
                    value = "${filters.search}"
                    type="text"
                    placeholder="🔎 Поиск по адресу">

                <select id="statusFilter">

                    <option value="">
                        Все статусы
                    </option>

                    <option value="new">
                        Новые
                    </option>

                    <option value="in_progress">
                        В работе
                    </option>

                </select>

                <select id="priorityFilter">

                    <option value="">
                        Все приоритеты
                    </option>

                    <option value="high">
                        Высокий
                    </option>

                    <option value="medium">
                        Средний
                    </option>

                    <option value="low">
                        Низкий
                    </option>

                </select>

                <select id="typeFilter">

                    <option value="">
                        Все типы
                    </option>

                    <option value="подтопление">
                        🌊 Подтопление
                    </option>

                    <option value="яма">
                        🕳 Яма
                    </option>

                    <option value="мусор">
                        🗑 Мусор
                    </option>

                    <option value="освещение">
                        💡 Освещение
                    </option>

                    <option value="другое">
                        ❗ Другое
                    </option>

                </select>

            </div>

        `;

        document.getElementById("searchAddress").value = filters.search;

        const status = document.getElementById("statusFilter");
        if (status) {
            status.value = filters.status;
        }

        const priority = document.getElementById("priorityFilter");
        if (priority) {
            priority.value = filters.priority;
        }

        const type = document.getElementById("typeFilter");
        if (type) {
            type.value = filters.type;
        }

    }

    else {

        container.innerHTML = `

            <div class="filters">

                <input
                    id="searchAddress"
                    value="${filters.search}"
                    type="text"
                    placeholder="🔎 Поиск по адресу">

            </div>

        `;

    }

}

function connectFilterEvents() {


    const search =
        document.getElementById("searchAddress");


    if (search) {

        search.addEventListener(
            "input",
            applyFilters
        );

    }


    const status =
        document.getElementById("statusFilter");


    if (status) {

        status.addEventListener(
            "change",
            applyFilters
        );

    }

    const priority =
        document.getElementById("priorityFilter");


    if (priority) {

        priority.addEventListener(
            "change",
            applyFilters
        );

    }

    const type =
        document.getElementById("typeFilter");


    if (type) {

        type.addEventListener(
            "change",
            applyFilters
        );

    }


}

function loadOutages(){

    currentMode="outages";

    fetch(`${API}/outages`)
    .then(r => r.json())
    .then(data => {

        currentData = data.map(outage => ({
            id: outage.id,
            outage: true,
            type: "электричество",
            feeder: outage.feeder,
            address: outage.addresses.join(", "),
            description: outage.description,
            status: outage.status,
            created_at: outage.created_at,
            restore_time: outage.restore_time
        }));

        document.getElementById("outagesCount").innerText = data.length;

        updateTabs();
        renderFilters();
        connectFilterEvents();
        applyFilters();

    });

}


async function changeStatus(id, status) {


    const result = await apiRequest(
        `/problems/${id}`,
        {
            method: "PUT",

            body: JSON.stringify({
                status: status
            })
        }
    );


    alert(
        "Статус изменён: " + result.status
    );

    refreshProblems();

}

async function finishProblem(id) {

    const comment = prompt(
        "Что было сделано?"
    );


    if (!comment) {
        return;
    }

    const result = await apiRequest(
        `/problems/${id}`,
        {
            method: "PUT",

            body: JSON.stringify({

                status: "done",

                resolution_comment: comment

            })
        }
    );


    alert(
        "Проблема закрыта"
    );

    refreshProblems();

}

async function changePriority(id) {

    const priority =
        document.getElementById(
            `priority-${id}`
        ).value;


    const result = await apiRequest(
        `/problems/${id}/priority`,
        {
            method:"PUT",

            body:JSON.stringify({
                priority
            })
        }
    );

}

refreshProblems();

async function restoreProblem(id) {


    const result = await apiRequest(
        `/problems/${id}/restore`,
        {
            method: "PUT"
        }
    );


    alert("Проблема возвращена в активные");

    refreshProblems();

}

async function finishOutage(id){

    if(!confirm("Закрыть отключение?")){
        return;
    }

    await apiRequest(`/outages/${id}/done`,{
        method:"PUT"
    });

    loadCounts();
    loadOutages();

}

let currentPhotos = [];
let currentPhotoIndex = 0;
let currentOverlay = null;

function openPhoto(photos, index){

    currentPhotos = photos;
    currentPhotoIndex = index;

    currentOverlay = document.createElement("div");
    currentOverlay.className = "photo-overlay";

    currentOverlay.innerHTML = `
        <button class="photo-prev">❮</button>

        <img class="photo-full">

        <button class="photo-next">❯</button>

        <div class="photo-counter"></div>
    `;

    currentOverlay.onclick = function(e){

        if(e.target === currentOverlay){
            currentOverlay.remove();
        }

    };

    document.body.appendChild(currentOverlay);

    currentOverlay
    .querySelector(".photo-prev")
    .onclick = function(e){

        e.stopPropagation();

        currentPhotoIndex =
            (currentPhotoIndex - 1 + currentPhotos.length) %
            currentPhotos.length;

        showPhoto();

    };


    currentOverlay
    .querySelector(".photo-next")
    .onclick = function(e){

        e.stopPropagation();

        currentPhotoIndex =
            (currentPhotoIndex + 1) %
            currentPhotos.length;

        showPhoto();

    };

    showPhoto();

}

function showPhoto(){

    currentOverlay
        .querySelector(".photo-full")
        .src =
            currentPhotos[currentPhotoIndex];


    currentOverlay
        .querySelector(".photo-counter")
        .textContent =
            `${currentPhotoIndex + 1} / ${currentPhotos.length}`;

}

document.addEventListener("keydown", function(e){

    if(!currentOverlay){
        return;
    }

    if(e.key === "Escape"){

        currentOverlay.remove();
        currentOverlay = null;
        return;

    }

    if(e.key === "ArrowRight"){

        currentPhotoIndex =
            (currentPhotoIndex + 1) %
            currentPhotos.length;

        showPhoto();

    }

    if(e.key === "ArrowLeft"){

        currentPhotoIndex =
            (currentPhotoIndex - 1 + currentPhotos.length) %
            currentPhotos.length;

        showPhoto();

    }

});