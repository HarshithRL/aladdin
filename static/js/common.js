function showNotification(message, type = "info", duration = 5) {
      // console.log("Showing notification:");
      // Convert seconds to milliseconds
      const durationMs = duration * 1000;

      // Check if a notification container already exists
      let notificationContainer = document.getElementById("notificationContainer");
      if (!notificationContainer) {
            notificationContainer = document.createElement("div");
            notificationContainer.id = "notificationContainer";
            document.body.appendChild(notificationContainer);
      }

      // Create the notification element
      const notification = document.createElement("div");
      notification.classList.add("notification", `notification-${type}`);
      notification.textContent = message;

      // Append to the container
      notificationContainer.appendChild(notification);

      // Trigger slide-in animation
      setTimeout(() => {
            notification.classList.add("show");
      }, 100); // Small delay for smooth animation

      // Remove notification after the specified duration
      setTimeout(() => {
            notification.classList.remove("show");
            setTimeout(() => {
                  notification.remove();
            }, 500); // Wait for animation to finish before removing
      }, durationMs);
}
document.addEventListener('DOMContentLoaded', function() {
    const tooltip = document.getElementById('llm-model-tooltip');
    const modelOptions = document.querySelectorAll('.model-option');
    
    modelOptions.forEach(option => {
        // Show tooltip on hover
        option.addEventListener('mouseenter', function(e) {
            const tooltipText = this.getAttribute('data-tooltip-text');
            if (tooltipText) {
                tooltip.textContent = tooltipText;
                
                // Position the tooltip next to the hovered option
                const rect = this.getBoundingClientRect();
                tooltip.style.top = rect.top + (rect.height / 2) - (tooltip.offsetHeight / 2) + 'px';
                tooltip.style.left = rect.right + 15 + 'px';
                
                // Make it visible
                tooltip.style.opacity = '1';
                tooltip.style.visibility = 'visible';
            }
        });
        
        // Hide tooltip when mouse leaves
        option.addEventListener('mouseleave', function() {
            tooltip.style.opacity = '0';
            tooltip.style.visibility = 'hidden';
        });
    });
});


const modelMappings = {
    "gpt-4o": 'OpenAI <div class="model-name-second-line">GPT 4o</div>',
    "o3-mini": 'OpenAI <div class="model-name-second-line">GPT o3-mini</div>',
    "gpt-4.1": 'OpenAI <div class="model-name-second-line">GPT 4.1</div>',
    "o1": 'OpenAI <div class="model-name-second-line">GPT o1</div>',
};

function selectModel(model) {
    const modelNameElement = document.querySelector(".model-name");
    modelNameElement.innerHTML = modelMappings[model] || model;
    modelNameElement.dataset.actualModel = model; // Store actual model
    closeModelDropdown(); // Close dropdown after selection
}

function toggleModelDropdown() {
      const dropdown = document.querySelector(".model-dropdown");
      const modelSelect = document.querySelector(".model-select");
      const modelName = document.querySelector(".model-name");
      // Check if dropdown is already open
      if (dropdown.classList.contains("active")) {
            dropdown.classList.remove("active");
            modelSelect.classList.remove("active");
            // Reset font size to default when dropdown is not active
            modelName.style.fontSize = "23px";
            modelName.style.width = "80px";
            // Reset modelSelect properties when dropdown is not active
            modelSelect.style.backgroundColor = "var(--bg-hover)";
            modelSelect.style.transform = "scale(1.0)";
      } else {
            dropdown.classList.add("active");
            modelSelect.classList.add("active");
            // Set font size to 12px when dropdown is active
            modelName.style.fontSize = "23px";
            modelName.style.width = "80px";
            // Set modelSelect properties when dropdown is active
            modelSelect.style.backgroundColor = "var(--bg-hover)";
            modelSelect.style.transform = "scale(1.05)";
      }
}
function hideModelNameOnOutsideClick(event) {
      const modelSelect = document.querySelector(".model-select");
      const dropdown = document.querySelector(".model-dropdown");

      if (!modelSelect.contains(event.target) && !dropdown.contains(event.target)) {
            hideModelName();
      }
}

