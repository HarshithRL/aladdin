let allSites = [];
let cloudUploadedFiles = []

function loadSharepointFilesModal() {
      // Show the modal
      const sharepointFileUploadModal = document.getElementById("sharepointFileUploadModal");
      sharepointFileUploadModal.style.display = "block";

      // Add close button event listener
      document.getElementById("closeSharepointModalBtn").addEventListener("click", function () {
            document.getElementById("sharepointFileUploadModal").style.display = "none";
      });

      // Add search functionality
      const searchInput = document.getElementById("sharepointSiteSearch");
      searchInput.addEventListener("input", function (e) {
            filterSites(e.target.value);
      });

      // Load SharePoint sites
      loadSharepointSites();
}

async function loadSharepointSites() {
      try {
            currentBreadCrumbs = [];
            renderBreadcrumbs("sharepointFileUploadModel");
            showLoadingState("sharepointFileUploadModel");

      
            const response = await fetch("/relaychat/get_sharepoint_sites", {
                  method: "POST",
                  headers: {
                        "Content-Type": "application/json",
                  },
            });

            const data = await response.json();

            if (data.success) {
                  allSites = data.sites;
                  currentBreadCrumbs.push({
                        breadcrumbName: "Sites",
                        breadcrumbContents: allSites,
                        function: "renderSites",
                        tabId: "sharepointFileUploadModel"
                  });
                  renderBreadcrumbs("sharepointFileUploadModel");
                  renderSites(allSites);
            } else {
                  showError(data.message || "Failed to load SharePoint sites", "sharepointFileUploadModel");
            }
      } catch (error) {
            console.error("Error loading SharePoint sites:", error);
            showError("Network error occurred while loading sites", "sharepointFileUploadModel");
      }
}

function renderSites(sites) {
      const container = document.getElementById("sharepointFileUploadModel").querySelector(".file-upload-content");

      if (sites.length === 0) {
            container.innerHTML = `
                    <div class="shrp-site-card-no-results">
                        <p>No SharePoint sites found</p>
                    </div>
                `;
            return;
      }

      const sitesHtml = sites
            .map(
                  (site) => `
                <div class="shrp-site-card" data-site-id="${site.id}" onclick="handleSiteCardClick(this)">
                    <div class="shrp-site-card-header">
                        <h3 class="shrp-site-card-title">${escapeHtml(site.displayName)}</h3>
                        <a href="${escapeHtml(site.webUrl)}" 
                           target="_blank" 
                           rel="noopener noreferrer"
                           class="shrp-site-card-external-btn"
                           onclick="event.stopPropagation()">
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
                                <polyline points="15,3 21,3 21,9"></polyline>
                                <line x1="10" y1="14" x2="21" y2="3"></line>
                            </svg>
                            Open
                        </a>
                    </div>
                </div>
            `
            )
            .join("");

      container.innerHTML = `
                <div class="shrp-site-card-container">
                    ${sitesHtml}
                </div>
            `;
      
}

function filterSites(searchTerm) {
      const filteredSites = allSites.filter((site) => site.displayName.toLowerCase().includes(searchTerm.toLowerCase()) || site.webUrl.toLowerCase().includes(searchTerm.toLowerCase()));
      renderSites(filteredSites);
}

// SharePoint Navigation State Management
// Enhanced site card click handler
async function handleSiteCardClick(cardElement) {
      const siteId = cardElement.getAttribute("data-site-id");
      const site = allSites.find((s) => s.id === siteId);

      if (site) {
            
            await loadSiteRootContents(site);
      }
}

let currentBreadCrumbs = [];

