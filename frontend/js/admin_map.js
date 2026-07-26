const map = L.map('map').setView(
    [42.8913,47.6397],
    13
);

const urlParams = new URLSearchParams(
    window.location.search
);

const selectedProblemId = urlParams.get("id");

const API_URL = "https://kaspiysk-map-1.onrender.com";


L.tileLayer(
'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
{
    attribution:'OpenStreetMap'
}
).addTo(map);


const problemIcons = {

    "подтопление": "🌊",

    "мусор": "🗑",

    "яма": "🕳",

    "освещение": "💡"

};



// получаем проблемы

fetch(`${API_URL}/problems/active`)

.then(res => res.json())

.then(data => {

    console.log(data);


    data.forEach(problem => {


        let color;


        if(problem.status === "new") {

            color = "red";

        }

        else if(problem.status === "in_progress") {

            color = "orange";

        }

        else if(problem.status === "done") {

            color = "green";

        }

        const icon = problemIcons[problem.type] || "❗";

        let size;

        if (problem.priority === "high") {

            size = 42;

        } else if (problem.priority === "medium") {

            size = 34;

        } else {

            size = 26;

        }


        const marker = L.marker(
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

                    iconSize:[size, size],

                    iconAnchor:[size / 2, size / 2]

                })
            }
        )
        .addTo(map);

        if (problem.id == selectedProblemId) {

            map.setView(
                [
                    problem.latitude,
                    problem.longitude
                ],
                17
            );

        }



        marker.bindPopup(`

            <b>
            ${icon} ${problem.type}
            </b>

            <br><br>

            📍 ${problem.address || "Адрес не определён"}

            ${
                problem.landmark
                ? `<br>
                🔎 Ориентир: ${problem.landmark}`
                : ""
            }

            <br><br>

            ${problem.description}

            <br><br>

            Статус:
            ${problem.status}

        `);

        if (problem.id == selectedProblemId) {

            setTimeout(() => {
                marker.openPopup();
            }, 300);

        }


    });


});