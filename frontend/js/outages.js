const API = API_URL;


const container =
    document.getElementById("outagesList");


const buttons =
    document.querySelectorAll(".tab-button");


const activeCount =
    document.getElementById("activeCount");


const monthCount =
    document.getElementById("monthCount");


const feederCount =
    document.getElementById("feederCount");


const addressCount =
    document.getElementById("addressCount");


const chart =
    document.getElementById("outageChart");


let activeOutages = [];

let doneOutages = [];


/* =========================
   БЕЗОПАСНЫЙ HTML
========================= */

function escapeHtml(value) {

    if (
        value === null ||
        value === undefined
    ) {
        return "";
    }


    return String(value)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");

}


/* =========================
   ЗАГРУЗКА ВСЕХ ДАННЫХ
========================= */

async function loadAllData() {

    try {

        const [
            activeResponse,
            doneResponse
        ] = await Promise.all([

            fetch(
                `${API_URL}/outages`
            ),

            fetch(
                `${API_URL}/outages/done`
            )

        ]);


        if (!activeResponse.ok) {

            throw new Error(
                `Ошибка /outages: ${activeResponse.status}`
            );

        }


        if (!doneResponse.ok) {

            throw new Error(
                `Ошибка /outages/done: ${doneResponse.status}`
            );

        }


        activeOutages =
            await activeResponse.json();


        doneOutages =
            await doneResponse.json();


        console.log(
            "Активные отключения:",
            activeOutages
        );


        console.log(
            "Решенные отключения:",
            doneOutages
        );


        updateAnalytics();


        renderOutages(
            activeOutages,
            "active"
        );


    } catch (error) {

        console.error(
            "Ошибка загрузки отключений:",
            error
        );


        if (container) {

            container.innerHTML =
                "<p>Ошибка загрузки данных</p>";

        }

    }

}


/* =========================
   АНАЛИТИКА
========================= */

function updateAnalytics() {

    const allOutages = [

        ...activeOutages,

        ...doneOutages

    ];


    const now =
        new Date();


    const monthStart =
        new Date(now);


    monthStart.setDate(
        now.getDate() - 30
    );


    const monthOutages =
        allOutages.filter(
            outage => {

                if (!outage.created_at) {

                    return false;

                }


                const date =
                    new Date(
                        outage.created_at
                    );


                if (
                    Number.isNaN(
                        date.getTime()
                    )
                ) {

                    return false;

                }


                return date >= monthStart;

            }
        );


    /* =========================
       АКТИВНЫЕ
    ========================= */

    if (activeCount) {

        activeCount.textContent =
            activeOutages.length;

    }


    /* =========================
       ЗА 30 ДНЕЙ
    ========================= */

    if (monthCount) {

        monthCount.textContent =
            monthOutages.length;

    }


    /* =========================
       УНИКАЛЬНЫЕ ФИДЕРЫ
    ========================= */

    const feeders =
        new Set();


    monthOutages.forEach(
        outage => {

            if (
                outage.feeder !== null &&
                outage.feeder !== undefined &&
                String(outage.feeder).trim() !== ""
            ) {

                feeders.add(
                    String(
                        outage.feeder
                    ).trim()
                );

            }

        }
    );


    if (feederCount) {

        feederCount.textContent =
            feeders.size;

    }


    /* =========================
       УНИКАЛЬНЫЕ АДРЕСА
    ========================= */

    const addresses =
        new Set();


    monthOutages.forEach(
        outage => {

            if (
                !Array.isArray(
                    outage.addresses
                )
            ) {

                return;

            }


            outage.addresses.forEach(
                address => {

                    if (
                        address !== null &&
                        address !== undefined &&
                        String(address).trim() !== ""
                    ) {

                        addresses.add(
                            String(
                                address
                            ).trim()
                        );

                    }

                }
            );

        }
    );


    if (addressCount) {

        addressCount.textContent =
            addresses.size;

    }


    /* =========================
       ГРАФИК
    ========================= */

    renderChart(
        monthOutages
    );

}


/* =========================
   ГРАФИК ЗА 30 ДНЕЙ
========================= */

function renderChart(data) {

    if (!chart) {

        return;

    }


    const days = [];


    const today =
        new Date();


    for (
        let i = 29;
        i >= 0;
        i--
    ) {

        const date =
            new Date(today);


        date.setHours(
            0,
            0,
            0,
            0
        );


        date.setDate(
            today.getDate() - i
        );


        days.push(
            date
        );

    }


    const counts =
        days.map(
            day => {

                return data.filter(
                    outage => {

                        if (
                            !outage.created_at
                        ) {

                            return false;

                        }


                        const date =
                            new Date(
                                outage.created_at
                            );


                        if (
                            Number.isNaN(
                                date.getTime()
                            )
                        ) {

                            return false;

                        }


                        return (

                            date.getFullYear()
                            ===
                            day.getFullYear()

                            &&

                            date.getMonth()
                            ===
                            day.getMonth()

                            &&

                            date.getDate()
                            ===
                            day.getDate()

                        );

                    }
                ).length;

            }
        );


    const max =
        Math.max(
            ...counts,
            1
        );


    chart.innerHTML =
        days.map(
            (day, index) => {

                const count =
                    counts[index];


                const height =
                    count === 0

                        ? 3

                        : Math.max(
                            8,
                            (count / max) * 90
                        );


                const label =
                    `${String(
                        day.getDate()
                    ).padStart(2, "0")}.${String(
                        day.getMonth() + 1
                    ).padStart(2, "0")}`;


                return `

                    <div
                        class="chart-day"
                        title="${escapeHtml(
                            label
                        )}: ${count} отключений"
                    >

                        <div class="chart-count">
                            ${count || ""}
                        </div>


                        <div
                            class="chart-bar"
                            style="height:${height}px"
                        ></div>


                        <div class="chart-label">
                            ${escapeHtml(
                                label
                            )}
                        </div>

                    </div>

                `;

            }
        ).join("");

}


