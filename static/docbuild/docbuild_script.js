const sessionId = document.body.getAttribute("data-session-id");
let currentSessionId = sessionId;
let stopGeneration = false;
let undoStack = [];
let redoStack = [];
let isDocumentDirty = false;
let lastcurrentDocumentText = "";
let session_item_message_id = 0;
const resizer = document.getElementById("resizer");
const promptSection = document.getElementById("promptSection");
const cardsSection = document.getElementById("cardsSection");

let isDragging = false;

resizer.addEventListener("mousedown", () => {
      isDragging = true;
      document.body.style.cursor = "ew-resize";
      document.body.style.userSelect = "none"; // prevent text selection
});

function handleKeyPress(event) {
      const sendButton = document.getElementById("generateButton");
      if (event.key === "Enter" && !event.shiftKey && !sendButton.disabled) {
            event.preventDefault();
            handleGenerate();
      }
}

document.addEventListener("mousemove", (e) => {
      if (!isDragging) return;

      const containerWidth = window.innerWidth;
      const newPromptWidthPercent = (e.clientX / containerWidth) * 100;
      const clampedPromptWidth = Math.min(Math.max(newPromptWidthPercent, 20), 80); // clamp between 20% and 80%

      promptSection.style.width = `${clampedPromptWidth}%`;
      cardsSection.style.width = `${100 - clampedPromptWidth}%`;
});

document.addEventListener("mouseup", () => {
      isDragging = false;
      document.body.style.cursor = "default";
      document.body.style.userSelect = ""; // reset
});
// Define the strict order of message types
const MESSAGE_ORDER = {
      "all-user-messages": 1,
      "tool-name-container": 2,
      "image-generating-container": 3,
      "generated-image-container": 4,
      "thought-process-container": 5,
      "chatbot-message-container": 6,
};

// Helper function to get the order number of an element
function getElementOrder(element) {
      for (const [className, order] of Object.entries(MESSAGE_ORDER)) {
            if (element.classList.contains(className)) {
                  return order;
            }
      }
      return 0; // Unknown elements go to the beginning
}
function findInsertionPoint(chatContainer, targetClass) {
      const targetOrder = MESSAGE_ORDER[targetClass];
      const children = Array.from(chatContainer.children);

      let insertAfter = null;
      let insertBefore = null;

      for (let i = children.length - 1; i >= 0; i--) {
            const child = children[i];
            const childOrder = getElementOrder(child);

            // ✅ Insert after the last element whose order is less than or equal to target
            if (childOrder <= targetOrder) {
                  insertAfter = child;
                  break;
            }

            // ✅ Fallback: find the next higher one (if no insertAfter found)
            if (childOrder > targetOrder && !insertBefore) {
                  insertBefore = child;
            }
      }

      return { insertAfter, insertBefore };
}

// Helper function to insert element in correct position
function insertInOrder(chatContainer, element, targetClass) {
      const { insertAfter, insertBefore } = findInsertionPoint(chatContainer, targetClass);

      if (insertAfter) {
            insertAfter.insertAdjacentElement("afterend", element);
      } else if (insertBefore) {
            insertBefore.insertAdjacentElement("beforebegin", element);
      } else {
            chatContainer.appendChild(element);
      }
}
function appendToolNameMessage(content) {
      const chatContainer = document.getElementById("chat-container");

      const toolMessageContainer = document.createElement("div");
      toolMessageContainer.classList.add("tool-name-container");

      const messageContainer = document.createElement("div");
      messageContainer.classList.add("tool-name-message", "loading-text", "shimmer");
      messageContainer.innerText = content;

      toolMessageContainer.appendChild(messageContainer);

      // Insert in correct order
      insertInOrder(chatContainer, toolMessageContainer, "tool-name-container");
}

const defaultContent = `Welcome to Document Builder in Etex Mate 
your AI-powered tool for creating professional documents with ease.
Use the panel on the right to start creating a document,
or take advantage of smart actions like:

* Turning audio into structured text
* Merging multiple files into one cohesive document
* Translating documents while preserving formatting

Just start typing or upload your content to begin.
`;
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
let newMessageTrace = "";
let abortController = new AbortController();
const signal = abortController.signal;

