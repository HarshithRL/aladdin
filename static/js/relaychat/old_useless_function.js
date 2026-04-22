
// Enhance the modal close handler to clear history but keep cache
function closeFileUploadModal() {
      // console.log("Closing file upload modal");
      const fileUploadModal = document.getElementById("fileUploadModal");
      if (fileUploadModal) {
            fileUploadModal.style.display = "none";
      }

      // Reset to sites view when closing SharePoint modal
      if (window.fileCache && window.fileCache["sharepoint-tab"]) {
            renderSharePointSites("sharepoint-tab", window.fileCache["sharepoint-tab"]);

            // Clear the SharePoint history
            window.sharePointHistory = window.sharePointHistory || {};
            window.sharePointHistory["sharepoint-tab"] = [];
      }
}

// Add a function to clear the cache when needed (e.g., for refreshing data)
function clearFileCache(tabId = null) {
      if (tabId) {
            // Clear cache for a specific tab
            if (window.fileCache && window.fileCache[tabId]) {
                  window.fileCache[tabId] = null;
                  // console.log(`Cache cleared for ${tabId}`);
            }
      } else {
            // Clear all caches
            window.fileCache = {
                  "sharepoint-tab": null,
                  "onedrive-tab": null,
                  "shared-tab": null,
            };
            // console.log('All file caches cleared');
      }
}

// Helper function to update file status in DOM
function updateFileStatusInDOM(fileId, statusText, statusClass) {
      const fileItem = document.getElementById(fileId);
      if (fileItem) {
            const statusElement = fileItem.querySelector(".file-status");
            if (statusElement) {
                  statusElement.textContent = statusText;
                  statusElement.className = `file-status ${statusClass || ""}`;
            }
      }
}


// ==================== FILE PREVIEW RENDERING ====================
function renderFilePreview() {
      const filePreview = document.getElementById("filePreview");
      filePreview.innerHTML = "";
      filePreview.style.display = "flex";

      // Render all files in our unified collection
      filesCollection.forEach((fileData) => {
            const fileCard = document.createElement("div");
            fileCard.classList.add("file-card");
            fileCard.setAttribute("data-file-id", fileData.id);

            // Create file card header with remove button
            const fileCardHeader = document.createElement("div");
            fileCardHeader.classList.add("file-card-header");

            const removeButton = document.createElement("button");
            removeButton.innerHTML = `<img src="/static/images/close.svg" alt="Close" class="file-preview-close-icon">`;
            removeButton.classList.add("remove-file");

            // Set up file removal on click
            removeButton.onclick = () => removeFile(fileData.id);

            fileCardHeader.appendChild(removeButton);
            fileCard.appendChild(fileCardHeader);

            // Create file card body
            const fileCardBody = document.createElement("div");
            fileCardBody.classList.add("card", "file-card-body");

            // Icon container
            const fileIconContainer = document.createElement("div");
            fileIconContainer.classList.add("file-icon-container", fileData.iconClass);

            // File icon
            const fileIcon = document.createElement("img");
            fileIcon.classList.add("file-icon", "icon-svg");
            fileIcon.src = fileData.iconSrc;

            // Add spin class if the file is pending
            if (fileData.status === "pending") {
                  fileIcon.classList.add("spin");
            }

            fileIconContainer.appendChild(fileIcon);

            // File details container
            const fileDetailsContainer = document.createElement("div");
            fileDetailsContainer.classList.add("file-details-container");

            // File name
            const fileName = document.createElement("div");
            fileName.classList.add("file-name");
            fileName.textContent = fileData.name;

            // File type
            const fileType = document.createElement("div");
            fileType.classList.add("file-type");
            fileType.textContent = fileData.typeLabel;

            fileDetailsContainer.appendChild(fileName);
            fileDetailsContainer.appendChild(fileType);

            fileCardBody.appendChild(fileIconContainer);
            fileCardBody.appendChild(fileDetailsContainer);

            fileCard.appendChild(fileCardBody);
            filePreview.appendChild(fileCard);
      });
}

