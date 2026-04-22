const sessionId = document.body.getAttribute("data-session-id");
let currentSessionId = sessionId;
let shouldStopStream = false;
let sessionName = sessionId;
let allowSessionCreation = false;
let isStreaming = false;
let newMessageTrace = "";
let activeToolName = "";
let sessionAttachedFiles = {};
let newlyUploadedFiles = {};
let filesCollection = [];
let agentUpdate = null;
let currentFolderPath = {};
let folderHistory = {};
let isFixedHeight = false;
let audioContext;
let analyser;
let sourceNode;
let audioBuffer;
let animationFrameId;
let audioPlaying = false;

const minBarHeight = 5; // Minimum height for bars during visualization
const maxBarHeight = 600; // Maximum height for bars during visualization

let currentBaseHeights = [10, 30, 20, 20]; // Stores the randomized base heights for each bar
let lastSoundTime = performance.now();
const silenceThreshold = 1; // Average amplitude below this to consider silence (0-255)
const silenceDurationThreshold = 0.3; // 1 second of continuous silence to trigger reshuffle

if (currentSessionId === "None") {
      currentSessionId = generateSessionId();
}
const modelNameElement = document.querySelector(".model-name");
const modelName = modelNameElement.dataset.actualModel || modelNameElement.textContent.trim();
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
/////////////////////////////////
//      on document load      //
///////////////////////////////
document.querySelector(".new-session-button").addEventListener("click", function () {
      window.location.href = "/relaychat";
});

document.addEventListener("DOMContentLoaded", function () {
      if (sessionId !== "None") {
            loadSessionData(currentSessionId);
      } else {
            document.getElementById("chat-container").innerHTML = "";
            document.getElementById("chat-container").style.paddingBottom = "0px";
            document.getElementById("chat-container").style.margin = "0px";
      }

      // Delay focus and enable session creation after page is fully loaded
      setTimeout(() => {
            document.getElementById("userInput").focus();
            allowSessionCreation = true; // Now it's safe to create sessions
            // // console.log("Session creation enabled");
      }, 500);
});
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
/////////////////////////////////////////////////////////
//                  Utility functions                  //
/////////////////////////////////////////////////////////

function hideWelcomeMessage() {
      const welcomeMessage = document.getElementById("welcomeMessage");
      welcomeMessage.style.display = "none";
}
function addCopyButtonToPreTags() {
      const preTags = document.querySelectorAll("pre");

      preTags.forEach((preTag) => {
            // Ensure it's not already wrapped
            if (!preTag.parentElement.classList.contains("pre-container")) {
                  // Create a wrapper container
                  const container = document.createElement("div");
                  container.className = "pre-container";

                  // Create a header container
                  const header = document.createElement("div");
                  header.className = "pre-header";

                  // Extract language from class (e.g., "language-python")
                  const codeBlock = preTag.querySelector("code");
                  let language = "Text"; // Default if no language is found

                  if (codeBlock && codeBlock.classList.length > 0) {
                        const langClass = Array.from(codeBlock.classList).find((cls) => cls.startsWith("language-"));
                        if (langClass) {
                              language = langClass.replace("language-", "").toUpperCase();
                        }
                  }

                  // Create language label
                  const langLabel = document.createElement("span");
                  langLabel.className = "lang-label";
                  langLabel.textContent = language;

                  // Create copy button
                  const copyButton = document.createElement("button");
                  copyButton.textContent = "Copy";
                  copyButton.className = "markdown-copy-button";

                  // Insert elements correctly
                  preTag.parentNode.insertBefore(container, preTag);
                  container.appendChild(header);
                  header.appendChild(langLabel);
                  header.appendChild(copyButton);
                  container.appendChild(preTag);

                  // Add copy functionality
                  copyButton.addEventListener("click", () => {
                        const text = preTag.innerText; // Get text at click time
                        navigator.clipboard
                              .writeText(text)
                              .then(() => {
                                    copyButton.textContent = "Copied!";
                                    setTimeout(() => {
                                          copyButton.textContent = "Copy";
                                    }, 1500);
                              })
                              .catch((err) => {
                                    console.error("Error copying text: ", err);
                              });
                  });
            }
      });
}

function scrollToBottom() {
      const chatContainer = document.getElementById("chat-container");
      if (chatContainer) {
            const messages = chatContainer.children;
            if (messages.length > 0) {
                  messages[messages.length - 1].scrollIntoView({ behavior: "smooth" });
            }
      }
      hljs.highlightAll();
}

function loadingAnimation() {
      const bottomPart = document.getElementById("bottomPart");
      const loadingMessageContainer = document.createElement("div");
      loadingMessageContainer.classList.add("bot-loading-message-container");
      loadingMessageContainer.id = "slide-loading-animation";

      const loadingCircle = document.createElement("div");
      loadingCircle.classList.add("loading-circle");

      const loadingText = document.createElement("div");
      loadingText.classList.add("loading-text");
      loadingText.classList.add("shimmer");
      loadingText.textContent = "Generating";

      const loadingdots = document.createElement("div");
      loadingdots.classList.add("loading-dots");

      loadingMessageContainer.appendChild(loadingCircle);
      loadingMessageContainer.appendChild(loadingText);
      loadingMessageContainer.appendChild(loadingdots);
      bottomPart.appendChild(loadingMessageContainer);
}

function hideLoadingAnimation() {
      const loadingMessageContainer = document.getElementById("slide-loading-animation");
      if (loadingMessageContainer) {
            loadingMessageContainer.remove();
      }
}

/////////////////////////////////////////////////////////
//                  sidebar functions                  //
/////////////////////////////////////////////////////////

let sessionItemMessageId = 0;

baseimgURL = "https://sdmntprsouthcentralus.oaiusercontent.com/files/00000000-6b20-61f7-961f-2978a26511ff/raw?se=2025-06-29T05%3A32%3A14Z&sp=r&sv=2024-08-04&sr=b&scid=e7210f19-8279-5627-9467-493ef6ef8e95&skoid=61180a4f-34a9-42b7-b76d-9ca47d89946d&sktid=a48cca56-e6da-484e-a814-9c849652bcb3&skt=2025-06-28T20%3A10%3A34Z&ske=2025-06-29T20%3A10%3A34Z&sks=b&skv=2024-08-04&sig=Zp7J/naYNuzGga22rPn9e7L04NA%2BxXjhK77LfE7d0hI%3D";
function renderSession(sessionData, sessionId) {
      for (const key in sessionAttachedFiles) {
            if (sessionAttachedFiles.hasOwnProperty(key)) {
                  delete sessionAttachedFiles[key];
            }
      }

      hideWelcomeMessage();
      currentSessionId = sessionId;
      const slidesContainer = document.getElementById("chat-container");
      slidesContainer.innerHTML = "";
      sessionData.forEach((item) => {
            try {
                  const session_item_id = item.session_item_id;
                  const prompt = item.prompt;
                  const chatbot_response = item.chatbot_response;
                  const feedback = item.feedback;
                  const sessionDetails = JSON.parse(item.session_item_details);
                  // console.log(sessionDetails);

                  newlyUploadedFiles = sessionDetails.files_json;
                  Object.assign(sessionAttachedFiles, newlyUploadedFiles);

                  // console.log("sessionAttachedFiles", sessionAttachedFiles)

                  let imageAttachments = sessionDetails.images;

                  if (typeof imageAttachments === "string") {
                        imageAttachments = JSON.parse(imageAttachments);
                  }

                  console.log("sessionDetails:", sessionDetails);

                  appendUserMessage(prompt, imageAttachments, newlyUploadedFiles);

                  agentUpdate = sessionDetails.agent_name;

                  // console.log("agentUpdate value:", agentUpdate);
                  if (agentUpdate) {
                        console.log("Calling createChatbotMessageWrapper with session_item_id and agentUpdate:", session_item_id, agentUpdate);
                        createChatbotMessageWrapper(session_item_id, agentUpdate);
                        console.log(agentUpdate)
                  } else {
                        // console.log("Calling createChatbotMessageWrapper with session_item_id:", session_item_id);
                        createChatbotMessageWrapper(session_item_id);
                  }
                  
                  let audioBlobURL = sessionDetails.audio_url;
                  // console.log("Appending chatbot message:", chatbot_response, session_item_id, feedback, false, audioBlobURL);
                  if (audioBlobURL) {
                        appendChatbotMessage(chatbot_response, session_item_id, feedback, false, audioBlobURL);
                  } else {
                        // console.log(chatbot_response)
                        appendChatbotMessage(chatbot_response, session_item_id, feedback, false, "");
                  }
                  
                  sessionItemMessageId += 1;

                  let newMessagesTrace = [];
                  if (sessionDetails.new_messages_trace) {
                        try {
                              newMessagesTrace = JSON.parse(sessionDetails.new_messages_trace);
                        } catch (e) {
                              console.error("Failed to parse new_messages_trace:", e);
                        }
                  }
                  // Loop through all but the last message
                  // console.log("Processing newMessagesTrace:", newMessagesTrace);
                  for (let i = 0; i < newMessagesTrace.length - 1; i++) {
                        let toolMsg = newMessagesTrace[i];
                        // console.log(`Processing toolMsg at index ${i}:`, toolMsg);
                        if (toolMsg["type"] === "function_call_output") {
                              let toolContent = {};
                              try {
                                    toolContent = typeof toolMsg.output === "string" ? JSON.parse(toolMsg.output) : toolMsg.output;
                                    // console.log("Parsed toolContent:", toolContent);
                              } catch (e) {
                                    toolContent = toolMsg.output || {};
                                    // console.log("Failed to parse toolMsg.output, using as is:", toolContent, e);
                              }
                              if (toolContent.tool_type === "image_generator") {
                                    // console.log("Appending thought message for image_generation:", toolContent.tool_text);
                                    appendThoughtMessage(toolContent.tool_text, false, session_item_id);
                                    // console.log("Appending generated image message:", toolContent.image_url);
                                    appendGeneratedImageMessage(toolContent.image_url, session_item_id);
                              } else if (toolContent.tool_type === "execute_inventory_query"){
                                    aladdin_json_value = toolContent.response;
                                    appendThoughtMessage(toolContent.response, false, session_item_id);

                              } else if (toolContent.tool_type === "execute_sales_insights_query"){
                                    aladdin_json_value = toolContent.response;
                                    appendThoughtMessage(toolContent.response, false, session_item_id);
                              } else if (toolContent.tool_type === "execute_llm_query"){
                                    // Format ML model inference for display
                                    let mlModelDisplay = `**🤖 ML Model Inference**\n\n`;
                                    mlModelDisplay += `**Query:** ${toolContent.query}\n\n`;
                                    if (toolContent.success && toolContent.response) {
                                          mlModelDisplay += `**ML Model Prediction:**\n${toolContent.response}\n\n`;
                                    } else if (toolContent.error_msg) {
                                          mlModelDisplay += `**⚠️ Error:** ${toolContent.error_msg}\n\n`;
                                    }
                                    mlModelDisplay += `*Inferred from ML model: ${toolContent.model || 'mas-c37b2829-endpoint'}*\n`;
                                    appendThoughtMessage(mlModelDisplay, false, session_item_id);
                              } 
                        } else {
                              console.log(`toolMsg at index ${i} is not a tool message, role:`, toolMsg["type"]);
                        }
                  }
                  for (const key in newlyUploadedFiles) {
                        if (newlyUploadedFiles.hasOwnProperty(key)) {
                              delete newlyUploadedFiles[key];
                        }
                  }
                  let wrapper = document.querySelector(`.chatbot-message-Wrapper[data-session-item-id="${session_item_id}"]`);
                  const avatarLoader = wrapper.querySelector(".avatar-loader");
                  if (avatarLoader) {
                        avatarLoader.remove();
                  }
            } catch (error) {
                  console.error("Error rendering session data:", error);
            }
      });
      sessionInitialized = true;
      // console.log("Setting sessionInitialized to true")
      addCopyButtonToPreTags();
      addCopyButtonToTables();
      scrollToBottom();
      document.getElementById("userInput").focus();
      hljs.highlightAll();
}

