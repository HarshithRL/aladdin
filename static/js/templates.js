let templateState = {
      templates: [],
      initialized: false,
};

/**
 * Initialize template functionality
 */
function initTemplates() {
      if (templateState.initialized) return;

      // Add event listeners
      document.querySelector(".templates-button")?.addEventListener("click", toggleTemplatesPanel);

      // Close templates panel when clicking outside
      document.addEventListener("click", (event) => {
            const panel = document.querySelector(".templates-panel");
            const templatesButton = document.querySelector(".chat-action-button.templates-button");

            if (panel && panel.style.display !== "none" && !panel.contains(event.target) && !templatesButton?.contains(event.target)) {
                  hideTemplatesPanel();
            }
      });

      // Create templates panel container if it doesn't exist
      if (!document.querySelector(".templates-panel")) {
            const panel = document.createElement("div");
            panel.className = "popup-card-container templates-panel";
            panel.style.display = "none";
            document.body.appendChild(panel);
      }

      fetchTemplates();
      templateState.initialized = true;
}

/**
 * Fetch templates from the server
 */
async function fetchTemplates() {
      try {
            const response = await fetch("/templates/get_template", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({}),
            });

            const result = await response.json();

            if (result.success) {
                  templateState.templates = result.templates;
                  renderTemplatesInterface();
            } else {
                  console.error("Error fetching templates:", result.error);
            }
      } catch (error) {
            console.error("Failed to fetch templates:", error);
      }
}

/**
 * Toggle visibility of templates panel
 */
function toggleTemplatesPanel(event) {
      if (event) event.stopPropagation();

      const panel = document.querySelector(".templates-panel");
      if (!panel) return;

      if (panel.style.display === "none") {
            panel.style.display = "flex";
      } else {
            panel.style.display = "none";
      }
}

/**
 * Hide templates panel
 */
function hideTemplatesPanel() {
      const panel = document.querySelector(".templates-panel");
      if (panel) panel.style.display = "none";
}

function renderTemplatesInterface() {
      // Group templates by app name
      const appGroups = groupTemplatesByApp();

      // Create container for tab interface
      const panel = document.querySelector(".templates-panel");
      panel.innerHTML = ""; // Clear existing content

      const tabContainer = document.createElement("div");
      tabContainer.className = "template-tabs-container";

      // Create header with title and close button
      const panelHeader = document.createElement("div");
      panelHeader.className = "template-panel-header";

      const panelTitle = document.createElement("h2");
      panelTitle.textContent = "Templates";
      panelTitle.className = "template-panel-title";

      const closeButton = document.createElement("span");
      closeButton.innerHTML = `<img src="/static/images/lucide_icons/x.svg" alt="close" />`;
      closeButton.className = "template-panel-close";
      closeButton.addEventListener("click", () => hideTemplatesPanel());

      panelHeader.appendChild(panelTitle);
      panelHeader.appendChild(closeButton);
      tabContainer.appendChild(panelHeader);

      // Create tabs header and content sections
      const tabsHeader = document.createElement("div");
      tabsHeader.className = "template-tabs-header";

      const tabsContent = document.createElement("div");
      tabsContent.className = "template-tabs-content";

      // Add "New Template" button
      const newTemplateTab = document.createElement("div");
      newTemplateTab.className = "template-tab new-template-tab";
      newTemplateTab.innerHTML = "<img class='plus-icon-img icon-svg' src='/static/images/plus.svg' />";
      newTemplateTab.addEventListener("click", () => showTemplateForm());
      tabsHeader.appendChild(newTemplateTab);

      // Create tabs for each app group
      const appNames = Object.keys(appGroups);
      appNames.forEach((appName, index) => {
            const tab = createAppTab(appName, index === 0);
            tabsHeader.appendChild(tab);

            const tabContent = createAppContent(appName, appGroups[appName], index === 0);
            tabsContent.appendChild(tabContent);
      });

      const tabsContainer = document.createElement("div");
      tabsContainer.className = "template-tabs-container-wrapper";

      // Assemble the interface
      tabsContainer.appendChild(tabsHeader);
      tabsContainer.appendChild(tabsContent);

      tabContainer.appendChild(tabsContainer);
      panel.appendChild(tabContainer);
}

/**
 * Group templates by app name
 */
function groupTemplatesByApp() {
      const appGroups = {};

      templateState.templates.forEach((template) => {
            if (!appGroups[template.app_name]) {
                  appGroups[template.app_name] = [];
            }
            appGroups[template.app_name].push(template);
      });

      return appGroups;
}

/**
 * Create a tab for an app
 */
function createAppTab(appName, isActive) {
      const tab = document.createElement("div");
      tab.className = "template-tab";
      if (isActive) tab.classList.add("active");
      tab.textContent = appName;
      tab.dataset.appName = appName;

      tab.addEventListener("click", () => {
            activateTab(appName);
      });

      return tab;
}