function getSelectedSharepointFiles() {
      // Try to get checkboxes from both modals
      let checkboxes;

      // First try the active modal
      const onedriveModal = document.getElementById("onedriveModal");
      const sharepointModal = document.getElementById("fileUploadModal");

      // console.log("Looking for checked checkboxes in modals");

      if (onedriveModal && onedriveModal.style.display !== "none") {
            checkboxes = onedriveModal.querySelectorAll(".file-checkbox:checked");
            // console.log("Found in OneDrive modal:", checkboxes.length);
      } else if (sharepointModal && sharepointModal.style.display !== "none") {
            checkboxes = sharepointModal.querySelectorAll(".file-checkbox:checked");
            // console.log("Found in SharePoint modal:", checkboxes.length);
      } else {
            // If no specific modal is active, search the entire document
            checkboxes = document.querySelectorAll(".file-checkbox:checked");
            // console.log("Found in document:", checkboxes.length);
      }

      if (checkboxes.length === 0) return [];

      const selectedFiles = [];
      const processedUrls = new Map(); // Track files that have already been processed

      checkboxes.forEach((cb) => {
            const url = cb.getAttribute("data-url");
            const name = cb.getAttribute("data-name") || "Unknown";
            // console.log("Selected file:", url, name);

            // Skip if we've already processed this URL
            if (processedUrls.has(url)) {
                  return;
            }

            // Mark URL as processed
            processedUrls.set(url, true);

            // Get the parent row to access the file data
            const row = cb.closest(".file-grid-row");
            const fileDataAttr = row.getAttribute("data-file-info");

            let fileInfo = {
                  name,
                  url,
            };

            // If file has additional data, add it
            if (fileDataAttr) {
                  try {
                        const additionalData = JSON.parse(fileDataAttr);

                        // Include remoteItem data if available (for shared files)
                        if (additionalData.remoteItem) {
                              fileInfo.remoteItem = additionalData.remoteItem;
                        }

                        // Include webUrl as a fallback option
                        if (additionalData.webUrl) {
                              fileInfo.webUrl = additionalData.webUrl;
                        }

                        // Include the downloadUrl if available
                        if (additionalData["@microsoft.graph.downloadUrl"]) {
                              fileInfo.downloadUrl = additionalData["@microsoft.graph.downloadUrl"];
                        }
                  } catch (err) {
                        console.error("Error parsing file data:", err);
                  }
            }

            selectedFiles.push(fileInfo);
      });

      return selectedFiles;
}
// Render SharePoint sites as cards
function renderSharePointSites(tabId, sites) {
      const tabContent = document.getElementById(tabId);

      if (!sites || sites.length === 0) {
            tabContent.innerHTML = '<div class="no-files">No SharePoint sites found.</div>';
            return;
      }

      // Create breadcrumb for navigation
      const breadcrumbContainer = document.createElement("div");
      breadcrumbContainer.className = "breadcrumb-container";
      breadcrumbContainer.innerHTML = `
        <div class="breadcrumb-item current">Sites</div>
        <input type="text" id="${tabId}-search" class="search-input" placeholder="Search sites...">
        <img src="/static/images/search.svg" alt="Search" class="search-icon" />
    `;

      // Create grid for site cards
      const sitesGrid = document.createElement("div");
      sitesGrid.className = "sites-grid";
      sitesGrid.id = `${tabId}-sites-grid`;

      // Add site cards to the grid
      sites.forEach((site) => {
            const siteCard = document.createElement("div");
            siteCard.className = "site-card";
            siteCard.setAttribute("data-site-id", site.id);
            siteCard.setAttribute("data-site-name", site.name);

            // Generate site initial or icon
            const initial = site.name.charAt(0).toUpperCase();
            const colorClass = generateColorClass(site.name);

            siteCard.innerHTML = `
            <div class="site-icon ${colorClass}">${initial}</div>
            <div class="site-info">
                <div class="site-name">${site.name}</div>
                <div class="site-description">${site.description || "No description"}</div>
            </div>
            ${site.isFollowed ? '<div class="followed-badge">★ Followed</div>' : ""}
        `;

            // Add click event to open the site
            siteCard.addEventListener("click", function () {
                  navigateToSharePointSite(tabId, site.id, site.name);
            });

            sitesGrid.appendChild(siteCard);
      });

      // Clear tab content and add the new elements
      tabContent.innerHTML = "";
      tabContent.appendChild(breadcrumbContainer);
      tabContent.appendChild(sitesGrid);

      // Set up search functionality
      const searchInput = document.getElementById(`${tabId}-search`);
      if (searchInput) {
            searchInput.addEventListener("input", function () {
                  filterSiteGrid(tabId);
            });
      }
}

