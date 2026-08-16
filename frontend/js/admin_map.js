const map = L.map('map').setView(
    [42.8913,47.6397],
    13
);

const urlParams = new URLSearchParams(
    window.location.search
);

const selectedProblemId = urlParams.get("id");

const API_URL = API_URL;


L.tileLayer(
'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
{
    attribution:'OpenStreetMap'
}
).addTo(map);

// получаем проблемы

fetch(`${API_URL}/problems/active`)
.then(res => res.json())
.then(data => {

    console.log(data);

    data.forEach(problem => {

        const marker = createProblemMarker(problem)
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
            ${getProblemIcon(problem.type)} ${problem.type}
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
            ${getStatusName(problem.status)}

        `);

        if (problem.id == selectedProblemId) {

            setTimeout(() => {
                marker.openPopup();
            }, 300);

        }

    });

});