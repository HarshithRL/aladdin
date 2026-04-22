////////////////////////////////////////////////////////
//              Streaming functionality              //
//////////////////////////////////////////////////////

// Global variables
let stopGeneration = false;
let abortController = new AbortController();
let sessionInitialized = false;
// console.log("setting sessionInitialized to false")
const pendingCharts = new Map(); // chart specs waiting to render; keyed by session_item_id
let filesJson = [];

function extractFileMetadata(files) {
      return files.map((file) => {
            let icon = "/static/images/file.svg";
            let typeLabel = "Unknown File Type";
            let iconClass = "file-icon-default";

            const name = file.name || "";
            const fileName = name.toLowerCase();

            if (fileName.endsWith(".csv") || fileName.endsWith(".xls") || fileName.endsWith(".xlsx")) {
                  icon = "/static/images/file-spreadsheet.svg";
                  typeLabel = "Spreadsheet";
                  iconClass = "file-icon-spreadsheet";
            } else if (fileName.endsWith(".doc") || fileName.endsWith(".docx")) {
                  icon = "/static/images/file-type.svg";
                  typeLabel = "Word Document";
                  iconClass = "file-icon-word";
            } else if (fileName.endsWith(".pdf")) {
                  icon = "/static/images/file-text.svg";
                  typeLabel = "PDF";
                  iconClass = "file-icon-pdf";
            } else if (fileName.endsWith(".ppt") || fileName.endsWith(".pptx")) {
                  icon = "/static/images/file-chart-pie.svg";
                  typeLabel = "Presentation";
                  iconClass = "file-icon-presentation";
            } else {
                  icon = "/static/images/file.svg";
                  typeLabel = "File";
                  iconClass = "file-icon-generic";
            }

            return {
                  name: file.name,
                  typeLabel,
                  icon,
                  iconClass,
            };
      });
}

function collectUserInput() {
      const userInput = document.getElementById("userInput");
      const message = getUserInputAsMarkdown();

      // Get uploaded images' blob URLs (if any)
      const pastePreviewWrapper = document.getElementById("pastePreview");
      let images = [];

      if (pastePreviewWrapper) {
            const imageElements = pastePreviewWrapper.querySelectorAll(".paste-preview-content img");

            // Check for image limit
            if (imageElements.length > 10) {
                  showNotification("Maximum of 10 images allowed. Please remove some images before sending.", "warning", 3);
                  return { message: "", images: [] };
            }

            imageElements.forEach((img) => {
                  // Use the blob URL stored in the data attribute
                  if (img.dataset.blobUrl) {
                        images.push(img.dataset.blobUrl);
                  } else {
                        images.push(img.src); // Fallback
                  }
            });
      }
      // console.log("activeTool: ", activeTool);
      // console.log("toolConfigs: ", toolConfigs);
      return {
            inputMessage: message,
            inputImages: images,
            inputFiles: newlyUploadedFiles,
            inputTool: activeTool == null ? null : activeTool,
      };
}

function clearInputFields() {
      const pastePreviewWrapper = document.getElementById("pastePreview");
      const filePreview = document.getElementById("filePreview");
      const userInput = document.getElementById("userInput");
      const sendIcon = document.getElementById("sendIcon");
      const sendButton = document.getElementById("sendButton");
      const expandWrapper = document.querySelector(".expand-input-wrapper");

      sendButton.onclick = stopChatbotGeneration;
      sendIcon.src = "/static/images/lucide_icons/square.svg";
      sendIcon.onclick = null;

      userInput.innerHTML = "";

      filePreview.innerHTML = "";
      filePreview.style.display = "none";

      if (pastePreviewWrapper) {
            pastePreviewWrapper.remove();
      }

      expandWrapper.style.display = "none";
}

