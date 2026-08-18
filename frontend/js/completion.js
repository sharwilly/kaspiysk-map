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

    // PUT /problems/:id currently accepts JSON. The old implementation
    // sent FormData, while admin.js forced Content-Type: application/json.
    // That produced an invalid request body and caused a 400 response.
    // Keep the completion request JSON-only for now.
    if (photoInput.files.length > 0) {
        alert("Фото выполнения пока не отправляется. Сначала сохраните выполнение без фото.");
        return;
    }

    try {
        const response = await fetch(
            `${API_URL}/problems/${completeProblemId}`,
            {
                method: "PUT",
                headers: {
                    "Content-Type": "application/json",
                    "x-admin-key": localStorage.getItem("adminKey") || ""
                },
                body: JSON.stringify({
                    status: "done",
                    resolution_comment: comment
                })
            }
        );

        const contentType = response.headers.get("content-type") || "";
        let result;

        if (contentType.includes("application/json")) {
            result = await response.json();
        } else {
            const text = await response.text();
            result = {
                error: text || `HTTP ${response.status}`
            };
        }

        if (!response.ok || result.error) {
            alert("Ошибка: " + (result.error || `HTTP ${response.status}`));
            return;
        }

        closeCompleteModal();
        alert("Проблема выполнена");
        refreshProblems();

    } catch (error) {
        console.error("Ошибка завершения проблемы:", error);
        alert("Не удалось завершить проблему: " + error.message);
    }
}

// В main старый admin.js вызывает finishProblem().
// Используем новое окно вместо старого prompt().
function finishProblem(id) {
    openCompleteModal(id);
}
