fetch("components/header.html")
.then(response => response.text())
.then(data => {

    document
    .getElementById("header-container")
    .innerHTML = data;

    const currentPage = document.body.dataset.page;

    const activeLink = document.querySelector(
        `.menu a[data-page="${currentPage}"]`
    );

    if (activeLink) {
        activeLink.classList.add("active");
    }

});