async function checkMemoryLimit() {
      const hasLimitResponse = await fetch("/user_memory/has_more_than_30_memories");
      const hasLimitData = await hasLimitResponse.json();

      const isAtLimit = memories.length >= MEMORY_LIMIT || hasLimitData.hasMoreThan30;
      if (isAtLimit) {
            showNotification("Memory limit reached! Please go to settings and delete some memories to add new ones.", "warning", 5);
      }

      return isAtLimit;
}

async function memoryClassifier(message) {
      try {
            // Skip if message is empty
            if (!message || message.length === 0) {
                  return;
            }

            // Check if we're at the memory limit
            if (await checkMemoryLimit()) {
                  return;
            }

            const selectedModel = getSelectedModel();

            const classifyResponse = await fetch("/user_memory/classify_message_for_user_memory", {
                  method: "POST",
                  headers: {
                        "Content-Type": "application/json",
                  },
                  body: JSON.stringify({ message: message, model_name: selectedModel }),
            });

            if (!classifyResponse.ok) {
                  throw new Error("Failed to classify message");
            }

            const classifyData = await classifyResponse.json();
            const is_worthy = classifyData.is_worthy;
            const summary_text = classifyData.summary_text;

            if (is_worthy) {
                  await addMemory(summary_text);
            }
      } catch (error) {
            console.error("Error in memoryClassifier:", error);
      }
}

async function addMemory(summaryText) {
      try {
            const addResponse = await fetch("/user_memory/add_memory", {
                  method: "POST",
                  headers: {
                        "Content-Type": "application/json",
                  },
                  body: JSON.stringify({ memory_value: summaryText, manual_upload: false }),
            });

            const addData = await addResponse.json();

            if (!addData.success) {
                  alert(addData.error || "Failed to add memory");
            } else {
                  showNotification("Memory added successfully", "success", 2);
            }
      } catch (error) {
            console.error("Error adding memory:", error);
      }
}

async function initializeSession(inputMessage, inputImages = [], inputFiles = [], inputTool = "") {
      // console.log(sessionInitialized)
      if (sessionInitialized === false) {
            try {
                  const sessionNameResponse = await fetch("/sidebar/get_session_name", {
                        method: "POST",
                        headers: {
                              "Content-Type": "application/json",
                        },
                        body: JSON.stringify({
                              session_id: currentSessionId,
                              user_input: inputMessage,
                              model_name: getSelectedModel(),
                              images: inputImages,
                              files_json: inputFiles,
                              input_tool: inputTool,
                        }),
                  });

                  if (!sessionNameResponse.ok) {
                        showNotification("Failed to create a name for the session");
                        sessionName = "New Session";
                  } else {
                        const sessionNameJson = await sessionNameResponse.json();
                        sessionName = sessionNameJson.session_name;
                  }

                  updateSidebarWithSession(currentSessionId, sessionName);
                  sessionInitialized = true;
                  // console.log("setting sessionInitialized to true")
                  return sessionName;
            } catch (error) {
                  console.error("Error initializing session:", error);
            }
      }
      return sessionName;
}