// Load site root contents
async function loadSiteRootContents(site) {
      try {
            showLoadingState("sharepointFileUploadModel");

            const response = await fetch("/relaychat/get_sharepoint_site_root_children", {
                  method: "POST",
                  headers: {
                        "Content-Type": "application/json",
                  },
                  body: JSON.stringify({
                        id: site.id,
                        name: site.displayName,
                        webUrl: site.webUrl,
                  }),
            });

            const data = await response.json();
            if (data.success) {
                  currentBreadCrumbs.push({
                        breadcrumbName: site.displayName,
                        breadcrumbContents: [data.contents],
                        function: "renderFolderContents",
                        tabId: "sharepointFileUploadModel"
                  });
                  renderBreadcrumbs("sharepointFileUploadModel");

                  renderFolderContents([data.contents], "sharepointFileUploadModel");
            } else {
                  showError(data.message || "Failed to load site contents", "sharepointFileUploadModel");
            }
      } catch (error) {
            console.error("Error loading site contents:", error);
            showError("Network error occurred while loading contents", "sharepointFileUploadModel");
      }
}


function renderBreadcrumbs(tabId) {
    const container = document.getElementById(tabId).querySelector(".file-upload-breadcrumbs");
    container.innerHTML = "";

    currentBreadCrumbs.forEach((crumb, index) => {
        const btn = document.createElement("div");
        btn.className = "file-upload-breadcrumb-btn";
        btn.textContent = crumb.breadcrumbName;

        btn.onclick = () => {
            // Trim the breadcrumbs from this index onward
            currentBreadCrumbs = currentBreadCrumbs.slice(0, index + 1);

            // Re-render breadcrumbs
            renderBreadcrumbs(tabId);

            // Call the respective function
            const fnName = crumb.function;
            const contents = crumb.breadcrumbContents;

            if (fnName === "renderFolderContents") {
                renderFolderContents(contents, tabId);
            } else if (fnName === "renderSites") {
                renderSites(contents);
            } else {
                console.warn("Unknown breadcrumb function:", fnName);
            }
        };

        container.appendChild(btn);

        // Add right chevron icon except for the last breadcrumb
        if (index !== currentBreadCrumbs.length - 1) {
            const chevron = document.createElement("img");
            chevron.src = "/static/images/lucide_icons/chevron-right.svg";
            chevron.className = "icon-svg";
            chevron.alt = "chevron Icon";
            container.appendChild(chevron);
        }
    });
}


// Load folder contents
async function loadFolderContents(folder, tabId, folderName) {
      try {
            showLoadingState(tabId);

            const response = await fetch("/relaychat/get_sharepoint_folder_children", {
                  method: "POST",
                  headers: {
                        "Content-Type": "application/json",
                  },
                  body: JSON.stringify({
                        drive_id: folder.drive_id,
                        item_id: folder.item_id,
                        site_id: folder.site_id,
                  }),
            });

            const data = await response.json();

            if (data.success) {
                  currentBreadCrumbs.push({
                        breadcrumbName: folderName,
                        breadcrumbContents: [data.contents],
                        function: "renderFolderContents",
                        tabId: tabId
                  });
                  renderBreadcrumbs(tabId);
                  renderFolderContents([data.contents], tabId);
            } else {
                  showError(data.message || "Failed to load folder contents", tabId);
            }
      } catch (error) {
            console.error("Error loading folder contents:", error);
            showError("Network error occurred while loading folder contents", tabId);
      }
}


function createFolderItem(subfolder, tabId) {
    return `
        <div class="shrp-folder-item shrp-table-row" onclick="handleSubfolderClick(this, '${tabId}', '${escapeHtml(subfolder.name)}')" 
             data-subfolder='${JSON.stringify(subfolder)}'>
            <div class="shrp-table-cell shrp-checkbox-cell"></div>
            <div class="shrp-table-cell shrp-icon-cell">
                <img src="/static/images/office/folder.png" class="shrp-file-icon" alt="Folder Icon" />
            </div>
            <div class="shrp-table-cell shrp-name-cell">${escapeHtml(subfolder.name)}</div>
            <div class="shrp-table-cell shrp-actions-cell"></div>
            <div class="shrp-table-cell shrp-date-cell">${escapeHtml(subfolder.formattedLastModifiedDateTime || "")}</div>
            <div class="shrp-table-cell shrp-by-cell">${escapeHtml(subfolder.lastModifiedBy || subfolder.sharedBy || "Unknown")}</div>
            <div class="shrp-table-cell shrp-size-cell">${subfolder.size_in_mb || ""}</div>
        </div>
    `;
}