// Generate a consistent color class based on site name
function generateColorClass(siteName) {
      const colors = ["red", "blue", "green", "purple", "orange", "teal", "pink", "yellow"];
      const hash = siteName.split("").reduce((acc, char) => char.charCodeAt(0) + acc, 0);
      return `color-${colors[hash % colors.length]}`;
}

// Filter site grid based on search input
function filterSiteGrid(tabId) {
      const searchInput = document.getElementById(`${tabId}-search`);
      const searchValue = searchInput.value.toLowerCase();
      const sitesGrid = document.getElementById(`${tabId}-sites-grid`);

      if (!sitesGrid) return;

      const siteCards = sitesGrid.querySelectorAll(".site-card");

      siteCards.forEach((card) => {
            const siteName = card.getAttribute("data-site-name").toLowerCase();
            if (siteName.includes(searchValue)) {
                  card.style.display = "flex";
            } else {
                  card.style.display = "none";
            }
      });
}

// Navigate to a specific SharePoint site
function navigateToSharePointSite(tabId, siteId, siteName) {
      const tabContent = document.getElementById(tabId);

      // Show loading state
      tabContent.innerHTML = '<div class="loading-spinner"><div class="spinner"></div><p>Loading files from site...</p></div>';

      // Fetch files from the site
      fetch("/relaychat/get_files_from_sharepoint", {
            method: "POST",
            headers: {
                  "Content-Type": "application/json",
            },
            body: JSON.stringify({
                  site_id: siteId,
                  site_name: siteName,
            }),
      })
            .then((response) => response.json())
            .then((data) => {
                  if (data.success && data.files) {
                        // Store site info for breadcrumb navigation
                        const siteInfo = {
                              id: siteId,
                              name: siteName,
                              path: "root",
                        };

                        // Store site history for back navigation
                        if (!window.sharePointHistory) {
                              window.sharePointHistory = {};
                        }
                        window.sharePointHistory[tabId] = [siteInfo];

                        // Populate tab with files
                        populateSharePointTab(data.files, siteInfo);
                  } else {
                        tabContent.innerHTML = '<div class="no-files">No files found in this site or error occurred.</div>';
                        console.error("Error loading SharePoint files:", data.message || "Unknown error");
                  }
            })
            .catch((error) => {
                  console.error("Error fetching SharePoint files:", error);
                  tabContent.innerHTML = '<div class="no-files">Error loading files. Please try again.</div>';
            });
}