async function streamBotResponse(responseAgent, messageContainer, resultText, session_item_id) {
      const reader = responseAgent.body.getReader();
      const decoder = new TextDecoder("utf-8");
      let llmOutput = "";
      let done = false;
      isFixedHeight = false;
      let isFinalMessageMode = false;
      let isNewMessageTraceMode = false;
      let newMessageTrace = "";

      scrollToBottom();

      while (!done && !stopGeneration) {
            const { value, done: readerDone } = await reader.read();
            done = readerDone;

            if (value) {
                  // Decode the chunk
                  const chunk = decoder.decode(value);
                  console.log(chunk);

                  // Check if we're in final message mode - all chunks should be treated as final message
                  if (isFinalMessageMode) {
                        if (chunk.includes("[NEW MESSAGES TRACE]")) {
                              isNewMessageTraceMode = true;
                              isFinalMessageMode = false;
                              const newMessageTraceStr = chunk.substring(chunk.indexOf("[NEW MESSAGES TRACE]") + "[NEW MESSAGES TRACE]".length).trim();
                              newMessageTrace = newMessageTraceStr;
                        } 
                        else {
                              llmOutput += chunk;
                              resultText.innerHTML = marked.parse(llmOutput);
                        }
                  }
                  // Check if we're in new message trace mode - all chunks should accumulate to newMessageTrace
                  else if (isNewMessageTraceMode) {
                        newMessageTrace += chunk;
                  }
                  // Handle agent updates
                  else if (chunk.includes("[AGENT UPDATES]")) {
                        let agentUpdateParts = chunk.split("[AGENT UPDATES]").map(part => part.trim());
                        // Prefer the part after the tag if available, else fall back to the part before
                        agentUpdate = agentUpdateParts[1] || agentUpdateParts[0];
                        console.log(agentUpdate);
                        appendAgentNameMessage(agentUpdate, session_item_id);

                        if (agentUpdate === "Relay Image Generator Agent") {
                              appendImageGenerationMessage(session_item_id);
                        }
                  } else if (chunk.startsWith("[NEW MESSAGES TRACE]")) {
                        isNewMessageTraceMode = true;
                        const newMessageTraceStr = chunk.replace("[NEW MESSAGES TRACE]", "").trim();
                        newMessageTrace = newMessageTraceStr;
                  }
                  // Handle tool output
                  else if (chunk.startsWith("[TOOL OUTPUT]")) {
                        const toolOutputStr = chunk.replace("[TOOL OUTPUT]", "").trim();
                        // console.log(toolOutputStr);



                        // 
                        // 
                        // 
                        // 
                        // 
                        // 
                        // 
                        // 
                        // 
                        // 
                        // 
                        // 
                        // 
                        // 
                        // 
                        // 
                        // 
                        // 
                        // 
                        // 
                        // Thought processes (Tool outputs)
                        try {
                              console.log(toolOutputStr)
                              const json_value = JSON.parse(JSON.parse(toolOutputStr));
                              console.log(json_value)
                              console.log(json_value.tool_type)
                              
                              // Remove the last image-generating-container if it exists
                              if (json_value.tool_type === "image_generator") {
                                    // Remove all image-generating-container elements
                                    document.querySelectorAll(".image-generating-container").forEach((container) => container.remove());
                                    // Remove all agent-message elements
                                    document.querySelectorAll(".agent-message").forEach((container) => container.remove());
                                    appendThoughtMessage(json_value.tool_text, false, session_item_id);
                                    // Remove the agent-message if it exists (only one)
                                    const toolNameContainer = document.querySelector(".agent-message");
                                    if (toolNameContainer) {
                                          toolNameContainer.remove();
                                    }
                                    appendGeneratedImageMessage(json_value.image_url, session_item_id);
                             
                             
                             
                             
                             
                             
                             
                             
                              } else if (json_value.tool_type === "execute_inventory_query"){
                                    aladdin_json_value = json_value.response;
                                    appendThoughtMessage(json_value.response, false, session_item_id);

                              } else if (json_value.tool_type === "execute_sales_insights_query"){
                                    aladdin_json_value = json_value.response;
                                    appendThoughtMessage(json_value.response, false, session_item_id);
                                    if (json_value.chart_spec && typeof json_value.chart_spec === "object") {
                                          appendChartToThought(json_value.chart_spec, session_item_id);
                                    }
                              } else if (json_value.tool_type === "execute_web_search_query"){
                                    // Format web search results for display
                                    let webSearchDisplay = `**Web Search Query:** ${json_value.Question}\n\n`;
                                    webSearchDisplay += `**Search Results:**\n${json_value.response}\n\n`;
                                    
                                    if (json_value.urls && json_value.urls.length > 0) {
                                          webSearchDisplay += `**Sources:**\n`;
                                          json_value.urls.forEach((url, index) => {
                                                webSearchDisplay += `${index + 1}. [${url}](${url})\n`;
                                          });
                                    }
                                    
                                    appendThoughtMessage(webSearchDisplay, false, session_item_id);
                              } else if (json_value.tool_type === "execute_llm_query"){
                                    // Format ML model inference for display
                                    let mlModelDisplay = `**🤖 ML Model Inference**\n\n`;
                                    mlModelDisplay += `**Query:** ${json_value.query}\n\n`;
                                    if (json_value.success && json_value.response) {
                                          mlModelDisplay += `**ML Model Prediction:**\n${json_value.response}\n\n`;
                                    } else if (json_value.error_msg) {
                                          mlModelDisplay += `**⚠️ Error:** ${json_value.error_msg}\n\n`;
                                    }
                                    mlModelDisplay += `*Inferred from ML model: ${json_value.model || 'mas-c37b2829-endpoint'}*\n`;
                                    appendThoughtMessage(mlModelDisplay, false, session_item_id);
                              } 
                              
                              else if (json_value.tool_type === "write_email_draft_for_outlook"){
                                    const toRecipients = json_value.draft_email.toRecipients;
                                    const ccRecipients = json_value.draft_email.ccRecipients;
                                    const emailSubject = json_value.draft_email.emailSubject;
                                    const emailBody = json_value.draft_email.emailBody;
                                    appendEmailSender(toRecipients, ccRecipients, emailSubject, emailBody, session_item_id);
                                    
                                    let wrapper = document.querySelector(`.chatbot-message-Wrapper[data-session-item-id="${session_item_id}"]`);
                                    const avatarLoader = wrapper.querySelector(".avatar-loader");
                                    if (avatarLoader) {avatarLoader.remove();}

                                    document.querySelectorAll(".agent-message").forEach((container) => container.remove());
                                    finishThoughtStreaming();
                                    llmOutput = `All set! I've crafted a clean, interactive email drafting interface just for you — complete with real-time user suggestions as you type, smooth recipient management with easy-to-remove chips, and a cozy little spot for your subject and message. When you're ready, just hit Send, and boom — everything gets logged neatly to the console. Like it? Want to sprinkle in a few more features or dress it up some more? Just say the word! 💌✨`
                                    resultText.innerHTML = marked.parse(llmOutput);
                                    return llmOutput;
                              }
                        } catch (e) {
                              console.error("Failed to parse tool output:", e);
                        }
                  }
                  // Handle final message
                  else if (chunk.startsWith("[FINAL MESSAGE]")) {
                        finishThoughtStreaming();
                        isFinalMessageMode = true;
                        llmOutput = chunk.replace("[FINAL MESSAGE]", "").trim();
                        resultText.innerHTML = marked.parse(llmOutput);
                  }
                  // Handle final message
                  else if (chunk.startsWith("[FAILED]")) {
                        finishThoughtStreaming();
                        llmOutput = chunk.replace("[FAILED]", "").trim();
                        resultText.innerHTML = marked.parse(llmOutput);
                        llmOutput = "[FAILED]"

                        appendErrorMessage(session_item_id);

                        let wrapper = document.querySelector(`.chatbot-message-Wrapper[data-session-item-id="${session_item_id}"]`);
                        const wrapperChatContainerError = wrapper.querySelector('.chatbot-action-container');
                        wrapperChatContainerError.style.display = "none";
                  }
                  // Handle normal streaming text
                  else {
                        // Remove all image-generating-container elements
                        document.querySelectorAll(".image-generating-container").forEach((container) => container.remove());
                        finishThoughtStreaming();
                        llmOutput += chunk;
                        resultText.innerHTML = marked.parse(llmOutput);
                  }
                  addCopyButtonToPreTags();
                  addCopyButtonToTables();
                  hljs.highlightAll();
                  updateLastCopyButtonText(llmOutput);
                  updateAudioCreatorButton(llmOutput, session_item_id);
                  hljs.highlightAll();
            }

            setMinHeight();
            // await sleep(25);
      }

      document.querySelectorAll(".agent-message").forEach((container) => container.remove());
      finishThoughtStreaming();

      if (llmOutput !== "[FAILED]"){
            resultText.innerHTML = marked.parse(llmOutput);
            const buttonContainer = messageContainer.querySelector(".button-container");
            if (buttonContainer) {
                  buttonContainer.style.display = "flex";
            }

            addCopyButtonToTables();
            addCopyButtonToPreTags();
            //   uiElements.typingCursorWrapper.remove();
            hljs.highlightAll();
      }
      let wrapper = document.querySelector(`.chatbot-message-Wrapper[data-session-item-id="${session_item_id}"]`);
      const avatarLoader = wrapper.querySelector(".avatar-loader");
      if (avatarLoader) {
            avatarLoader.remove();
      }
      return llmOutput;
}