function renderProcessedFileCards(inputFiles) {
      const userFilesContainer = document.createElement("div");
      userFilesContainer.classList.add("user-files-container");

      Object.entries(inputFiles).forEach(([fileId, fileData]) => {
            const fileCard = document.createElement("div");
            fileCard.classList.add("file-card");

            // Set data attributes
            fileCard.setAttribute("data-file-id", fileId);
            fileCard.setAttribute("data-file-details", JSON.stringify(fileData));

            const fileCardBody = document.createElement("div");
            fileCardBody.classList.add("card", "file-card-body");

            const fileIconContainer = document.createElement("div");
            fileIconContainer.classList.add("file-icon-container", fileData.fileIconClass);

            const fileIcon = document.createElement("img");
            fileIcon.classList.add("file-icon", "icon-svg");
            fileIcon.src = fileData.fileIconSrc;

            fileIconContainer.appendChild(fileIcon);

            const fileDetailsContainer = document.createElement("div");
            fileDetailsContainer.classList.add("file-details-container");

            const fileName = document.createElement("div");
            fileName.classList.add("file-name");
            fileName.textContent = fileData.fileName;

            const fileType = document.createElement("div");
            fileType.classList.add("file-type");
            fileType.textContent = fileData.FileTypeLabel;

            fileDetailsContainer.appendChild(fileName);
            fileDetailsContainer.appendChild(fileType);

            fileCardBody.appendChild(fileIconContainer);
            fileCardBody.appendChild(fileDetailsContainer);

            fileCard.appendChild(fileCardBody);
            userFilesContainer.appendChild(fileCard);
      });

      return userFilesContainer;
}

function animateWidth(element, startWidth, endWidth, startY = 500, endY = 0, duration = 300) {
      element.style.width = `${startWidth}px`;
      element.style.transform = `translateY(${startY}px)`;
      const startTime = performance.now();

      function frame(currentTime) {
            const elapsed = currentTime - startTime;
            const progress = Math.min(elapsed / duration, 1);
            const eased = easeOutCubic(progress);

            const currentWidth = startWidth + (endWidth - startWidth) * eased;
            const currentY = startY + (endY - startY) * eased;

            element.style.width = `${currentWidth}px`;
            element.style.transform = `translateY(${currentY}px)`;

            if (progress < 1) {
                  requestAnimationFrame(frame);
            } else {
                  // Cleanup: let CSS handle layout naturally after animation
                  element.style.width = "";
                  element.style.transform = `translateY(${endY}px)`;
            }
      }

      requestAnimationFrame(frame);
}

function easeOutCubic(t) {
      return 1 - Math.pow(1 - t, 3);
}
function triggerLocalUpload() {
      document.getElementById("localFileInput").click();
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
// Define the strict order of message types
const MESSAGE_ORDER = {
      "all-user-messages": 1,
      "tool-name-container": 2,
      "image-generating-container": 3,
      "generated-image-container": 4,
      "thought-process-container": 5,
      "chatbot-message-container": 6,
};

function appendUserMessage(inputMessage, inputImages = [], inputFiles = [], inputTool = null) {
      const chatContainer = document.getElementById("chat-container");

      // Store the message data in localStorage
      const messageData = {
            inputMessage: inputMessage,
            inputImages: inputImages,
            inputFiles: inputFiles,
            inputTool: inputTool,
      };
      localStorage.setItem("lastUserMessage", JSON.stringify(messageData));

      const messageContainer = document.createElement("div");
      messageContainer.classList.add("user-message-container");

      const messageContentWrapper = document.createElement("div");
      messageContentWrapper.classList.add("user-message", "message");
      messageContentWrapper.style.opacity = "0";
      messageContentWrapper.style.transform = "translateY(40px)";
      messageContentWrapper.style.transition = "opacity 0.4s ease, transform 0.4s ease";

      // Action container with copy functionality
      const actionContainer = document.createElement("div");
      actionContainer.classList.add("user-message-action-container");

      const copyButton = document.createElement("button");
      copyButton.classList.add("toolbar-btn");
      copyButton.title = "Copy"; // Tooltip for the button
      copyButton.setAttribute("data-tooltip", "Copy");
      copyButton.onmouseenter = showTooltip;
      copyButton.onmouseleave = hideTooltip;

      const copyIcon = document.createElement("img");
      copyIcon.src = "/static/images/lucide_icons/copy.svg";
      copyIcon.alt = "Copy";
      copyIcon.classList.add("icon-svg");
      copyButton.appendChild(copyIcon);

      // Add click functionality to copy the message and temporarily change the icon
      copyButton.onclick = () => {
            navigator.clipboard.writeText(inputMessage); // Copy content to clipboard
            copyIcon.src = "/static/images/lucide_icons/check.svg"; // Change to check icon
            copyButton.title = "Copied!"; // Update tooltip text

            setTimeout(() => {
                  copyIcon.src = "/static/images/lucide_icons/copy.svg"; // Revert icon to copy
                  copyButton.title = "Copy"; // Reset tooltip text
            }, 2000);
      };

      actionContainer.appendChild(copyButton); // Add the copy button to the action container

      const imageContainer = document.createElement("div");
      imageContainer.classList.add("message-image-container");

      inputImages.forEach((src) => {
            const img = document.createElement("img");
            img.src = src;
            img.alt = "uploaded image";
            img.classList.add("user-uploaded-image");
            imageContainer.appendChild(img);
      });

      const textContentContainer = document.createElement("div");
      textContentContainer.classList.add("text-content-container");
      textContentContainer.textContent = inputMessage;

      messageContentWrapper.appendChild(textContentContainer);
      messageContainer.appendChild(messageContentWrapper);

      const allUserMessages = document.createElement("div");
      allUserMessages.classList.add("all-user-messages");

      if (inputImages.length > 0) {
            allUserMessages.appendChild(imageContainer);
      }

      // Add action container to the message container
      messageContainer.appendChild(actionContainer);

      if (Object.keys(inputFiles).length !== 0) {
            const userFilesContainer = renderProcessedFileCards(inputFiles);
            allUserMessages.appendChild(userFilesContainer);
      }

      if (inputMessage !== "") {
            allUserMessages.appendChild(messageContainer);
      }

      chatContainer.appendChild(allUserMessages);

      // Width Animation Logic
      requestAnimationFrame(() => {
            const naturalWidth = messageContentWrapper.scrollWidth;
            animateWidth(messageContentWrapper, 1000, naturalWidth);

            // Fade in after width anim starts
            setTimeout(() => {
                  messageContentWrapper.style.opacity = "1";
                  messageContentWrapper.style.transform = "translateY(0)";
            }, 100);
      });

      scrollToBottom();
}

const agentMapping = {
      "Relay Image Generator Agent": {
            agentIconBackgroundClass: "generate-image-agent-color",
            agentIconBackground: "var(--generate-image-agent-color)",
            agentMessage: "Generating Image",
            agentIcon: "palette.svg",
      },
      "Relay Microsoft 365 Agent": {
            agentIconBackgroundClass: "relay-search-agent-color",
            agentIconBackground: "var(--relay-search-agent-color)",
            agentMessage: "Scanning your relay workspace",
            agentIcon: "search.svg",
      },
      "Relay DevOps Agent": {
            agentIconBackgroundClass: "relay-devops-agent-color",
            agentIconBackground: "var(--relay-devops-agent-color)",
            agentMessage: "Scanning your relay workspace",
            agentIcon: "infinity.svg",
      },
      "Relay Project Manager Agent": {
            agentIconBackgroundClass: "relay-project-manager-agent-color",
            agentIconBackground: "var(--relay-project-manager-agent-color)",
            agentMessage: "Scanning your DevOps workspace",
            agentIcon: "search.svg",
      },
      "Relay Document Analyst Agent": {
            agentIconBackgroundClass: "document-analyst-agent-color",
            agentIconBackground: "var(--document-analyst-agent-color)",
            agentMessage: "Working on your request",
            agentIcon: "file-search-2.svg",
      },
      "Aladdin Agent": {
            agentIconBackgroundClass: "chat-agent-color",
            agentIconBackground: "var(--chat-agent-color)",
            agentMessage: "Thinking",
            agentIcon: "bot.svg",
      },
};

function appendAgentNameMessage(agentName, session_item_id) {
      console.log(agentName)
      const agentDetails = agentMapping[agentName];
      console.log(agentDetails)
      // Create the agent processing message
      const toolMessageContainer = document.createElement("div");
      toolMessageContainer.classList.add("agent-message");
      toolMessageContainer.innerHTML = `${agentDetails.agentMessage}...`;
      
      // Get or create the wrapper
      let wrapper = document.querySelector(`.chatbot-message-Wrapper[data-session-item-id="${session_item_id}"]`);
      if (!wrapper) {
            createChatbotMessageWrapper(session_item_id, agentName);
            wrapper = document.querySelector(`.chatbot-message-Wrapper[data-session-item-id="${session_item_id}"]`);
      }
      
      // 🔄 Update left avatar in the margin area
      const avatarDiv = wrapper.querySelector(".tool-name-container .agent-avatar");
      if (avatarDiv) {
            //   avatarDiv.style.background = agentDetails.agentIconBackground;
            avatarDiv.setAttribute("data-tooltip", agentName);
            
            const classesToRemove = ["chat-agent-color", "relay-search-agent-color", "generate-image-agent-color", "relay-devops-agent-color", "document-analyst-agent-color", "web-search-agent-color", "send-email-agent-color"]; // whatever your list is
            const classToAdd = agentDetails.agentIconBackgroundClass; // the one you want to apply
            
            const avatarImgDiv = avatarDiv.querySelector(".agent-img-wrapper");
            // Remove only the specified classes
            classesToRemove.forEach((cls) => avatarImgDiv.classList.remove(cls));

            // Add the new one
            avatarImgDiv.classList.add(classToAdd);

            const img = avatarDiv.querySelector("img");
            if (img) {
                  img.src = `/static/images/lucide_icons/${agentDetails.agentIcon}`;
                  img.alt = "bot";
            }
      }

      // 🔁 Inject processing message into chatbot-processing-container
      const wrapperChatContainer = wrapper.querySelector(".chatbot-processing-container");
      if (wrapperChatContainer) {
            wrapperChatContainer.replaceChildren(toolMessageContainer);
      } else {
            console.warn(`Missing .chatbot-processing-container for session_item_id: ${session_item_id}`);
      }
}

function appendImageGenerationMessage(session_item_id) {
      const imageGeneratingContainer = document.createElement("div");
      imageGeneratingContainer.classList.add("image-generating-container");

      imageGeneratingContainer.innerHTML = `
      <div class="image-generating-box">
            <div class="image-generating-loading">
            <div class="image-loader"></div>
                  <div class="image-generating-loader">
                        <img class="image-generating-icon icon-svg" src="/static/images/lucide_icons/image.svg" alt="Attach" />
                  </div>
            </div>
      </div>
      `;

      let wrapper = document.querySelector(`.chatbot-message-Wrapper[data-session-item-id="${session_item_id}"]`);

      if (!wrapper) {
            createChatbotMessageWrapper(session_item_id);
            wrapper = document.querySelector(`.chatbot-message-Wrapper[data-session-item-id="${session_item_id}"]`);
      }
      const wrapperChatContainer = wrapper.querySelector(".chatbot-image-container");
      wrapperChatContainer.appendChild(imageGeneratingContainer);
}


async function appendEmailSender(toList = [], ccList = [], subject = "", content = "", session_item_id) {
    const sendEmailContainer = document.createElement("div");
    sendEmailContainer.className = "send-email-container";

    // Helper: create chip
    const createEmailChip = (email, list, container) => {
        const chip = document.createElement("div");
        chip.className = "email-chip";
        chip.innerText = email;
        const removeBtn = document.createElement("span");
        removeBtn.innerText = "✖";
        removeBtn.className = "remove-chip";
        removeBtn.onclick = () => {
            const index = list.indexOf(email);
            if (index !== -1) list.splice(index, 1);
            chip.remove();
        };
        chip.appendChild(removeBtn);
        container.appendChild(chip);
    };

    // TO Section
    const toSection = document.createElement("div");
    toSection.className = "email-section";
    const toLabel = document.createElement("div");
    toLabel.innerText = "To:";
    const toContainer = document.createElement("div");
    toContainer.className = "email-list";
    toList.forEach((email) => createEmailChip(email, toList, toContainer));
    const toInput = document.createElement("input");
    toInput.placeholder = "Search users...";
    toInput.oninput = () => handleEmailSuggestions(toInput, toList, toContainer);
    toSection.append(toLabel, toContainer, toInput);

    // CC Section
    const ccSection = document.createElement("div");
    ccSection.className = "email-section";
    const ccLabel = document.createElement("div");
    ccLabel.innerText = "CC:";
    const ccContainer = document.createElement("div");
    ccContainer.className = "email-list";
    ccList.forEach((email) => createEmailChip(email, ccList, ccContainer));
    const ccInput = document.createElement("input");
    ccInput.placeholder = "Search users...";
    ccInput.oninput = () => handleEmailSuggestions(ccInput, ccList, ccContainer);
    ccSection.append(ccLabel, ccContainer, ccInput);

    // Subject
    const subjectInput = document.createElement("input");
    subjectInput.className = "email-subject";
    subjectInput.placeholder = "Subject";
    subjectInput.value = subject;

    // Body
    const bodyInput = document.createElement("textarea");
    bodyInput.className = "email-body";
    bodyInput.placeholder = "Email content";
    bodyInput.value = content;

    // Send Button
    const sendBtn = document.createElement("button");
    sendBtn.innerText = "Send";
    sendBtn.onclick = async () => {
        const accessToken = await fetchAccessToken();

        const payload = {
            toList,
            ccList,
            subject: subjectInput.value,
            body_html: bodyInput.value,
            access_token: accessToken
        };

        try {
            const res = await fetch("/relaychat/send_email", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify(payload)
            });

            if (!res.ok) {
                const err = await res.json();
                throw new Error(err?.error || "Failed to send email");
            }

            console.log("✅ Email sent successfully!");
            sendBtn.innerText = "Sent ✔";
            sendBtn.disabled = true;
        } catch (err) {
            console.error("❌ Error sending email:", err);
            sendBtn.innerText = "Error ❌";
        }
    };

    // Assemble
    sendEmailContainer.append(toSection, ccSection, subjectInput, bodyInput, sendBtn);

    // Insert into DOM
    let wrapper = document.querySelector(`.chatbot-message-Wrapper[data-session-item-id="${session_item_id}"]`);
    if (!wrapper) {
        createChatbotMessageWrapper(session_item_id);
        wrapper = document.querySelector(`.chatbot-message-Wrapper[data-session-item-id="${session_item_id}"]`);
    }
    const wrapperChatContainer = wrapper.querySelector(".chatbot-image-container");
    wrapperChatContainer.appendChild(sendEmailContainer);

    // Email suggestions
    async function handleEmailSuggestions(inputEl, targetList, targetContainer) {
        const value = inputEl.value.trim();
        if (value.length === 0) {
            const existing = inputEl.parentNode.querySelector(".email-suggestion-box");
            if (existing) existing.remove();
            return;
        }

        let oldBox = inputEl.parentNode.querySelector(".email-suggestion-box");
        if (oldBox) oldBox.remove();

        const box = document.createElement("div");
        box.className = "email-suggestion-box";
        const loader = document.createElement("div");
        loader.className = "suggestions-loader";
        box.appendChild(loader);
        inputEl.parentNode.appendChild(box);

        try {
            const users = await fetchUsersFromBackend(value);
            box.innerHTML = "";

            if (users.length === 0) {
                box.innerHTML = "<div class='email-suggestion-item'>No matching users</div>";
                return;
            }

            users.forEach((user) => {
                const item = document.createElement("div");
                item.className = "email-suggestion-item";

                const avatar = document.createElement("div");
                avatar.className = "user-photo";
                if (user.photo === "[NOT AVAILABLE]" || !user.photo) {
                    avatar.textContent = getInitials(user.displayName).toUpperCase();
                } else {
                    const img = document.createElement("img");
                    img.src = user.photo;
                    img.alt = user.displayName;
                    img.className = "avatar-image";
                    avatar.appendChild(img);
                }

                const label = document.createElement("div");
                label.innerHTML = `<strong>${user.displayName}</strong><br><small>${user.email}</small>`;

                item.appendChild(avatar);
                item.appendChild(label);
                item.onclick = () => {
                    if (!targetList.includes(user.email)) {
                        targetList.push(user.email);
                        createEmailChip(user.email, targetList, targetContainer);
                    }
                    inputEl.value = "";
                    box.remove();
                };

                box.appendChild(item);
            });
        } catch (error) {
            console.error("Error fetching user suggestions:", error);
            box.innerHTML = "<div class='email-suggestion-item'>Error fetching suggestions</div>";
        }
    }

    function getInitials(name = "") {
        return name
            .split(" ")
            .map(part => part[0])
            .join("")
            .slice(0, 2);
    }
}