function createFileItem(file) {
    const extension = file.name.split(".").pop().toLowerCase();
    const checkboxSupportedExtensions = ["pdf", "doc", "docx", "ppt", "pptx", "xlsx", "csv", "txt"];
    const showCheckbox = checkboxSupportedExtensions.includes(extension);

    let iconPath = "/static/images/office/genericfile.svg";
    if (["doc", "docx"].includes(extension)) iconPath = "/static/images/office/docx.svg";
    else if (["ppt", "pptx"].includes(extension)) iconPath = "/static/images/office/pptx.svg";
    else if (["xls", "xlsx"].includes(extension)) iconPath = "/static/images/office/xlsx.svg";
    else if (["pdf"].includes(extension)) iconPath = "/static/images/office/pdf.svg";
    else if (["png", "jpg", "jpeg"].includes(extension)) iconPath = "/static/images/office/photo.svg";
    else if (["mp4", "mov"].includes(extension)) iconPath = "/static/images/office/video.svg";
    else if (["loop"].includes(extension)) iconPath = "/static/images/office/loop.svg";
    else if (["zip"].includes(extension)) iconPath = "/static/images/office/zip.svg";

    const checkboxHtml = showCheckbox
    ? `<div class="shrp-file-checkbox" onclick="event.stopPropagation(); handleFileClick('${JSON.stringify(file).replace(/'/g, '\\\'').replace(/"/g, '&quot;')}'); this.classList.toggle('checked');"></div>`
    : "";

    return `
        <div class="shrp-file-item shrp-table-row" data-file='${JSON.stringify(file)}'>
            <div class="shrp-table-cell shrp-checkbox-cell">${checkboxHtml}</div>
            <div class="shrp-table-cell shrp-icon-cell">
                <img src="${iconPath}" class="shrp-file-icon" alt="${extension} file icon" />
            </div>
            <div class="shrp-table-cell shrp-name-cell">${escapeHtml(file.name)}</div>
            <div class="shrp-table-cell shrp-actions-cell">
                <a href="${escapeHtml(file.url)}" 
                   target="_blank" 
                   rel="noopener noreferrer"
                   class="shrp-file-external-btn"
                   onclick="event.stopPropagation()"
                   title="Open file">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
                        <polyline points="15,3 21,3 21,9"></polyline>
                        <line x1="10" y1="14" x2="21" y2="3"></line>
                    </svg>
                </a>
                <a href="${escapeHtml(file.download_url)}" 
                   class="shrp-file-download-btn"
                   onclick="event.stopPropagation()"
                   title="Download file">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                        <polyline points="7,10 12,15 17,10"></polyline>
                        <line x1="12" y1="15" x2="12" y2="3"></line>
                    </svg>
                </a>
            </div>
            <div class="shrp-table-cell shrp-date-cell">${escapeHtml(file.formattedLastModifiedDateTime)}</div>
            <div class="shrp-table-cell shrp-by-cell">${escapeHtml(file.lastModifiedBy || file.sharedBy || "Unknown")}</div>
            <div class="shrp-table-cell shrp-size-cell">${file.size_in_mb}</div>
        </div>
    `;
}


function handleFileClick(fileJsonString) {
    const cleanedString = fileJsonString.replace(/&quot;/g, '"');
    const file = JSON.parse(cleanedString);

    
    const existingIndex = cloudUploadedFiles.findIndex(f => JSON.stringify(f) === cleanedString);
    
    if (existingIndex !== -1) {
        cloudUploadedFiles.splice(existingIndex, 1);
      } else {
            cloudUploadedFiles.push(file);
      }
      
      const selectedCount = cloudUploadedFiles.length;
      
      document.querySelectorAll(".file-upload-model-action-btn-contianer").forEach((container) => {
            if (selectedCount > 0) {
                  container.innerHTML = `
                  <div class="file-upload-unselect-all" onclick="unSelectAllCloudFiles()">
                  <div class="unselect-icon-content">
                  <img src="/static/images/lucide_icons/x.svg" class="icon-svg" alt="Unselect Icon" />
                  </div>
                  <div class="unselect-text-content">${selectedCount} Selected</div>
                  </div>
                  <button class="action-button button-template" onclick="handleCloudFileUpload()">Upload</button>
                  `;
            } else {
                  container.innerHTML = "";
            }
      });
      console.log(cloudUploadedFiles);
}