async function updateSession(inputMessage, botResponse, inputImages, inputTool, inputFiles, sessionItemId, newMessageTrace, sessionItemMessageId, sessionName, agentUpdate, audio_url) {
      const response = await fetch("/relaychat/update_session", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                  session_id: currentSessionId,
                  prompt: inputMessage,
                  chatbot_response: botResponse,
                  model_name: getSelectedModel(),
                  session_name: sessionName,
                  images: inputImages,
                  files_json: inputFiles,
                  new_messages_trace: newMessageTrace,
                  session_item_message_id: sessionItemMessageId,
                  session_item_id: sessionItemId,
                  input_tool: inputTool,
                  agent_name: agentUpdate,
                  audio_url: audio_url,
            }),
      });

      if (response.ok) {
            window.history.pushState({}, "", `/relaychat/${currentSessionId}`);
      }
}

function updateChatUI() {
      hideWelcomeMessage();
      hideModelName();
      document.getElementById("userInput").style.height = "40px";
      document.getElementById("userInput").focus();
      document.getElementById("chat-container").style.paddingBottom = "90px";
      document.getElementById("chat-container").style.margin = "auto";
      document.querySelector(".container").style.justifyContent = "space-between";
      document.querySelector(".container").style.alignItems = "flex-end";
}

function resetSendButton() {
      const userInput = document.getElementById("userInput");
      userInput.setAttribute("contenteditable", "true");

      const sendButton = document.getElementById("sendButton");
      sendButton.setAttribute("onclick", "generateChatbotAnswer()");
      sendButton.disabled = false;

      const sendIcon = document.getElementById("sendIcon");
      // Change icon based on input content
      if (document.getElementById("userInput").textContent.trim() === "") {
            // Show voice icon when empty
            document.getElementById("sendButton").onclick = toggleVoiceOverlay;
            sendIcon.src = "/static/images/lucide_icons/audio-lines.svg";
      } else {
            // Show send icon when there's content
            document.getElementById("sendButton").onclick = generateChatbotAnswer;
            sendIcon.src = "/static/images/lucide_icons/arrow-up.svg";
      }

      // Hide the loading animation
      // hideLoadingAnimation();
      stopGeneration = false;
}