function getInitials(name = "") {
      return name
            .split(" ")
            .map((part) => part[0])
            .join("")
            .slice(0, 2);
}

function appendGeneratedImageMessage(base64Url, session_item_id) {
      const chatContainer = document.getElementById("chat-container");

      const imageContainer = document.createElement("div");
      imageContainer.classList.add("generated-image-container");

      imageContainer.innerHTML = `
    <div class="generated-image-wrapper">
      <img class="generated-image" src="${base64Url}" alt="Generated Image" />
      <div class="image-hover-overlay">
        <a class="download-button" href="${base64Url}" download="generated-image.png" title="Download">
          <img class="image-generating-icon icon-svg" src="/static/images/lucide_icons/download.svg" alt="Download" />
        </a>
      </div>
    </div>
  `;

      let wrapper = document.querySelector(`.chatbot-message-Wrapper[data-session-item-id="${session_item_id}"]`);

      if (!wrapper) {
            createChatbotMessageWrapper(session_item_id);
            wrapper = document.querySelector(`.chatbot-message-Wrapper[data-session-item-id="${session_item_id}"]`);
      }
      const wrapperChatContainer = wrapper.querySelector(".chatbot-image-container");
      wrapperChatContainer.appendChild(imageContainer);

      // Add full-screen modal on image click
      const imageEl = imageContainer.querySelector(".generated-image");

      imageEl.addEventListener("click", () => {
            const modal = document.createElement("div");
            modal.classList.add("image-modal");

            modal.innerHTML = `
      <div class="modal-content">
        <button class="modal-close">&times;</button>
        <img class="modal-image" src="${base64Url}" alt="Full Image" />
      </div>
    `;

            document.body.appendChild(modal);

            // Close on button click
            modal.querySelector(".modal-close").addEventListener("click", () => {
                  document.body.removeChild(modal);
            });

            // Close on clicking outside the image
            modal.addEventListener("click", (e) => {
                  if (e.target === modal) {
                        document.body.removeChild(modal);
                  }
            });
      });
}

function createThoughtProcessContainer() {
      const thoughtProcessContainer = document.createElement("div");
      thoughtProcessContainer.classList.add("thought-process-container");

      // Create the toggle button
      const toggleButton = document.createElement("button");
      toggleButton.classList.add("thought-toggle-btn");
      toggleButton.classList.add("icon-svg");

      // Button text
      const btnText = document.createElement("span");
      btnText.textContent = "Show thoughts";
      toggleButton.appendChild(btnText);

      // Arrow image
      const arrowImg = document.createElement("img");
      arrowImg.src = "/static/images/lucide_icons/chevron-right.svg";
      arrowImg.alt = "Toggle";
      arrowImg.style.width = "14px";
      arrowImg.style.height = "14px";
      arrowImg.style.transition = "transform 0.2s";
      toggleButton.appendChild(arrowImg);

      // Create thinking indicator (initially hidden)
      const thinkingDiv = document.createElement("div");
      thinkingDiv.classList.add("thinking-indicator", "shimmer");
      thinkingDiv.textContent = "Thinking...";
      thinkingDiv.style.display = "none";
      toggleButton.appendChild(thinkingDiv);

      // Toggle logic
      let expanded = false; // Start collapsed by default
      toggleButton.addEventListener("click", () => {
            // Don't allow manual toggle while streaming
            if (toggleButton.classList.contains("streaming")) {
                  return;
            }
            toggleButton.style.opacity = 1;

            expanded = !expanded;
            const wrappers = thoughtProcessContainer.querySelectorAll(".thought-item-wrapper");
            wrappers.forEach((w) => {
                  w.style.display = expanded ? "flex" : "none";
            });
            arrowImg.style.transform = expanded ? "rotate(90deg)" : "rotate(0deg)";
            btnText.textContent = expanded ? "Hide thoughts" : "Show thoughts";
      });

      thoughtProcessContainer.appendChild(toggleButton);
      return thoughtProcessContainer;
}

function appendThoughtMessage(content, isStreaming = false, session_item_id) {
      let wrapper = document.querySelector(`.chatbot-message-Wrapper[data-session-item-id="${session_item_id}"]`);
      if (!wrapper) {
            console.warn(`No wrapper found for session_item_id: ${session_item_id}`);
            return;
      }

      // Reuse or create thought-process-container
      let thoughtProcessContainer = wrapper.querySelector(".thought-process-container");
      if (!thoughtProcessContainer) {
            thoughtProcessContainer = createThoughtProcessContainer();

            const wrapperChatbotThoughtContainer = wrapper.querySelector(".chatbot-message-container").querySelector(".chatbot-thought-container");
            if (!wrapperChatbotThoughtContainer) {
                  console.warn(`No chatbot-message-container found for session_item_id: ${session_item_id}`);
                  return;
            }
            wrapperChatbotThoughtContainer.appendChild(thoughtProcessContainer);
      }

      // Thought item structure
      const thoughtProcessContent = document.createElement("div");
      thoughtProcessContent.classList.add("thought-process-item", "message");
      if (content) {
            thoughtProcessContent.innerHTML = marked.parse(content);
      }

      const thoughtDot = document.createElement("div");
      thoughtDot.classList.add("thought-dot");
      const thoughtLine = document.createElement("div");
      thoughtLine.classList.add("thought-line");

      const thoughtMargin = document.createElement("div");
      thoughtMargin.classList.add("thought-margin");
      thoughtMargin.appendChild(thoughtDot);
      thoughtMargin.appendChild(thoughtLine);

      const thoughtItemWrapper = document.createElement("div");
      thoughtItemWrapper.classList.add("thought-item-wrapper");
      thoughtItemWrapper.appendChild(thoughtMargin);
      thoughtItemWrapper.appendChild(thoughtProcessContent);

      thoughtProcessContainer.appendChild(thoughtItemWrapper);

      // Toggle and streaming logic
      const toggleBtn = thoughtProcessContainer.querySelector(".thought-toggle-btn");
      const btnText = toggleBtn.querySelector("span");
      const arrowImg = toggleBtn.querySelector("img");
      const thinkingDiv = toggleBtn.querySelector(".thinking-indicator");

      if (isStreaming) {
            toggleBtn.classList.add("streaming");
            btnText.style.display = "none";
            arrowImg.style.display = "none";
            thinkingDiv.style.display = "inline-block";
            thoughtItemWrapper.style.display = "flex";

            // Scroll into view
            setTimeout(() => {
                  thoughtItemWrapper.scrollIntoView({ behavior: "smooth", block: "nearest" });
            }, 50);
      } else {
            // Collapse initially
            thoughtItemWrapper.style.display = "none";
            toggleBtn.classList.remove("streaming");
            btnText.style.display = "inline";
            arrowImg.style.display = "inline";
            thinkingDiv.style.display = "none";
      }
}

