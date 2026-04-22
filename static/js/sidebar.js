function getAppName() {
      var url = window.location.href;
      var urlObj = new URL(url);
      var pathName = urlObj.pathname;
      var pathParts = pathName.split("/");
      var appName = pathParts[1];
      // console.log(appName);
      return appName;
}

function updateSidebarWithSession(sessionId, session_name) {
      const sessionList = document.getElementById("session-list");
      let noGroupContainer = document.getElementById("no_group");

      // Minimal metadata needed for rendering
      const dummyData = {
            "Unnamed Session": [
                  {
                        session_id: sessionId,
                        session_name: session_name,
                        session_last_updated_date: "today",
                        session_group_color: "#ccc",
                  },
            ],
      };

      // Create the session DOM element
      const sessionItem = createSessionItem(sessionId, session_name, dummyData, false);
      sessionItem.onclick = () => {
            window.location.href = `/${getAppName()}/${sessionId}`;
      };

      // Insert new session at the top
      noGroupContainer.insertBefore(sessionItem, noGroupContainer.firstChild);
}

async function deleteAllSessions() {
      // Show confirmation dialog
      const confirmation = confirm("Are you sure you want to delete all sessions?");
      if (!confirmation) {
            return; // Exit if the user cancels
      }

      try {
            // Send POST request to Flask backend to delete the specific session
            const response = await fetch(`/sidebar/delete_all_sessions`, {
                  method: "POST",
                  headers: {
                        "Content-Type": "application/json",
                  },
                  body: JSON.stringify({ app_name: `/${getAppName()}` }),
            });

            if (response.ok) {
                  showNotification("all Sessions deleted successfully.");
                  fetchAndRenderSessions();
            } else {
                  const errorMessage = await response.text();
                  showNotification("Failed to delete session: " + errorMessage, "error");
            }
      } catch (error) {
            // console.log("Error deleting session:", error);
            showNotification("An error occurred while deleting the session. Please try again.");
      }
}

async function deleteSession(sessionId) {
      // Show confirmation dialog
      const confirmation = confirm("Are you sure you want to delete this session?");
      if (!confirmation) {
            return; // Exit if the user cancels
      }

      try {
            // Send POST request to Flask backend to delete the specific session
            const response = await fetch(`/sidebar/delete_session`, {
                  method: "POST",
                  headers: {
                        "Content-Type": "application/json",
                  },
                  body: JSON.stringify({ session_id: sessionId }),
            });

            if (response.ok) {
                  showNotification("Session deleted successfully.");
                  // Remove the session from the DOM
                  const sessionElement = document.querySelector(`[session_id="${sessionId}"]`);
                  if (sessionElement) {
                        sessionElement.remove();
                  }
                  // Remove the session card from the DOM
                  existingCard = document.getElementById("session-card");
                  // console.log(existingCard);
                  if (existingCard) existingCard.remove();
            } else {
                  const errorMessage = await response.text();
                  showNotification("Failed to delete session: " + errorMessage);
            }
      } catch (error) {
            // console.log("Error deleting session:", error);
            showNotification("An error occurred while deleting the session. Please try again.");
      }
}

async function removeFromSessionGroup(sessionId) {
      // Show confirmation dialog
      const confirmation = confirm("Are you sure you want to remove this session from this group?");
      if (!confirmation) {
            return; // Exit if the user cancels
      }

      try {
            // Send POST request to Flask backend to delete the specific session
            const response = await fetch(`/sidebar/remove_from_session_group`, {
                  method: "POST",
                  headers: {
                        "Content-Type": "application/json",
                  },
                  body: JSON.stringify({ session_id: sessionId }),
            });

            if (response.ok) {
                  showNotification("Session deleted successfully.");
                  // Remove the session from the DOM
                  const sessionElement = document.querySelector(`[session_id="${sessionId}"]`);
                  if (sessionElement) {
                        sessionElement.remove();
                  }
            } else {
                  const errorMessage = await response.text();
                  showNotification("Failed to delete session: " + errorMessage);
            }
      } catch (error) {
            // console.log("Error deleting session:", error);
            showNotification("An error occurred while deleting the session. Please try again.");
      }
}

let isSidebarLocked = false; // Keeps track of whether the sidebar is locked

function collapseSidebar() {
    if (isSidebarLocked) return; // Prevent collapsing if locked

    const sidebar = document.getElementById("sidebar");
    const collapseButton = document.getElementById("collapse-sidebar");
    const elementsToFade = document.querySelectorAll(
        ".recent-chats-text, .new-session-text, .sidebar-recent-part, .sidebar-bottom-chats-text"
    );
    // const logo = document.getElementById("sidebar-logo"); // No longer an img
    const brandText = document.getElementById("sidebar-brand-text");

    // Shrink width
    sidebar.style.width = "70px";
    sidebar.classList.add("collapsed");
    collapseButton.style.transform = "rotate(180deg)";

    // Hide brand text
    if (brandText) {
        brandText.style.opacity = "0";
        setTimeout(() => { brandText.style.display = "none"; }, 300);
    }

    // Fade out text
    elementsToFade.forEach((el) => {
        el.style.fontSize = "0";
    });

    setTimeout(() => {
        elementsToFade.forEach((el) => {
            el.style.display = "none";
            el.style.opacity = "0"; // Ensure opacity transition works if added
        });
    }, 300);
}

function expandSidebar() {
    const sidebar = document.getElementById("sidebar");
    const collapseButton = document.getElementById("collapse-sidebar");
    const elementsToFade = document.querySelectorAll(
        ".recent-chats-text, .new-session-text, .sidebar-recent-part, .sidebar-bottom-chats-text"
    );
    // const logo = document.getElementById("sidebar-logo"); 
    const brandText = document.getElementById("sidebar-brand-text");

    // Expand width
    sidebar.style.width = "350px";
    sidebar.classList.remove("collapsed");
    collapseButton.style.transform = "rotate(0deg)";

    // Show brand text
    if (brandText) {
         brandText.style.display = "block";
         setTimeout(() => { brandText.style.opacity = "1"; }, 10);
    }

    // Show text back
    elementsToFade.forEach((el) => {
        el.style.display = "block";
        el.style.opacity = "1";
        el.style.fontSize = "";
    });
}

function toggleSidebarLock() {
      const sidebar = document.getElementById("sidebar");
      const collapseButton = document.getElementById("collapse-sidebar");

      isSidebarLocked = !isSidebarLocked; // Toggle lock state

      if (isSidebarLocked) {
            // // Lock sidebar open
            // sidebar.style.width = "350px"; // Ensure it’s fully expanded
            // collapseButton.style.transform = "rotate(0deg)";
            expandSidebar();
      } else {
            // // Unlock sidebar; allow default behavior
            // collapseSidebar(); // Collapse immediately to restore behavior
            // collapseButton.style.transform = "rotate(180deg)";
            collapseSidebar();
      }
}