async function handleGenerate() {
      try {
            selectedModel = getSelectedModel();

            if (stopGeneration) return;

            // Hide welcome message
            const welcomeMessage = document.getElementById("welcomeMessage");
            console.log(welcomeMessage);
            if (welcomeMessage) welcomeMessage.style.display = "none";

            // Show chat container
            const chatContainer = document.getElementById("chat-container");
            if (chatContainer) chatContainer.style.display = "flex";

            const promptInput = document.getElementById("userInput");
            userInput = promptInput.innerText.trim();
            promptInput.innerHTML = "";
            promptInput.focus();
            setMinHeight();

            // Get or create session ID
            if (!currentSessionId || currentSessionId === "None") {
                  currentSessionId = generateSessionId();
            }

            sessionItemId = generateSessionId();

            appendUserMessage(userInput);
            createChatbotMessageWrapper(sessionItemId);
            
            // const messageContainers = document.querySelectorAll(".chatbot-message-container");
            // const messageContainer = messageContainers[messageContainers.length - 1];
            // const resultText = messageContainer.querySelector(".text-content-container");
            appendcanvasWritingMessage(sessionItemId);

            scrollToBottom();

            const sendButton = document.getElementById("generateButton");
            sendButton.setAttribute("onclick", "stopChatbotGeneration()");

            const sendIcon = document.getElementById("sendIcon");
            sendIcon.src = "/static/images/square.png";
            sendIcon.onclick = null;

            // If currentDocumentText is the same as initialMarkdown, send an empty string
            const docTextToSend = currentDocumentText === initialMarkdown ? "" : currentDocumentText;

            const responseAgent = await fetch("/docbuild/generate", {
                  method: "POST",
                  headers: {
                        "Content-Type": "application/json",
                  },
                  body: JSON.stringify({
                        prompt: userInput,
                        session_id: currentSessionId,
                        model_name: selectedModel,
                        current_document_text: docTextToSend,
                  }),
            });

            if (!responseAgent.ok) {
                  console.log("Error invoking agent:", responseAgent.statusText);
                  showNotification("Error: " + responseAgent.statusText);
                  return;
            }

            // Don't append chatbot message to chat - we'll handle content in editor/preview
            scrollToBottom();

            const reader = responseAgent.body.getReader();
            const decoder = new TextDecoder("utf-8");

            let llmOutput = "";
            let done = false;

            while (!done && !stopGeneration) {
                  const { value, done: readerDone } = await reader.read();
                  done = readerDone;

                  if (value) {
                        const chunk = decoder.decode(value);

                        // Handle agent updates
                        if (chunk.startsWith("[AGENT UPDATES]")) {
                              const agentUpdate = chunk.replace("[AGENT UPDATES]", "").trim();
                              if (agentUpdate === "Document Builder") {
                                    document.querySelectorAll(".tool-name-container").forEach((container) => container.remove());
                                    appendToolNameMessage("Editing the document...");
                              }
                              continue;
                        } else if (chunk.startsWith("[NEW MESSAGES TRACE]")) {
                              const newMessageTraceStr = chunk.replace("[NEW MESSAGES TRACE]", "").trim();
                              newMessageTrace = newMessageTraceStr;
                              continue;
                        } else if (chunk.startsWith("[TOOL OUTPUT]")) {
                              const toolOutputStr = chunk.replace("[TOOL OUTPUT]", "").trim();
                              try {
                                    const json_value = JSON.parse(toolOutputStr);

                                    if (json_value.tool_type === "document_editor") {
                                    }
                              } catch (e) {
                                    console.error("Failed to parse tool output:", e);
                              }
                              continue;
                        } else if (chunk.startsWith("[FINAL MESSAGE]")) {
                              console.log("receied chunk", chunk);
                              console.log("present llmOutput", llmOutput);
                              llmOutput = chunk.replace("[FINAL MESSAGE]", "").trim();
                              console.log("updated llmOutput", llmOutput);
                              processCompleteOutput(llmOutput);
                              // resultText.innerHTML = llmOutput;
                        } else {
                              llmOutput += chunk;
                              if (!llmOutput.trim().endsWith("```")) {
                                    // Only append "```" if llmOutput doesn't already end with it
                                    processCompleteOutput(llmOutput + "```");
                                    // resultText.innerHTML = llmOutput + "```";
                              } else {
                                    processCompleteOutput(llmOutput);
                                    // resultText.innerHTML = llmOutput;
                              }
                        }
                  }
            }

            // Process the complete LLM output after streaming is done
            if (!stopGeneration && llmOutput.trim()) {
                  document.querySelectorAll(".agent-message").forEach((container) => container.remove());
                  document.querySelectorAll(".chatbot-canvas-writing").forEach((container) => container.remove());
                  appendChatbotMessage(llmOutput, sessionItemId, 0);
                  processCompleteOutput(llmOutput);
            }
            showPreview();
            if (stopGeneration) return;
            scrollToBottom();

            // Update session
            await fetch("/docbuild/update_session", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                        session_id: currentSessionId,
                        prompt: userInput,
                        chatbot_response: llmOutput,
                        model_name: selectedModel,
                        session_item_message_id: session_item_message_id,
                        newMessageTrace: newMessageTrace,
                        session_item_id: sessionItemId,
                  }),
                  signal,
            });
            let wrapper = document.querySelector(`.chatbot-message-Wrapper[data-session-item-id="${sessionItemId}"]`);
            const avatarLoader = wrapper.querySelector(".avatar-loader");
            if (avatarLoader) {
                  avatarLoader.remove();
            }

            // Update URL
            window.history.pushState({}, "", `/docbuild/${currentSessionId}`);
            hideLoadingAnimation();
      } catch (error) {
            console.log("Error: " + error.message);
            showNotification("Error: " + error.message);
      } finally {
            resetSendButton();
            hideModelName();
            document.getElementById("userInput").focus();
            filesJson = [];
      }
}
function processCompleteOutput(llmOutput) {
  showEditor();

  const documentLanguages = ["plaintext", "markdown", "md", "text", "txt"];
  let rawContent = llmOutput?.trim() || "";
  let language = "markdown";
  let content = rawContent;

  const codeBlockMatch = rawContent.match(/```(\w+)?\n([\s\S]*?)```/m);

  if (codeBlockMatch) {
    language = codeBlockMatch[1] || "plaintext";
    content = codeBlockMatch[2].trim();
  } else {
    // No backticks, treat whole output as markdown and wrap it
    console.warn("No triple backticks found. Wrapping as markdown.");
    language = "markdown";
    content = rawContent;
    rawContent = "```markdown\n" + content + "\n```";
  }

  const isDocument = documentLanguages.includes(language.toLowerCase());

  // Normalize language
  const monacoLang = isDocument ? "markdown" : language;

  if (!editor) {
    console.error("Editor not initialized");
    return;
  }

  currentDocumentText = content;

  monaco.editor.setModelLanguage(editor.getModel(), monacoLang);
  editor.setValue(content);

  // Save to localStorage
  localStorage.setItem("markdownText", content);

  console.log("Language:", language);
  console.log("Is Document:", isDocument);
  console.log("Final Editor Content:\n", content);
}

