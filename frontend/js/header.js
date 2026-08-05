const header = document.getElementById("header-container");

if(header){

    header.innerHTML = `
        ...
    `;

}
fetch("components/header.html")
.then(response => response.text())
.then(data => {

    document
    .getElementById("header-container")
    .innerHTML = data;

    const currentPage = document.body.dataset.page;

    console.log("Текущая страница:", currentPage);

    const activeLink = document.querySelector(
        `.menu a[data-page="${currentPage}"]`
    );

    console.log("Найдена ссылка:", activeLink);

    if (activeLink) {
        activeLink.classList.add("active");
    }

});

const weatherBtn = document.getElementById("weatherBtn");
const weatherPopover = document.getElementById("weatherPopover");

weatherBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    weatherPopover.classList.toggle("hidden");
});

document.addEventListener("click", (e) => {
    if (!weatherPopover.contains(e.target) && !weatherBtn.contains(e.target)) {
        weatherPopover.classList.add("hidden");
    }
});