async function stopChatbotGeneration() {
      stopGeneration = true;
      abortController.abort(); // Cancels fetch requests

      // Get the last message container and its content
      const messageContainers = document.querySelectorAll(".chatbot-message-container");
      const lastMessageContainer = messageContainers[messageContainers.length - 1];

      if (lastMessageContainer) {
            const resultText = lastMessageContainer.querySelector(".text-content-container");
            const partialResponse = resultText ? resultText.innerHTML : "";

            // Get the original user message data from localStorage
            let userMessageData = JSON.parse(localStorage.getItem("lastUserMessage") || "{}");
            let inputMessage = userMessageData.inputMessage || "";
            let inputImages = userMessageData.inputImages || [];
            let inputFiles = userMessageData.inputFiles || [];
            let inputTool = userMessageData.inputTool || "";

            // Remove typing cursor
            const typingCursor = lastMessageContainer.querySelector(".typing-cursor-wrapper");
            if (typingCursor) {
                  typingCursor.remove();
            }

            // If we have a partial response, update the session
            if (partialResponse) {
                  try {
                        const params = {
                              session_id: currentSessionId,
                              prompt: inputMessage,
                              chatbot_response: partialResponse,
                              model_name: getSelectedModel(),
                              input_tool: inputTool,
                              session_name: sessionName,
                              images: inputImages,
                              files_json: inputFiles,
                              new_messages_trace: newMessageTrace,
                              sessionItemMessageId: sessionItemMessageId,
                              session_item_id: session_item_id,
                              audio_url: "",
                        };

                        await fetch("/relaychat/update_session", {
                              method: "POST",
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify(params),
                        });

                        // Update URL to reflect the session
                        window.history.pushState({}, "", `/relaychat/${currentSessionId}`);
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

      // Hide the loading animation
      // hideLoadingAnimation();
      resetSendButton();
      // Remove all image-generating-container elements
      document.querySelectorAll(".image-generating-container").forEach((container) => container.remove());
      // Remove all agent-message elements
      document.querySelectorAll(".agent-message").forEach((container) => container.remove());
      let wrapper = document.querySelector(`.chatbot-message-Wrapper[data-session-item-id="${session_item_id}"]`);
      const avatarLoader = wrapper.querySelector(".avatar-loader");
      if (avatarLoader) {
            avatarLoader.remove();
      }
}

function sleep(ms) {
      return new Promise((resolve) => setTimeout(resolve, ms));
}

async function processChatbotResponse(inputMessage, inputImages, inputFiles, inputTool, auth_access_token) {
      // Create a new AbortController for this request
      // console.log("inputImages", inputImages)
      abortController = new AbortController();
      const signal = abortController.signal;

      try {
            // Prepare request data
            // console.log(voiceModeEnabled);
            if (voiceModeEnabled) {
                  // Fetch response from agent
                  // const circleContainer = document.getElementById("circleContainer");
                  // const bars = document.getElementById("talkingBars");
                  // circleContainer.style.display = "none";
                  // bars.classList.remove("hidden");
                  const response = await fetch("/relaychat/invoke_audio", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                              session_id: currentSessionId,
                              user_input: inputMessage,
                              auth_access_token: auth_access_token,
                              model_name: getSelectedModel(),
                        }),
                        signal,
                  });
                  if (response.ok) {
                        // const blob = await response.blob();
                        // const audioUrl = URL.createObjectURL(blob);

                        // document.getElementById("player").src = audioUrl;
                        // document.getElementById("player").play();
                        const data = await response.json();
                        if (data.audio_url) {
                              const audioPlayer = document.getElementById("player");
                              audioPlayer.src = data.audio_url;
                              // audio_url_temp = "https://s3-us-west-2.amazonaws.com/s.cdpn.io/3/shoptalk-clip.mp3";
                              showVoiceModeAnimation('talkingBars', '', data.audio_url)
                              // audioPlayer.play();
                        } else {
                              alert("Failed to generate audio.");
                        }

                        const botResponse = data.spoken_text;
                        session_item_id = generateSessionId();
                        createChatbotMessageWrapper(session_item_id);
                        appendChatbotMessage(botResponse, session_item_id, 0, false, data.audio_url);

                        // Initialize or update session
                        sessionName = await initializeSession(inputMessage);
                        await updateSession(inputMessage, botResponse, [], "", [], session_item_id, "[]", sessionItemMessageId, sessionName, "", data.audio_url);

                        let wrapper = document.querySelector(`.chatbot-message-Wrapper[data-session-item-id="${session_item_id}"]`);
                        const avatarLoader = wrapper.querySelector(".avatar-loader");
                        if (avatarLoader) {
                              avatarLoader.remove();
                        }
                  } else {
                        showNotification("TTS failed", "error");
                  }
            } else {
                  // Fetch response from agent
                  console.log("responseAgent reqeust body:---->", {
                              session_id: currentSessionId,
                              user_input: inputMessage,
                              model_name: getSelectedModel(),
                              images: inputImages,
                              files_json: inputFiles,
                              current_active_tool: inputTool,
                              session_attached_files: sessionAttachedFiles,
                        })
                  const responseAgent = await fetch("/relaychat/invoke_agent", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                              session_id: currentSessionId,
                              user_input: inputMessage,
                              model_name: getSelectedModel(),
                              images: inputImages,
                              files_json: inputFiles,
                              current_active_tool: inputTool,
                              session_attached_files: sessionAttachedFiles,
                              auth_access_token: auth_access_token,
                        }),
                        signal,
                  });

                  if (stopGeneration) return;

                  if (!responseAgent.ok) throw new Error(responseAgent.statusText);

                  sessionItemMessageId += 1;

                  // Setup UI for bot response
                  session_item_id = generateSessionId();
                  createChatbotMessageWrapper(session_item_id);
                  appendChatbotMessage("", session_item_id, 0, true, "");

                  const messageContainers = document.querySelectorAll(".chatbot-message-container");
                  const messageContainer = messageContainers[messageContainers.length - 1];

                  const resultText = messageContainer.querySelector(".text-content-container");

                  // Stream and process the bot response
                  const botResponse = await streamBotResponse(responseAgent, messageContainer, resultText, session_item_id);
                  if (stopGeneration) return;
                  if (botResponse === "[FAILED]") return;

                  // Remove minimum height constraint
                  removeMinHeight();

                  // Initialize or update session
                  sessionName = await initializeSession(inputMessage, inputImages, inputFiles, inputTool);

                  // Update session with the completed conversation
                  await updateSession(inputMessage, botResponse, inputImages, inputTool, inputFiles, session_item_id, newMessageTrace, sessionItemMessageId, sessionName, agentUpdate, "");
            }
      } catch (error) {
            if (!stopGeneration && error.name !== "AbortError") {
                  console.error("Error during fetch or streaming:", error.message);
                  showNotification("Error: " + error.message, sessionItemMessageId);
            }
      } finally {
            removeMinHeight();
            resetSendButton();
            hideModelName();
            document.getElementById("userInput").focus();
            filesJson = [];
      }
}