// Wrapper for onmouseenter
function handleSidebarMouseEnter() {
      if (!isSidebarLocked) expandSidebar(); // Only call expandSidebar if not locked
}

// Wrapper for onmouseleave
function handleSidebarMouseLeave() {
      if (!isSidebarLocked) collapseSidebar(); // Only call collapseSidebar if not locked
}

/// Function to create the back button
function createBackButton() {
      const backButton = document.createElement("button");
      backButton.className = "group-folder-back-button hidden";

      // SVG icon for the back button
      backButton.innerHTML = `
      <img class="icon-svg" src="/static/images/lucide_icons/move-left.svg" />
      Back
      `;

      return backButton;
}

async function showAppInfo() {
      try {
            const response = await fetch(`/sidebar/get_app_info`, {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ app_name: getAppName() }),
            });
            if (!response.ok) {
                  throw new Error("Failed to fetch app info");
            }
            const data = await response.json();
            renderTextCard(data.app_info_text, data.what_is_new);
      } catch (error) {
            console.error("Error fetching app info:", error);
      }
}

function renderTextCard(appInfoText, whatIsNew) {
      const existingCard = document.getElementById("text-card");
      if (existingCard) existingCard.remove(); // Remove any existing card

      // Create card container
      const card = document.createElement("div");
      card.className = "popup-card-container";
      card.id = "text-card";

      // Create card content
      const cardContent = document.createElement("div");
      cardContent.className = "card card-content app-info-card";

      // Header with close button
      const cardHeader = document.createElement("div");
      cardHeader.className = "popup-header";

      const title = document.createElement("h2");
      title.textContent = "App Info";

      const closeButton = document.createElement("button");
      closeButton.className = "close-button";
      closeButton.id = "closePopup";
      closeButton.textContent = "✕";

      cardHeader.appendChild(title);
      cardHeader.appendChild(closeButton);

      // Create Tab navigation
      const tabContainer = document.createElement("div");
      tabContainer.className = "tab-container";

      const tabAppInfo = document.createElement("div");
      tabAppInfo.className = "app-info-tab active";
      tabAppInfo.textContent = "Overview";
      tabAppInfo.onclick = () => switchTab("app-info");

      const tabWhatIsNew = document.createElement("div");
      tabWhatIsNew.className = "app-info-tab";
      tabWhatIsNew.textContent = "What's New";
      tabWhatIsNew.onclick = () => switchTab("what-is-new");

      tabContainer.appendChild(tabAppInfo);
      tabContainer.appendChild(tabWhatIsNew);

      // Content sections for the tabs
      const contentContainer = document.createElement("div");
      contentContainer.className = "content-container  minimal-scrollbar";

      const appInfoSection = document.createElement("div");
      appInfoSection.className = "app-info-tab-content app-info card-text message";
      appInfoSection.innerHTML = marked.parse(appInfoText); // Markdown parsing
      contentContainer.appendChild(appInfoSection);

      const whatIsNewSection = document.createElement("div");
      whatIsNewSection.className = "app-info-tab-content what-is-new card-text message";
      whatIsNewSection.innerHTML = marked.parse(whatIsNew); // Markdown parsing
      contentContainer.appendChild(whatIsNewSection);

      // Default display (show app info first)
      appInfoSection.style.display = "block";
      whatIsNewSection.style.display = "none";

      // Tab switching logic
      function switchTab(tabName) {
            if (tabName === "app-info") {
                  appInfoSection.style.display = "block";
                  whatIsNewSection.style.display = "none";
                  tabAppInfo.classList.add("active");
                  tabWhatIsNew.classList.remove("active");
            } else if (tabName === "what-is-new") {
                  appInfoSection.style.display = "none";
                  whatIsNewSection.style.display = "block";
                  tabAppInfo.classList.remove("active");
                  tabWhatIsNew.classList.add("active");
            }
      }

      // Append elements
      cardContent.appendChild(cardHeader);
      cardContent.appendChild(tabContainer);
      cardContent.appendChild(contentContainer);
      card.appendChild(cardContent);
      document.body.appendChild(card);

      // Close on button click
      closeButton.addEventListener("click", () => {
            card.remove();
      });

      // Close on clicking outside the cardContent
      function handleOutsideClick(event) {
            if (!cardContent.contains(event.target)) {
                  card.remove();
                  document.removeEventListener("click", handleOutsideClick);
            }
      }

      // Slight delay ensures event doesn't fire immediately on append
      setTimeout(() => {
            document.addEventListener("click", handleOutsideClick);
      }, 0);
}

function addToGroup(sessionId, selectedColor, groupName) {
      fetch(`/sidebar/add_session_to_group`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ session_id: sessionId, group_name: groupName, selectedColor: selectedColor }),
      })
            .then((response) => response.json())
            .then((result) => {
                  if (result.success) {
                        showNotification("Session added to group successfully!");
                        hideAddToGroupMenu(sessionId);
                        window.location.href = `/${getAppName()}/`;
                  } else {
                        showNotification("Failed to add session to group.");
                  }
            })
            .catch((error) => console.error("Error adding session to group:", error));
}
function moveSessionToGroup(sessionId, session_group_name) {
      fetch(`/sidebar/move_session_to_group`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ session_id: sessionId, session_group_name: session_group_name }),
      })
            .then((response) => response.json())
            .then((data) => {
                  if (!data.success) {
                        showNotification("Failed to update session group.");
                  } else {
                        showNotification("Session group updated successfully!");
                        window.location.href = `/${getAppName()}/`;
                  }
            })
            .catch((error) => console.error("Error updating session group:", error));
}

// Functions to handle renaming and adding to group
function renameSession(sessionId, sessionName) {
      // console.log(`Renaming session ${sessionId} to ${sessionName}`);
}
// Function to change session group color
function changeSessionGroupColor(sessionGroupName, newColor) {
      // console.log(`Changing color of session group '${sessionGroupName}' to ${newColor}`);
      fetch(`/sidebar/change_session_group_color`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ session_group_name: sessionGroupName, new_color: newColor }),
      })
            .then((response) => response.json())
            .then((result) => {
                  if (result.success) {
                        showNotification("Session group color updated successfully!");
                        window.location.href = `/${getAppName()}/`;
                  } else {
                        showNotification("Failed to update session group color.");
                  }
            })
            .catch((error) => console.error("Error changing session group color:", error));
}

