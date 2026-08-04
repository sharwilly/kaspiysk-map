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



});