function finishThoughtStreaming() {
      const chatContainer = document.getElementById("chat-container");
      const thoughtProcessContainer = chatContainer.querySelector(".thought-process-container");

      if (thoughtProcessContainer) {
            const toggleBtn = thoughtProcessContainer.querySelector(".thought-toggle-btn");
            const btnText = toggleBtn.querySelector("span");
            const arrowImg = toggleBtn.querySelector("img");
            const thinkingDiv = toggleBtn.querySelector(".thinking-indicator");

            // Remove streaming state
            toggleBtn.classList.remove("streaming");

            // Hide thinking indicator, show button text and arrow
            thinkingDiv.style.display = "none";
            btnText.style.display = "inline";
            arrowImg.style.display = "inline-block";

            // Collapse the thought process section
            const wrappers = thoughtProcessContainer.querySelectorAll(".thought-item-wrapper");
            wrappers.forEach((w) => (w.style.display = "none"));

            // Update button state to collapsed
            arrowImg.style.transform = "rotate(0deg)";
            btnText.textContent = "Show thoughts";
      }
}
function createAudioPlayer(audioUrl, session_item_id) {
      const audioPlayerContainer = document.createElement("div");
      audioPlayerContainer.classList.add("audio-player-container");

      const audioElement = document.createElement("audio");
      audioElement.src = audioUrl;
      audioElement.preload = "metadata";

      // Player controls container
      const controlsContainer = document.createElement("div");
      controlsContainer.classList.add("audio-controls");

      // Play/Pause button
      const playPauseBtn = document.createElement("button");
      playPauseBtn.classList.add("play-pause-btn");

      const playIcon = document.createElement("img");
      playIcon.src = "/static/images/lucide_icons/play.svg";
      playIcon.alt = "Play";
      playIcon.classList.add("icon-svg");
      playPauseBtn.appendChild(playIcon);

      // Time display
      const timeDisplay = document.createElement("div");
      timeDisplay.classList.add("time-display");
      timeDisplay.textContent = "0:00 / 0:00";

      // Progress bar container
      const progressContainer = document.createElement("div");
      progressContainer.classList.add("progress-container");

      const progressBar = document.createElement("input");
      progressBar.type = "range";
      progressBar.min = "0";
      progressBar.max = "100";
      progressBar.value = "0";
      progressBar.classList.add("progress-bar");

      // Download button
      const downloadBtn = document.createElement("button");
      downloadBtn.classList.add("download-btn");

      const downloadIcon = document.createElement("img");
      downloadIcon.src = "/static/images/lucide_icons/download.svg";
      downloadIcon.alt = "Download";
      downloadIcon.classList.add("icon-svg");
      downloadBtn.appendChild(downloadIcon);

      // Assemble controls
      controlsContainer.appendChild(playPauseBtn);
      controlsContainer.appendChild(timeDisplay);
      controlsContainer.appendChild(progressContainer);
      progressContainer.appendChild(progressBar);
      controlsContainer.appendChild(downloadBtn);

      audioPlayerContainer.appendChild(controlsContainer);

      // Event listeners
      let isPlaying = false;

      playPauseBtn.addEventListener("click", () => {
            if (isPlaying) {
                  audioElement.pause();
                  playIcon.src = "/static/images/lucide_icons/play.svg";
                  isPlaying = false;
            } else {
                  audioElement.play();
                  playIcon.src = "/static/images/lucide_icons/pause.svg";
                  isPlaying = true;
            }
      });

      audioElement.addEventListener("loadedmetadata", () => {
            progressBar.max = audioElement.duration;
            updateTimeDisplay();
      });

      audioElement.addEventListener("timeupdate", () => {
            progressBar.value = audioElement.currentTime;
            updateTimeDisplay();
      });

      audioElement.addEventListener("ended", () => {
            playIcon.src = "/static/images/lucide_icons/play.svg";
            isPlaying = false;
            progressBar.value = 0;
            updateTimeDisplay();
      });

      progressBar.addEventListener("input", () => {
            audioElement.currentTime = progressBar.value;
      });

      downloadBtn.addEventListener("click", () => {
            const a = document.createElement("a");
            a.href = audioUrl;
            a.download = `audio_${session_item_id}.mp3`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
      });

      function updateTimeDisplay() {
            const current = formatTime(audioElement.currentTime);
            const duration = formatTime(audioElement.duration);
            timeDisplay.textContent = `${current} / ${duration}`;
      }

      function formatTime(seconds) {
            if (isNaN(seconds)) return "0:00";
            const minutes = Math.floor(seconds / 60);
            const remainingSeconds = Math.floor(seconds % 60);
            return `${minutes}:${remainingSeconds.toString().padStart(2, "0")}`;
      }

      return audioPlayerContainer;
}

function createChatbotMessageWrapper(session_item_id, agentName = "Aladdin Agent") {
      const agentDetails = agentMapping[agentName];
      const messageWrapper = document.createElement("div");
      messageWrapper.classList.add("chatbot-message-Wrapper");
      messageWrapper.setAttribute("data-session-item-id", session_item_id);

      // Build the agent loading message structure
      const chatbotAgentDetailsContainer = document.createElement("div");
      chatbotAgentDetailsContainer.classList.add("tool-name-container");
      chatbotAgentDetailsContainer.innerHTML = `
      <div class="agent-avatar" id="agentAvatar" data-tooltip="${agentName}" onmouseenter="showTooltip(event)" onmouseleave="hideTooltip()">
            <div class="agent-img-wrapper ${agentDetails.agentIconBackgroundClass}">
                  <img src="/static/images/lucide_icons/${agentDetails.agentIcon}" alt="bot" />
            </div>
            <div class="avatar-loader" style="border:2px solid ${agentDetails.agentIconBackground}"></div>
      </div>`;

      const chatContainer = document.getElementById("chat-container");

      const messageContainer = document.createElement("div");
      messageContainer.classList.add("chatbot-message-container");

      // Add three sub-divs inside chatbot-message-container
      const subDiv1 = document.createElement("div");
      subDiv1.classList.add("chatbot-processing-container");
      const subDiv2 = document.createElement("div");
      subDiv2.classList.add("chatbot-image-container");
      const subDiv3 = document.createElement("div");
      subDiv3.classList.add("chatbot-thought-container");
      const subDiv4 = document.createElement("div");
      subDiv4.classList.add("chatbot-text-container");
      const subDiv41 = document.createElement("div");
      subDiv41.classList.add("chatbot-email-sender-container");
      const subDiv5 = document.createElement("div");
      subDiv5.classList.add("chatbot-audio-container");
      const subDiv6 = document.createElement("div");
      subDiv6.classList.add("chatbot-error-container");
      const subDiv7 = document.createElement("div");
      subDiv7.classList.add("chatbot-action-container");

      messageContainer.appendChild(subDiv1);
      messageContainer.appendChild(subDiv2);
      messageContainer.appendChild(subDiv3);
      messageContainer.appendChild(subDiv4);
      messageContainer.appendChild(subDiv41);
      messageContainer.appendChild(subDiv5);
      messageContainer.appendChild(subDiv6);
      messageContainer.appendChild(subDiv7);

      messageWrapper.appendChild(chatbotAgentDetailsContainer);
      messageWrapper.appendChild(messageContainer);

      chatContainer.appendChild(messageWrapper);
}

function appendErrorMessage(session_item_id) {
      const wrapper = document.querySelector(`.chatbot-message-Wrapper[data-session-item-id="${session_item_id}"]`);
      const wrapperChatContainerError = wrapper.querySelector(".chatbot-error-container");

      const errorHTML = `
    <div class="chatbot-error-box">
      <span class="chatbot-error-icon">❗</span>
      <span class="chatbot-error-text">
        Something went wrong. If this issue persists, please contact our team at bangaru.bhavyasree@diggibyte.com, sairam.penjarla@diggibyte.com, or harshith.r@diggibyte.com.
      </span>
    </div>
  `;
      wrapperChatContainerError.innerHTML = errorHTML;
}