// Populate SharePoint tab with files from a site
function populateSharePointTab(files, siteInfo) {
      // Initialize history if it doesn't exist
      if (!window.sharePointHistory) {
            window.sharePointHistory = {};
      }

      // Create header with back button and site name
      const breadcrumbContainer = document.createElement("div");
      breadcrumbContainer.className = "breadcrumb-container";

      // Always display a back button that takes you back to the sites view
      breadcrumbHTML = `<button class="back-button" onclick="navigateBackSharePoint('${tabId}')">← Back to Sites</button>`;

      // If we have history, create breadcrumb items
      if (window.sharePointHistory && window.sharePointHistory[tabId] && window.sharePointHistory[tabId].length > 0) {
            // Add site name as first breadcrumb
            breadcrumbHTML += `<div class="breadcrumb-item">${window.sharePointHistory[tabId][0].name}</div>`;

            // Add folder path if we're deeper than the root
            if (window.sharePointHistory[tabId].length > 1) {
                  for (let i = 1; i < window.sharePointHistory[tabId].length; i++) {
                        const isLast = i === window.sharePointHistory[tabId].length - 1;
                        breadcrumbHTML += `<div class="breadcrumb-separator">/</div>
                                   <div class="breadcrumb-item ${isLast ? "current" : ""}">${window.sharePointHistory[tabId][i].name}</div>`;
                  }
            }
      } else {
            // Fallback if history isn't available
            breadcrumbHTML += `<div class="breadcrumb-item current">${siteInfo.name}</div>`;
      }

      breadcrumbContainer.innerHTML =
            breadcrumbHTML +
            `
    <div class="breadcrumb-item current">Sites</div>
        <input type="text" id="${tabId}-search" class="search-input" placeholder="Search files...">
        <img src="/static/images/search.svg" alt="Search" class="search-icon" />
    `;

      // Now populate the files similarly to OneDrive tab
      populateTabWithFiles(document.getElementById(tabId), tabId, files, `${siteInfo.name} - ${siteInfo.path || "root"}`);

      // Replace the file table header with our breadcrumb
      const fileTableHeader = document.getElementById(tabId).querySelector(".file-table-header");
      if (fileTableHeader) {
            fileTableHeader.parentNode.replaceChild(breadcrumbContainer, fileTableHeader);
      } else {
            // Insert at the beginning if header doesn't exist
            document.getElementById(tabId).insertBefore(breadcrumbContainer, document.getElementById(tabId).firstChild);
      }

      // Set up search functionality
      const searchInput = document.getElementById(`${tabId}-search`);
      if (searchInput) {
            searchInput.addEventListener("input", function () {
                  filterFileGrid(tabId);
            });
      }
}

// Navigate back in SharePoint site history
function navigateBackSharePoint(tabId) {
      // Initialize history if it doesn't exist
      if (!window.sharePointHistory) {
            window.sharePointHistory = {};
      }

      // Always reset to sites list view regardless of history
      const tabContent = document.getElementById(tabId);
      if (window.fileCache && window.fileCache[tabId]) {
            renderSharePointSites(tabId, window.fileCache[tabId]);
            // Clear the history
            window.sharePointHistory[tabId] = [];
      } else {
            // If no cache exists for some reason, fetch again
            uploadFromSharepoint();
      }
}

// Load shared files tab
async function loadSharedFilesTab() {
      // Show the OneDrive modal (shared files use the same modal as OneDrive)
      const onedriveModal = document.getElementById("onedriveModal");
      onedriveModal.style.display = "block";

      // Reset the tabs if needed
      document.querySelectorAll(".onedrive-tab-button").forEach((button) => {
            button.classList.remove("active");
      });
      document.querySelectorAll(".onedrive-tab-content").forEach((content) => {
            content.classList.remove("active");
      });

      // Set up Shared tab
      const tabButton = document.querySelector('.onedrive-tab-button[data-tab="shared-tab"]');
      const tabContent = document.getElementById("shared-tab");

      if (tabButton && tabContent) {
            tabButton.classList.add("active");
            tabContent.classList.add("active");

            // Check if we already have cached data
            if (window.fileCache["shared-tab"]) {
                  // console.log('Using cached shared files');
                  populateOneDriveTab("shared-tab", window.fileCache["shared-tab"]);
                  return;
            }

            // Clear previous content and show loading state
            tabContent.innerHTML = '<div class="loading-spinner"><div class="spinner"></div><p>Loading shared files...</p></div>';

            // Add folder navigation and search styles
            addFolderAndSearchStyles();

            const accessToken = await fetchAccessToken();
            // Fetch shared files
            fetch("/relaychat/get_files_from_onedrive", {
                  method: "POST",
                  headers: {
                        "Content-Type": "application/json",
                  },
                  body: JSON.stringify({ access_token: accessToken }),
            })
                  .then((response) => response.json())
                  .then((data) => {
                        if (data.success && data.shared_files) {
                              // Cache the shared files data
                              window.fileCache["shared-tab"] = data.shared_files;

                              // Populate the tab with shared files
                              populateOneDriveTab("shared-tab", data.shared_files);
                        } else {
                              tabContent.innerHTML = '<div class="no-files">No shared files found or error occurred.</div>';
                              console.error("Error loading shared files:", data.message || "Unknown error");
                        }
                  })
                  .catch((error) => {
                        console.error("Error fetching shared files:", error);
                        tabContent.innerHTML = '<div class="no-files">Error loading shared files. Please try again.</div>';
                  });
      }
}