/**
 * Create content section for an app's templates
 */
function createAppContent(appName, templates, isActive) {
      const tabContent = document.createElement("div");
      tabContent.className = "template-tab-content";
      if (isActive) tabContent.classList.add("active");
      tabContent.dataset.appName = appName;

      templates.forEach((template) => {
            const templateCard = createTemplateCard(template);
            tabContent.appendChild(templateCard);
      });

      return tabContent;
}

/**
 * Activate a specific tab
 */
function activateTab(appName) {
      // Update active tab
      document.querySelectorAll(".template-tab").forEach((tab) => {
            tab.classList.remove("active");
            if (tab.dataset.appName === appName) {
                  tab.classList.add("active");
            }
      });

      // Update active content
      document.querySelectorAll(".template-tab-content").forEach((content) => {
            content.classList.remove("active");
            if (content.dataset.appName === appName) {
                  content.classList.add("active");
            }
      });
}

/**
 * Create a template card
 */
function createTemplateCard(template) {
      const templateCard = document.createElement("div");
      templateCard.className = "card template-card card-with-hover";

      // Create card header with template name and actions
      const header = document.createElement("div");
      header.className = "template-card-header";

      const templateName = document.createElement("div");
      templateName.className = "template-name";
      templateName.textContent = template.template_name;

      // Create action buttons
      const actions = document.createElement("div");
      actions.className = "template-actions";

      const editIcon = document.createElement("img");
      editIcon.src = "/static/images/edit-icon.svg";
      editIcon.className = "template-icon icon-svg";
      editIcon.addEventListener("click", (event) => {
            event.stopPropagation();
            showTemplateForm(template.template_id, template.template_name, template.template_text, template.app_name, "edit");
      });

      const deleteIcon = document.createElement("img");
      deleteIcon.src = "/static/images/delete-icon.svg";
      deleteIcon.className = "template-icon delete icon-svg";
      deleteIcon.addEventListener("click", async (event) => {
            event.stopPropagation();
            const isDeleted = await deleteTemplate(template.template_id);
            if (isDeleted) {
                  // Re-fetch templates to update the UI
                  fetchTemplates();
            }
      });

      actions.appendChild(editIcon);
      actions.appendChild(deleteIcon);

      header.appendChild(templateName);
      header.appendChild(actions);

      // Template description
      const description = document.createElement("p");
      description.className = "template-description";
      description.textContent = template.template_text;

      templateCard.appendChild(header);
      templateCard.appendChild(description);

      // Add click handler to insert template text
      templateCard.addEventListener("click", () => {
            insertTemplateText(template.template_text);
            hideTemplatesPanel();
      });

      return templateCard;
}

/**
 * Insert template text into the user input field
 */
function insertTemplateText(templateText) {
      const userInput = document.getElementById("userInput");
      if (!userInput) return;

      const formattedText = templateText.replace(/\n/g, "<br>").replace(/\t/g, "&nbsp;&nbsp;&nbsp;&nbsp;");
      userInput.innerHTML = formattedText;
      userInput.focus();

      const sendIcon = document.getElementById("sendIcon");
      if (!isStreaming) {
            // Show send icon when there's content
            document.getElementById("sendButton").onclick = generateChatbotAnswer;
            sendIcon.src = "/static/images/lucide_icons/arrow-up.svg";
      }

      if (typeof adjustHeight === "function") {
            requestAnimationFrame(adjustHeight);
      }
}

/**
 * Show template form for adding or editing templates
 */
