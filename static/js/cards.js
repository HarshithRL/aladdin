function renderSessionCard(sessionId, sessionName, sessions_meta_data, isGrouped) {
    // Remove any existing card first
    const existingCard = document.getElementById("session-card");
    if (existingCard) existingCard.remove();

    // Create new card
    const card = document.createElement("div");
    card.className = "popup-card-container card";
    card.id = "session-card";

    const cardContent = document.createElement("div");
    cardContent.className = "card card-content session-group-content";

    // Header with close button
    const cardHeader = document.createElement("div");
    cardHeader.className = "popup-header";

    const title = document.createElement("h2");
    title.textContent = "Session";

    const closeButton = document.createElement("button");
    closeButton.className = "close-button";
    closeButton.id = "closePopup";
    closeButton.innerHTML = `<img src="/static/images/lucide_icons/x.svg" alt="Close" class="icon-svg">`;
    
    // Add click event to close button
    closeButton.addEventListener("click", () => {
        card.remove();
    });

    cardHeader.appendChild(title);
    cardHeader.appendChild(closeButton);

    // Tabs navigation
    const tabsNav = document.createElement("div");
    tabsNav.className = "tabs-nav";

    const tabsContent = document.createElement("div");

    const tabs = [
        { id: "rename", label: "Rename" },
        { id: "group", label: "Group" },
        { id: "delete", label: "Delete" },
    ];

    tabs.forEach((tab, index) => {
        const tabButton = document.createElement("button");
        tabButton.textContent = tab.label;
        tabButton.className = "tab-button";
        tabButton.id = `tab-${tab.id}`;
        tabButton.onclick = () => switchTab(tab.id);

        if (index === 0) {
            tabButton.classList.add("active-tab");
        }

        tabsNav.appendChild(tabButton);
    });

    const renameTab = createRenameTab(sessionId, sessionName);
    const groupTab = createGroupTab(sessionId, sessions_meta_data);
    const deleteTab = createDeleteTab(sessionId);

    renameTab.style.display = "block";
    groupTab.style.display = "none";
    deleteTab.style.display = "none";

    tabsContent.appendChild(renameTab);
    tabsContent.appendChild(groupTab);
    tabsContent.appendChild(deleteTab);

    function switchTab(tabId) {
        document.querySelectorAll(".tab-button").forEach((button) => {
            button.classList.remove("active-tab");
        });
        document.getElementById(`tab-${tabId}`).classList.add("active-tab");

        renameTab.style.display = "none";
        groupTab.style.display = "none";
        deleteTab.style.display = "none";

        if (tabId === "rename") renameTab.style.display = "block";
        if (tabId === "group") groupTab.style.display = "block";
        if (tabId === "delete") deleteTab.style.display = "block";
    }

    const tabsContentBody = document.createElement("div");
    tabsContentBody.className = "tabs-content-body";
    tabsContentBody.appendChild(tabsNav);
    tabsContentBody.appendChild(tabsContent);


    
    // Append everything
    cardContent.appendChild(cardHeader);
    cardContent.appendChild(tabsContentBody);
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

  

// Helper function to create the rename tab
function createRenameTab(sessionId, sessionName) {
      const container = document.createElement("div");
      container.id = "rename-tab";

      const inputGroup = document.createElement("div");
      inputGroup.className = "input-group";

      const label = document.createElement("label");
      label.htmlFor = "session-name";
      label.textContent = "Session Name";

      const input = document.createElement("input");
      input.type = "text";
      input.id = "session-name";
      input.placeholder = "Enter new session name";
      input.value = sessionName;

      inputGroup.appendChild(label);
      inputGroup.appendChild(input);

      const buttonGroup = document.createElement("div");
      buttonGroup.className = "button-group";

      const saveButton = document.createElement("button");
      saveButton.className = "save-button button-template";
      saveButton.textContent = "Save";
      saveButton.onclick = () => renameSession(sessionId, input.value);

      buttonGroup.appendChild(saveButton);

      container.appendChild(inputGroup);
      container.appendChild(buttonGroup);

      return container;
}

// Helper function to create the rename tab
function createRenameTab(sessionId, sessionName) {
      const container = document.createElement("div");
      container.id = "rename-tab";

      const inputGroup = document.createElement("div");
      inputGroup.className = "input-group";

      const label = document.createElement("label");
      label.htmlFor = "session-name";
      label.textContent = "Session Name";

      const input = document.createElement("input");
      input.type = "text";
      input.id = "session-name";
      input.placeholder = "Enter new session name";
      input.value = sessionName;

      inputGroup.appendChild(label);
      inputGroup.appendChild(input);

      const buttonGroup = document.createElement("div");
      buttonGroup.className = "button-group";

      const saveButton = document.createElement("button");
      saveButton.className = "save-button  button-template";
      saveButton.textContent = "Save";
      saveButton.onclick = () => renameSession(sessionId, input.value);

      buttonGroup.appendChild(saveButton);

      container.appendChild(inputGroup);
      container.appendChild(buttonGroup);

      return container;
}

function createGroupTab(sessionId, sessions_meta_data) {
      const container = document.createElement("div");
      container.id = "group-tab";

      // Get current group info
      let currentGroup = "Unnamed Session";
      Object.keys(sessions_meta_data).forEach((groupName) => {
            sessions_meta_data[groupName].forEach((session) => {
                  if (session.session_id === sessionId) {
                        currentGroup = groupName;
                  }
            });
      });

      const currentGroupInfo = document.createElement("div");
      currentGroupInfo.style.marginBottom = "15px";

      const currentGroupLabel = document.createElement("label");
      currentGroupLabel.textContent = "Current Group:";
      currentGroupLabel.style.display = "block";
      currentGroupLabel.style.marginBottom = "5px";

      const currentGroupValue = document.createElement("span");
      currentGroupValue.textContent = currentGroup;
      currentGroupValue.style.fontWeight = "bold";

      currentGroupInfo.appendChild(currentGroupLabel);
      currentGroupInfo.appendChild(currentGroupValue);

      const select = document.createElement("select");
      select.id = `group-select-${sessionId}`;
      select.style.marginBottom = "15px";

      // If the session is in a named group, list it first
      if (currentGroup !== "Unnamed Session") {
            const option = document.createElement("option");
            option.value = currentGroup;
            option.textContent = currentGroup;
            option.selected = true;
            select.appendChild(option);
      }

      // "Create New Group" option
      const newOption = document.createElement("option");
      newOption.value = "";
      newOption.textContent = "Create New Group";
      select.appendChild(newOption);

      // List all existing groups except "Unnamed Session"
      for (const groupName of Object.keys(sessions_meta_data)) {
            if (groupName !== "Unnamed Session" && groupName !== currentGroup) {
                  const option = document.createElement("option");
                  option.value = groupName;
                  option.textContent = groupName;
                  select.appendChild(option);
            }
      }

      // New Group Name Input
      const newGroupInput = document.createElement("input");
      newGroupInput.type = "text";
      newGroupInput.id = `new-group-name-${sessionId}`;
      newGroupInput.placeholder = "New Group Name";
      newGroupInput.style.display = "none";
      newGroupInput.style.marginBottom = "15px";

      // Color selection container
      const colorContainer = document.createElement("div");
      colorContainer.className = "color-container";
      colorContainer.style.display = "none";
      colorContainer.style.marginBottom = "15px";

      const colors = ["#FF6961", "#77DD77", "#AEC6CF", "#FFB6C1", "#f9f941"];
      let selectedColor = colors[0];

      colors.forEach((color) => {
            const colorCircle = document.createElement("div");
            colorCircle.className = "color-circle";
            colorCircle.style.backgroundColor = color;
            colorCircle.dataset.color = color;

            if (color === colors[0]) {
                  colorCircle.classList.add("selected");
            }

            colorCircle.addEventListener("click", function () {
                  document.querySelectorAll(".color-circle").forEach((c) => c.classList.remove("selected"));
                  this.classList.add("selected");
                  selectedColor = this.dataset.color;
            });

            colorContainer.appendChild(colorCircle);
      });

      // Button group
      const buttonGroup = document.createElement("div");
      buttonGroup.className = "button-group";

      const saveButton = document.createElement("button");
      saveButton.className = "save-button button-template";
      saveButton.textContent = "Update Group";
      saveButton.onclick = () => {
            const selectedGroup = select.value;
            if (selectedGroup === "") {
                // Create new group
                if (!newGroupInput.value.trim()) {
                    alert("Please enter a new group name!");
                    return;
                }
                addToGroup(sessionId, selectedColor || "#FF6961", newGroupInput.value.trim());
            } else if (selectedGroup !== currentGroup) {
                // Move to existing group
                moveSessionToGroup(sessionId, selectedGroup);
            }
            window.location.href = `/${getAppName()}/`;
        };
        

      buttonGroup.appendChild(saveButton);

      // Remove button only if the session is in a named group
      if (currentGroup !== "Unnamed Session") {
            const removeButton = document.createElement("button");
            removeButton.className = "save-button  button-template";
            removeButton.textContent = "Remove From Group";
            removeButton.style.backgroundColor = "#cccccc";
            removeButton.onclick = () => removeFromSessionGroup(sessionId);
            buttonGroup.appendChild(removeButton);
      }

      // Show/hide input and color selection based on selection
      select.addEventListener("change", function () {
            if (this.value === "") {
                  newGroupInput.style.display = "block";
                  colorContainer.style.display = "flex";
            } else {
                  newGroupInput.style.display = "none";
                  colorContainer.style.display = "none";
            }
      });

      // Append elements to container
      container.appendChild(currentGroupInfo);
      container.appendChild(select);
      container.appendChild(newGroupInput);
      container.appendChild(colorContainer);
      container.appendChild(buttonGroup);

      // Ensure input and color selection are visible if session is in "Unnamed Session"
      if (currentGroup === "Unnamed Session") {
            newGroupInput.style.display = "block";
            colorContainer.style.display = "flex";
      }

      return container;
}

// Helper function to create the delete tab
function createDeleteTab(sessionId) {
      const container = document.createElement("div");
      container.id = "delete-tab";

      const warningText = document.createElement("p");
      warningText.textContent = "Are you sure you want to delete this session? This action cannot be undone.";
      warningText.style.marginBottom = "20px";
      warningText.style.color = "#d32f2f";

      const buttonGroup = document.createElement("div");
      buttonGroup.className = "button-group";

      const deleteButton = document.createElement("button");
      deleteButton.className = "save-button button-template";
      deleteButton.textContent = "Delete Session";
      deleteButton.style.backgroundColor = "#d32f2f";
      deleteButton.onclick = () => deleteSession(sessionId);

      const cancelButton = document.createElement("button");
      cancelButton.className = "save-button button-template";
      cancelButton.textContent = "Cancel";
      cancelButton.style.backgroundColor = "#cccccc";

      buttonGroup.appendChild(deleteButton);
      buttonGroup.appendChild(cancelButton);

      container.appendChild(warningText);
      container.appendChild(buttonGroup);

      return container;
}
