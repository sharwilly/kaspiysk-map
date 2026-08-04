document.addEventListener("DOMContentLoaded", () => {


const map = L.map("city-map", {

    zoomControl:false,

    attributionControl:false

})
.setView(
    [42.8913,47.6397],
    13
);



L.tileLayer(
    "https://tile.openstreetmap.org/{z}/{x}/{y}.png"
)
.addTo(map);





fetch("https://kaspiysk-map-1.onrender.com/problems/active")

.then(response => response.json())

.then(problems => {


    problems.forEach(problem => {


        const marker = createProblemMarker(problem);


        marker.bindPopup(`

            <b>${getProblemIcon(problem.type)} ${problem.type}</b>

            <br><br>

            ${problem.address}

            <br>

            ${getStatusName(problem.status)}

        `);



        marker.addTo(map);


    });



})


.catch(error => {

    console.error(
        "Ошибка загрузки проблем:",
        error
    );

});


});