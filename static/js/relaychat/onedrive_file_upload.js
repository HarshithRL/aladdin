async function loadOneDriveFilesModal() {
      const accessToken = await fetchAccessToken();
      currentBreadCrumbs = [];
      renderBreadcrumbs("OneDriveSharedFilesTab");
      showLoadingState("OneDriveSharedFilesTab");

      // Show the modal
      const oneDriveFileUploadModal = document.getElementById("oneDriveFileUploadModal");
      oneDriveFileUploadModal.style.display = "block";

      // Add close button event listener
      document.getElementById("closeOnedriveModalBtn").addEventListener("click", function () {
            document.getElementById("oneDriveFileUploadModal").style.display = "none";
      });

      document.getElementById("OnedriveMyFilesTab").style.display = "none";
      document.getElementById("OneDriveSharedFilesTab").style.display = "flex";

      document.getElementById("myTabBtn").classList.remove("active");
      document.getElementById("sharedTabBtn").classList.add("active");

      // Load SharePoint sites
      loadOneDriveSharedFiles(accessToken);
}
async function loadOneDriveSharedFiles(accessToken) {
      
      try {
            const response = await fetch("/relaychat/get_my_shared_files", {
                  method: "POST",
                  headers: {
                        "Content-Type": "application/json",
                  },
                  body: JSON.stringify({
                        access_token: accessToken
                  })
            });

            const data = await response.json();

            if (data.success) {
                  currentBreadCrumbs.push({
                        breadcrumbName: "Shared Files",
                        breadcrumbContents: [data.my_shared_files],
                        function: "renderFolderContents",
                        tabId: "OneDriveSharedFilesTab"
                  });
                  renderFolderContents([data.my_shared_files], "OneDriveSharedFilesTab");
                  renderBreadcrumbs("OneDriveSharedFilesTab");
                  
            } else {
                  showError(data.message || "Failed to load SharePoint sites");
            }
      } catch (error) {
            console.error("Error loading SharePoint sites:", error);
            showError("Network error occurred while loading sites");
      }
}
// 
// 
// 
// 
// 
// 
// 
// 
// 
// 
// 
// 
// 
// 
// 
// 
// 
// 
// 
// 
// 
// 
// 
// 
// 
// 
// 
// 
// 
// 
// 
// 
// 
// 
// 
// 
// 
// 
// 
// 
// 
// 
// 
async function loadOneDriveMyFiles() {
      const accessToken = await fetchAccessToken();
      currentBreadCrumbs = [];
      renderBreadcrumbs("OnedriveMyFilesTab");
      showLoadingState("OnedriveMyFilesTab");

      // Show the modal
      const oneDriveFileUploadModal = document.getElementById("oneDriveFileUploadModal");
      oneDriveFileUploadModal.style.display = "block";

      // Add close button event listener
      document.getElementById("closeOnedriveModalBtn").addEventListener("click", function () {
            document.getElementById("oneDriveFileUploadModal").style.display = "none";
      });

      document.getElementById("OnedriveMyFilesTab").style.display = "flex";
      document.getElementById("OneDriveSharedFilesTab").style.display = "none";

      document.getElementById("myTabBtn").classList.add("active");
      document.getElementById("sharedTabBtn").classList.remove("active");

      // Load SharePoint sites
      loadOneDriveMyFilesContent(accessToken);
}

async function loadOneDriveMyFilesContent(accessToken) {
      
      try {
            const response = await fetch("/relaychat/get_my_one_drive_files", {
                  method: "POST",
                  headers: {
                        "Content-Type": "application/json",
                  },
                  body: JSON.stringify({
                        access_token: accessToken
                  })
            });

            const data = await response.json();

            if (data.success) {
                  currentBreadCrumbs.push({
                        breadcrumbName: "My Files",
                        breadcrumbContents: [data.my_one_drive_files],
                        function: "renderFolderContents",
                        tabId: "OnedriveMyFilesTab"
                  });
                  renderFolderContents([data.my_one_drive_files], "OnedriveMyFilesTab");
                  renderBreadcrumbs("OnedriveMyFilesTab");
            } else {
                  showError(data.message || "Failed to load SharePoint sites");
            }
      } catch (error) {
            console.error("Error loading SharePoint sites:", error);
            showError("Network error occurred while loading sites");
      }
}