function hideModelName() {
      const modelSelect = document.querySelector(".model-select");
      const modelName = document.querySelector(".model-name");

      closeModelDropdown();
      modelSelect.classList.remove("active");
      modelName.style.fontSize = "0px";
      modelName.style.width = "max-content";
      modelSelect.style.backgroundColor = "var(--bg-hover)";
      modelSelect.style.transform = "scale(1.0)";
}

document.addEventListener("click", hideModelNameOnOutsideClick);

function closeModelDropdown() {
      const dropdown = document.querySelector(".model-dropdown");
      const modelSelect = document.querySelector(".model-select");

      dropdown.classList.remove("active");
      modelSelect.classList.remove("active");
}

function getSelectedModel() {
    const modelNameElement = document.querySelector(".model-name");
    return modelNameElement.dataset.actualModel || modelNameElement.textContent.trim();
}

function generateSessionId() {
      return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function (c) {
            const r = (Math.random() * 16) | 0;
            const v = c === "x" ? r : (r & 0x3) | 0x8;
            return v.toString(16);
      });
}

function removeReferencesHeading(inputText) {
  // Regex to match any heading level (e.g., #, ##, ###) that says "References"
  const referencesHeadingRegex = /^#{1,6}\s*References\s*$/im;

  return inputText.replace(referencesHeadingRegex, '').trim();
}

function showTooltip(e) {
      const tooltip = document.getElementById("globalTooltip");
      const rect = e.currentTarget.getBoundingClientRect();
      const tooltipText = e.currentTarget.getAttribute("data-tooltip");

      tooltip.innerText = tooltipText;
      tooltip.style.top = rect.top +35 + "px"; // adjust if needed
      tooltip.style.left = rect.left + rect.width / 2 + "px";
      tooltip.style.transform = "translateX(-50%)";
      tooltip.style.opacity = 1;
}

function hideTooltip() {
      const tooltip = document.getElementById("globalTooltip");

      tooltip.style.opacity = 0;
}

async function checkAccessAndContinue(targetUrl, actionAfterLogin) {
    try {
        const response = await fetch(targetUrl, {
            method: "GET",
            headers: {
                "X-Requested-With": "XMLHttpRequest"
            }
        });

        const data = await response.json();

        if (data.login_required) {
            const loginTab = window.open(data.login_url, '_blank');

            // Poll until the login session is established
            const interval = setInterval(async () => {
                const statusCheck = await fetch("/session_status", {
                    method: "GET",
                    headers: {
                        "X-Requested-With": "XMLHttpRequest"
                    }
                });

                const status = await statusCheck.json();
                if (status.logged_in) {
                    clearInterval(interval);
                    loginTab.close();
                    // Proceed with the action after login
                    actionAfterLogin();
                }
            }, 2000); // every 2 seconds
        } else {
            // Already logged in – just proceed
            actionAfterLogin();
        }
    } catch (err) {
        console.error("Error during login flow:", err);
    }
}
async function fetchAccessToken() {
    const response = await fetch("/get_access_token", {
        headers: { "X-Requested-With": "XMLHttpRequest" }
    });

    const data = await response.json();

    if (data.login_required) {
        const loginTab = window.open(data.auth_uri, "_blank");

        // Poll session status until logged in
        const interval = setInterval(async () => {
            const sessionCheck = await fetch("/session_status", {
                headers: { "X-Requested-With": "XMLHttpRequest" }
            });
            const sessionData = await sessionCheck.json();
            if (sessionData.logged_in) {
                clearInterval(interval);
                loginTab.close();

                // Try again after login
                fetchAccessToken();
            }
        }, 2000);
    } 
    return data.access_token;
        
}