async function generateChatbotAnswer() {
      const accessToken = await fetchAccessToken();
      if (!accessToken){
            return;
      }
      // Early return if session creation is not allowed yet
      if (!allowSessionCreation) {
            return;
      }

      // Collect user input and images
      const { inputMessage, inputImages, inputFiles, inputTool } = collectUserInput();

      // Update UI elements
      updateChatUI();

      // Clear input fields
      clearInputFields();

      // Load animation while waiting for response
      // loadingAnimation();

      // console.log("inputMessage: ", inputMessage);
      // console.log("inputImages: ", inputImages);
      // console.log("inputFiles: ", inputFiles);
      // console.log("inputTool: ", inputTool);
      // console.log("sessionName: ", sessionName);

      // Immediately append the user message to the chat
      appendUserMessage(inputMessage, inputImages, inputFiles, inputTool);

      // Process the chatbot response
      await processChatbotResponse(inputMessage, inputImages, inputFiles, inputTool, accessToken);

      // Process potential memory
      if (inputMessage !== "") {
            await memoryClassifier(inputMessage);
      }
      for (const key in newlyUploadedFiles) {
            if (newlyUploadedFiles.hasOwnProperty(key)) {
                  delete newlyUploadedFiles[key];
            }
      }
}

/**
 * Renders a Chart.js chart inside the thought process container,
 * right after the markdown table, wrapped in a .thought-item-wrapper
 * so the Show/Hide thoughts toggle controls it correctly.
 */