// Function to delete session group
function deleteSessionGroup(sessionGroupName) {
      // console.log(`Deleting session group '${sessionGroupName}'`);
      fetch(`/sidebar/delete_session_group`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ session_group_name: sessionGroupName }),
      })
            .then((response) => response.json())
            .then((result) => {
                  if (result.success) {
                        showNotification("Session group deleted successfully!");
                        window.location.href = `/${getAppName()}/`;
                  } else {
                        showNotification("Failed to delete session group.");
                  }
            })
            .catch((error) => console.error("Error deleting session group:", error));
}

// Function to change session group color
function changeSessionGroupColor(sessionGroupName, newColor) {
      // console.log(`Changing color of session group '${sessionGroupName}' to ${newColor}`);
      fetch(`/sidebar/change_session_group_color`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ session_group_name: sessionGroupName, new_color: newColor }),
      })
            .then((response) => response.json())
            .then((result) => {
                  if (result.success) {
                        showNotification("Session group color updated successfully!");
                        window.location.href = `/${getAppName()}/`;
                  } else {
                        showNotification("Failed to update session group color.");
                  }
            })
            .catch((error) => console.error("Error changing session group color:", error));
}

// Function to delete session group
function renameSessionGroup(old_group_name, new_group_name) {
      fetch(`/sidebar/rename_session_group`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ old_group_name: old_group_name, new_group_name: new_group_name }),
      })
            .then((response) => response.json())
            .then((result) => {
                  if (result.success) {
                        showNotification("Session group updated successfully!");
                        window.location.href = `/${getAppName()}/`;
                  } else {
                        showNotification("Failed to delete session group.");
                  }
            })
            .catch((error) => console.error("Error deleting session group:", error));
}

function renderSessionGroupCard(sessionGroupName, currentColor) {
      // Remove any existing card first
      const existingCard = document.getElementById("session-group-card");
      if (existingCard) existingCard.remove();

      // Create new card
      const card = document.createElement("div");
      card.className = "popup-card-container card";
      card.id = "session-group-card";

      const cardContent = document.createElement("div");
      cardContent.className = "card card-content session-group-content";

      // Header with close button
      const cardHeader = document.createElement("div");
      cardHeader.className = "popup-header";

      const title = document.createElement("h2");
      title.textContent = "Session Group Settings";

      const closeButton = document.createElement("button");
      closeButton.className = "close-button";
      closeButton.id = "closePopup";
      closeButton.textContent = "✕";

      // Add click event to close button
      closeButton.addEventListener("click", () => {
            card.remove();
      });

      cardHeader.appendChild(title);
      cardHeader.appendChild(closeButton);

      // Input for renaming the group
      const inputGroup = document.createElement("div");
      inputGroup.className = "input-group";

      const label = document.createElement("label");
      label.htmlFor = "group-name";
      label.textContent = "Group Name";

      const input = document.createElement("input");
      input.type = "text";
      input.id = "group-name";
      input.placeholder = "Enter new group name";
      input.value = sessionGroupName;

      inputGroup.appendChild(label);
      inputGroup.appendChild(input);

      // Color selection
      const colorContainer = document.createElement("div");
      colorContainer.className = "color-container";

      const colors = ["#FF6961", "#77DD77", "#AEC6CF", "#FFB6C1", "#f9f941"];
      let selectedColor = currentColor || colors[0];

      colors.forEach((color) => {
            const colorCircle = document.createElement("div");
            colorCircle.className = "color-circle";
            colorCircle.style.backgroundColor = color;
            colorCircle.dataset.color = color;
            if (color === selectedColor) colorCircle.classList.add("selected");

            colorCircle.addEventListener("click", function () {
                  document.querySelectorAll(".color-circle").forEach((c) => c.classList.remove("selected"));
                  this.classList.add("selected");
                  selectedColor = this.dataset.color;
            });

            colorContainer.appendChild(colorCircle);
      });

      // Buttons
      const buttonGroup = document.createElement("div");
      buttonGroup.className = "button-group";

      const saveButton = document.createElement("button");
      saveButton.className = "save-button";
      saveButton.classList.add("button-template");
      saveButton.textContent = "Save Changes";
      saveButton.onclick = () => {
            renameSessionGroup(sessionGroupName, input.value);
            changeSessionGroupColor(sessionGroupName, selectedColor);
            window.location.href = `/${getAppName()}/`;
      };

      const deleteButton = document.createElement("button");
      deleteButton.className = "delete-button";
      deleteButton.classList.add("button-template");
      deleteButton.textContent = "Delete Group";
      deleteButton.onclick = () => {
            const confirmDelete = confirm(`Are you sure you want to delete the group "${sessionGroupName}"?`);
            if (confirmDelete) {
                  deleteSessionGroup(sessionGroupName);
                  window.location.href = `/${getAppName()}/`;
            }
      };

      buttonGroup.appendChild(saveButton);
      buttonGroup.appendChild(deleteButton);

      // Append elements
      cardContent.appendChild(cardHeader);

      // Create card body
      const cardBody = document.createElement("div");
      cardBody.className = "card-body";

      cardBody.appendChild(inputGroup);
      cardBody.appendChild(colorContainer);
      cardBody.appendChild(buttonGroup);

      cardContent.appendChild(cardBody);
      card.appendChild(cardContent);

      document.body.appendChild(card);

      // Set up the outside click listener
      function handleOutsideClick(event) {
            // Check if the click is outside the card content
            if (card && !cardContent.contains(event.target)) {
                  card.remove();
                  document.removeEventListener("click", handleOutsideClick);
            }
      }

      // Add a small delay before adding the click listener
      // to prevent it from immediately triggering when the card is created
      setTimeout(() => {
            document.addEventListener("click", handleOutsideClick);
      }, 100);
}

function createDropdownMenu(sessionId, sessionGroupId, isGrouped) {
      const dropdownMenu = document.createElement("div");
      dropdownMenu.className = "dropdown-menu hidden";
      dropdownMenu.id = `options-menu-${sessionId}`;

      const deleteOption = createDropdownItem("/static/images/delete_black.svg", "Delete", () => deleteSession(sessionId));
      dropdownMenu.appendChild(deleteOption);

      if (isGrouped) {
            const removeOption = createDropdownItem("/static/images/remove.svg", "Remove from Group", () => removeFromGroup(sessionGroupId, sessionId));
            dropdownMenu.appendChild(removeOption);
      } else {
            const addToGroupOption = createDropdownItem("/static/images/folder-closed.svg", "Add to Group", () => showAddToGroupMenu(sessionId));
            dropdownMenu.appendChild(addToGroupOption);
      }

      return dropdownMenu;
}