function showTemplateForm(templateId = "", templateName = "", templateText = "", appName = "", action = "add") {
      // Remove any existing form
      const existingForm = document.querySelector(".template-form-overlay");
      if (existingForm) {
            document.body.removeChild(existingForm);
      }

      // Create form overlay
      const formOverlay = document.createElement("div");
      formOverlay.className = "template-form-overlay";

      // Create form container
      const form = document.createElement("div");
      form.className = "template-form";

      // Form title
      const title = document.createElement("h3");
      title.textContent = action === "edit" ? "Edit Template" : "New Template";

      // Template name input
      const nameLabel = document.createElement("label");
      nameLabel.textContent = "Template Name:";

      const nameInput = document.createElement("input");
      nameInput.type = "text";
      nameInput.value = templateName;
      nameInput.placeholder = "Enter template name...";
      nameInput.className = "template-input";

      // App name selection
      const appLabel = document.createElement("label");
      appLabel.textContent = "Category:";

      const appContainer = document.createElement("div");
      appContainer.className = "app-name-container";

      // Get existing app names from state
      const existingApps = [...new Set(templateState.templates.map((t) => t.app_name).filter(Boolean))];

      // Create app selection dropdown
      const appSelect = document.createElement("select");
      appSelect.className = "app-name-select";

      // Create new app input field
      const newAppInput = document.createElement("input");
      newAppInput.type = "text";
      newAppInput.placeholder = "Enter new category name...";
      newAppInput.className = "template-input";
      newAppInput.style.display = "none";

      if (existingApps.length === 0) {
            // No existing categories — show input directly
            appSelect.style.display = "none";
            newAppInput.style.display = "block";
            newAppInput.focus();
      } else {
            // Add existing apps to dropdown
            existingApps.forEach((app) => {
                  const option = document.createElement("option");
                  option.value = app;
                  option.textContent = app;
                  appSelect.appendChild(option);
            });

            // Add "Create new" option
            const newAppOption = document.createElement("option");
            newAppOption.value = "_new_";
            newAppOption.textContent = "Create new category...";
            appSelect.appendChild(newAppOption);

            // Set selected app if editing
            if (appName && existingApps.includes(appName)) {
                  appSelect.value = appName;
            }
      }

      // Toggle between select and input
      appSelect.addEventListener("change", () => {
            if (appSelect.value === "_new_") {
                  appSelect.style.display = "none";
                  newAppInput.style.display = "block";
                  newAppInput.focus();
            }
      });

      appContainer.appendChild(appSelect);
      appContainer.appendChild(newAppInput);

      // Template text input
      const textLabel = document.createElement("label");
      textLabel.textContent = "Template Text:";

      const textInput = document.createElement("textarea");
      textInput.value = templateText;
      textInput.placeholder = "Enter template text...";
      textInput.className = "template-text-input";

      // Form buttons
      const buttonsContainer = document.createElement("div");
      buttonsContainer.className = "template-form-buttons";

      const saveButton = document.createElement("button");
      saveButton.textContent = "Save";
      saveButton.className = "template-save-btn button-template";
      saveButton.addEventListener("click", async () => {
            const newName = nameInput.value.trim();
            const newText = textInput.value.trim();
            let selectedAppName;

            // Get selected app name
            if (appSelect.style.display !== "none") {
                  selectedAppName = appSelect.value === "_new_" ? "" : appSelect.value;
            } else {
                  selectedAppName = newAppInput.value.trim();
            }

            if (!newName || !newText) {
                  alert("Template name and text cannot be empty!");
                  return;
            }

            if (!selectedAppName) {
                  alert("Category name cannot be empty!");
                  return;
            }

            try {
                  if (action === "edit") {
                        await updateTemplate(templateId, newName, newText, selectedAppName);
                  } else {
                        await createTemplate(newName, newText, selectedAppName);
                  }

                  document.body.removeChild(formOverlay);
            } catch (error) {
                  console.error("Error saving template:", error);
                  alert("Failed to save template. Please try again.");
            }
      });

      const cancelButton = document.createElement("button");
      cancelButton.textContent = "Cancel";
      cancelButton.className = "template-cancel-btn button-template";
      cancelButton.addEventListener("click", () => {
            document.body.removeChild(formOverlay);
      });

      // Assemble form
      buttonsContainer.appendChild(saveButton);
      buttonsContainer.appendChild(cancelButton);

      form.appendChild(title);
      form.appendChild(nameLabel);
      form.appendChild(nameInput);
      form.appendChild(appLabel);
      form.appendChild(appContainer);
      form.appendChild(textLabel);
      form.appendChild(textInput);
      form.appendChild(buttonsContainer);

      formOverlay.appendChild(form);
      document.body.appendChild(formOverlay);
}

async function createTemplate(templateName, templateText, appName) {
      try {
            const response = await fetch("/templates/create_template", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                        template_id: `temp_${Date.now()}`,
                        template_name: templateName,
                        template_text: templateText,
                        app_name: appName,
                  }),
            });

            if (!response.ok) {
                  throw new Error(`Failed to create template: ${response.statusText}`);
            }

            // Update local state
            await fetchTemplates();

            return true;
      } catch (error) {
            console.error("Error creating template:", error);
            return false;
      }
}

/**
 * Update an existing template
 */
async function updateTemplate(templateId, newName, newText, newAppName) {
      try {
            const response = await fetch("/templates/update_template", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                        template_id: templateId,
                        new_name: newName,
                        new_text: newText,
                        app_name: newAppName,
                  }),
            });

            if (!response.ok) {
                  throw new Error(`Failed to update template: ${response.statusText}`);
            }

            // Update local state
            await fetchTemplates();

            return true;
      } catch (error) {
            console.error("Error updating template:", error);
            return false;
      }
}

/**
 * Delete a template
 */
async function deleteTemplate(templateId) {
      if (!confirm("Are you sure you want to delete this template?")) {
            return false;
      }

      try {
            const response = await fetch("/templates/delete_template", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                        template_id: templateId,
                  }),
            });

            if (!response.ok) {
                  throw new Error(`Failed to delete template: ${response.statusText}`);
            }

            return true;
      } catch (error) {
            console.error("Error deleting template:", error);
            return false;
      }
}

// Initialize templates when the DOM is loaded
document.addEventListener("DOMContentLoaded", initTemplates);