function populateOneDriveTab(tabId, files, folderPath = "") {
      const tab = document.getElementById(tabId);
      if (!tab) return;

      // Initialize the global objects if they don't exist
      if (!folderHistory) folderHistory = {};
      if (!currentFolderPath) currentFolderPath = {};

      // Initialize folder state for this tab if not already set
      if (!currentFolderPath[tabId]) {
            currentFolderPath[tabId] = "";
            folderHistory[tabId] = [{ path: "", files: files }];
            // console.log(`Initialized history for ${tabId}:`, folderHistory[tabId].map(h => h.path));
      }

      // If a folder path is provided, update the current folder
      if (folderPath !== "" && folderPath !== currentFolderPath[tabId]) {
            // If we're returning to a folder in our history (e.g. after tab switch)
            const existingFolderIndex = folderHistory[tabId].findIndex((item) => item.path === folderPath);

            if (existingFolderIndex !== -1) {
                  // Update the files for this folder in our history
                  folderHistory[tabId][existingFolderIndex].files = files;

                  // Make sure we don't have extra history entries beyond this point
                  if (existingFolderIndex < folderHistory[tabId].length - 1) {
                        folderHistory[tabId] = folderHistory[tabId].slice(0, existingFolderIndex + 1);
                  }
            } else {
                  // Find the current index to properly manage history
                  const currentIndex = folderHistory[tabId].findIndex((item) => item.path === currentFolderPath[tabId]);

                  // If we're at an intermediate point in history, trim forward history
                  if (currentIndex !== -1 && currentIndex < folderHistory[tabId].length - 1) {
                        folderHistory[tabId] = folderHistory[tabId].slice(0, currentIndex + 1);
                  }

                  // Add this new folder to history
                  folderHistory[tabId].push({ path: folderPath, files: files });
            }

            // Update current path
            currentFolderPath[tabId] = folderPath;
            // console.log(`Updated history for ${tabId}:`, folderHistory[tabId].map(h => h.path));
      }

      // Use the populateTabWithFiles function to render the content
      populateTabWithFiles(tab, tabId, files, folderPath);
}

