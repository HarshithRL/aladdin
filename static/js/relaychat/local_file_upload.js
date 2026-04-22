// ==================== LOCAL FILE UPLOAD FUNCTIONS ====================
async function processUploadedFiles(files) {
    const fileInput = { target: { files } };
    await handleLocalFiles(fileInput); // Simulate a file input change event
}
async function handleLocalFiles(event) {
    console.log("handleLocalFiles called", event);

    const files = Array.from(event.target.files);
    console.log("Files selected:", files);
    if (files.length === 0) {
        console.log("No files selected, exiting.");
        return;
    }
    
    const filePreview = document.getElementById("filePreview");
    filePreview.style.display = "grid";
    const sendButton = document.getElementById("sendButton");
    const sendIcon = document.getElementById("sendIcon");
    const fileButtons = document.querySelectorAll(".chat-action-button.file-button");

    fileButtons.forEach(btn => btn.classList.add("disabled"));
    sendButton.disabled = true;
    sendButton.classList.add("disabled");
    sendIcon.src = "/static/images/lucide_icons/loader-circle.svg";
    sendIcon.classList.add("file-icon-loading-img");

    const fileUploadStatus = {};
    const fileIdToFileMap = new Map();
    const uploadPromises = [];

    for (const file of files) {
        const fileId = generateSessionId();
        const { fileIconSrc, fileIconClass, FileTypeLabel } = getFileTypeInfo(file.name, file.type);

        const fileCard = document.createElement("div");
        fileCard.classList.add("file-card");
        fileCard.setAttribute("data-file-id", fileId);

        const fileCardHeader = document.createElement("div");
        fileCardHeader.classList.add("file-card-header");

        const removeButton = document.createElement("button");
        removeButton.innerHTML = `<img src="/static/images/lucide_icons/x.svg" alt="Close" class="file-preview-close-icon">`;
        removeButton.classList.add("remove-file");

        removeButton.onclick = async () => {
            const iconImg = removeButton.querySelector("img");
            if (iconImg) {
                iconImg.src = "/static/images/lucide_icons/loader-circle.svg";
                iconImg.classList.add("spin");
            }

            try {
                const deleteResponse = await fetch(`/relaychat/delete_uploaded_file_from_azure_ai_search/${fileId}`, {
                    method: "DELETE",
                });

                if (!deleteResponse.ok) throw new Error("Delete failed");

                fileCard.remove();
                delete sessionAttachedFiles[fileId];
                delete newlyUploadedFiles[fileId];

                const remainingCards = filePreview.querySelectorAll(".file-card");
                const anyFailures = filePreview.querySelectorAll(".file-upload-failed").length > 0;
                const userInput = document.getElementById("userInput");

                if (remainingCards.length === 0) {
                    filePreview.style.display = "none";
                    if (userInput.textContent.trim() === "") {
                        sendButton.onclick = toggleVoiceOverlay;
                        sendIcon.src = "/static/images/lucide_icons/audio-lines.svg";
                    } else {
                        sendButton.onclick = generateChatbotAnswer;
                        sendIcon.src = "/static/images/lucide_icons/arrow-up.svg";
                    }
                }

                if (!anyFailures) {
                    sendButton.disabled = false;
                    sendButton.classList.remove("disabled");
                    sendIcon.src = "/static/images/lucide_icons/arrow-up.svg";
                    sendButton.onclick = generateChatbotAnswer;
                } else {
                    sendButton.disabled = true;
                    sendButton.classList.add("disabled");
                }
            } catch (err) {
                showNotification(`Error removing ${file.name}.`, "error");
                if (iconImg) {
                    iconImg.src = "/static/images/lucide_icons/x.svg";
                    iconImg.classList.remove("spin");
                }
            }
        };

        fileCardHeader.appendChild(removeButton);
        fileCard.appendChild(fileCardHeader);

        const fileCardBody = document.createElement("div");
        fileCardBody.classList.add("card", "file-card-body");

        const fileIconContainer = document.createElement("div");
        fileIconContainer.classList.add("file-icon-container");

        const fileIcon = document.createElement("img");
        fileIcon.classList.add("file-icon", "icon-svg", "spin");
        fileIcon.src = "/static/images/lucide_icons/loader-circle.svg";

        fileIconContainer.appendChild(fileIcon);

        const fileDetailsContainer = document.createElement("div");
        fileDetailsContainer.classList.add("file-details-container");

        const fileNameEl = document.createElement("div");
        fileNameEl.classList.add("file-name");
        fileNameEl.textContent = file.name;

        const fileType = document.createElement("div");
        fileType.classList.add("file-type");
        fileType.textContent = FileTypeLabel;

        fileDetailsContainer.appendChild(fileNameEl);
        fileDetailsContainer.appendChild(fileType);

        fileCardBody.appendChild(fileIconContainer);
        fileCardBody.appendChild(fileDetailsContainer);
        fileCard.appendChild(fileCardBody);
        filePreview.appendChild(fileCard);

        fileIdToFileMap.set(fileId, {
            fileIcon, fileIconContainer, fileType, fileName: file.name, fileIconSrc, fileIconClass, FileTypeLabel
        });

        const formData = new FormData();
        formData.append("session_id", currentSessionId);
        formData.append("file", file);
        formData.append("file_id", fileId);

        uploadPromises.push(
            fetch("/relaychat/upload_file_to_azure_ai_search", {
                method: "POST",
                body: formData,
            })
            .then(response => response.json().then(result => {
                return { response, result, fileId, fileName: file.name };
            }))
            .catch(err => {
                return { response: { ok: false }, result: { error: "Network error" }, fileId, fileName: file.name };
            })
        );
    }

    const allResults = await Promise.all(uploadPromises);

    for (const { response, result, fileId, fileName } of allResults) {
        const fileData = fileIdToFileMap.get(fileId);
        if (!fileData) continue;

        const { fileIcon, fileIconContainer, fileType, fileIconSrc, fileIconClass, FileTypeLabel } = fileData;
        if (response.ok && result.upload_status === "success") {
            fileUploadStatus[fileId] = true;
            fileIcon.src = fileIconSrc;
            fileIcon.classList.remove("spin");
            fileIconContainer.classList.remove("file-upload-failed");
            fileIconContainer.classList.add(fileIconClass);
            fileType.textContent = FileTypeLabel;

            const fileCard = filePreview.querySelector(`[data-file-id="${fileId}"]`);
            if (fileCard && result.file_details_string) {
                // Combine file_details_string and extra info into one JSON object
                const detailsObj = {
                    file_details_string: result.file_details_string,
                    fileIconSrc: fileIconSrc,
                    fileIconClass: fileIconClass,
                    FileTypeLabel: FileTypeLabel,
                    fileName: fileName
                };
                fileCard.setAttribute("data-file-details", JSON.stringify(detailsObj));
                sessionAttachedFiles[fileId] = detailsObj;
                newlyUploadedFiles[fileId] = detailsObj;
                console.log(newlyUploadedFiles)
            }
        } else {
            fileUploadStatus[fileId] = false;
            fileType.textContent = "Upload Failed";
            fileIcon.src = "/static/images/lucide_icons/circle-alert.svg";
            fileIcon.classList.remove("spin");
            fileIconContainer.classList.add("file-upload-failed");
            const errorMsg = result.error || "Failed to upload file.";
            showNotification(errorMsg, 'error');
        }
    }

    const anyFailures = filePreview.querySelectorAll(".file-upload-failed").length > 0;
    if (!anyFailures) {
        sendButton.disabled = false;
        sendButton.classList.remove("disabled");
        sendIcon.src = "/static/images/lucide_icons/arrow-up.svg";
        sendIcon.classList.remove("file-icon-loading-img");
        sendButton.onclick = generateChatbotAnswer;
    } else {
        sendButton.disabled = true;
        sendButton.classList.add("disabled");
        sendIcon.src = "/static/images/lucide_icons/arrow-up.svg";
        sendIcon.classList.remove("file-icon-loading-img");
    }

    fileButtons.forEach(btn => btn.classList.remove("disabled"));
    console.log("handleLocalFiles finished.");
}