function appendChartToThought(chartSpec, session_item_id) {
      // 1. Library guard
      if (typeof Chart === "undefined") {
            console.warn("[Chart] Chart.js not loaded — skipping visualization");
            return;
      }
      // 2. Spec guard
      if (!chartSpec || !chartSpec.type || !chartSpec.data || !Array.isArray(chartSpec.data.datasets)) {
            console.warn("[Chart] Invalid chart spec — skipping", chartSpec);
            return;
      }
      // 3. Find thought-process-container (created by appendThoughtMessage just before this call)
      const wrapper = document.querySelector(`.chatbot-message-Wrapper[data-session-item-id="${session_item_id}"]`);
      if (!wrapper) return;
      const thoughtProcessContainer = wrapper.querySelector(".thought-process-container");
      if (!thoughtProcessContainer) return;

      // 4. Build chart canvas
      const container = document.createElement("div");
      container.classList.add("chart-container");

      const canvasId = "chart-" + session_item_id + "-" + Date.now();
      const canvas = document.createElement("canvas");
      canvas.id = canvasId;
      container.appendChild(canvas);

      // 5. Wrap in .thought-item-wrapper (matches thought structure; toggle will show/hide it)
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
      thoughtItemWrapper.appendChild(container);
      thoughtItemWrapper.style.display = "none"; // collapsed by default, matches appendThoughtMessage(isStreaming=false)

      thoughtProcessContainer.appendChild(thoughtItemWrapper);

      // 6. Enforce responsive options
      chartSpec.options = chartSpec.options || {};
      chartSpec.options.responsive = true;
      chartSpec.options.maintainAspectRatio = true;

      // 7. Destroy previous instance on same canvas (safety net)
      if (canvas._chartInstance) {
            canvas._chartInstance.destroy();
            canvas._chartInstance = null;
      }

      // 8. Render — any Chart.js runtime error silently removes the wrapper
      try {
            const chart = new Chart(canvas, chartSpec);
            canvas._chartInstance = chart;
      } catch (err) {
            console.error("[Chart] Failed to render chart:", err);
            thoughtItemWrapper.remove();
      }
}