function populateTabWithFiles(tab, tabId, files, folderPath) {
      const allowedExtensions = ["docx", "pdf", "ppt", "pptx", "xls", "xlsx", "csv"];

      let content = `
        <div class="file-grid">
            <div class="file-grid-header">
                <div class="file-cell checkbox-cell"></div>
                <div class="file-cell icon-cell"></div>
                <div class="file-cell name-cell">Name</div>
                <div class="file-cell link-cell">Link</div>
                <div class="file-cell created-cell">Created</div>
                <div class="file-cell modified-cell">Last Modified</div>
                <div class="file-cell modifiedby-cell">Modified By</div>
            </div>
            
            <div class="file-grid-body" id="${tabId}-file-grid-body">
    `;

      const validFiles = (files || []).filter((file) => {
            if (file.folder) return true; // allow folders
            const ext = file.name.split(".").pop().toLowerCase();
            return allowedExtensions.includes(ext);
      });

      if (validFiles.length > 0) {
            // First show folders, then files
            const folders = validFiles.filter((file) => file.folder);
            const regularFiles = validFiles.filter((file) => !file.folder);

            // Add folders
            folders.forEach((file) => {
                  const icon = '<img src="/static/images/office/folder.svg" alt="Folder" class="file-icon" />';

                  content += `
                <div class="file-grid-row folder-row" data-name="${file.name.toLowerCase()}" onclick="navigateToFolder('${tabId}', '${file.name}', '${encodeURIComponent(JSON.stringify(file))}')">
                    <div class="file-cell checkbox-cell"></div>
                    <div class="file-cell icon-cell">${icon}</div>
                    <div class="file-cell name-cell folder-name">${file.name}</div>
                    <div class="file-cell link-cell">
                        <a href="${file.webUrl}" target="_blank" onclick="event.stopPropagation()">Go to folder</a>
                    </div>
                    <div class="file-cell createdby-cell">${file.createdBy?.user?.displayName || "-"}</div>
                    <div class="file-cell created-cell">${new Date(file.createdDateTime).toLocaleString()}</div>
                    <div class="file-cell modified-cell">${new Date(file.lastModifiedDateTime).toLocaleString()}</div>
                    <div class="file-cell modifiedby-cell">${file.lastModifiedBy?.user?.displayName || "-"}</div>
                </div>
            `;
            });

            // Add files
            regularFiles.forEach((file) => {
                  const icon = getFileIcon(file.name);

                  // Ensure file has all necessary metadata
                  const fileInfo = { ...file };

                  // Prepare download URL based on tab type and file origin
                  let downloadUrl = "";

                  // For OneDrive/SharePoint files, ensure we capture the download URL
                  if (tabId === "myTab" || tabId === "sharedTab") {
                        // Prefer the Microsoft Graph download URL when available
                        downloadUrl = fileInfo["@microsoft.graph.downloadUrl"] || fileInfo.webUrl;

                        // For shared files, ensure we flag them properly
                        if (tabId === "sharedTab" || fileInfo.remoteItem) {
                              fileInfo.isShared = true;
                        }
                  } else {
                        // For other tabs, fallback to webUrl
                        downloadUrl = fileInfo.webUrl;
                  }

                  // Store complete file info for later access, including remoteItem data if present
                  const fileData = JSON.stringify(fileInfo);

                  content += `
                <div class="file-grid-row" data-name="${fileInfo.name.toLowerCase()}" data-file-info='${fileData}'>
                    <div class="file-cell checkbox-cell">
                        <input type="checkbox" class="file-checkbox" 
                               data-url="${downloadUrl}" 
                               data-name="${fileInfo.name}" 
                               data-shared="${fileInfo.remoteItem ? "true" : "false"}" />
                    </div>
                    <div class="file-cell icon-cell">${icon}</div>
                    <div class="file-cell name-cell">${fileInfo.name}</div>
                    <div class="file-cell link-cell">
                        <a href="${fileInfo.webUrl}" target="_blank">View</a>
                    </div>
                    <div class="file-cell createdby-cell">${fileInfo.createdBy?.user?.displayName || "-"}</div>
                    <div class="file-cell created-cell">${new Date(fileInfo.createdDateTime).toLocaleString()}</div>
                    <div class="file-cell modified-cell">${new Date(fileInfo.lastModifiedDateTime).toLocaleString()}</div>
                    <div class="file-cell modifiedby-cell">${fileInfo.lastModifiedBy?.user?.displayName || "-"}</div>
                </div>
            `;
            });
      } else {
            content += `
            <div class="file-grid-row no-files">
                <div class="file-cell" style="grid-column: span 8;">No files found</div>
            </div>
        `;
      }

      content += `
            </div>
        </div>`; // close file-grid-body and file-grid
      tab.innerHTML = content;

      // Add CSS for improved folder interaction and search UI
      addFolderAndSearchStyles();
}