function createDropdownItem(iconSrc, text, onClick) {
      const item = document.createElement("div");
      item.className = "dropdown-item";
      item.onclick = (event) => {
            event.stopPropagation();
            onClick();
      };
      item.innerHTML = `<img src="${iconSrc}" class="options-icon icon-svg" /> ${text}`;
      return item;
}

function createAddToGroupMenu(sessionId) {
      const addToGroupMenu = document.createElement("div");
      addToGroupMenu.className = "add-to-group-menu hidden";
      addToGroupMenu.id = `add-to-group-menu-${sessionId}`;
      addToGroupMenu.innerHTML = `
      <h4>Add to Group</h4>
      <select id="group-select-${sessionId}">
          <option value="">Create New Group</option>
      </select>
      <input type="text" id="new-group-name-${sessionId}" placeholder="New Group Name">
  `;

      const colorContainer = createColorContainer();
      const buttonContainer = createGroupMenuButtons(sessionId, colorContainer);

      addToGroupMenu.appendChild(colorContainer);
      addToGroupMenu.appendChild(buttonContainer);
      addToGroupMenu.addEventListener("click", (e) => e.stopPropagation());

      return addToGroupMenu;
}

function createColorContainer() {
      const colorContainer = document.createElement("div");
      colorContainer.className = "color-container";

      const colors = ["#FF69B4", "#34A85A", "#FFC107", "#8E24AA", "#4CAF50"];
      colors.forEach((color) => {
            const colorCircle = document.createElement("div");
            colorCircle.className = "color-circle";
            colorCircle.style.backgroundColor = color;
            colorCircle.dataset.color = color;
            colorContainer.appendChild(colorCircle);
      });

      colorContainer.addEventListener("click", (e) => {
            if (e.target.classList.contains("color-circle")) {
                  colorContainer.querySelectorAll(".color-circle").forEach((circle) => circle.classList.remove("selected"));
                  e.target.classList.add("selected");
            }
      });

      return colorContainer;
}

function createGroupMenuButtons(sessionId, colorContainer) {
      const buttonContainer = document.createElement("div");

      const addToGroupButton = document.createElement("button");
      addToGroupButton.textContent = "Add";
      addToGroupButton.onclick = (e) => {
            e.stopPropagation();
            const selectedColor = colorContainer.querySelector(".selected")?.dataset.color || "#FF69B4";
            addToGroup(sessionId, selectedColor);
      };

      const cancelButton = document.createElement("button");
      cancelButton.textContent = "Cancel";
      cancelButton.onclick = (e) => {
            e.stopPropagation();
            hideAddToGroupMenu(sessionId);
      };

      buttonContainer.appendChild(addToGroupButton);
      buttonContainer.appendChild(cancelButton);

      return buttonContainer;
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
//
//
//
//
//
//
//
// document.getElementById("createNewProjectButton").addEventListener("click", () => {
//       showCreateProjectPopup();
// });
function showCreateProjectPopup(projectId = null, projectColor = null, projectName = "", endpoint = "/sidebar/create_new_project", projectIcon = null) {
  const existing = document.querySelector(".create-new-project-overlay");
  if (existing) existing.remove();

  const overlay = document.createElement("div");
  overlay.className = "create-new-project-overlay";

  const folderColors = ["#f87171", "#fbbf24", "#34d399", "#60a5fa", "#a78bfa", "#f472b6"];
  let selectedColor = projectColor || folderColors[0];

  fetch(`/sidebar/get_project_icons`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ hello: "hello" }),
  })
    .then((response) => response.json())
    .then((result) => {
      if (!result.success) {
        showNotification("Failed to get project icons", "error");
        return;
      }

      const projectIcons = result.icons.map((icon) => `/static/images/lucide_icons/project_icons/${icon}`);
      const popup = document.createElement("div");
      popup.className = "create-new-project-popup";

      popup.innerHTML = `
        <div class="create-new-project-header">
          <h2>${projectId ? "Edit project" : "Create new project"}</h2>
          <button class="create-new-project-close-button" id="closeCreateProjectPopup">
            <img class="settings-icon icon-svg" src="/static/images/lucide_icons/x.svg" />
          </button>
        </div>

        <div class="create-new-project-body">
          <input type="text" class="create-new-project-input" placeholder="Project name" value="${projectName}" />

          <div class="create-new-project-section-title">Choose Icon</div>
          <div class="create-new-project-icon-toolbar">
            <div class="search-wrapper">
              <img class="search-icon" src="/static/images/lucide_icons/search.svg" />
              <input type="text" placeholder="Search..." class="create-new-project-icon-search" />
            </div>
            <button id="randomIcon">
              <img class="icon-svg" src="/static/images/lucide_icons/shuffle.svg" />
            </button>
          </div>

          <div class="create-new-project-icon-grid">
            ${projectIcons.map((path) => {
              const isSelected = projectIcon && path === projectIcon;
              return `
                <div class="create-new-project-icon-wrapper ${isSelected ? "selected" : ""}" 
                     data-icon="${path}" 
                     style="background-color: ${selectedColor || "transparent"};">
                  <img src="${path}" class="create-new-project-icon-img" />
                </div>`;
            }).join("")}
          </div>

          <div class="create-new-project-section-title">Choose Color</div>
          <div class="create-new-project-color-picker">
            <div class="create-new-project-color-swatch no-color-swatch" title="Remove color" data-color="none">
              <img src="/static/images/lucide_icons/x.svg" class="remove-color-icon" />
            </div>
            ${folderColors.map(
              (color) => `
                <div class="create-new-project-color-swatch ${color === selectedColor ? "selected" : ""}" 
                     data-color="${color}" style="background-color: ${color};"></div>`
            ).join("")}
          </div>

          <button class="create-new-project-submit">${projectId ? "Update" : "Create"}</button>
        </div>
      `;

      overlay.appendChild(popup);
      document.body.appendChild(overlay);

      document.getElementById("closeCreateProjectPopup").onclick = () => overlay.remove();
      overlay.onclick = (e) => {
        if (e.target === overlay) overlay.remove();
      };

      // Icon selection
      popup.querySelectorAll(".create-new-project-icon-wrapper").forEach((el) => {
        el.onclick = () => {
          popup.querySelectorAll(".create-new-project-icon-wrapper").forEach((e) => e.classList.remove("selected"));
          el.classList.add("selected");
        };
      });

      // Search filter
      const searchInput = popup.querySelector(".create-new-project-icon-search");
      searchInput.addEventListener("input", () => {
        const query = searchInput.value.toLowerCase();
        popup.querySelectorAll(".create-new-project-icon-wrapper").forEach((el) => {
          const match = el.getAttribute("data-icon").toLowerCase().includes(query);
          el.style.display = match ? "inline-block" : "none";
        });
      });

      // Random icon picker
      document.getElementById("randomIcon").onclick = () => {
        const icons = [...popup.querySelectorAll(".create-new-project-icon-wrapper")].filter(
          (i) => i.style.display !== "none"
        );
        popup.querySelectorAll(".create-new-project-icon-wrapper").forEach((i) => i.classList.remove("selected"));
        if (icons.length > 0) {
          const rand = icons[Math.floor(Math.random() * icons.length)];
          rand.classList.add("selected");
          rand.scrollIntoView({ behavior: "smooth", block: "center" });
        }
      };

      // Color picker
      popup.querySelectorAll(".create-new-project-color-swatch").forEach((swatch) => {
        swatch.onclick = () => {
          popup.querySelectorAll(".create-new-project-color-swatch").forEach((s) => s.classList.remove("selected"));
          swatch.classList.add("selected");

          const color = swatch.dataset.color;
          selectedColor = color === "none" ? null : color;

          popup.querySelectorAll(".create-new-project-icon-wrapper").forEach((wrapper) => {
            wrapper.style.backgroundColor = selectedColor || "transparent";
          });
        };
      });

      // Submit
      popup.querySelector(".create-new-project-submit").onclick = () => {
        const name = popup.querySelector(".create-new-project-input").value.trim();
        const selected = popup.querySelector(".create-new-project-icon-wrapper.selected");

        if (!name || !selected) {
          alert("Please enter a project name and select an icon.");
          return;
        }

        const iconPath = selected.getAttribute("data-icon");

        fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            session_group_id: projectId || generateSessionId(),
            session_group_name: name,
            project_icon: iconPath,
            session_group_color: selectedColor,
            app_name: getAppName(),
          }),
        })
          .then((res) => res.json())
          .then((data) => {
            if (data.success) {
              overlay.remove();
              showNotification(projectId ? "Project updated" : "Project created", "success", 5);
              fetchAndRenderSessions();
            } else {
              showNotification("Failed to save project", "error", 5);
            }
          });
      };
    });
}