/**
 * Called at the end of streamBotResponse, AFTER resultText.innerHTML is finalised.
 * Renders the Chart.js chart inside the .text-content-container (resultText).
 * All failures are silent — the chat flow is never interrupted.
 */
function _renderPendingChart(session_item_id, resultText) {
      // 1. Check if a chart was queued for this session
      if (!pendingCharts.has(session_item_id)) return;
      const chartSpec = pendingCharts.get(session_item_id);
      pendingCharts.delete(session_item_id);

      // 2. Library guard
      if (typeof Chart === "undefined") {
            console.warn("[Chart] Chart.js not loaded — skipping visualization");
            return;
      }

      // 3. Target guard
      if (!resultText) return;

      // 4. Build container with unique canvas ID
      const container = document.createElement("div");
      container.classList.add("chart-container");

      const canvasId = "chart-" + session_item_id + "-" + Date.now();
      const canvas = document.createElement("canvas");
      canvas.id = canvasId;
      container.appendChild(canvas);

      // Insert BEFORE the LLM text so the chart leads the response
      resultText.insertBefore(container, resultText.firstChild);

      // 5. Enforce responsive options
      chartSpec.options = chartSpec.options || {};
      chartSpec.options.responsive = true;
      chartSpec.options.maintainAspectRatio = true;

      // 6. Destroy previous Chart instance on same canvas (safety net)
      if (canvas._chartInstance) {
            canvas._chartInstance.destroy();
            canvas._chartInstance = null;
      }

      // 7. Render — catch any Chart.js runtime errors
      try {
            const chart = new Chart(canvas, chartSpec);
            canvas._chartInstance = chart;
      } catch (err) {
            console.error("[Chart] Failed to render chart:", err);
            container.remove();   // Clean broken container out of DOM
      }
}