function filterFileGrid(tabId) {
      const searchInput = document.getElementById(`${tabId}-search`);
      const searchValue = searchInput.value.toLowerCase().trim();
      const fileGridBody = document.getElementById(`${tabId}-file-grid-body`);
      const fileRows = fileGridBody.querySelectorAll(".file-grid-row");

      let hasResults = false;

      fileRows.forEach((row) => {
            if (!row.classList.contains("no-files")) {
                  const fileName = row.getAttribute("data-name");
                  if (fileName.includes(searchValue)) {
                        row.style.display = "";
                        hasResults = true;
                  } else {
                        row.style.display = "none";
                  }
            }
      });

      // Handle no results message
      const existingNoResults = fileGridBody.querySelector(".no-results");
      if (existingNoResults) {
            fileGridBody.removeChild(existingNoResults);
      }

      if (!hasResults && searchValue.length > 0) {
            const noResultsRow = document.createElement("div");
            noResultsRow.className = "file-grid-row no-results";
            noResultsRow.innerHTML = `
            <div class="file-cell" style="grid-column: span 8;">
                No files or folders found matching '${searchValue}'
            </div>
        `;
            fileGridBody.appendChild(noResultsRow);
      }
}

function addFolderAndSearchStyles() {
      // Check if styles already exist
      if (document.getElementById("folder-navigation-styles")) {
            return;
      }
}

function navigateBack(tabId) {
      // Initialize folderHistory for this tab if it doesn't exist
      if (!folderHistory || !folderHistory[tabId]) {
            // console.log("No navigation history found for tab:", tabId);
            folderHistory = folderHistory || {};
            folderHistory[tabId] = [
                  {
                        path: "",
                        files: [],
                  },
            ];
            return;
      }

      // Find the current folder's index in history
      const currentIndex = folderHistory[tabId].findIndex((item) => item.path === currentFolderPath[tabId]);

      if (currentIndex > 0) {
            // Get the previous folder
            const previousFolder = folderHistory[tabId][currentIndex - 1];

            // Update the current path
            currentFolderPath[tabId] = previousFolder.path;

            // Immediately render the previous folder content from cache
            const tab = document.getElementById(tabId);

            // Directly populate the tab with cached data
            populateTabWithFiles(tab, tabId, previousFolder.files, previousFolder.path);
      }
}

async function navigateToFolder(tabId, folderName, folderDataEncoded) {
      try {
            // Initialize the history objects if they don't exist
            if (!folderHistory) folderHistory = {};
            if (!currentFolderPath) currentFolderPath = {};
            if (!folderHistory[tabId]) {
                  folderHistory[tabId] = [{ path: "", files: [] }];
            }
            if (!currentFolderPath[tabId]) {
                  currentFolderPath[tabId] = "";
            }

            const folderData = JSON.parse(decodeURIComponent(folderDataEncoded));
            const folderPath = currentFolderPath[tabId] ? `${currentFolderPath[tabId]} > ${folderName}` : folderName;

            // Check if this folder is already in our history
            const existingFolderIndex = folderHistory[tabId].findIndex((item) => item.path === folderPath);
            const currentIndex = folderHistory[tabId].findIndex((item) => item.path === currentFolderPath[tabId]);

            const tab = document.getElementById(tabId);

            // If we've already visited this folder, use cached data
            if (existingFolderIndex !== -1) {
                  // Update the current path
                  currentFolderPath[tabId] = folderPath;

                  // When navigating to a folder that exists in our history,
                  // trim any history items that came after it
                  if (existingFolderIndex < folderHistory[tabId].length - 1) {
                        folderHistory[tabId] = folderHistory[tabId].slice(0, existingFolderIndex + 1);
                  }

                  // Use cached data
                  populateTabWithFiles(tab, tabId, folderHistory[tabId][existingFolderIndex].files, folderPath);
                  return;
            }

            // If we're navigating to a new folder, truncate any forward history
            if (currentIndex !== -1 && currentIndex < folderHistory[tabId].length - 1) {
                  folderHistory[tabId] = folderHistory[tabId].slice(0, currentIndex + 1);
            }

            // If it's a new folder, show loading state
            tab.innerHTML = `
            <div class="loading">
                <div class="file-icon-loading">
                    <img src="/static/images/loader-circle.svg" class="spin" alt="Loading Icon" />
                </div>
                Loading folder contents...
            </div>
        `;

            // Get folder ID from the folderData
            const folderId = folderData.id;

            // Prepare request data, including remoteItem info if available for shared folders
            const requestData = {
                  folder_id: folderId,
                  source: tabId === "myTab" ? "onedrive" : "shared",
            };

            // Add remoteItem data if it exists (for shared folders)
            if (folderData.remoteItem) {
                  requestData.remoteItem = folderData.remoteItem;
                  // console.log("Including remoteItem data for shared folder", requestData.remoteItem);
            }

            // Fetch folder contents
            const response = await fetch("/relaychat/get_onedrive_folder_contents", {
                  method: "POST",
                  headers: {
                        "Content-Type": "application/json",
                  },
                  body: JSON.stringify(requestData),
            });

            if (!response.ok) {
                  throw new Error("Failed to load folder contents");
            }

            const data = await response.json();

            // Update the current path
            currentFolderPath[tabId] = folderPath;

            // Add to history
            folderHistory[tabId].push({ path: folderPath, files: data.folder_contents });

            // console.log("History after adding:", folderHistory[tabId].map(h => h.path));

            // Populate the tab with the new data
            populateTabWithFiles(tab, tabId, data.folder_contents, folderPath);
      } catch (error) {
            console.error("Error navigating to folder:", error);
            showNotification("Error loading folder contents: " + error.message, "error");

            // Restore the previous view
            const tab = document.getElementById(tabId);
            const currentHistory = folderHistory && folderHistory[tabId] ? folderHistory[tabId].find((item) => item.path === currentFolderPath[tabId]) : null;

            if (currentHistory) {
                  populateTabWithFiles(tab, tabId, currentHistory.files, currentFolderPath[tabId]);
            }
      }
}