function unSelectAllCloudFiles() {
    cloudUploadedFiles = [];

    document.querySelectorAll('.shrp-file-checkbox.checked').forEach((checkbox) => {
        checkbox.classList.remove('checked');
    });

    document.querySelectorAll(".file-upload-model-action-btn-contianer").forEach((container) => {
        container.innerHTML = "";
    });
}


async function handleCloudFileUpload(){
      const sharepointFileUploadModal = document.getElementById("sharepointFileUploadModal");
      sharepointFileUploadModal.style.display = "none";
      
      
      const OneDriveFileUploadModal = document.getElementById("oneDriveFileUploadModal");
      OneDriveFileUploadModal.style.display = "none";
      
      
      console.log(cloudUploadedFiles);
      // do magic here
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

    for (const file of cloudUploadedFiles) {
        const fileId = generateSessionId();
        const { fileIconSrc, fileIconClass, FileTypeLabel } = getFileTypeInfo(file.name);

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
        formData.append("file_id", fileId);
        formData.append("filename", file.name);
        formData.append("graph_download_url", file.download_url);
        formData.append("site_id", file.site_id);
        formData.append("drive_id", file.drive_id);
        formData.append("item_id", file.item_id);

        uploadPromises.push(
            fetch("/relaychat/upload_cloud_files_to_azure_ai_search", {
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

      cloudUploadedFiles = [];

      document.querySelectorAll('.shrp-file-checkbox.checked').forEach((checkbox) => {
            checkbox.classList.remove('checked');
      });

      document.querySelectorAll(".file-upload-model-action-btn-contianer").forEach((container) => {
            container.innerHTML = "";
      });
}

function renderFolderContents(contents, tabId) {
      const container = document.getElementById(tabId).querySelector(".file-upload-content");

      if (!container) {
            console.warn(`No container found for tabId: ${tabId}`);
            return;
      }

      if (!contents || contents.length === 0) {
            container.innerHTML = `
            <div class="shrp-folder-no-contents">
                <p>No contents found in this location</p>
            </div>
        `;
            return;
      }

      let itemsHtml = "";

      contents.forEach((item, index) => {

            if (item.subfolders && item.subfolders.length > 0) {
                  item.subfolders.forEach((subfolder, subIndex) => {
                        itemsHtml += createFolderItem(subfolder, tabId);
                  });
            }

            if (item.files && item.files.length > 0) {
                  item.files.forEach((file, fileIndex) => {
                        itemsHtml += createFileItem(file);
                  });
            }
      });

      container.innerHTML = `
        <div class="shrp-folder-contents-container">
            ${itemsHtml}
        </div>
    `;
}

// Handle subfolder click
async function handleSubfolderClick(subfolderElement, tabId, folderName) {
      const subfolderData = JSON.parse(subfolderElement.getAttribute("data-subfolder"));
      // Load subfolder contents from server
      await loadFolderContents(subfolderData, tabId, folderName);
}


// Show loading state
function showLoadingState(tabId) {
      const container = document.getElementById(tabId).querySelector(".file-upload-content");
      container.innerHTML = `
        <div class="loading">
            <div class="file-icon-loading">
                  <img src="/static/images/loader-circle.svg" class="spin" alt="Loading Icon" />
            </div>
            Loading your files...
      </div>
    `;
}


function showError(message, tabId) {
      const container = document.getElementById(tabId).querySelector(".shrp-folder-contents-container");
      container.innerHTML = `
                <div class="shrp-site-card-no-results">
                    <p style="color: #d13438;">Error: ${escapeHtml(message)}</p>
                </div>
            `;
}

function escapeHtml(text) {
      const div = document.createElement("div");
      div.textContent = text;
      return div.innerHTML;
}