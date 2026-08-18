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

    const result = await apiRequest(
        `/problems/${completeProblemId}`,
        {
            method: "PUT",
            body: JSON.stringify({
                status: "done",
                resolution_comment: comment
            })
        }
    );

    if (result.error) {
        alert("Ошибка: " + result.error);
        return;
    }

    if (document.getElementById("resolutionPhoto").files.length > 0) {
        alert("Проблема выполнена. Фото пока сохранено только в предпросмотре: backend main ещё не принимает фото выполнения.");
    } else {
        alert("Проблема выполнена");
    }

    closeCompleteModal();
    refreshProblems();
}

// В main старый admin.js вызывает finishProblem().
// Перехватываем его и используем новое окно.
function finishProblem(id) {
    openCompleteModal(id);
}