function getFileIcon(fileName) {
      const ext = fileName.split(".").pop().toLowerCase();
      switch (ext) {
            case "pdf":
                  return '<img src="/static/images/office/pdf.png" alt="PDF" class="file-icon" />';
            case "docx":
            case "doc":
                  return '<img src="/static/images/office/word.svg" alt="Word" class="file-icon" />';
            case "ppt":
            case "pptx":
                  return '<img src="/static/images/office/powerpoint.svg" alt="PowerPoint" class="file-icon" />';
            case "xls":
            case "xlsx":
            case "csv":
                  return '<img src="/static/images/office/excel.svg" alt="Excel" class="file-icon" />';
            default:
                  return '<img src="/static/images/office/file.svg" alt="File" class="file-icon" />';
      }
}

function getAccessTokenFromBackend() {
      return fetch("/getAccessToken", {
            method: "GET",
            headers: {
                  "Content-Type": "application/json",
            },
      })
            .then((response) => {
                  if (!response.ok) {
                        throw new Error("Failed to fetch access token");
                  }
                  return response.json();
            })
            .then((data) => {
                  if (data.access_token) {
                        return data.access_token;
                  } else {
                        throw new Error("Access token not available");
                  }
            })
            .catch((error) => {
                  console.error("Error fetching access token:", error);
                  return null;
            });
}


function updateFileIconInDOM(fileId, iconSrc, iconClass) {
      const fileElement = document.querySelector(`[data-file-id="${fileId}"]`);
      if (!fileElement) return;

      const iconElement = fileElement.querySelector(".file-icon");
      const iconContainer = fileElement.querySelector(".file-icon-container");
      const typeLabel = fileElement.querySelector(".file-type");

      if (iconElement) {
            iconElement.src = iconSrc;
            iconElement.classList.remove("spin");
      }

      if (iconContainer) {
            // Remove all icon classes
            iconContainer.classList.remove("file-icon-loading", "file-icon-spreadsheet", "file-icon-word", "file-icon-pdf", "file-icon-presentation", "file-icon-default", "file-icon-error");
            // Add the new class
            iconContainer.classList.add(iconClass);
      }

      // Update the file type label if present
      if (typeLabel) {
            const fileData = filesCollection.find((f) => f.id === fileId);
            if (fileData) {
                  typeLabel.textContent = fileData.typeLabel;
            }
      }
}