function fetchAndRenderSessions() {
      const projectListContainer = document.getElementById("project-list");
      const noGroupContainer = document.createElement("div");

      noGroupContainer.className = "no_group";
      noGroupContainer.id = "no_group";
      projectListContainer.innerHTML = "";

      fetch(`/sidebar/get_all_sessions_and_projects`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ app_name: getAppName() }),
      })
            .then((response) => response.json())
            .then((data) => {
                  const projectNameAndIds = [];

                  for (const groupName in data.grouped_sessions) {
                        const groupData = data.grouped_sessions[groupName];
                        projectNameAndIds.push({
                              project_name: groupName,
                              project_id: groupData.session_group_id,
                              project_group_color: groupData.session_group_color,
                              project_group_details: groupData.session_group_details,
                        });
                  }

                  // Store all session groups and no_group containers
                  const allContainers = new Map();

                  // Clear existing content
                  const sessionList = document.getElementById("session-list");
                  sessionList.innerHTML = "";

                  data.ungrouped_sessions.forEach((item) => {
                        const sessionItem = createSessionItem(item.session_id, item.session_name, projectNameAndIds);
                        noGroupContainer.appendChild(sessionItem);
                  });

                  sessionList.appendChild(noGroupContainer);

                  // Add the no_group container to our map
                  allContainers.set("no_group", noGroupContainer);

                  // Create and append the back button (initially hidden)
                  const backButton = createBackButton();
                  backButton.style.display = "none";
                  projectListContainer.appendChild(backButton);

                  // // Iterate through session groups
                  data.session_group_names_by_app.forEach((item) => {});
                  for (const groupName in data.grouped_sessions) {
                        const groupData = data.grouped_sessions[groupName];
                        const groupIcon = JSON.parse(groupData.session_group_details).project_icon



                        const { session_group_color, session_group_id, sessions } = groupData;

                        const groupContainer = document.createElement("div");
                        groupContainer.className = "session-group";
                        groupContainer.id = session_group_id;
                        const groupFolder = createProjectItem(session_group_id, groupName, groupIcon, session_group_color);
                        groupContainer.appendChild(groupFolder);
                        projectListContainer.appendChild(groupContainer);

                        // Create a container for this group's sessions (initially hidden)
                        const groupSessionsContainer = document.createElement("div");
                        groupSessionsContainer.className = "session-group-expanded";
                        groupSessionsContainer.id = `expanded-${session_group_id}`;
                        groupSessionsContainer.style.display = "none";

                        // Add all sessions for this group
                        sessions.forEach((session) => {
                              const sessionItem = createSessionItem(session.session_id, session.session_name, projectNameAndIds);
                              groupSessionsContainer.appendChild(sessionItem);
                        });

                        // // Add the expanded view to our map to reference later
                        allContainers.set(`expanded-${session_group_id}`, groupSessionsContainer);

                        // // When clicked, hide all groups and show only this group's sessions
                        groupFolder.onclick = () => {
                              // Hide all regular containers
                              allContainers.forEach((container) => {
                                    container.style.display = "none";
                              });

                              // Show back button and this group's sessions
                              backButton.style.display = "flex";
                              groupSessionsContainer.style.display = "block";
                              document.querySelector(".sidebar-heading.today-heading").style.display = "none";
                        };

                        groupContainer.appendChild(groupFolder);
                        projectListContainer.appendChild(groupContainer);
                        projectListContainer.appendChild(groupSessionsContainer);

                        // Add the group container to our map
                        allContainers.set(`group-${groupName}`, groupContainer);
                  }
                  // Set up the back button to restore normal view
                  backButton.onclick = () => {
                        // Hide all expanded group views
                        allContainers.forEach((container, key) => {
                              if (key.startsWith("expanded-")) {
                                    container.style.display = "none";
                              } else {
                                    container.style.display = "block";
                              }
                        });

                        // Hide the back button
                        backButton.style.display = "none";
                        document.querySelector(".sidebar-heading.today-heading").style.display = "block";
                  };
            })
            .catch((error) => console.error("Error fetching previous session metadata:", error));
}
document.addEventListener("DOMContentLoaded", fetchAndRenderSessions);
function createSessionItem(sessionId, sessionName, session_group_names_by_app) {
      const chatItem = document.createElement("div");
      chatItem.className = "chat-item";
      chatItem.id = sessionId;
      chatItem.setAttribute("session_id", sessionId);
      // chatItem.setAttribute("draggable", "true");
      // chatItem.setAttribute("ondragstart", "drag(event)");

      chatItem.onclick = () => {
            // Remove 'highlighted-chat-item' from other items
            const chatItems = document.getElementsByClassName("chat-item");
            for (let i = 0; i < chatItems.length; i++) {
                  chatItems[i].classList.remove("highlighted-chat-item");
            }

            // Highlight this item
            chatItem.classList.add("highlighted-chat-item");

            // Load session data
            loadSessionData(sessionId);
      };

      if (sessionId === currentSessionId) {
            chatItem.classList.add("highlighted-chat-item");
      }

      const chatQuestion = document.createElement("div");
      chatQuestion.className = "chat-item-question";
      chatQuestion.textContent = sessionName;

      const chatQuestionIcon = document.createElement("div");
      chatQuestionIcon.className = "chat-item-question-icon";
      chatQuestionIcon.innerHTML = "<img src='/static/images/lucide_icons/message-square.svg' class='chat-item-question-icon-png icon-svg' />";

      const chatOptions = createChatOptions(sessionId, sessionName, session_group_names_by_app);

      chatItem.appendChild(chatQuestionIcon);
      chatItem.appendChild(chatQuestion);
      chatItem.appendChild(chatOptions);

      return chatItem;
}
function createChatOptions(sessionId, sessionName, session_group_names_by_app) {
      const chatOptions = document.createElement("div");
      chatOptions.className = "chat-item-options";

      const optionsIcon = document.createElement("img");
      optionsIcon.src = "/static/images/options.svg";
      optionsIcon.className = "options-icon icon-svg";

      optionsIcon.addEventListener("click", (event) => {
            showContextMenu(event, sessionId, sessionName, session_group_names_by_app);
      });

      chatOptions.appendChild(optionsIcon);
      return chatOptions;
}
function showContextMenu(event, sessionId, sessionName, session_group_names_by_app) {
      event.stopPropagation();

      // Remove any existing menus
      const existing = document.querySelector(".context-menu");
      if (existing) existing.remove();

      // Remove old highlights
      document.querySelectorAll(".chat-item").forEach((item) => {
            item.classList.remove("active-chat-options");
      });

      // Highlight the current chat item
      const chatItem = document.getElementById(sessionId);
      if (chatItem) chatItem.classList.add("active-chat-options");

      // Create the context menu
      const menu = document.createElement("div");
      menu.className = "context-menu";

      // --- Rename ---
      const rename = document.createElement("div");
      rename.className = "context-menu-item";
      rename.innerHTML = `
        <img src="/static/images/lucide_icons/pencil.svg" class="icon-svg" alt="rename Icon" />
        <span>Rename</span>
    `;
      rename.onclick = () => {
            renderRenameInline(sessionId);
            menu.remove();
      };

      // --- Delete ---
      const del = document.createElement("div");
      del.className = "context-menu-item";
      del.innerHTML = `
        <img src="/static/images/lucide_icons/trash-2.svg" class="icon-svg" alt="delete Icon" />
        <span>Delete</span>
    `;
      del.onclick = () => {
            deleteSession(sessionId);
            menu.remove();
      };

      // --- Project (with submenu) ---
      const project = document.createElement("div");
      project.className = "context-menu-item project";
      project.innerHTML = `
        <img src="/static/images/lucide_icons/folder.svg" class="icon-svg" alt="project Icon" />
        <span>Project</span>
        <span style="margin-left:auto;">
            <img src="/static/images/lucide_icons/chevron-right.svg" class="icon-svg" alt="chevron-right Icon" />
        </span>
    `;

      const submenu = document.createElement("div");
      submenu.className = "context-submenu";

      session_group_names_by_app.forEach((p) => {
            const item = document.createElement("div");
            console.log(p.project_group_details);
            const ProjectIcon = JSON.parse(p.project_group_details).project_icon;
            item.className = "context-menu-item";
            item.innerHTML = `
            <img src="/static/images/lucide_icons/folder.svg" class="icon-svg" alt="project Icon" />
            <span>${p.project_name}</span>
        `;
            item.onclick = () => {
                  assignProject(p.project_id, p.project_name, p.project_group_color, ProjectIcon, sessionId, sessionName, p.project_group_details);
                  menu.remove();
            };
            submenu.appendChild(item);
      });

      const createNew = document.createElement("div");
      createNew.className = "context-menu-item";
      createNew.innerHTML = `
        <img src="/static/images/lucide_icons/folder-plus.svg" class="icon-svg" alt="new project Icon" />
        <span>Create new project</span>
    `;
      createNew.onclick = () => {
            showCreateProjectPopup();
            menu.remove();
      };

      submenu.appendChild(createNew);
      project.appendChild(submenu);

      // Attach items
      menu.appendChild(rename);
      menu.appendChild(del);
      menu.appendChild(project);

      document.body.appendChild(menu);

      // Position it near the clicked icon
      const rect = event.currentTarget.getBoundingClientRect();
      menu.style.top = `${rect.bottom + window.scrollY}px`;
      menu.style.left = `${rect.left + window.scrollX}px`;

      // Click anywhere else closes it
      setTimeout(() => {
            document.addEventListener(
                  "click",
                  () => {
                        menu.remove();
                        if (chatItem) chatItem.classList.remove("active-chat-options");
                  },
                  { once: true }
            );
      }, 200);
}

