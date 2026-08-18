let completeProblemId = null;

function openCompleteModal(id) {
    completeProblemId = id;
    document.getElementById("resolutionComment").value = "";
    document.getElementById("resolutionPhoto").value = "";
    document.getElementById("resolutionPreview").innerHTML = "";
    document.getElementById("completeModal").classList.add("show");
}

function closeCompleteModal() {
    completeProblemId = null;
    document.getElementById("completeModal").classList.remove("show");
}

document.getElementById("resolutionPhoto").addEventListener("change", function () {
    const file = this.files[0];
    const preview = document.getElementById("resolutionPreview");
    preview.innerHTML = "";
    if (!file) return;

    const image = document.createElement("img");
    image.src = URL.createObjectURL(file);
    preview.appendChild(image);
});

async function confirmComplete() {
    if (!completeProblemId) return;

    const comment = document
        .getElementById("resolutionComment")
        .value
        .trim();

    const photoInput = document.getElementById("resolutionPhoto");
    const formData = new FormData();

    formData.append("status", "done");
    formData.append("resolution_comment", comment);

    if (photoInput.files.length > 0) {
        formData.append("resolution_photo", photoInput.files[0]);
    }

    const result = await apiRequest(
        `/problems/${completeProblemId}`,
        {
            method: "PUT",
            body: formData
        }
    );

    if (result.error) {
        alert("Ошибка: " + result.error);
        return;
    }

    closeCompleteModal();
    alert("Проблема выполнена");
    refreshProblems();
}

// В main старый admin.js вызывает finishProblem().
// Используем новое окно вместо старого prompt().
function finishProblem(id) {
    openCompleteModal(id);
}