const problemIcons = {

    "подтопление": "🌊",
    "мусор": "🗑",
    "яма": "🕳",
    "освещение": "💡"

};

function getProblemIcon(type) {
    return problemIcons[type] || "❗";
}

function getStatusName(status) {

    if (status === "new") return "🟡 Новая";
    if (status === "in_progress") return "🟠 В работе";
    if (status === "done") return "🟢 Выполнена";

    return status;

}


function createProblemMarker(problem) {

    let color;

    if (problem.status === "new") {
        color = "red";
    }
    else if (problem.status === "in_progress") {
        color = "orange";
    }
    else {
        color = "green";
    }

    const icon = problemIcons[problem.type] || "❗";

    let size = 32;

    if (problem.priority === "high") {
        size = 42;
    }
    else if (problem.priority === "medium") {
        size = 34;
    }

    return L.marker(
        [
            problem.latitude,
            problem.longitude
        ],
        {
            icon: L.divIcon({

                className: "",

                html: `
                    <div style="
                        background:${color};
                        width:${size}px;
                        height:${size}px;
                        border-radius:50%;
                        display:flex;
                        align-items:center;
                        justify-content:center;
                        font-size:${size * 0.55}px;
                        border:2px solid white;
                    ">
                        ${icon}
                    </div>
                `,

                iconSize: [size, size],
                iconAnchor: [size / 2, size / 2]

            })
        }
    );

}