// Helper function to update editor content
function updateEditorContent(content, language) {
      if (!editor) return;

      // Update the current document text
      currentDocumentText = content;

      if (language === "markdown") {
            // Update editor value
            editor.setValue(content);
            // Update preview
            const preview = document.getElementById("preview");
            if (preview) {
                  preview.innerHTML = marked.parse(content);
            }
      } else {
            // For non-markdown languages, just update the editor
            editor.setValue(content);
      }

      // Save to localStorage
      localStorage.setItem("markdownText", content);
}
function sleep(ms) {
      return new Promise((resolve) => setTimeout(resolve, ms));
}

// Call function on page load

document.addEventListener("DOMContentLoaded", function () {
      const userInput = document.getElementById("userInput");
      userInput.addEventListener("input", adjustHeight);
});
document.querySelector(".new-session-button").addEventListener("click", function () {
      window.location.href = "/docbuild";
});
// Add session loading functionality
document.addEventListener("DOMContentLoaded", function () {
      const sessionId = document.body.getAttribute("data-session-id");
      currentSessionId = sessionId;
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
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
function handlePromptToDoc() {
      // Hide welcome message
      const welcomeMessage = document.getElementById("welcomeMessage");
      if (welcomeMessage) welcomeMessage.style.display = "none";

      // Hide welcome message
      const chatContainer = document.getElementById("chat-container");
      if (chatContainer) chatContainer.style.display = "flex";

      // Hide all cards but keep cards section visible
      const docbuildCards = document.getElementById("docbuildCards");
      if (docbuildCards) docbuildCards.style.display = "none";

      // Show the bottom part with the input in the cards section
      const cardsBottomPart = document.getElementById("cardsBottomPart");
      if (cardsBottomPart) {
            cardsBottomPart.style.display = "flex";

            // Focus on the input
            const userInput = document.getElementById("userInput");
            if (userInput) {
                  userInput.innerHTML = ""; // Clear any existing content
                  userInput.focus();
            }
      }
      showDocumentContainer();
}

function adjustHeight() {
      const userInput = document.getElementById("userInput");
      let currentHeight = userInput.offsetHeight; // Get the current height
      userInput.style.height = "auto"; // Temporarily set to auto to get correct scrollHeight
      let newHeight = Math.min(userInput.scrollHeight, 150); // Calculate new height, max 150px

      // Set back to original height before transition to make animation smooth
      userInput.style.height = currentHeight + "px";

      // Allow browser to process the change, then transition to the new height
      requestAnimationFrame(() => {
            userInput.style.transition = "height 0.3s ease";
            userInput.style.height = newHeight + "px";
      });

      // Enable scroll only if the height exceeds 150px
      userInput.style.overflowY = userInput.scrollHeight > 150 ? "auto" : "hidden";
}

function loadingAnimation() {
      const contentContainer = document.getElementById("editor");
      contentContainer.classList.add("shimmer-content-container");
      const bottomPart = document.getElementById("cardsBottomPart");
      const loadingMessageContainer = document.createElement("div");
      loadingMessageContainer.classList.add("builder-loading-message-container");
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
function appendUserMessage(content, images = [], files_json = []) {
      // getMarkdownContent();
      const chatContainer = document.getElementById("chat-container");

      // Store the message data in localStorage
      const messageData = {
            content: content,
            images: images,
            files_json: files_json,
      };
      localStorage.setItem("lastUserMessage", JSON.stringify(messageData));

      const messageContainer = document.createElement("div");
      messageContainer.classList.add("user-message-container");

      const messageContentWrapper = document.createElement("div");
      messageContentWrapper.classList.add("user-message", "message");
      messageContentWrapper.style.opacity = "0";
      messageContentWrapper.style.transform = "translateY(40px)";
      messageContentWrapper.style.transition = "opacity 0.4s ease, transform 0.4s ease";

      const imageContainer = document.createElement("div");
      imageContainer.classList.add("message-image-container");

      if (images.length > 0) {
            images.forEach((src) => {
                  const img = document.createElement("img");
                  img.src = src;
                  img.alt = "uploaded image";
                  img.classList.add("user-uploaded-image");
                  imageContainer.appendChild(img);
            });
      }

      const textContentContainer = document.createElement("div");
      textContentContainer.classList.add("text-content-container");
      textContentContainer.textContent = content;

      messageContentWrapper.appendChild(textContentContainer);
      messageContainer.appendChild(messageContentWrapper);

      const allUserMessages = document.createElement("div");
      allUserMessages.classList.add("all-user-messages");

      if (images.length > 0) {
            allUserMessages.appendChild(imageContainer);
      }

      if (files_json.length > 0) {
            const userFilesContainer = renderProcessedFileCards(files_json);
            allUserMessages.appendChild(userFilesContainer);
      }

      if (content !== "") {
            allUserMessages.appendChild(messageContainer);
      }

      chatContainer.appendChild(allUserMessages);

      // Width Animation Logic
      requestAnimationFrame(() => {
            const naturalWidth = messageContentWrapper.scrollWidth;
            animateWidth(messageContentWrapper, 1000, naturalWidth);

            // Fade/slide in after width anim starts
            setTimeout(() => {
                  messageContentWrapper.style.opacity = "1";
                  messageContentWrapper.style.transform = "translateY(0)";
            }, 100);
      });
}

const agentMapping = {
      "Etex Mate Image Generator Agent": {
            agentIconBackgroundClass: "generate-image-agent-color",
            agentIconBackground: "var(--generate-image-agent-color)",
            agentMessage: "Generating Image",
            agentIcon: "palette.svg",
      },
      "Etex Mate Microsoft 365 Agent": {
            agentIconBackgroundClass: "etex-search-agent-color",
            agentIconBackground: "var(--etex-search-agent-color)",
            agentMessage: "Scanning your etex workspace",
            agentIcon: "search.svg",
      },
      "Etex Mate Document Analyst Agent": {
            agentIconBackgroundClass: "document-analyst-agent-color",
            agentIconBackground: "var(--document-analyst-agent-color)",
            agentMessage: "Working on your request",
            agentIcon: "file-search-2.svg",
      },
      "Etex Mate Chat Agent": {
            agentIconBackgroundClass: "chat-agent-color",
            agentIconBackground: "var(--chat-agent-color)",
            agentMessage: "Thinking",
            agentIcon: "bot.svg",
      },
};

function appendAgentNameMessage(agentName, session_item_id) {
      const agentDetails = agentMapping[agentName];

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

            const classesToRemove = ["chat-agent-color", "etex-search-agent-color", "generate-image-agent-color", "document-analyst-agent-color", "web-search-agent-color", "send-email-agent-color"]; // whatever your list is
            const classToAdd = agentMapping.agentIconBackgroundClass; // the one you want to apply

            // Remove only the specified classes
            classesToRemove.forEach((cls) => avatarDiv.classList.remove(cls));

            // Add the new one
            avatarDiv.classList.add(classToAdd);

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

function createChatbotMessageWrapper(session_item_id, agentName = "Etex Mate Chat Agent") {
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
      const subDiv5 = document.createElement("div");
      subDiv5.classList.add("chatbot-audio-container");
      const subDiv6 = document.createElement("div");
      subDiv6.classList.add("chatbot-error-container");
      const subDiv7 = document.createElement("div");
      subDiv7.classList.add("chatbot-canvas-writing-container");
      const subDiv8 = document.createElement("div");
      subDiv8.classList.add("chatbot-action-container");

      messageContainer.appendChild(subDiv1);
      messageContainer.appendChild(subDiv2);
      messageContainer.appendChild(subDiv3);
      messageContainer.appendChild(subDiv4);
      messageContainer.appendChild(subDiv5);
      messageContainer.appendChild(subDiv6);
      messageContainer.appendChild(subDiv7);
      messageContainer.appendChild(subDiv8);

      messageWrapper.appendChild(chatbotAgentDetailsContainer);
      messageWrapper.appendChild(messageContainer);

      chatContainer.appendChild(messageWrapper);
}

function appendcanvasWritingMessage(session_item_id) {
      const wrapper = document.querySelector(`.chatbot-message-Wrapper[data-session-item-id="${session_item_id}"]`);
      const wrapperCanvasWritingContainer = wrapper.querySelector(".chatbot-canvas-writing-container");

      const errorHTML = `
      <div class="chatbot-canvas-writing">
            <span class="chatbot-canvas-writing-icon">
                  <img src="/static/images/lucide_icons/file.svg" alt="file" class="icon-svg" />
            </span>
            <span class="chatbot-canvas-writing-text">
                  Writing
            </span>
            <div class="chatbot-canvas-writing-loading">
            </div>
      </div>
      `;
      wrapperCanvasWritingContainer.innerHTML = errorHTML;
}

function appendErrorMessage(session_item_id) {
      const wrapper = document.querySelector(`.chatbot-message-Wrapper[data-session-item-id="${session_item_id}"]`);
      const wrapperChatContainerError = wrapper.querySelector(".chatbot-error-container");

      const errorHTML = `
    <div class="chatbot-error-box">
      <span class="chatbot-error-icon">❗</span>
      <span class="chatbot-error-text">
        Something went wrong. If this issue persists, please contact our team at Satish.Chadha@etexgroup.com, SaiRam.Penjarla@etexgroup.com, or Bohdan.Yeromenko@etexgroup.com.
      </span>
    </div>
  `;
      wrapperChatContainerError.innerHTML = errorHTML;
}

function appendChatbotMessage(content, session_item_id, feedback = 0, is_streaming = false, audio_url = "", fileName = "Untitled") {
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
      messageContentWrapper.classList.add("chatbot-message", "preview-window-message");

      let new_content = content || "";
      new_content = removeReferencesHeading(new_content).trim();

      let language = "markdown";
      let actualContent = new_content;

      // Try to extract triple-backtick code block with optional language
      const codeBlockMatch = new_content.match(/```(\w+)?\n([\s\S]*?)```/m);

      if (codeBlockMatch) {
      language = codeBlockMatch[1] || "plaintext";
      actualContent = codeBlockMatch[2].trim();
      } else {
      // No triple-backtick format, treat entire thing as markdown
      language = "markdown";
      actualContent = new_content;
      console.warn("No triple backticks found. Treating content as markdown.");
      }

      // Determine if it's a document-style language
      const documentLanguages = ["plaintext", "markdown", "md", "text", "txt"];
      const isDocument = documentLanguages.includes(language.toLowerCase());

      const cleanContent = actualContent;

      console.log("Language:", language);
      console.log("Is Document:", isDocument);
      console.log("Clean Content:\n", cleanContent);


      // Create header container
      const headerContainer = document.createElement("div");
      headerContainer.classList.add("content-header");

      const leftSection = document.createElement("div");
      leftSection.style.cssText = `
            display: flex;
            align-items: center;
            gap: 8px;
      `;

      // Create appropriate icon
      const contentIcon = document.createElement("img");
      contentIcon.classList.add("content-icon");
      contentIcon.classList.add("icon-svg");
      contentIcon.style.cssText = `
            width: 16px;
            height: 16px;
      `;
      
      if (isDocument) {
            contentIcon.src = "/static/images/lucide_icons/file-text.svg";
            contentIcon.alt = "Document";
      } else {
            contentIcon.src = "/static/images/lucide_icons/code.svg";
            contentIcon.alt = "Code";
      }

      const fileNameSpan = document.createElement("span");
      fileNameSpan.textContent = fileName;
      fileNameSpan.style.fontWeight = "500";

      leftSection.appendChild(contentIcon);
      leftSection.appendChild(fileNameSpan);

      // Create fullscreen button
      const fullScreenButton = document.createElement("button");
      fullScreenButton.classList.add("fullscreen-button");
      fullScreenButton.style.cssText = `
            display: flex;
            align-items: center;
            justify-content: center;
            width: 32px;
            height: 32px;
            border: none;
            background: transparent;
            border-radius: 4px;
            cursor: pointer;
            transition: all 0.2s ease;
            opacity: 0.7;
      `;

      const fullScreenIcon = document.createElement("img");
      fullScreenIcon.src = "/static/images/lucide_icons/arrow-up-left.svg";
      fullScreenIcon.alt = "Full Screen";
      fullScreenIcon.style.cssText = `
            width: 16px;
            height: 16px;
      `;
      fullScreenIcon.classList.add("icon-svg");
      

      fullScreenButton.appendChild(fullScreenIcon);

      // Add hover effects
      fullScreenButton.addEventListener("mouseenter", () => {
            fullScreenButton.style.opacity = "1";
            fullScreenButton.style.backgroundColor = "#e9ecef";
      });

      fullScreenButton.addEventListener("mouseleave", () => {
            fullScreenButton.style.opacity = "0.7";
            fullScreenButton.style.backgroundColor = "transparent";
      });

      // Add click handler to fullScreenButton
      fullScreenButton.addEventListener("click", () => {
            handleContentClick(content);
            showPreview();
      });

      headerContainer.appendChild(leftSection);
      headerContainer.appendChild(fullScreenButton);

      const textContentContainer = document.createElement("div");
      textContentContainer.classList.add("text-content-container");
      textContentContainer.style.cssText = `
            width: 100%;
            height: 300px;
            cursor: pointer;
            border-radius: 0 0 8px 8px;
            overflow: hidden;
      `;

      // Add click handler to textContentContainer
      textContentContainer.addEventListener("click", () => {
            // Call your function with the original text
            handleContentClick(content); // Replace with your actual function name
      });

      if (isDocument) {

            // Parse markdown and set as HTML
            if (language.toLowerCase() === "markdown" || language.toLowerCase() === "md") {
                  if (typeof marked !== 'undefined') {
                        textContentContainer.innerHTML = marked.parse(actualContent);
                  } else {
                        // Fallback if marked is not available
                        textContentContainer.innerHTML = `<pre style="white-space: pre-wrap; margin: 0;">${actualContent}</pre>`;
                  }
            } else {
                  // For plaintext, just display as-is
                  textContentContainer.innerHTML = `<pre style="white-space: pre-wrap; margin: 0; font-family: inherit;">${actualContent}</pre>`;
            }
      } else {
            // Handle code content with Monaco Editor
            // Load Monaco and mount editor
            require.config({ paths: { vs: "https://cdn.jsdelivr.net/npm/monaco-editor@0.45.0/min/vs" } });
            require(["vs/editor/editor.main"], function () {
                  monaco.editor.create(textContentContainer, {
                        value: actualContent,
                        language: language,
                        readOnly: true,
                        domReadOnly: true,
                        fontSize: 14,
                        theme: "vs-light",
                        automaticLayout: true,
                        wordWrap: "on",
                        scrollBeyondLastLine: false,
                        renderLineHighlight: "none",
                        lineNumbers: "on",
                        overviewRulerLanes: 0,
                        minimap: { enabled: false },
                        scrollbar: {
                              vertical: 'hidden',
                              horizontal: 'hidden'
                        },
                        cursorStyle: "line",
                        cursorBlinking: "solid",
                        tabIndex: -1,
                  });
            });
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
            fetch("/etexchat/update_feedback", {
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
      audioIcon.src = "/static/images/lucide_icons/volume-2.svg";
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
            const wrapper = document.querySelector(`.chatbot-message-Wrapper[data-session-item-id="${session_item_id}"]`);
            const audioContainer = wrapper.querySelector(".chatbot-message-container").querySelector(".chatbot-audio-container");
            const audioPlayer = createAudioPlayer(currentAudioUrl, session_item_id);
            audioPlayer.setAttribute("data-blob_url", currentAudioUrl);
            audioContainer.appendChild(audioPlayer);
      }

      audioButton.onclick = async () => {
            audioIcon.classList.add("spin");
            audioIcon.src = "/static/images/lucide_icons/loader-circle.svg";

            try {
                  const response = await fetch("/etexchat/generate_audio_from_text", {
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

      // Add buttons to container
      buttonContainer.appendChild(copyButton);
      buttonContainer.appendChild(likeButton);
      buttonContainer.appendChild(dislikeButton);
      if (audio_url === "") {
            buttonContainer.appendChild(audioButton);
      }

      if (is_streaming) {
            buttonContainer.style.display = "none";
      }

      // Assemble the message structure
      messageContentWrapper.appendChild(headerContainer);
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

// You'll need to implement this function according to your needs
function handleContentClick(originalText) {
      // Replace this with your actual function implementation
      console.log("Content clicked:", originalText);
      // Example: openFullScreenView(originalText);
      processCompleteOutput(originalText);
}

function updateAudioCreatorButton(content, session_item_id) {
      console.log(content, session_item_id);
      let wrapper = document.querySelector(`.chatbot-message-Wrapper[data-session-item-id="${session_item_id}"]`);
      const audioButton = wrapper.querySelector(".chatbot-action-container").querySelector(".audio-button");
      const audioIcon = audioButton.querySelector(".icon-svg");

      audioButton.onclick = async () => {
            console.log("Clicked audioButton", content, session_item_id);
            // If no URL yet, generate it from backend
            audioIcon.classList.add("spin"); // Optional loading indicator
            audioIcon.src = "/static/images/lucide_icons/loader-circle.svg";

            try {
                  console.log(content);
                  console.log(session_item_id);
                  const response = await fetch("/etexchat/generate_audio_from_text", {
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

function easeOutCubic(t) {
      return 1 - Math.pow(1 - t, 3);
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
function hideLoadingAnimation() {
      const contentContainer = document.getElementById("editor");
      contentContainer.classList.remove("shimmer-content-container");
      const loadingMessageContainer = document.getElementById("slide-loading-animation");
      if (loadingMessageContainer) {
            loadingMessageContainer.remove();
      }
}
function resetSendButton() {
      const userInput = document.getElementById("userInput");
      userInput.setAttribute("contenteditable", "true");

      const sendButton = document.getElementById("generateButton");
      sendButton.setAttribute("onclick", "handleGenerate()");
      sendButton.disabled = false;

      const sendIcon = document.getElementById("sendIcon");
      sendIcon.src = "/static/images/arrow-right.svg";
      sendIcon.onclick = null;

      // Hide the loading animation
      hideLoadingAnimation();
      stopGeneration = false;
}

async function stopChatbotGeneration() {
      stopGeneration = true;
      abortController.abort(); // Cancels fetch requests

      const selectedModel = getSelectedModel();
      // Get the last message container and its content
      const messageContainers = document.querySelectorAll(".chatbot-container");
      const lastMessageContainer = messageContainers[messageContainers.length - 1];

      if (lastMessageContainer) {
            const resultText = lastMessageContainer.querySelector(".text-content-container");
            const partialResponse = resultText ? resultText.innerHTML : "";

            // Get the original user message data from localStorage
            let userMessageData = JSON.parse(localStorage.getItem("lastUserMessage") || "{}");
            let userPrompt = userMessageData.content || "";
            let images = userMessageData.images || [];
            let filesJson = userMessageData.files_json || [];

            // Remove typing cursor
            const typingCursor = lastMessageContainer.querySelector(".typing-cursor-wrapper");
            if (typingCursor) {
                  typingCursor.remove();
            }

            // If we have a partial response, update the session
            if (partialResponse) {
                  try {
                        await fetch("/docbuild/update_session", {
                              method: "POST",
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify({
                                    session_id: currentSessionId,
                                    prompt: userPrompt,
                                    chatbot_response: partialResponse,
                                    model_name: selectedModel,
                                    session_item_message_id: session_item_message_id,
                              }),
                        });

                        // Update URL to reflect the session
                        window.history.pushState({}, "", `/docbuild/${currentSessionId}`);
                  } catch (error) {
                        console.error("Error updating session with partial response:", error);
                  }
            }

            // Clear the stored message data
            localStorage.removeItem("lastUserMessage");
      }

      // Reset input and button states
      const userInput = document.getElementById("userInput");
      userInput.setAttribute("contenteditable", "true");

      const sendButton = document.getElementById("generateButton");
      sendButton.setAttribute("onclick", "handleGenerate()");
      sendButton.disabled = false;

      const sendIcon = document.getElementById("sendIcon");
      sendIcon.src = "/static/images/arrow-right.svg";
      sendIcon.onclick = null;

      // Hide the loading animation
      hideLoadingAnimation();
      resetSendButton();
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
                              copyIcon.src = "/static/images/copy-icon.svg"; // Revert back to copy icon
                              copyButton.title = "";
                        }, 2000);
                  })
                  .catch((err) => {
                        console.error("Error copying text: ", err);
                  });
      };
}
function setMinHeight() {
      var elements = document.querySelectorAll(".chatbot-container");
      if (elements.length) {
            var lastElement = elements[elements.length - 1];
      } else {
            console.error("Element with class .chatbot-container not found");
      }
}
function removeMinHeight() {
      var elements = document.querySelectorAll(".chatbot-container");
      if (elements.length) {
            var lastElement = elements[elements.length - 1];
            lastElement.style.minHeight = null;
      } else {
            console.error("Element with class .chatbot-container not found");
      }
}

function handlePaste(event) {
      const clipboardData = event.clipboardData || window.clipboardData;
      const items = clipboardData.items;

      let handledImage = false;

      // Check if we've already reached the maximum image limit
      const existingImages = document.querySelectorAll(".paste-preview-content img");
      if (existingImages.length >= 10) {
            showNotification("Maximum of 10 images allowed. Please remove some images before adding more.", "warning", 3);
            return;
      }

      for (const item of items) {
            if (item.type.indexOf("image") !== -1) {
                  // Check again to make sure we don't exceed 10 images
                  const currentImages = document.querySelectorAll(".paste-preview-content img");
                  if (currentImages.length >= 10) {
                        showNotification("Maximum of 10 images allowed. Please remove some images before adding more.", "warning", 3);
                        break;
                  }

                  const file = item.getAsFile();
                  // Create a temporary local preview with loading state
                  const tempId = "img_" + Date.now();
                  showImagePreviewLoading(tempId, file);

                  // Upload to blob storage
                  uploadImageToBlob(file, tempId);
                  event.preventDefault();
                  handledImage = true;
            }
      }

      // If not handling image, override pasted text as plain
      if (!handledImage) {
            const text = clipboardData.getData("text/plain");
            event.preventDefault();

            const selection = window.getSelection();
            if (!selection.rangeCount) return;

            const formattedText = text
                  .replace(/&/g, "&amp;") // escape HTML
                  .replace(/</g, "&lt;")
                  .replace(/>/g, "&gt;")
                  .replace(/\t/g, "  ") // use two em-spaces for tab
                  .replace(/\n/g, "<br>");

            const span = document.createElement("span");
            span.innerHTML = formattedText;

            const range = selection.getRangeAt(0);
            range.deleteContents();
            range.insertNode(span);

            // Move caret after inserted content
            range.setStartAfter(span);
            range.collapse(true);

            selection.removeAllRanges();
            selection.addRange(range);
      }
      adjustHeight();
}
async function loadSessionData(sessionId) {
      try {
            const response = await fetch(`/docbuild/get_session_data?session_id=${sessionId}`, {
                  method: "GET",
            });

            if (response.ok) {
                  // Hide welcome message
                  const welcomeMessage = document.getElementById("welcomeMessage");
                  console.log(welcomeMessage);
                  if (welcomeMessage) welcomeMessage.style.display = "none";

                  window.history.pushState({}, "", `/docbuild/${sessionId}`);
                  const data = await response.json();
                  const slidesContainer = document.getElementById("chat-container");
                  slidesContainer.innerHTML = "";
                  data.forEach((item) => {
                        appendUserMessage(item.prompt);
                        createChatbotMessageWrapper(item.session_item_id);
                        appendChatbotMessage(item.chatbot_response, item.session_item_id, item.feedback);
                        processCompleteOutput(item.chatbot_response);
                        session_item_message_id += 1;
                        let wrapper = document.querySelector(`.chatbot-message-Wrapper[data-session-item-id="${item.session_item_id}"]`);
                        const avatarLoader = wrapper.querySelector(".avatar-loader");
                        if (avatarLoader) {
                              avatarLoader.remove();
                        }
                  });

                  currentSessionId = sessionId;
                  sessionInitialized = true;
                  showPreview();
            } else {
                  throw new Error("Failed to load session data");
            }
      } catch (error) {
            console.error("Error loading session data:", error);
            showNotification("Failed to load session data", "error");
      }
}

const initialMarkdown = `# Markdown syntax guide

## Headers

# This is a Heading h1
## This is a Heading h2
###### This is a Heading h6

## Emphasis

*This text will be italic*  
_This will also be italic_

**This text will be bold**  
__This will also be bold__

_You **can** combine them_

## Lists

### Unordered

* Item 1
* Item 2
* Item 2a
* Item 2b
    * Item 3a
    * Item 3b

### Ordered

1. Item 1
2. Item 2
3. Item 3
    1. Item 3a
    2. Item 3b


## Links

You may be using [Markdown Live Preview](https://markdownlivepreview.com/).

## Blockquotes

> Markdown is a lightweight markup language with plain-text-formatting syntax, created in 2004 by John Gruber with Aaron Swartz.
>
>> Markdown is often used to format readme files, for writing messages in online discussion forums, and to create rich text using a plain text editor.

## Tables

| Left columns  | Right columns |
| ------------- |:-------------:|
| left foo      | right foo     |
| left bar      | right bar     |
| left baz      | right baz     |

`;

let editor;
let currentDocumentText = initialMarkdown;
function setupEventListeners() {
      function applyTemporaryTick(iconId, buttonId, newSrc, newTitle, revertSrc, timeout = 2000) {
            const icon = document.querySelector(`#${buttonId} img`);
            const button = document.getElementById(buttonId);
            icon.src = newSrc;
            button.title = newTitle;

            setTimeout(() => {
                  icon.src = revertSrc;
                  button.title = ""; // Reset title after timeout
            }, timeout);
      }

      document.getElementById("undoBtn").onclick = () => editor && editor.trigger("", "undo", null);
      document.getElementById("redoBtn").onclick = () => editor && editor.trigger("", "redo", null);

      document.getElementById("copyBtn").onclick = () => {
            navigator.clipboard.writeText(editor.getValue());
            applyTemporaryTick("copyIcon", "copyBtn", "/static/images/lucide_icons/check.svg", "Copied!", "/static/images/lucide_icons/copy.svg");
      };

      document.getElementById("downloadBtn").onclick = () => {
            downloadFile();
            applyTemporaryTick("downloadIcon", "downloadBtn", "/static/images/lucide_icons/check.svg", "Downloaded!", "/static/images/lucide_icons/download.svg");
      };

      document.getElementById("saveBtn").onclick = () => {
            saveContent();
            applyTemporaryTick("saveIcon", "saveBtn", "/static/images/lucide_icons/check.svg", "Saved!", "/static/images/lucide_icons/save.svg");
      };

      // Add event listeners for Active and Archived radio buttons
      document.getElementById("active").onchange = () => toggleMode("active");
      document.getElementById("archived").onchange = () => toggleMode("archived");
}

function toggleMode(option) {
      const preview = document.getElementById("preview");
      const editorDiv = document.getElementById("editor");

      const language = editor.getModel().getLanguageId();

      // Handle the "Active" option
      if (option === "active") {
            if (language === "markdown") {
                  saveContent();

                  // Render Markdown
                  preview.innerHTML = marked.parse(editor.getValue());

                  // Make images resizable
                  const imgs = preview.querySelectorAll("img");
                  imgs.forEach((img) => {
                        const wrapper = document.createElement("div");
                        wrapper.style.resize = "both";
                        wrapper.style.overflow = "auto";
                        wrapper.style.display = "inline-block";
                        wrapper.style.border = "1px solid #ccc";
                        wrapper.style.padding = "4px";
                        wrapper.appendChild(img.cloneNode(true));
                        img.replaceWith(wrapper);
                  });

                  preview.style.display = "block";
                  editorDiv.style.display = "none";
            } else {
                  showEditor();
            }
      }

      // Handle the "Archived" option
      else if (option === "archived") {
            preview.style.display = "none";
            editorDiv.style.display = "block";
      }
}

function showEditor() {
      const archivedRadio = document.getElementById("archived");
      archivedRadio.checked = true;
      toggleMode("archived"); // React to radio button state
}

function showPreview() {
      if (editor) {
            currentDocumentText = editor.getValue();
            localStorage.setItem("markdownText", currentDocumentText);
      }

      const language = editor.getModel().getLanguageId();
      // Only show preview if language is markdown
      if (language === "markdown") {
            const activeRadio = document.getElementById("active");
            activeRadio.checked = true;
            toggleMode("active");
      } else {
            // Reset the state to "Archived" if content is not markdown
            const archivedRadio = document.getElementById("archived");
            archivedRadio.checked = true;
            toggleMode("archived");
      }
}

function saveContent() {
      if (editor) {
            currentDocumentText = editor.getValue();
            localStorage.setItem("markdownText", currentDocumentText);
      }
}

function downloadFile() {
      const markdown = editor.getValue();
      const language = editor.getModel().getLanguageId(); // Detect editor language

      let endpoint = "";
      let fileExtension = "";

      switch (language) {
            case "markdown":
                  endpoint = "/docbuild/download_markdown_as_word";
                  fileExtension = "docx";
                  break;

            case "html":
                  endpoint = "/docbuild/download_html_as_file";
                  fileExtension = "html";
                  break;

            case "plaintext":
            case "text":
                  endpoint = "/docbuild/download_text_as_file";
                  fileExtension = "txt";
                  break;

            case "json":
                  endpoint = "/docbuild/download_json_as_file";
                  fileExtension = "json";
                  break;

            case "javascript":
                  endpoint = "/docbuild/download_code_as_file";
                  fileExtension = "js";
                  break;

            case "typescript":
                  endpoint = "/docbuild/download_code_as_file";
                  fileExtension = "ts";
                  break;

            case "python":
                  endpoint = "/docbuild/download_code_as_file";
                  fileExtension = "py";
                  break;

            case "java":
                  endpoint = "/docbuild/download_code_as_file";
                  fileExtension = "java";
                  break;

            case "csharp":
                  endpoint = "/docbuild/download_code_as_file";
                  fileExtension = "cs";
                  break;

            case "cpp":
            case "c":
                  endpoint = "/docbuild/download_code_as_file";
                  fileExtension = "cpp";
                  break;

            case "yaml":
            case "yml":
                  endpoint = "/docbuild/download_yaml_as_file";
                  fileExtension = "yaml";
                  break;

            case "xml":
                  endpoint = "/docbuild/download_xml_as_file";
                  fileExtension = "xml";
                  break;

            case "sql":
                  endpoint = "/docbuild/download_sql_as_file";
                  fileExtension = "sql";
                  break;

            case "csv":
                  endpoint = "/docbuild/download_csv_as_file";
                  fileExtension = "csv";
                  break;

            default:
                  endpoint = "/docbuild/download_text_as_file";
                  fileExtension = "txt";
                  break;
      }

      fetch(endpoint, {
            method: "POST",
            headers: {
                  "Content-Type": "application/json",
            },
            body: JSON.stringify({ markdown }),
      })
            .then((response) => {
                  if (!response.ok) throw new Error("Failed to download the file.");
                  return response.blob();
            })
            .then((blob) => {
                  const url = window.URL.createObjectURL(blob);
                  const a = document.createElement("a");
                  a.href = url;
                  a.download = `document.${fileExtension}`;
                  document.body.appendChild(a);
                  a.click();
                  document.body.removeChild(a);
                  window.URL.revokeObjectURL(url);
            })
            .catch((error) => {
                  console.error("Error:", error);
            });
}

require.config({ paths: { vs: "https://unpkg.com/monaco-editor@latest/min/vs" } });
require(["vs/editor/editor.main"], function () {
      editor = monaco.editor.create(document.getElementById("editor"), {
            value: initialMarkdown,
            language: "markdown",
            theme: "vs-light",
            scrollbar: {
                  vertical: 'hidden',
                  horizontal: 'hidden'
            },
      });
      setupEventListeners();
      showEditor();
      if (sessionId !== "None" && sessionId) {
            loadSessionData(sessionId);
      }
      showPreview();
});