function renderRenameInline(sessionId) {
      // Remove any existing rename popups
      const existingPopup = document.getElementById("rename-popup");
      if (existingPopup) existingPopup.remove();

      const chatItem = document.getElementById(sessionId);
      const currentName = chatItem?.querySelector(".chat-item-question")?.textContent || "";

      // Create overlay
      const overlay = document.createElement("div");
      overlay.id = "rename-popup";
      overlay.style.position = "fixed";
      overlay.style.top = "0";
      overlay.style.left = "0";
      overlay.style.width = "100vw";
      overlay.style.height = "100vh";
      overlay.style.background = "rgba(0, 0, 0, 0.4)";
      overlay.style.display = "flex";
      overlay.style.alignItems = "center";
      overlay.style.justifyContent = "center";
      overlay.style.zIndex = "2000";

      // Popup box
      const popup = document.createElement("div");
      popup.style.background = "white";
      popup.style.padding = "10px";
      popup.style.borderRadius = "20px";
      popup.style.boxShadow = "0 10px 30px rgba(0,0,0,0.2)";
      popup.style.display = "flex";
      popup.style.gap = "10px";
      popup.style.minWidth = "300px";

      // Input
      const input = document.createElement("input");
      input.type = "text";
      input.placeholder = "Enter new session name";
      input.value = currentName;
      input.style.padding = "8px 12px";
      input.style.fontSize = "14px";
      input.style.border = "1px solid #ccc";
      input.style.borderRadius = "10px";
      input.style.outline = "none";

      // Buttons container
      const buttons = document.createElement("div");
      buttons.style.display = "flex";
      buttons.style.justifyContent = "flex-end";
      buttons.style.gap = "10px";

      // ✅ Confirm button
      const confirmBtn = document.createElement("button");
      confirmBtn.innerHTML = `<img src="/static/images/lucide_icons/check.svg" class="icon-svg" alt="confirm" />`;
      confirmBtn.style.border = "none";
      confirmBtn.style.background = "transparent";
      confirmBtn.style.cursor = "pointer";
      confirmBtn.onclick = () => {
            const newName = input.value.trim();
            if (newName) {
                  const nameDiv = chatItem.querySelector(".chat-item-question");
                  nameDiv.textContent = newName;

                  fetch(`/sidebar/rename_session`, {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ session_id: sessionId, sessionName: newName }),
                  })
                        .then((response) => response.json())
                        .then((result) => {
                              if (result.success) {
                                    showNotification("Session renamed successfully!", "success", 3);
                                    console.log(`Renamed ${sessionId} to ${newName}`);
                                    document.querySelector("${sessionId} .chat-item-question").textContent = newName;
                              } else {
                                    showNotification("Failed to rename session.", "error", 5);
                              }
                        })
                        .catch((error) => console.error("Error adding session to group:", error));
            }
            overlay.remove();
      };

      // ❌ Cancel button
      const cancelBtn = document.createElement("button");
      cancelBtn.innerHTML = `<img src="/static/images/lucide_icons/x.svg" class="icon-svg" alt="cancel" />`;
      cancelBtn.style.border = "none";
      cancelBtn.style.background = "transparent";
      cancelBtn.style.cursor = "pointer";
      cancelBtn.onclick = () => {
            overlay.remove();
      };

      buttons.appendChild(cancelBtn);
      buttons.appendChild(confirmBtn);
      popup.appendChild(input);
      popup.appendChild(buttons);
      overlay.appendChild(popup);
      document.body.appendChild(overlay);

      // Autofocus + select
      input.focus();
      input.select();
}