function appendChatbotMessage(content, session_item_id, feedback, is_streaming = false, audio_url = "") {
      // Only create messageWrapper if it doesn't already exist for this message
      let messageWrapper = document.querySelector(`.chatbot-message-Wrapper[data-session-item-id="${session_item_id}"]`);
      if (!messageWrapper) {
            messageWrapper = document.createElement("div");
            messageWrapper.classList.add("chatbot-message-Wrapper");
            messageWrapper.setAttribute("data-session-item-id", session_item_id);
      }

      const chatContainer = document.getElementById("chat-container");

      const messageContainer = document.createElement("div");
      messageContainer.classList.add("chatbot-text-response-container");

      const messageContentWrapper = document.createElement("div");
      messageContentWrapper.classList.add("chatbot-message", "message");

      const textContentContainer = document.createElement("div");
      textContentContainer.classList.add("text-content-container");

      if (content) {
            new_content = removeReferencesHeading(content);
            textContentContainer.innerHTML = marked.parse(new_content);
      }

      const buttonContainer = document.createElement("div");
      buttonContainer.classList.add("button-container");

      const copyButton = document.createElement("button");
      copyButton.classList.add("copy-button");
      copyButton.id = "tooltipButton";

      const copyIcon = document.createElement("img");
      copyIcon.src = "/static/images/lucide_icons/copy.svg";
      copyIcon.alt = "Copy";
      copyIcon.classList.add("icon-svg");
      copyButton.appendChild(copyIcon);

      const tooltip = document.createElement("div");
      tooltip.classList.add("tooltip");
      tooltip.textContent = "Copy";
      copyButton.appendChild(tooltip);

      const originalText = content;
      copyButton.addEventListener("click", () => {
            navigator.clipboard
                  .writeText(originalText)
                  .then(() => {
                        copyIcon.src = "/static/images/lucide_icons/check.svg";
                        copyButton.title = "Copied!";
                        setTimeout(() => {
                              copyIcon.src = "/static/images/lucide_icons/copy.svg";
                              copyButton.title = "";
                        }, 2000);
                  })
                  .catch((err) => console.error("Error copying text: ", err));
      });

      function sendFeedback(feedbackType) {
            fetch("/relaychat/update_feedback", {
                  method: "POST",
                  headers: {
                        "Content-Type": "application/json",
                  },
                  body: JSON.stringify({
                        session_id: currentSessionId,
                        feedback: feedbackType,
                        session_item_id: session_item_id,
                  }),
            })
                  .then((response) => response.json())
                  .catch((error) => console.error("Error sending feedback:", error));
      }

      const likeButton = document.createElement("button");
      likeButton.classList.add("like-button");
      likeButton.id = "tooltipButton";

      const likeIcon = document.createElement("img");
      likeIcon.src = "/static/images/lucide_icons/like-icon.svg";
      likeIcon.alt = "Like";
      likeIcon.classList.add("icon-svg");
      likeButton.appendChild(likeIcon);

      const likeTooltip = document.createElement("div");
      likeTooltip.classList.add("tooltip");
      likeTooltip.textContent = "Good response";
      likeButton.appendChild(likeTooltip);

      likeButton.addEventListener("click", () => {
            likeIcon.src = "/static/images/lucide_icons/check.svg";
            likeButton.title = "Liked";
            dislikeIcon.src = "/static/images/lucide_icons/thumbs-down.svg";
            dislikeButton.title = "";
            sendFeedback(1);
      });

      const dislikeButton = document.createElement("button");
      dislikeButton.classList.add("dislike-button");
      dislikeButton.id = "tooltipButton";

      const dislikeIcon = document.createElement("img");
      dislikeIcon.src = "/static/images/lucide_icons/thumbs-down.svg";
      dislikeIcon.alt = "Dislike";
      dislikeIcon.classList.add("icon-svg");
      dislikeButton.appendChild(dislikeIcon);

      const dislikeTooltip = document.createElement("div");
      dislikeTooltip.classList.add("tooltip");
      dislikeTooltip.textContent = "Bad response";
      dislikeButton.appendChild(dislikeTooltip);

      dislikeButton.addEventListener("click", () => {
            dislikeIcon.src = "/static/images/lucide_icons/check.svg";
            dislikeButton.title = "Disliked";
            likeIcon.src = "/static/images/lucide_icons/thumbs-up.svg";
            likeButton.title = "";
            sendFeedback(-1);
      });

      // Handle initial feedback state
      if (feedback === 1) {
            likeIcon.src = "/static/images/lucide_icons/check.svg";
            likeButton.title = "Liked";
            dislikeIcon.src = "/static/images/lucide_icons/thumbs-down.svg";
            dislikeButton.title = "";
      } else if (feedback === -1) {
            dislikeIcon.src = "/static/images/lucide_icons/check.svg";
            dislikeButton.title = "Disliked";
            likeIcon.src = "/static/images/lucide_icons/thumbs-up.svg";
            likeButton.title = "";
      } else {
            // Default icons already set above
            likeIcon.src = "/static/images/lucide_icons/thumbs-up.svg";
            dislikeIcon.src = "/static/images/lucide_icons/thumbs-down.svg";
            likeButton.title = "";
            dislikeButton.title = "";
      }

      // 🎧 AUDIO BUTTON
      const audioButton = document.createElement("button");
      audioButton.classList.add("audio-button");
      audioButton.id = "tooltipButton";

      const audioIcon = document.createElement("img");
      audioIcon.src = "/static/images/lucide_icons/volume-2.svg"; // Provide your own icon
      audioIcon.alt = "Create Audio";
      audioIcon.classList.add("icon-svg");
      audioButton.appendChild(audioIcon);

      const audioTooltip = document.createElement("div");
      audioTooltip.classList.add("tooltip");
      audioTooltip.textContent = "Create Audio";
      audioButton.appendChild(audioTooltip);

      // AUDIO LOGIC
      let currentAudioUrl = audio_url;
      const audioElement = new Audio();

      if (currentAudioUrl && currentAudioUrl.trim() !== "") {
            // Create and add audio player to audio container
            const wrapper = document.querySelector(`.chatbot-message-Wrapper[data-session-item-id="${session_item_id}"]`);
            const audioContainer = wrapper.querySelector(".chatbot-message-container").querySelector(".chatbot-audio-container");
            const audioPlayer = createAudioPlayer(currentAudioUrl, session_item_id);
            audioPlayer.setAttribute("data-blob_url", currentAudioUrl);
            audioContainer.appendChild(audioPlayer);
      }
      audioButton.onclick = async () => {
            // If no URL yet, generate it from backend
            audioIcon.classList.add("spin"); // Optional loading indicator
            audioIcon.src = "/static/images/lucide_icons/loader-circle.svg";

            try {
                  const response = await fetch("/relaychat/generate_audio_from_text", {
                        method: "POST",
                        headers: {
                              "Content-Type": "application/json",
                        },
                        body: JSON.stringify({
                              session_id: currentSessionId,
                              content: content,
                              session_item_id: session_item_id,
                        }),
                  });

                  const data = await response.json();
                  if (data.audio_url) {
                        currentAudioUrl = data.audio_url;

                        audioButton.remove();

                        // Create and add audio player to audio container
                        const wrapper = document.querySelector(`.chatbot-message-Wrapper[data-session-item-id="${session_item_id}"]`);
                        const audioContainer = wrapper.querySelector(".chatbot-message-container").querySelector(".chatbot-audio-container");
                        const audioPlayer = createAudioPlayer(currentAudioUrl, session_item_id);
                        audioPlayer.setAttribute("data-blob_url", currentAudioUrl);
                        audioContainer.appendChild(audioPlayer);
                        return;
                  } else {
                        alert("Failed to generate audio.");
                  }
            } catch (error) {
                  console.error("Audio generation error:", error);
                  alert("Audio could not be generated.");
            } finally {
                  audioIcon.classList.remove("loading");
            }
      };

      // Add audio button to the container
      buttonContainer.appendChild(copyButton);
      buttonContainer.appendChild(likeButton);
      buttonContainer.appendChild(dislikeButton);
      // console.log(audio_url.trim() === "", content, audio_url)
      if (audio_url === "") {
            buttonContainer.appendChild(audioButton);
      }

      if (is_streaming) {
            buttonContainer.style.display = "none";
      }

      messageContentWrapper.appendChild(textContentContainer);
      messageContainer.appendChild(messageContentWrapper);

      let wrapper = document.querySelector(`.chatbot-message-Wrapper[data-session-item-id="${session_item_id}"]`);

      if (!wrapper) {
            createChatbotMessageWrapper(session_item_id);
            wrapper = document.querySelector(`.chatbot-message-Wrapper[data-session-item-id="${session_item_id}"]`);
      }
      const wrapperChatContainer = wrapper.querySelector(".chatbot-message-container").querySelector(".chatbot-text-container");
      wrapperChatContainer.appendChild(messageContainer);

      const wrapperChatActionContainer = wrapper.querySelector(".chatbot-message-container").querySelector(".chatbot-action-container");
      wrapperChatActionContainer.appendChild(buttonContainer);
}