/* =========================
   ЗАГРУЗКА ОТКЛЮЧЕНИЙ
========================= */

async function loadOutages(
    type = "active"
) {

    if (container) {

        container.innerHTML =
            "Загрузка...";

    }


    let url;


    if (type === "done") {

        url =
            `${API_URL}/outages/done`;

    } else {

        url =
            `${API_URL}/outages`;

    }


    try {

        const response =
            await fetch(url);


        if (!response.ok) {

            throw new Error(
                `HTTP ${response.status}`
            );

        }


        const data =
            await response.json();


        renderOutages(
            data,
            type
        );


    } catch (error) {

        console.error(
            "Ошибка загрузки:",
            error
        );


        if (container) {

            container.innerHTML =
                "<p>Ошибка загрузки данных</p>";

        }

    }

}


/* =========================
   КАРТОЧКИ ОТКЛЮЧЕНИЙ
========================= */

function renderOutages(
    data,
    type
) {

    if (!container) {

        return;

    }


    if (!Array.isArray(data)) {

        container.innerHTML =
            "<p>Некорректный формат данных</p>";

        return;

    }


    if (data.length === 0) {

        container.innerHTML =

            type === "done"

                ? "<p>Решенных отключений нет</p>"

                : "<p>Активных отключений нет</p>";

        return;

    }


    container.innerHTML =

        data.map(
            outage => {

                const isDone =
                    type === "done";


                const statusText =
                    isDone

                        ? "✅ Отключение устранено"

                        : "🔴 Активное отключение";


                const feeder =
                    outage.feeder ||
                    "Не указан";


                const substation =
                    outage.substation ||
                    "Не указана";


                const description =
                    outage.description ||
                    "Информация отсутствует";


                const restoreTime =
                    outage.restore_time ||
                    "Не указано";


                const addresses =
                    Array.isArray(
                        outage.addresses
                    )

                        ? outage.addresses

                        : [];


                const addressHTML =

                    addresses.length

                        ?

                        `

                            <h3>
                                📍 Зона отключения
                            </h3>


                            <div class="address-list">

                                ${
                                    addresses
                                        .map(
                                            address =>
                                                `
                                                    <div>
                                                        ${escapeHtml(
                                                            address
                                                        )}
                                                    </div>
                                                `
                                        )
                                        .join("")
                                }

                            </div>

                        `

                        :

                        "";


                const dateHTML =

                    isDone &&
                    outage.created_at

                        ?

                        `

                            <p class="date">

                                📅 Зарегистрировано:

                                ${formatDate(
                                    outage.created_at
                                )}

                            </p>

                        `

                        :

                        "";


                return `

                    <div class="outage-card">

                        <h2
                            class="${
                                isDone
                                    ? "outage-done"
                                    : "outage-active"
                            }"
                        >

                            ${statusText}

                        </h2>


                        <div class="outage-meta">


                            <div
                                class="outage-meta-item"
                            >

                                <span>
                                    Фидер
                                </span>

                                <strong>
                                    ${escapeHtml(
                                        feeder
                                    )}
                                </strong>

                            </div>


                            <div
                                class="outage-meta-item"
                            >

                                <span>
                                    Подстанция
                                </span>

                                <strong>
                                    ${escapeHtml(
                                        substation
                                    )}
                                </strong>

                            </div>


                            <div
                                class="outage-meta-item"
                            >

                                <span>
                                    Тип
                                </span>

                                <strong>
                                    ${escapeHtml(
                                        description
                                    )}
                                </strong>

                            </div>


                            <div
                                class="outage-meta-item"
                            >

                                <span>
                                    Восстановление
                                </span>

                                <strong>
                                    ${escapeHtml(
                                        restoreTime
                                    )}
                                </strong>

                            </div>


                        </div>


                        ${addressHTML}


                        ${dateHTML}


                    </div>

                `;

            }
        ).join("");

}


/* =========================
   ФОРМАТ ДАТЫ
========================= */

function formatDate(
    value
) {

    const date =
        new Date(value);


    if (
        Number.isNaN(
            date.getTime()
        )
    ) {

        return "Неизвестно";

    }


    return date.toLocaleString(
        "ru-RU",
        {
            day: "2-digit",
            month: "2-digit",
            year: "numeric",
            hour: "2-digit",
            minute: "2-digit"
        }
    );

}


/* =========================
   ВКЛАДКИ
========================= */

buttons.forEach(
    button => {

        button.addEventListener(
            "click",
            () => {

                buttons.forEach(
                    btn => {

                        btn.classList.remove(
                            "active"
                        );

                    }
                );


                button.classList.add(
                    "active"
                );


                loadOutages(
                    button.dataset.tab
                );

            }
        );

    }
);


/* =========================
   ПЕРВАЯ ЗАГРУЗКА
========================= */

loadAllData();