async function deleteSession(sessionId) {
      // Show confirmation dialog
      const confirmation = confirm("Are you sure you want to delete this session?");
      if (!confirmation) {
            return; // Exit if the user cancels
      }

      try {
            // Send POST request to Flask backend to delete the specific session
            const response = await fetch(`/sidebar/delete_session`, {
                  method: "POST",
                  headers: {
                        "Content-Type": "application/json",
                  },
                  body: JSON.stringify({ session_id: sessionId }),
            });

            if (response.ok) {
                  showNotification("Session deleted successfully.", "success", 3);
                  // Remove the session from the DOM
                  const sessionElement = document.querySelector(`[session_id="${sessionId}"]`);
                  if (sessionElement) {
                        sessionElement.remove();
                  }
                  // Remove the session card from the DOM
                  existingCard = document.getElementById("session-card");
                  // console.log(existingCard);
                  if (existingCard) existingCard.remove();
            } else {
                  const errorMessage = await response.text();
                  showNotification("Failed to delete session: " + errorMessage, "error", 5);
            }
      } catch (error) {
            // console.log("Error deleting session:", error);
            showNotification("An error occurred while deleting the session. Please try again.", "error", 5);
      }
}

async function assignProject(sessionGroupId, sessionGroupName, sessionGroupColor, ProjectIcon, SessionId, sessionName, SessionGroupDetails) {
      try {
            // Send POST request to Flask backend to delete the specific session
            const response = await fetch(`/sidebar/move_session_to_project`, {
                  method: "POST",
                  headers: {
                        "Content-Type": "application/json",
                  },
                  body: JSON.stringify({
                        session_group_id: sessionGroupId,
                        session_group_name: sessionGroupName,
                        session_group_color: sessionGroupColor,
                        project_icon: ProjectIcon,
                        session_id: SessionId,
                        session_group_details: SessionGroupDetails,
                        app_name: getAppName(),
                  }),
            });

            if (response.ok) {
                  showNotification("Session added to group", "success", 3);
                  fetchAndRenderSessions();
            } else {
                  const errorMessage = await response.text();
                  showNotification("Failed to delete session: " + errorMessage, "error", 5);
            }
      } catch (error) {
            // console.log("Error deleting session:", error);
            showNotification("An error occurred while deleting the session. Please try again.", "error", 5);
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
function createProjectItem(projectId, projectName, projectIcon, color = "#000000") {
      const projectItem = document.createElement("div");
      projectItem.className = "project-item";
      projectItem.id = projectId;
      projectItem.setAttribute("project_id", projectId);
      //     projectItem.style.borderRight = `1px solid ${color}`;

      // Inline SVG folder icon (color via CSS fill)
      const iconWrapper = document.createElement("div");
      iconWrapper.className = "project-folder-icon-wrapper";
      iconWrapper.innerHTML = `<img src="${projectIcon}" class="icon-svg options-icon" />`
      iconWrapper.style.backgroundColor = color;
      // iconWrapper.querySelector("svg").style.color = color;

      const label = document.createElement("div");
      label.className = "project-label";
      label.textContent = projectName;

      const options = document.createElement("div");
      options.className = "project-options";
      options.innerHTML = `<img src="/static/images/options.svg" class="icon-svg options-icon" />`;

      options.onclick = (event) => {
            event.stopPropagation();
            showProjectContextMenu(event, projectId, projectName, projectIcon, color);
      };

      projectItem.appendChild(iconWrapper);
      projectItem.appendChild(label);
      projectItem.appendChild(options);
      return projectItem;
}

function showProjectContextMenu(event, projectId, projectName, projectIcon, currentColor) {
      // Remove any existing
      const existing = document.querySelector(".project-context-menu");
      if (existing) existing.remove();

      const menu = document.createElement("div");
      menu.className = "project-context-menu";

      // Change color
      const color = document.createElement("div");
      color.className = "context-menu-item";
      color.innerHTML = `<img src="/static/images/lucide_icons/pencil.svg" class="icon-svg" /><span>Edit project</span>`;
      color.onclick = () => {
            // showProjectColorPicker();
            showCreateProjectPopup(projectId, currentColor, projectName, "/sidebar/update_project_metadata", projectIcon);
            menu.remove();
      };

      // Delete
      const del = document.createElement("div");
      del.className = "context-menu-item";
      del.innerHTML = `<img src="/static/images/lucide_icons/trash-2.svg" class="icon-svg" /><span>Move to Trash</span>`;
      del.onclick = () => {
            deleteProject(projectId);
            menu.remove();
      };

      menu.appendChild(color);
      menu.appendChild(del);

      document.body.appendChild(menu);
      const rect = event.currentTarget.getBoundingClientRect();
      menu.style.top = `${rect.bottom + window.scrollY}px`;
      menu.style.left = `${rect.left + window.scrollX}px`;

      setTimeout(() => {
            document.addEventListener(
                  "click",
                  () => {
                        menu.remove();
                  },
                  { once: true }
            );
      }, 0);
}

function showProjectRenamePopup(projectId, currentName) {
      const overlay = document.createElement("div");
      overlay.className = "project-popup-overlay";

      const popup = document.createElement("div");
      popup.className = "project-popup-box";

      const input = document.createElement("input");
      input.type = "text";
      input.value = currentName;
      input.placeholder = "Enter new project name";

      const confirm = document.createElement("button");
      confirm.innerHTML = `<img src="/static/images/lucide_icons/check.svg" class="icon-svg" />`;
      confirm.onclick = () => {
            const newName = input.value.trim();
            if (newName) {
                  document.querySelector(`#${projectId} .project-label`).textContent = newName;
                  fetch(`/projects/rename`, {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ project_id: projectId, projectName: newName }),
                  })
                        .then((r) => r.json())
                        .then((res) => {
                              if (res.success) showNotification("Project renamed.", "success", 3);
                              else showNotification("Rename failed.", "error", 5);
                        });
            }
            overlay.remove();
      };

      const cancel = document.createElement("button");
      cancel.innerHTML = `<img src="/static/images/lucide_icons/x.svg" class="icon-svg" />`;
      cancel.onclick = () => overlay.remove();

      popup.appendChild(input);
      popup.appendChild(cancel);
      popup.appendChild(confirm);
      overlay.appendChild(popup);
      document.body.appendChild(overlay);

      input.focus();
      input.select();
}