function updateAudioCreatorButton(content, session_item_id) {
      let wrapper = document.querySelector(`.chatbot-message-Wrapper[data-session-item-id="${session_item_id}"]`);
      const audioButton = wrapper.querySelector(".chatbot-action-container").querySelector(".audio-button");
      const audioIcon = audioButton.querySelector(".icon-svg");

      audioButton.onclick = async () => {
            // If no URL yet, generate it from backend
            audioIcon.classList.add("spin"); // Optional loading indicator
            audioIcon.src = "/static/images/lucide_icons/loader-circle.svg";

            try {
                  const response = await fetch("/relaychat/generate_audio_from_text", {
                        method: "POST",
                        headers: {
                              "Content-Type": "application/json",
                        },
                        body: JSON.stringify({
                              content: content,
                              session_item_id: session_item_id,
                        }),
                  });

                  const data = await response.json();
                  if (data.audio_url) {
                        currentAudioUrl = data.audio_url;

                        audioButton.remove();

                        // Create and add audio player to audio container
                        const wrapper = document.querySelector(`.chatbot-message-Wrapper[data-session-item-id="${session_item_id}"]`);
                        const audioContainer = wrapper.querySelector(".chatbot-message-container").querySelector(".chatbot-audio-container");
                        const audioPlayer = createAudioPlayer(currentAudioUrl, session_item_id);
                        audioPlayer.setAttribute("data-blob_url", currentAudioUrl);
                        audioContainer.appendChild(audioPlayer);
                        return;
                  } else {
                        alert("Failed to generate audio.");
                  }
            } catch (error) {
                  console.error("Audio generation error:", error);
                  showNotification("Audio could not be generated.", "error");
            } finally {
                  audioIcon.classList.remove("loading");
            }
      };
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
//

async function loadSessionData(sessionId) {
      try {
            hideWelcomeMessage();
            currentSessionId = sessionId;
            window.history.pushState({}, "", `/relaychat/${sessionId}`);
            document.getElementById("chat-container").style.paddingBottom = "90px";
            document.getElementById("chat-container").style.margin = "auto";

            document.querySelector(".container").style.justifyContent = "space-between";
            document.querySelector(".container").style.alignItems = "flex-end";

            const response = await fetch("/relaychat/get_session_data", {
                  method: "POST",
                  headers: {
                        "Content-Type": "application/json",
                  },
                  body: JSON.stringify({ sessionId }),
            });
            const responseData = await response.json(); // Ensure JSON response
            const sessionData = responseData; // Access 'session_data'
            if (sessionData) {
                  renderSession(sessionData, sessionId);
            } else {
                  console.error("No conversations found for this session.");
            }
      } catch (error) {
            console.error("Error loading previous conversations:", error);
      }
}

function updateLastCopyButtonText(newText) {
      // Get all elements with class "button-container"
      const buttonContainers = document.querySelectorAll(".button-container");

      if (buttonContainers.length === 0) return; // Exit if no buttons exist

      // Get the last occurrence
      const lastButtonContainer = buttonContainers[buttonContainers.length - 1];

      // Find the copy button inside it
      const copyButton = lastButtonContainer.querySelector(".copy-button");

      if (!copyButton) return; // Exit if no copy button found

      // Update the event listener to copy the new text
      copyButton.onclick = () => {
            navigator.clipboard
                  .writeText(newText)
                  .then(() => {
                        const copyIcon = copyButton.querySelector("img");
                        copyIcon.src = "/static/images/tick.svg"; // Change to tick icon
                        copyButton.title = "Copied!";
                        setTimeout(() => {
                              copyIcon.src = "/static/images/lucide_icons/copy.svg"; // Revert back to copy icon
                              copyButton.title = "";
                        }, 2000);
                  })
                  .catch((err) => {
                        console.error("Error copying text: ", err);
                  });
      };
}
function downloadTableAsExcel(table, filename = "table.xlsx") {
      const wb = XLSX.utils.book_new();
      const ws_data = Array.from(table.rows).map((row) => Array.from(row.cells).map((cell) => cell.textContent.trim()));
      const ws = XLSX.utils.aoa_to_sheet(ws_data);
      XLSX.utils.book_append_sheet(wb, ws, "Sheet1");
      XLSX.writeFile(wb, filename);
}
function addCopyButtonToTables() {
      const tables = document.querySelectorAll(".chatbot-message-container table");

      tables.forEach((table, index) => {
            if (table.parentElement.classList.contains("table-copy-wrapper")) return;

            const wrapper = document.createElement("div");
            wrapper.classList.add("table-copy-wrapper");

            const buttonContainer = document.createElement("div");
            buttonContainer.classList.add("table-button-container");

            // Copy Button
            const copyButton = document.createElement("button");
            copyButton.classList.add("table-copy-button");
            copyButton.title = "Copy Table";

            const copyIcon = document.createElement("img");
            copyIcon.classList.add("icon-svg");
            copyIcon.src = "/static/images/lucide_icons/copy.svg";
            copyIcon.alt = "Copy";
            copyButton.appendChild(copyIcon);

            copyButton.onclick = () => {
                  const textContent = Array.from(table.rows)
                        .map((row) =>
                              Array.from(row.cells)
                                    .map((cell) => cell.textContent.trim())
                                    .join("\t")
                        )
                        .join("\n");

                  navigator.clipboard
                        .writeText(textContent)
                        .then(() => {
                              copyIcon.src = "/static/images/tick.svg";
                              copyButton.title = "Copied!";
                              setTimeout(() => {
                                    copyIcon.src = "/static/images/lucide_icons/copy.svg";
                                    copyButton.title = "Copy Table";
                              }, 2000);
                        })
                        .catch((err) => console.error("Error copying table:", err));
            };

            // Download Button
            const downloadButton = document.createElement("button");
            downloadButton.classList.add("table-download-button");
            downloadButton.title = "Download as Excel";

            const downloadIcon = document.createElement("img");
            downloadIcon.src = "/static/images/download.svg";
            downloadIcon.classList.add("icon-svg");
            downloadIcon.alt = "Download";
            downloadButton.appendChild(downloadIcon);

            downloadButton.onclick = () => downloadTableAsExcel(table, `table_${index + 1}.xlsx`);

            // Append buttons
            buttonContainer.appendChild(copyButton);
            buttonContainer.appendChild(downloadButton);

            // Wrap and insert
            table.parentElement.insertBefore(wrapper, table);
            wrapper.appendChild(buttonContainer);
            wrapper.appendChild(table);
      });
}

// Function to upload image to blob storage
async function uploadImageToBlob(file, tempId) {
      try {
            // Check if we've already reached the maximum image limit
            const existingImages = document.querySelectorAll(".paste-preview-content img");
            if (existingImages.length > 10) {
                  // Using > 10 since this is called after the preview is created
                  removeImagePreview(tempId); // Remove the preview that was just created
                  showNotification("Maximum of 10 images allowed. Please remove some images before adding more.", "warning", 3);
                  return;
            }

            const formData = new FormData();
            formData.append("image", file);

            const response = await fetch("/relaychat/upload_img_to_blob", {
                  method: "POST",
                  body: formData,
            });

            if (!response.ok) {
                  throw new Error("Failed to upload image");
            }

            const data = await response.json();
            // Update the preview with the actual blob URL
            updateImagePreview(tempId, data.blob_url);
      } catch (error) {
            console.error("Error uploading image:", error);
            // Handle error - remove the preview or show error state
            removeImagePreview(tempId);
            showNotification("Failed to upload image: " + error.message);
      }
}

function showImagePreviewLoading(tempId, file) {
      let pastePreviewWrapper = document.getElementById("pastePreview");

      // If the wrapper doesn't exist, create it
      if (!pastePreviewWrapper) {
            const inputContainer = document.querySelector(".input-container");

            pastePreviewWrapper = document.createElement("div");
            pastePreviewWrapper.id = "pastePreview";
            pastePreviewWrapper.className = "paste-preview";
            pastePreviewWrapper.classList.add("minimal-scrollbar");
            inputContainer.insertBefore(pastePreviewWrapper, inputContainer.querySelector(".input-top"));
      }

      const previewContainer = document.createElement("div");
      previewContainer.id = tempId;
      previewContainer.className = "paste-preview-container card";

      const imageUrl = URL.createObjectURL(file);

      previewContainer.innerHTML = `
          <div class="paste-preview-header">
              <button class="paste-preview-close"><img src="/static/images/lucide_icons/x.svg" alt="Close" class="icon-svg"></button>
          </div>
          <div class="paste-preview-content loading">
              <img src="${imageUrl}" class="paste-preview-image loading-opacity" />
              <div class="image-loading-spinner spin"></div>
          </div>
      `;

      previewContainer.querySelector(".paste-preview-close").addEventListener("click", function (e) {
            e.stopPropagation();
            removeImagePreview(tempId);
      });

      pastePreviewWrapper.appendChild(previewContainer);
}

function updateImagePreview(tempId, blobUrl) {
      const container = document.getElementById(tempId);
      if (!container) return;

      const image = container.querySelector(".paste-preview-image");
      const spinner = container.querySelector(".image-loading-spinner");

      if (image) {
            image.src = blobUrl;
            image.classList.remove("loading-opacity");
      }

      if (spinner) {
            spinner.remove();
      }

      container.querySelector(".paste-preview-content").classList.remove("loading");
}

// Remove image preview if needed
function removeImagePreview(tempId) {
      const previewContainer = document.getElementById(tempId);
      if (previewContainer) {
            previewContainer.remove();

            // Check if there are any previews left
            const pastePreviewWrapper = document.getElementById("pastePreview");
            if (pastePreviewWrapper && pastePreviewWrapper.children.length === 0) {
                  pastePreviewWrapper.remove();
            }
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
//
//
//
//
//
//
//
////////////////////////////////////////////////////
//              Input related codee              //
//////////////////////////////////////////////////

let isRecording = false;
let recognition = null;
let activeTool = null;
let session_item_id = "";


// Tool configurations
const toolConfigs = {
      relayMicrosoftSearch: {
            name: "Relay Microsoft 365 Agent",
            icon: "/static/images/lucide_icons/search.svg",
      },
      relayDevOpsSearch: {
            name: "Relay DevOps Agent",
            icon: "/static/images/lucide_icons/search.svg",
      },
      generateImage: {
            name: "Relay Image Generator Agent",
            icon: "/static/images/lucide_icons/palette.svg",
      },
      relayDataAnalystAgent: {
            name: "Relay Document Analyst Agent",
            icon: "/static/images/lucide_icons/globe.svg",
      },
};


// Initialize speech recognition if available
if ("webkitSpeechRecognition" in window || "SpeechRecognition" in window) {
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      recognition = new SpeechRecognition();
      recognition.continuous = true; // Enable continuous listening
      recognition.interimResults = true; // Enable interim results for real-time feedback
      recognition.lang = "en-US";
}
function toggleVoiceInput() {
      if (!recognition) {
            alert("Speech recognition is not supported in your browser");
            return;
      }

      const micButton = document.getElementById("micButton");
      const micIcon = document.getElementById("micIcon");

      if (!isRecording) {
            // Start recording
            isRecording = true;
            micButton.classList.add("recording");

            // Change to tick icon
            micIcon.src = "/static/images/lucide_icons/check.svg";

            recognition.start();
      } else {
            // Stop recording
            stopRecording();
      }
}

function stopRecording() {
      isRecording = false;
      const micButton = document.getElementById("micButton");
      const micIcon = document.getElementById("micIcon");

      micButton.classList.remove("recording");

      // Change back to mic icon
      micIcon.src = "/static/images/lucide_icons/mic.svg";

      if (recognition) {
            recognition.stop();
      }
}

// Speech recognition event handlers
if (recognition) {
      recognition.onresult = function (event) {
            const sendIcon = document.getElementById("sendIcon");
            if (!isStreaming) {
                  // Show send icon when there's content
                  document.getElementById("sendButton").onclick = generateChatbotAnswer;
                  sendIcon.src = "/static/images/lucide_icons/arrow-up.svg";
            }
            const userInput = document.getElementById("userInput");
            let transcript = "";

            // Combine all results (both interim and final)
            for (let i = 0; i < event.results.length; i++) {
                  transcript += event.results[i][0].transcript;
            }

            userInput.textContent = transcript;
            adjustHeight();
            // Don't call handleInput() to avoid changing icons during recording
      };

      recognition.onerror = function (event) {
            console.error("Speech recognition error:", event.error);
            // Only stop on certain errors, restart on others to maintain continuous listening
            if (event.error === "not-allowed" || event.error === "service-not-allowed") {
                  stopRecording();
            } else {
                  // For other errors, try to restart recognition
                  if (isRecording) {
                        setTimeout(() => {
                              if (isRecording) {
                                    recognition.start();
                              }
                        }, 100);
                  }
            }
      };

      recognition.onend = function () {
            // If still supposed to be recording, restart recognition
            if (isRecording) {
                  recognition.start();
            }
      };
}

function adjustHeight() {
      const userInput = document.getElementById("userInput");
      const expandWrapper = document.querySelector(".expand-input-wrapper");
      const expandIcon = expandWrapper.querySelector("img");

      if (isFixedHeight) return;

      userInput.style.height = "auto";
      let newHeight = Math.max(40, Math.min(userInput.scrollHeight, 150));
      userInput.style.overflowY = userInput.scrollHeight > 150 ? "auto" : "hidden";

      requestAnimationFrame(() => {
            userInput.style.transition = "height 0.3s ease";
            userInput.style.height = newHeight + "px";
      });

      if (newHeight > 50) {
            expandWrapper.style.display = "flex";
      } else {
            expandWrapper.style.display = "none";
      }

      // Always show maximize icon if not expanded
      expandIcon.src = "/static/images/lucide_icons/maximize-2.svg";
}

// Toggle expand/collapse on click
document.querySelector(".expand-input-icon").addEventListener("click", () => {
      const userInput = document.getElementById("userInput");
      const expandIcon = document.querySelector(".expand-input-wrapper img");

      if (isFixedHeight) {
            // Collapse back to dynamic
            isFixedHeight = false;
            userInput.style.height = "auto";
            adjustHeight(); // Re-apply natural height
            expandIcon.src = "/static/images/lucide_icons/maximize-2.svg";
      } else {
            // Expand to fixed
            isFixedHeight = true;
            userInput.style.height = "500px";
            userInput.style.overflowY = "auto";
            expandIcon.src = "/static/images/lucide_icons/minimize-2.svg";
      }
});

function toggleFileDropdown(event) {
      event.stopPropagation();
      const dropdown = document.getElementById("fileDropdown");
      const toolsDropdown = document.getElementById("toolsDropdown");

      // Close tools dropdown if open
      toolsDropdown.style.display = "none";

      dropdown.style.display = dropdown.style.display === "none" ? "block" : "none";
}

function toggleToolsDropdown(event) {
      event.stopPropagation();
      const dropdown = document.getElementById("toolsDropdown");
      const fileDropdown = document.getElementById("fileDropdown");

      // Close file dropdown if open
      fileDropdown.style.display = "none";

      dropdown.style.display = dropdown.style.display === "none" ? "block" : "none";
}


function setMinHeight() {
      var elements = document.querySelectorAll(".chatbot-message-container");
      if (elements.length) {
            var lastElement = elements[elements.length - 1];
            lastElement.style.minHeight = "200px";
      } else {
            console.error("Element with class .chatbot-message-container not found");
      }
}

function removeMinHeight() {
      var elements = document.querySelectorAll(".chatbot-message-Wrapper");
      if (elements.length) {
            var lastElement = elements[elements.length - 1];
            lastElement.style.minHeight = null;
      } else {
            console.error("Element with class .chatbot-message-Wrapper not found");
      }
}

document.addEventListener("DOMContentLoaded", function () {
      const userInput = document.getElementById("userInput");
      userInput.addEventListener("input", handleInput);
      handleInput();
});

function getUserInputAsMarkdown() {
      const input = document.getElementById("userInput");
      let result = "";

      input.childNodes.forEach((node) => {
            if (node.nodeType === Node.ELEMENT_NODE && node.classList.contains("mention")) {
                  const name = node.textContent;
                  const email = node.getAttribute("data-email");
                  result += `(${name})[${email}] `;
            } else if (node.nodeType === Node.TEXT_NODE) {
                  result += node.textContent;
            } else if (node.nodeType === Node.ELEMENT_NODE && node.tagName === "BR") {
                  result += "\n";
            } else {
                  // fallback for any other inline element
                  result += node.textContent || "";
            }
      });

      return result;
}

function toggleFileDropdown(event) {
      event.stopPropagation();
      const dropdown = document.getElementById("fileDropdown");
      const toolsDropdown = document.getElementById("toolsDropdown");
      const fileButton = document.querySelector(".file-button");
      const toolsButton = document.querySelector(".tools-button");

      // Close tools dropdown if open and remove active class
      toolsDropdown.style.display = "none";
      toolsButton.classList.remove("active");

      // Toggle file dropdown and active class
      const isOpen = dropdown.style.display === "block";
      dropdown.style.display = isOpen ? "none" : "block";

      if (isOpen) {
            fileButton.classList.remove("active");
      } else {
            fileButton.classList.add("active");
      }
}

function toggleToolsDropdown(event) {
      event.stopPropagation();
      const dropdown = document.getElementById("toolsDropdown");
      const fileDropdown = document.getElementById("fileDropdown");
      const toolsButton = document.querySelector(".tools-button");
      const fileButton = document.querySelector(".file-button");

      // Close file dropdown if open and remove active class
      fileDropdown.style.display = "none";
      fileButton.classList.remove("active");

      // Toggle tools dropdown and active class
      const isOpen = dropdown.style.display === "block";
      dropdown.style.display = isOpen ? "none" : "block";

      if (isOpen) {
            toolsButton.classList.remove("active");
      } else {
            toolsButton.classList.add("active");
      }
}

function toggleTool(toolName) {
      const toolPreview = document.getElementById("toolPreview");
      const toolText = toolPreview.querySelector(".tool-preview-text");
      const toolIcon = toolPreview.querySelector(".tool-preview-icon");
      const toolPreviewWrapper = document.querySelector(".tool-preview-wrapper");

      // If the same tool is clicked, deactivate it
      if (activeTool === toolName) {
            deactivateCurrentTool();
            return;
      }

      // Deactivate current tool first
      if (activeTool) {
            deactivateCurrentTool();
      }

      // Activate the new tool
      activeTool = toolName;
      const config = toolConfigs[toolName];

      // Update tool preview
      toolIcon.src = config.icon;
      toolText.textContent = config.name;
      toolPreview.style.display = "block";
      toolPreviewWrapper.style.display = "block";

      // Update dropdown UI
      updateToolDropdownUI();

      // Close dropdown
      document.getElementById("toolsDropdown").style.display = "none";
      document.querySelector(".tools-button").classList.remove("active");
}

function deactivateCurrentTool() {
      if (!activeTool) return;
      activeTool = null;
      document.getElementById("toolPreview").style.display = "none";
      document.querySelector(".tool-preview-wrapper").style.display = "none";
      updateToolDropdownUI();
}

function updateToolDropdownUI() {
      // Remove active state from all dropdown options
      const options = document.querySelectorAll(".tools-dropdown .dropdown-option");
      options.forEach((option) => {
            option.classList.remove("active");
            const indicator = option.querySelector(".active-indicator");
            if (indicator) {
                  indicator.style.display = "none";
            }
      });

      // Add active state to current tool if any
      if (activeTool) {
            const activeOption = document.querySelector(`[data-tool="${activeTool}"]`);
            if (activeOption) {
                  activeOption.classList.add("active");
                  const indicator = activeOption.querySelector(".active-indicator");
                  if (indicator) {
                        indicator.style.display = "block";
                  }
            }
      }
}

// Close dropdowns when clicking outside
document.addEventListener("click", function () {
      document.getElementById("fileDropdown").style.display = "none";
      // document.getElementById("toolsDropdown").style.display = "none";
      document.querySelector(".file-button").classList.remove("active");
      // document.querySelector(".tools-button").classList.remove("active");
});
////////////////////////////////////////////////
//              Session options              //
//////////////////////////////////////////////
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
///////////////////////////////////////////
//              voice mode              //
/////////////////////////////////////////
let isListening = false;
let voiceModeEnabled = false;

async function toggleVoiceOverlay() {
      const overlay = document.getElementById("voiceOverlay");
      const shouldShow = overlay.style.display === "none";
      overlay.style.display = shouldShow ? "flex" : "none";

      if (shouldShow) {
            voiceModeEnabled = true;
            startSpeechRecognition();
      } else {
            voiceModeEnabled = false;
            stopSpeechRecognition();
      }
      stopAudioVisualization();
}

document.getElementById("cancelButton").addEventListener("click", toggleVoiceOverlay);

function startSpeechRecognition() {
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (!SpeechRecognition) {
            alert("SpeechRecognition not supported.");
            return;
      }

      recognition = new SpeechRecognition();
      recognition.continuous = false;
      recognition.interimResults = false;
      recognition.lang = "en-US";

      const circle = document.getElementById("circle");
      const bars = document.getElementById("talkingBars");
      const circleContainer = document.getElementById("circleContainer");

      recognition.onstart = () => {
            isListening = true;
            // bars.classList.add("hidden");
            // circleContainer.style.display = "flex";
            // circle.className = "circle large";
            showVoiceModeAnimation("listeningBars", "Listening");
            console.log("🎤 Listening...");
      };

      recognition.onresult = async (event) => {
            showVoiceModeAnimation("thinkingBars", "Thinking");
            const transcript = event.results[0][0].transcript;
            console.log("📝 Heard:", transcript);
            updateChatUI();
            appendUserMessage(transcript);
            recognition.stop();
            isListening = false;

            // Thinking
            // circle.className = "circle large thinking";
            await delay(3000);
            await initializeSession(transcript, [], []);

            // Switch to talking bars
            await processChatbotResponse(transcript, [], false);
      };

      // recognition.onend = () => {
      //       if (isListening) startSpeechRecognition();
      // };

      recognition.onerror = (event) => {
            console.error("❌ Error:", event.error);
      };

      recognition.start();
}

function stopSpeechRecognition() {
      const circle = document.getElementById("circle");
      const bars = document.getElementById("talkingBars");
      const circleContainer = document.getElementById("circleContainer");

      if (recognition && isListening) {
            recognition.stop();
      }

      isListening = false;
      // circle.className = "circle idle";
      // bars.classList.add("hidden");
      // circleContainer.style.display = "flex";
      // console.log("🛑 Stopped.");
}

function delay(ms) {
      return new Promise((resolve) => setTimeout(resolve, ms));
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
let savedRange = null;
let isMentioning = false;
let mentionSearchTerm = "";
let debounceTimeout = null;
const USER_SUGGESTIONS_CACHE_KEY = "userSuggestionsCache"; // Key for local storage

// Global flag to track if any image is still uploading
let isImageUploading = false;

async function handleKeyPress(event) {
      const sendButton = document.getElementById("sendButton");
      const userInput = document.getElementById("userInput");
      const message = getUserInputAsMarkdown();

      // Only proceed if there's content, Enter was pressed, and nothing is uploading
      if (event.key === "Enter" && !event.shiftKey && !sendButton.disabled && message.length > 0 && !isStreaming && !isImageUploading) {
            event.preventDefault();
            isStreaming = true;
            await generateChatbotAnswer();
            isStreaming = false;
      } else if (isImageUploading) {
            event.preventDefault();
            showNotification("Please wait for image upload to finish.", "warning", 3);
      }
}

function handlePaste(event) {
      const sendButton = document.getElementById("sendButton");
      sendButton.setAttribute("onclick", "generateChatbotAnswer()");
      sendButton.disabled = false;

      const clipboardData = event.clipboardData || window.clipboardData;
      const items = clipboardData.items;

      let handledImage = false;

      const existingImages = document.querySelectorAll(".paste-preview-content img");
      if (existingImages.length >= 10) {
            showNotification("Maximum of 10 images allowed. Please remove some images before adding more.", "warning", 3);
            return;
      }

      for (const item of items) {
            if (item.type.indexOf("image") !== -1) {
                  const currentImages = document.querySelectorAll(".paste-preview-content img");
                  if (currentImages.length >= 10) {
                        showNotification("Maximum of 10 images allowed. Please remove some images before adding more.", "warning", 3);
                        break;
                  }

                  const file = item.getAsFile();
                  const tempId = "img_" + Date.now();
                  isImageUploading = true; // ⬅️ Set flag
                  showImagePreviewLoading(tempId, file);
                  uploadImageToBlob(file, tempId).finally(() => {
                        isImageUploading = false; // ⬅️ Reset flag
                  });

                  event.preventDefault();
                  handledImage = true;
            }
      }

      if (!handledImage) {
            const text = clipboardData.getData("text/plain");
            event.preventDefault();

            const selection = window.getSelection();
            if (!selection.rangeCount) return;

            const formattedText = text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\t/g, "  ").replace(/\n/g, "<br>");

            const span = document.createElement("span");
            span.innerHTML = formattedText;

            const range = selection.getRangeAt(0);
            range.deleteContents();
            range.insertNode(span);

            range.setStartAfter(span);
            range.collapse(true);

            selection.removeAllRanges();
            selection.addRange(range);
      }

      adjustHeight();
      const sendIcon = document.getElementById("sendIcon");
      if (!isStreaming) {
            document.getElementById("sendButton").onclick = generateChatbotAnswer;
            sendIcon.src = "/static/images/lucide_icons/arrow-up.svg";
      }
}

function handleInput() {
      const userInput = document.getElementById("userInput");
      const sendIcon = document.getElementById("sendIcon");

      if (userInput.textContent.trim() === "") {
            userInput.innerHTML = "";
      }

      document.getElementById("sendButton").onclick = generateChatbotAnswer;
      if (!sendIcon.src.includes("loader-circle")) {
            sendIcon.src = "/static/images/lucide_icons/arrow-up.svg";
      }
}

function handleDrop(event) {
      event.preventDefault();
      event.stopPropagation();

      const overlay = document.getElementById("dragDropOverlay");
      if (overlay) overlay.classList.remove("active");

      const files = Array.from(event.dataTransfer.files);
      if (files.length === 0) return;

      const imageFiles = files.filter((file) => file.type.startsWith("image/"));
      const validExtensions = /\.(pdf|doc|docx|xls|xlsx|csv|ppt|pptx|png|jpe?g|gif|webp)$/i;
      const acceptedFiles = files.filter((file) => validExtensions.test(file.name));

      if (imageFiles.length > 0) {
            const clipboardData = new DataTransfer();
            imageFiles.forEach((file) => clipboardData.items.add(file));

            const pasteEvent = new ClipboardEvent("paste", {
                  clipboardData: clipboardData,
                  bubbles: true,
            });

            const inputBox = document.getElementById("userInput");
            if (inputBox) {
                  inputBox.dispatchEvent(pasteEvent);
            }
      }

      const nonImageFiles = acceptedFiles.filter((file) => !file.type.startsWith("image/"));

      if (nonImageFiles.length > 0) {
            processUploadedFiles(nonImageFiles);
      }

      if (imageFiles.length === 0 && nonImageFiles.length === 0) {
            showNotification("Unsupported file type dropped.", "warning", 3);
      }
}

// Add event listeners when the document is loaded
document.addEventListener("DOMContentLoaded", function () {
      // Add drag and drop event listeners to the document
      document.addEventListener("dragover", handleDragOver);
      document.addEventListener("dragleave", handleDragLeave);
      document.addEventListener("drop", handleDrop);

      // Prevent default drag behaviors
      ["dragenter", "dragover", "dragleave", "drop"].forEach((eventName) => {
            document.addEventListener(eventName, preventDefaults, false);
      });

      function preventDefaults(e) {
            e.preventDefault();
            e.stopPropagation();
      }
});

function getCaretCoordinates() {
      const selection = window.getSelection();
      if (!selection.rangeCount) return null;

      const range = selection.getRangeAt(0).cloneRange();
      range.collapse(true);

      const tempSpan = document.createElement("span");
      tempSpan.textContent = "\u200b"; // zero-width space
      range.insertNode(tempSpan);

      const rect = tempSpan.getBoundingClientRect();
      const coords = {
            left: rect.left + window.scrollX,
            top: rect.top + window.scrollY,
      };

      tempSpan.remove();
      return coords;
}

document.addEventListener("click", (e) => {
      const box = document.getElementById("userSuggestions");
      if (box && !box.contains(e.target)) {
            box.remove();
            isMentioning = false;
            mentionSearchTerm = "";
            if (debounceTimeout) {
                  clearTimeout(debounceTimeout);
            }
      }
});

function getInitials(name) {
      const parts = name.split(" ");
      const first = parts[0]?.[0] || "";
      const last = parts.length > 1 ? parts[parts.length - 1][0] : "";
      return (first + last).toUpperCase();
}

function insertUserMention(displayName, email) {
      if (!savedRange) return;

      const selection = window.getSelection();
      selection.removeAllRanges();
      selection.addRange(savedRange);

      const range = selection.getRangeAt(0);
      const node = range.startContainer;
      let offset = range.startOffset;

      const text = node.textContent;
      const atIndex = text.lastIndexOf("@", offset);

      if (atIndex !== -1) {
            const before = text.substring(0, atIndex);
            // The `after` part is not strictly needed for replacement if we re-set textContent
            // and then insert new nodes, but keeping for reference if logic changes.
            // const after = text.substring(offset);

            const mentionSpan = document.createElement("span");
            mentionSpan.textContent = displayName;
            mentionSpan.className = "mention";
            mentionSpan.contentEditable = "false";
            mentionSpan.setAttribute("data-email", email);

            const space = document.createTextNode(" ");

            // Remove the old text from '@' to current offset
            const existingTextNodeContent = node.textContent;
            node.textContent = existingTextNodeContent.substring(0, atIndex);

            // Insert the mention span and a space
            node.parentNode.insertBefore(mentionSpan, node.nextSibling);
            node.parentNode.insertBefore(space, mentionSpan.nextSibling);

            // Handle any text that was after the caret (if the user typed more after the @mention-term)
            if (offset < existingTextNodeContent.length) {
                  const remainingText = document.createTextNode(existingTextNodeContent.substring(offset));
                  node.parentNode.insertBefore(remainingText, space.nextSibling);
            }

            // Move cursor after space (or remaining text if any)
            const newRange = document.createRange();
            newRange.setStartAfter(space); // Position after the inserted space
            newRange.collapse(true);
            selection.removeAllRanges();
            selection.addRange(newRange);
      }

      const box = document.getElementById("userSuggestions");
      if (box) box.remove();

      savedRange = null;
      isMentioning = false;
      mentionSearchTerm = "";
      document.getElementById("userInput").focus();
}

// --- New/Modified Functions ---

/**
 * Fetches users from local storage.
 * @returns {Array} An array of user objects.
 */
function getCachedUserSuggestions() {
      try {
            const cached = localStorage.getItem(USER_SUGGESTIONS_CACHE_KEY);
            return cached ? JSON.parse(cached) : [];
      } catch (e) {
            console.error("Error parsing user suggestions from local storage:", e);
            return [];
      }
}

/**
 * Caches a list of users in local storage (stores top 5 and merges with existing).
 * @param {Array} users An array of user objects to cache.
 */
function cacheUserSuggestions(users) {
      if (!users || users.length === 0) return;

      // Get existing cache
      let existingCache = getCachedUserSuggestions();
      const newUsers = users.slice(0, 5); // Take top 5 from the fetched list

      // Create a set of existing emails for quick lookup
      const existingEmails = new Set(existingCache.map((user) => user.email));

      // Add new users if they are not already in the cache
      newUsers.forEach((newUser) => {
            if (!existingEmails.has(newUser.email)) {
                  existingCache.push(newUser);
            }
      });

      // Optionally, limit the total number of cached users if it grows too large
      // For example, keep only the last 20 unique users
      if (existingCache.length > 20) {
            existingCache = existingCache.slice(existingCache.length - 20);
      }

      try {
            localStorage.setItem(USER_SUGGESTIONS_CACHE_KEY, JSON.stringify(existingCache));
      } catch (e) {
            console.error("Error saving user suggestions to local storage:", e);
      }
}
async function fetchUsersFromBackend(searchTerm) {
    try {
        const accessToken = await fetchAccessToken();

        const url = new URL("/search_users", window.location.origin);
        url.searchParams.append("q", searchTerm);

        const response = await fetch(url, {
            headers: {
                "Authorization": `Bearer ${accessToken}`
            }
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`HTTP error! status: ${response.status}, message: ${errorText}`);
        }

        return await response.json();
    } catch (error) {
        console.error("Error fetching users from backend:", error);
        return [];
    }
}

async function showUserSuggestions(searchTerm = "") {
      const selection = window.getSelection();
      if (selection.rangeCount > 0) {
            savedRange = selection.getRangeAt(0).cloneRange();
      }

      const existing = document.getElementById("userSuggestions");
      if (existing) existing.remove();

      const container = document.createElement("div");
      container.className = "user-suggestion-list";
      container.id = "userSuggestions";

      // Position container near caret immediately
      const rect = getCaretCoordinates();
      if (rect) {
            container.style.position = "absolute";
            container.style.left = `${rect.left}px`;
            container.style.top = `${rect.top + 20}px`;
            container.style.zIndex = 9999;
      }
      document.body.appendChild(container); // Append early to show loader or cached items

      if (searchTerm === "") {
            // If only '@' is typed, show cached suggestions immediately
            const cachedUsers = getCachedUserSuggestions();
            if (cachedUsers.length > 0) {
                  renderUserList(cachedUsers);
                  // No loader needed as data is instant
            } else {
                  // If no cache, show loader initially and then 'No matching users' after timeout
                  const loader = document.createElement("div");
                  loader.className = "suggestions-loader";
                  container.appendChild(loader);
                  // After a brief moment, if still no input, remove loader and show 'No matching'
                  setTimeout(() => {
                        if (mentionSearchTerm === "" && document.getElementById("userSuggestions") === container) {
                              // Ensure the box hasn't been removed or replaced
                              renderUserList([]); // Show "No matching users"
                        }
                  }, 500); // Give some time for user to type, otherwise show no results
            }
            return; // Exit here, no backend fetch for empty search term
      }

      // For non-empty search terms, show loader and fetch from backend
      const loader = document.createElement("div");
      loader.className = "suggestions-loader";
      container.appendChild(loader);

      try {
            const users = await fetchUsersFromBackend(searchTerm);
            renderUserList(users);
            // Cache the fetched users if the search was successful and returned results
            if (users.length > 0) {
                  cacheUserSuggestions(users);
            }
      } catch (error) {
            console.error("Failed to fetch users:", error);
            renderUserList([]); // Show no results on fetch error
      }
}

function renderUserList(users) {
      const container = document.getElementById("userSuggestions");
      if (!container) return; // In case it was removed while fetching

      container.innerHTML = ""; // Clear loader or previous suggestions

      if (users.length === 0) {
            const noResults = document.createElement("div");
            noResults.className = "no-suggestions";
            noResults.textContent = "No matching users found.";
            container.appendChild(noResults);
            return;
      }

      users.forEach((user) => {
            const item = document.createElement("div");
            item.className = "user-suggestion-item";

            const avatar = document.createElement("div");
            avatar.className = "avatar-circle";

            if (user.photo === "[NOT AVAILABLE]" || !user.photo) {
                  // Check for !user.photo too
                  avatar.textContent = getInitials(user.displayName).toUpperCase();
            } else {
                  const img = document.createElement("img");
                  img.src = user.photo;
                  img.alt = user.displayName;
                  img.className = "avatar-image";
                  avatar.appendChild(img);
            }

            const details = document.createElement("div");
            details.className = "user-details";
            details.innerHTML = `
            <div class="name">${user.displayName}</div>
            <div class="email">${user.email}</div>
        `;

            item.appendChild(avatar);
            item.appendChild(details);
            item.onclick = () => insertUserMention(user.displayName, user.email);
            container.appendChild(item);
      });
}

document.getElementById("userInput").addEventListener("input", (e) => {
      handleInput(); // Call existing handleInput for general input logic

      const selection = window.getSelection();
      if (!selection.rangeCount) {
            isMentioning = false;
            mentionSearchTerm = "";
            const box = document.getElementById("userSuggestions");
            if (box) box.remove();
            if (debounceTimeout) clearTimeout(debounceTimeout);
            return;
      }

      const range = selection.getRangeAt(0);
      const node = range.startContainer;
      const offset = range.startOffset;

      if (node.nodeType === Node.TEXT_NODE) {
            const text = node.textContent.slice(0, offset);
            const atIndex = text.lastIndexOf("@");

            if (atIndex !== -1) {
                  const potentialMention = text.substring(atIndex + 1, offset);
                  const lastCharTyped = text[offset - 1]; // Get the very last character typed

                  if (atIndex === offset - 1 && lastCharTyped === "@") {
                        // User just typed '@'
                        isMentioning = true;
                        mentionSearchTerm = "";
                        if (debounceTimeout) clearTimeout(debounceTimeout); // Clear any previous debounce
                        showUserSuggestions(""); // Show cached or empty if no cache
                        return;
                  } else if (isMentioning) {
                        if (lastCharTyped === " ") {
                              // User typed '@' and then space: collapse suggestions
                              const box = document.getElementById("userSuggestions");
                              if (box) box.remove();
                              isMentioning = false;
                              mentionSearchTerm = "";
                              if (debounceTimeout) clearTimeout(debounceTimeout);
                              return;
                        } else if (/^[a-zA-Z]*$/.test(potentialMention)) {
                              // User typed '@' followed by alphabets
                              mentionSearchTerm = potentialMention;
                              if (debounceTimeout) clearTimeout(debounceTimeout);
                              debounceTimeout = setTimeout(() => {
                                    showUserSuggestions(mentionSearchTerm);
                              }, 300); // Debounce for 300ms
                              return;
                        }
                  }
            }
      }

      // If '@' is not present or mention mode is exited, remove suggestions
      const box = document.getElementById("userSuggestions");
      if (box && (!isMentioning || !node.textContent.includes("@"))) {
            box.remove();
            isMentioning = false;
            mentionSearchTerm = "";
            if (debounceTimeout) clearTimeout(debounceTimeout);
      }
});

document.getElementById("userInput").addEventListener("keyup", saveCaretPosition);
document.getElementById("userInput").addEventListener("mouseup", saveCaretPosition);

function saveCaretPosition() {
      const selection = window.getSelection();
      if (selection.rangeCount > 0) {
            savedRange = selection.getRangeAt(0).cloneRange();
      }
}

function getFileTypeInfo(fileName, mimeType = "") {
      const ext = fileName.split(".").pop().toLowerCase();
      let iconSrc = "/static/images/file.svg";
      let iconClass = "file-icon-default";
      let typeLabel = "Unknown File Type";

      // Determine type by extension or MIME type
      if (["csv", "xls", "xlsx"].includes(ext) || mimeType.includes("spreadsheet")) {
            iconSrc = "/static/images/file-spreadsheet.svg";
            iconClass = "file-icon-spreadsheet";
            typeLabel = "Spreadsheet";
      } else if (["doc", "docx"].includes(ext) || mimeType.includes("wordprocessingml")) {
            iconSrc = "/static/images/file-type.svg";
            iconClass = "file-icon-word";
            typeLabel = "Word Document";
      } else if (ext === "pdf" || mimeType.includes("pdf")) {
            iconSrc = "/static/images/file-text.svg";
            iconClass = "file-icon-pdf";
            typeLabel = "PDF";
      } else if (["ppt", "pptx"].includes(ext) || mimeType.includes("presentationml")) {
            iconSrc = "/static/images/file-chart-pie.svg";
            iconClass = "file-icon-presentation";
            typeLabel = "Presentation";
      }

      return {
            fileIconSrc: iconSrc,
            fileIconClass: iconClass,
            FileTypeLabel: typeLabel,
      };
}
function toggleFileDropdown(event) {
      event.stopPropagation();
      const dropdown = document.getElementById("fileDropdown");
      dropdown.style.display = dropdown.style.display === "none" ? "block" : "none";

      // Close dropdown if clicked outside
      document.addEventListener("click", function handler(e) {
            if (!dropdown.contains(e.target)) {
                  dropdown.style.display = "none";
                  document.removeEventListener("click", handler);
            }
      });
}
// ==================== EVENT LISTENERS AND INITIALIZATION ====================
// Cleanup files when the window is closed or navigated away from
window.addEventListener("beforeunload", async () => {
      // Only try to delete uploaded files
      const uploadedFiles = filesCollection.filter((f) => f.status === "uploaded");

      if (uploadedFiles.length > 0) {
            sendButton = document.getElementById("sendButton");
            sendIcon = document.getElementById("sendIcon");

            sendButton.disabled = true;
            sendButton.classList.add("disabled");
            sendIcon.src = "/static/images/loader-circle.svg";
            sendIcon.classList.add("file-icon-loading-img");

            for (const fileData of uploadedFiles) {
                  try {
                        await fetch("/relaychat/delete_file_from_session", {
                              method: "POST",
                              headers: {
                                    "Content-Type": "application/json",
                              },
                              body: JSON.stringify({
                                    session_id: currentSessionId,
                                    filename: fileData.name,
                              }),
                        });
                  } catch (err) {
                        console.error("Failed to cleanup file:", fileData.name, err);
                  }
            }

            const sendButton = document.getElementById("sendButton");
            const sendIcon = document.getElementById("sendIcon");
            sendButton.disabled = false;
            sendButton.classList.remove("disabled");
            sendIcon.src = "/static/images/arrow-right.svg";
            sendIcon.classList.remove("file-icon-loading-img");
      }
});