function generateColorFilter(hexColor) {
      // crude approximation — works best with solid colors
      const colorMap = {
            "#f87171": "invert(38%) sepia(88%) saturate(747%) hue-rotate(330deg) brightness(103%) contrast(101%)",
            "#fbbf24": "invert(81%) sepia(76%) saturate(748%) hue-rotate(1deg) brightness(104%) contrast(102%)",
            "#34d399": "invert(69%) sepia(34%) saturate(666%) hue-rotate(109deg) brightness(96%) contrast(90%)",
            "#60a5fa": "invert(65%) sepia(77%) saturate(469%) hue-rotate(189deg) brightness(96%) contrast(92%)",
            "#a78bfa": "invert(71%) sepia(37%) saturate(431%) hue-rotate(224deg) brightness(101%) contrast(95%)",
            "#f472b6": "invert(74%) sepia(34%) saturate(507%) hue-rotate(291deg) brightness(95%) contrast(90%)",
            "#d1d5db": "invert(91%) sepia(7%) saturate(73%) hue-rotate(175deg) brightness(93%) contrast(85%)",
            "#cccccc": "invert(91%) sepia(0%) saturate(0%) hue-rotate(0deg) brightness(93%) contrast(86%)",
      };
      return colorMap[hexColor] || "invert(100%)"; // fallback for unknown colors
}
async function showProjectColorPicker(projectId) {
  // Remove existing picker if any
  const existing = document.querySelector(".project-color-picker");
  if (existing) existing.remove();

  const picker = document.createElement("div");
  picker.className = "project-color-picker";

  const colors = ["#f87171", "#fbbf24", "#34d399", "#60a5fa", "#a78bfa", "#f472b6"];

  // Add "Remove Color" swatch
  const removeSwatch = document.createElement("div");
  removeSwatch.className = "color-swatch no-color-swatch";
  removeSwatch.title = "Remove color";
  removeSwatch.innerHTML = `<img src="/static/images/lucide_icons/x.svg" class="remove-color-icon" />`;
  removeSwatch.onclick = async () => {
    await updateProjectColor(projectId, null);
    picker.remove();
  };
  picker.appendChild(removeSwatch);

  // Add color swatches
  colors.forEach((color) => {
    const swatch = document.createElement("div");
    swatch.className = "color-swatch";
    swatch.style.background = color;

    swatch.onclick = async () => {
      const projectEl = document.getElementById(projectId);
      if (!projectEl) return;

      // Update folder icon background visually
      const wrapper = projectEl.querySelector(".project-folder-icon-wrapper");
      if (wrapper) {
        wrapper.style.backgroundColor = color;
      }

      await updateProjectColor(projectId, color);
      picker.remove();
    };

    picker.appendChild(swatch);
  });

  document.body.appendChild(picker);

  // Position the picker below the project element
  const projectEl = document.getElementById(projectId);
  const rect = projectEl.getBoundingClientRect();
  picker.style.position = "absolute";
  picker.style.top = `${rect.bottom + window.scrollY}px`;
  picker.style.left = `${rect.left + window.scrollX}px`;

  // Close on outside click
  setTimeout(() => {
    document.addEventListener(
      "click",
      (e) => {
        if (!picker.contains(e.target)) picker.remove();
      },
      { once: true }
    );
  }, 0);
}

async function updateProjectColor(projectId, color) {
  try {
    const res = await fetch(`/sidebar/update_project_color`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ project_id: projectId, color }),
    });

    if (res.ok) {
      fetchAndRenderSessions();
    } else {
      const errorData = await res.json();
      showNotification("Failed to update color: " + (errorData.message || res.statusText), "error");
    }
  } catch (err) {
    console.error("Error updating color:", err);
    showNotification("Error updating project color.", "error");
  }
}

async function deleteProject(projectId) {
      const confirmed = confirm("Are you sure you want to delete this project?");
      if (!confirmed) return;

      try {
            const res = await fetch(`/sidebar/delete_project`, {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ project_id: projectId }),
            });
            if (res.ok) {
                  document.getElementById(projectId)?.remove();
                  showNotification("Project deleted.", "success", 3);
            } else {
                  showNotification("Failed to delete project.", "error", 5);
            }
      } catch (err) {
            showNotification("Error deleting project.", "error", 5);
      }
}
