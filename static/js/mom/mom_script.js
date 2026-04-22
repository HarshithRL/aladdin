// DOM elements
const sharepointLink = document.getElementById("sharepointLink");
const fileUpload = document.getElementById("fileUpload");
const dragDropArea = document.getElementById("dragDropArea");
const fileInfo = document.getElementById("fileInfo");
const sendButton = document.getElementById("sendButton");
const progressContainer = document.getElementById("progressContainer");
const progressItems = document.getElementById("progressItems");
const goBackButton = document.getElementById("goBackButton");
const sessionId = document.body.getAttribute("data-session-id");
let currentSessionId = sessionId;

document.querySelector(".new-session-button").addEventListener("click", function () {
      window.location.href = "/mom";
});

document.addEventListener("DOMContentLoaded", function () {
      if (sessionId !== "None") {
            loadSessionData(currentSessionId);
      }
});
async function loadSessionData(sessionId) {
      window.history.pushState({}, "", `/mom/${sessionId}`);
      const response = await fetch("/etexchat/get_session_data", {
            method: "POST",
            headers: {
                  "Content-Type": "application/json",
            },
            body: JSON.stringify({ sessionId }),
      });
      const responseDataList = await response.json(); // Ensure JSON response
      const responseData = Array.isArray(responseDataList) ? responseDataList[0] : responseDataList;
      console.log(responseData);

      part = JSON.parse(responseData.session_item_details).part;
      console.log(part);
      session_item_id = responseData.session_item_id;
      document.querySelector(".link-input-container").style.display = "none";
      document.querySelector(".model-select").style.display = "none";
      appendChatbotMessage(responseData.chatbot_response, session_item_id, 0);
      appendMeetingDetails(part.all_participants, part.embed_url);
}

// Progress steps for different input types
const linkSteps = [
      { id: "validate", text: "Validating link", endpoint: "/mom/get_meeting_details" },
      { id: "process", text: "Processing link", endpoint: "/process-link" },
      { id: "transcript", text: "Fetching transcript", endpoint: "/fetch-transcript" },
      { id: "generate", text: "Generating Minutes of meeting", endpoint: "/generate-minutes" },
];

const fileSteps = [
      { id: "read", text: "Reading file", endpoint: "/mom/read_file" },
      { id: "generate", text: "Generating minutes of meeting", endpoint: "/mom/generate_minutes" },
];

let currentFile = null;
let currentSteps = [];

// Event listeners
sharepointLink.addEventListener("input", handleLinkInput);
dragDropArea.addEventListener("click", () => fileUpload.click());
dragDropArea.addEventListener("dragover", handleDragOver);
dragDropArea.addEventListener("drop", handleDrop);
fileUpload.addEventListener("change", handleFileSelect);
goBackButton.addEventListener("click", resetForm);

function handleLinkInput(e) {
      document.getElementById('momSlidesContainer').style.display = 'none';
      const link = e.target.value.trim();
      if (link && isValidLink(link)) {
            showProgress(linkSteps);
            processSteps(linkSteps, { link: link });
      }
}

function isValidLink(link) {
      return link.includes("sharepoint.com") || link.includes(".sharepoint.");
}
// || link.includes("teams.microsoft.com")

function handleDragOver(e) {
      document.getElementById('momSlidesContainer').style.display = 'none';
      e.preventDefault();
      dragDropArea.classList.add("drag-over");
}

function handleDrop(e) {
      document.getElementById('momSlidesContainer').style.display = 'none';
      e.preventDefault();
      dragDropArea.classList.remove("drag-over");
      const files = e.dataTransfer.files;
      if (files.length > 0) {
            handleFile(files[0]);
      }
}

function handleFileSelect(e) {
      document.getElementById('momSlidesContainer').style.display = 'none';
      const file = e.target.files[0];
      if (file) {
            handleFile(file);
      }
}

function handleFile(file) {
      document.getElementById('momSlidesContainer').style.display = 'none';
      const validExtensions = [".mp4", ".docx", ".vtt"];
      const fileExtension = "." + file.name.split(".").pop().toLowerCase();

      if (!validExtensions.includes(fileExtension)) {
            alert("Please upload a valid file (.mp4, .docx, .vtt)");
            return;
      }

      currentFile = file;
      showFileInfo(file);
      showProgress(fileSteps);

      // Create FormData for file upload
      const formData = new FormData();
      formData.append("file", file);

      processFileSteps(fileSteps, formData);
}

function showFileInfo(file) {
      fileInfo.innerHTML = `
                <strong>Selected:</strong> ${file.name} 
                <span style="color: #718096;">(${(file.size / 1024 / 1024).toFixed(2)} MB)</span>
            `;
      fileInfo.classList.remove("hidden");
}

function showProgress(steps) {
      currentSteps = steps;
      progressItems.innerHTML = "";

      steps.forEach((step) => {
            const item = document.createElement("div");
            item.className = "progress-item";
            item.id = `progress-${step.id}`;
            item.innerHTML = `
                    <div class="checkbox-container">
                        <img src="/static/images/lucide_icons/check.svg" alt="Close" />
                        <div class="x-mark"></div>
                    </div>
                    <span class="progress-text">${step.text}</span>
                    <div class="spinner"></div>
                `;
            progressItems.appendChild(item);
      });

      progressContainer.classList.remove("hidden");
      sendButton.disabled = true;
}

async function processSteps(steps, data) {
      const accessToken = await fetchAccessToken();
      if (!accessToken){
            return;
      }
      for (let i = 0; i < steps.length; i++) {
            const step = steps[i];
            const progressItem = document.getElementById(`progress-${step.id}`);

            progressItem.classList.add("active");

            try {
                  const response = await fetch(step.endpoint, {
                        method: "POST",
                        body: JSON.stringify({ sharepoint_link: data.link, access_token: accessToken}),
                        headers: {
                              "Content-Type": "application/json",
                        },
                  });

                  const result = await response.json();

                  if (!result.success) throw new Error(result.error || "Step failed");

                  progressItem.classList.remove("active");
                  progressItem.classList.add("completed");

                  if (step.id === "validate" && result.meeting_id) {
                        showParts(result.parts);
                        return; // Stop flow to wait for user action
                  }
            } catch (error) {
                  progressItem.classList.remove("active");
                  progressItem.classList.add("failed");
                  // Change check icon to close icon on failure
                  const checkboxImg = progressItem.querySelector(".checkbox-container img");
                  if (checkboxImg) {
                        checkboxImg.src = "/static/images/lucide_icons/x.svg";
                        checkboxImg.alt = "Close";
                  }
                  console.error(error);
                  goBackButton.classList.remove("hidden");
                  break;
            }
      }
}

async function generateSessionName(message) {
      const selectedModel = getSelectedModel();

      const sessionNameRequestData = {
            user_input: message,
            model_name: selectedModel,
      };

      try {
            const sessionNameResponse = await fetch("/sidebar/get_session_name", {
                  method: "POST",
                  headers: {
                        "Content-Type": "application/json",
                  },
                  body: JSON.stringify(sessionNameRequestData),
            });

            if (!sessionNameResponse.ok) {
                  throw new Error("Failed to get session name");
            }

            const sessionNameJson = await sessionNameResponse.json();

            return sessionNameJson.session_name;
      } catch (error) {
            console.error("Error initializing session:", error);
            return "New Session";
      }
}

async function processFileSteps(steps, initialData) {
      let data = initialData;
      let session_id, session_item_id, meeting_name;

      for (let i = 0; i < steps.length; i++) {
            const step = steps[i];
            const progressItem = document.getElementById(`progress-${step.id}`);

            progressItem.classList.add("active");

            try {
                  let response;

                  if (step.id === "read") {
                        // First step: upload the file via FormData
                        response = await fetch(step.endpoint, {
                              method: "POST",
                              body: data,
                        });

                        const readResult = await response.json();
                        if (!readResult.success) throw new Error(readResult.error || "Read step failed");

                        // Prepare structured data for the generate step
                        const transcript = readResult.transcript_content;
                        session_id = generateSessionId();
                        session_item_id = generateSessionId();
                        meeting_name = await generateSessionName(transcript);

                        data = {
                              transcript_content: transcript,
                              model_name: getSelectedModel(),
                              session_id,
                              session_item_id,
                              meeting_name,
                        };

                        progressItem.classList.remove("active");
                        progressItem.classList.add("completed");
                        continue;
                  }

                  // POST JSON to /mom/generate_minutes
                  response = await fetch(step.endpoint, {
                        method: "POST",
                        body: JSON.stringify(data),
                        headers: {
                              "Content-Type": "application/json",
                        },
                  });

                  const generateResult = await response.json();
                  if (!generateResult.success) throw new Error(generateResult.error || "Generate step failed");

                  progressItem.classList.remove("active");
                  progressItem.classList.add("completed");

                  // ✅ Final Step: Show the MOM in UI
                  currentSessionId = session_id;
                  window.history.pushState({}, "", `/mom/${currentSessionId}`);
                  updateSidebarWithSession(currentSessionId, meeting_name);
                  document.querySelector(".link-input-container").style.display = "none";
                  document.querySelector(".model-select").style.display = "none";
                  appendChatbotMessage(generateResult.meeting_notes, session_item_id, 0);

                  // Dummy values for part.all_participants and embed_url if not applicable
                  appendMeetingDetails([], null);

                  console.log("✅ Generated Meeting Notes:");
                  console.log(generateResult.meeting_notes);
            } catch (error) {
                  progressItem.classList.remove("active");
                  progressItem.classList.add("failed");
                  // Change check icon to close icon on failure
                  const checkboxImg = progressItem.querySelector(".checkbox-container img");
                  if (checkboxImg) {
                        checkboxImg.src = "/static/images/lucide_icons/x.svg";
                        checkboxImg.alt = "Close";
                  }
                  console.error(`❌ ${step.text} failed:`, error);
                  goBackButton.classList.remove("hidden");
                  break;
            }
      }
}

async function showParts(parts) {
      if (parts.length === 1) {
            const part = parts[0];

            if (part.is_already_generated) {
                  session_item_id = generateSessionId();
                  currentSessionId = generateSessionId();

                  await fetch("/mom/create_session", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                              transcriptContentUrl: part.transcriptContentUrl,
                              session_id: currentSessionId,
                              meeting_notes: part.meeting_notes,
                              session_item_id: session_item_id,
                              meeting_name: part.meeting_name,
                              part: part,
                        }),
                  });

                  window.history.pushState({}, "", `/mom/${currentSessionId}`);
                  updateSidebarWithSession(currentSessionId, part.meeting_name);
                  document.querySelector(".link-input-container").style.display = "none";
                  document.querySelector(".model-select").style.display = "none";
                  appendChatbotMessage(part.meeting_notes, session_item_id, 0);
                  appendMeetingDetails(part.all_participants, part.embed_url);
            } else {
                  const transcriptStep = linkSteps.find((step) => step.id === "transcript");
                  const generateStep = linkSteps.find((step) => step.id === "generate");

                  showProgress([transcriptStep, generateStep]);

                  const success = await processSingleTranscript(part);

                  if (!success) {
                        goBackButton.classList.remove("hidden");
                        document.getElementById("partsContainer").classList.remove("hidden");
                  }
            }

            return; // Skip showing partsContainer
      }

      // Multiple parts — keep existing behavior
      const container = document.getElementById("partsContainer");
      container.innerHTML = "";
      container.classList.remove("hidden");

      parts.forEach((part, index) => {
            const partDiv = document.createElement("div");
            partDiv.className = "part-item";
            partDiv.innerHTML = `
                  <h3>Part-${index + 1}</h3>
                  <h4>${part.meeting_name}</h4>
                  <p>Created: ${new Date(part.createdDateTime).toLocaleString()}</p>
                  <button class="action-btn" data-index="${index}">
                        ${part.is_already_generated ? "Show Notes" : "Generate Meeting Notes"}
                  </button>
            `;
            container.appendChild(partDiv);
      });

      document.querySelectorAll(".action-btn").forEach((btn) => {
            btn.addEventListener("click", async (e) => {
                  const part = parts[e.target.dataset.index];
                  if (part.is_already_generated) {
                        session_item_id = generateSessionId();
                        currentSessionId = generateSessionId();

                        await fetch("/mom/create_session", {
                              method: "POST",
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify({
                                    transcriptContentUrl: part.transcriptContentUrl,
                                    session_id: currentSessionId,
                                    meeting_notes: part.meeting_notes,
                                    session_item_id: session_item_id,
                                    meeting_name: part.meeting_name,
                                    part: part,
                              }),
                        });

                        window.history.pushState({}, "", `/mom/${currentSessionId}`);
                        updateSidebarWithSession(currentSessionId, part.meeting_name);
                        document.querySelector(".link-input-container").style.display = "none";
                        document.querySelector(".model-select").style.display = "none";
                        appendChatbotMessage(part.meeting_notes, session_item_id, 0);
                        appendMeetingDetails(part.all_participants, part.embed_url);
                        return;
                  }

                  const transcriptStep = linkSteps.find((step) => step.id === "transcript");
                  const generateStep = linkSteps.find((step) => step.id === "generate");

                  showProgress([transcriptStep, generateStep]);

                  const success = await processSingleTranscript(part);

                  if (!success) {
                        goBackButton.classList.remove("hidden");
                        document.getElementById("partsContainer").classList.remove("hidden");
                  }
            });
      });
}

function generateSessionId() {
      return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function (c) {
            const r = (Math.random() * 16) | 0;
            const v = c === "x" ? r : (r & 0x3) | 0x8;
            return v.toString(16);
      });
}
async function processSingleTranscript(part) {
      const accessToken = await fetchAccessToken();
      if (!accessToken){
            return;
      }
      part['access_token'] = accessToken;
      try {
            const transcriptStepEl = document.getElementById("progress-transcript");
            transcriptStepEl.classList.add("active");

            const transcriptResponse = await fetch("/mom/fetch_transcript_content", {
                  method: "POST",
                  body: JSON.stringify(part),
                  headers: { "Content-Type": "application/json" },
            });

            const transcriptResult = await transcriptResponse.json();

            if (!transcriptResult.success) throw new Error("Transcript fetch failed");
            console.log(transcriptResult);
            transcriptStepEl.classList.remove("active");
            transcriptStepEl.classList.add("completed");

            const generateStepEl = document.getElementById("progress-generate");
            generateStepEl.classList.add("active");

            currentSessionId = generateSessionId();
            session_item_id = generateSessionId();

            const generateResponse = await fetch("/mom/generate_minutes", {
                  method: "POST",
                  body: JSON.stringify({
                        transcript_content: transcriptResult.transcript_content,
                        transcriptContentUrl: part.transcriptContentUrl,
                        model_name: getSelectedModel(),
                        session_id: currentSessionId,
                        session_item_id: session_item_id,
                        meeting_name: part.meeting_name,
                        part: part,
                  }),
                  headers: { "Content-Type": "application/json" },
            });

            const generateResult = await generateResponse.json();
            console.log(generateResult.meeting_notes);

            if (!generateResult.success) throw new Error("Minute generation failed");

            window.history.pushState({}, "", `/mom/${currentSessionId}`);
            updateSidebarWithSession(currentSessionId, part.meeting_name);
            document.querySelector(".link-input-container").style.display = "none";
            document.querySelector(".model-select").style.display = "none";
            appendChatbotMessage(generateResult.meeting_notes, session_item_id, 0);
            appendMeetingDetails(part.all_participants, part.embed_url);

            generateStepEl.classList.remove("active");
            generateStepEl.classList.add("completed");

            return true;
      } catch (error) {
            console.error(error);
            document.querySelectorAll(".progress-item.active").forEach((el) => {
                  el.classList.remove("active");
                  el.classList.add("failed");
            });
            return false;
      }
}
function appendMeetingDetails(all_participants, embed_url) {
      const leftContainer = document.getElementById("notesLeft");
      let htmlContent = "";
      console.log(embed_url);
      if (embed_url) {
            htmlContent += `
                <div class="video-container">
                    <iframe src="${embed_url}" width="500" height="300" frameborder="0" scrolling="no" allowfullscreen></iframe>
                </div>
            `;
      }
      console.log(all_participants);
      if (all_participants && all_participants.length > 0) {
            htmlContent += `
                <div class="participants-container">
                    <div class="participants-title-text">Participants</div>
                    <ul class="participants-list">
                        ${all_participants
                              .map(
                                    (participant) => `
                            <li class="participant-item" title="${participant.email}">
                                ${participant.profile_picture_path !== "[NOT AVAILABLE]" ? `<img src="${participant.profile_picture_path}" alt="${participant.displayName}" class="participant-icon" />` : `<div class="ms-avatar-placeholder">${participant.displayName[0]}</div>`}
                                <span class="participant-name">${participant.displayName}</span>
                            </li>
                        `
                              )
                              .join("")}
                    </ul>
                </div>
            `;
      }
      leftContainer.innerHTML = htmlContent;
}

function appendChatbotMessage(content, session_item_id, feedback) {
      const chatContainer = document.getElementById("notesRight");
      chatContainer.innerHTML = "";

      const messageContainer = document.createElement("div");
      messageContainer.classList.add("chatbot-message-container");

      const messageContentWrapper = document.createElement("div");
      messageContentWrapper.classList.add("chatbot-message", "message");

      const textContentContainer = document.createElement("div");
      textContentContainer.classList.add("text-content-container");

      if (content) {
            textContentContainer.innerHTML = marked.parse(content);
      }

      const buttonContainer = document.createElement("div");
      buttonContainer.classList.add("button-container");

      const copyButton = document.createElement("button");
      copyButton.classList.add("copy-button");
      copyButton.id = "tooltipButton";

      const copyIcon = document.createElement("img");
      copyIcon.src = "/static/images/copy-icon.svg";
      copyIcon.alt = "Copy";
      copyIcon.classList.add("icon");
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
                        copyIcon.src = "/static/images/tick.svg";
                        copyButton.title = "Copied!";
                        setTimeout(() => {
                              copyIcon.src = "/static/images/copy-icon.svg";
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
      likeIcon.src = "/static/images/like-icon.svg";
      likeIcon.alt = "Like";
      likeIcon.classList.add("icon");
      likeButton.appendChild(likeIcon);

      const likeTooltip = document.createElement("div");
      likeTooltip.classList.add("tooltip");
      likeTooltip.textContent = "Good response";
      likeButton.appendChild(likeTooltip);

      likeButton.addEventListener("click", () => {
            likeIcon.src = "/static/images/tick.svg";
            likeButton.title = "Liked";
            dislikeIcon.src = "/static/images/dislike-icon.svg";
            dislikeButton.title = "";
            sendFeedback(1);
      });

      const dislikeButton = document.createElement("button");
      dislikeButton.classList.add("dislike-button");
      dislikeButton.id = "tooltipButton";

      const dislikeIcon = document.createElement("img");
      dislikeIcon.src = "/static/images/dislike-icon.svg";
      dislikeIcon.alt = "Dislike";
      dislikeIcon.classList.add("icon");
      dislikeButton.appendChild(dislikeIcon);

      const dislikeTooltip = document.createElement("div");
      dislikeTooltip.classList.add("tooltip");
      dislikeTooltip.textContent = "Bad response";
      dislikeButton.appendChild(dislikeTooltip);

      dislikeButton.addEventListener("click", () => {
            dislikeIcon.src = "/static/images/tick.svg";
            dislikeButton.title = "Disliked";
            likeIcon.src = "/static/images/like-icon.svg";
            likeButton.title = "";
            sendFeedback(-1);
      });

      // ✅ Handle initial feedback state
      if (feedback === 1) {
            likeIcon.src = "/static/images/tick.svg";
            likeButton.title = "Liked";
            dislikeIcon.src = "/static/images/dislike-icon.svg";
            dislikeButton.title = "";
      } else if (feedback === -1) {
            dislikeIcon.src = "/static/images/tick.svg";
            dislikeButton.title = "Disliked";
            likeIcon.src = "/static/images/like-icon.svg";
            likeButton.title = "";
      } else {
            // Default icons already set above
            likeIcon.src = "/static/images/like-icon.svg";
            dislikeIcon.src = "/static/images/dislike-icon.svg";
            likeButton.title = "";
            dislikeButton.title = "";
      }

      buttonContainer.appendChild(copyButton);
      buttonContainer.appendChild(likeButton);
      buttonContainer.appendChild(dislikeButton);

      messageContentWrapper.appendChild(textContentContainer);
      messageContainer.appendChild(buttonContainer);
      messageContainer.appendChild(messageContentWrapper);
      // messageContainer.appendChild(typingCursorWrapper);
      chatContainer.appendChild(messageContainer);
}

function resetForm() {
      document.getElementById('momSlidesContainer').style.display = 'flex';
      // Reset form state
      sharepointLink.value = "";
      fileUpload.value = "";
      currentFile = null;
      currentSteps = [];

      // Hide progress and file info
      progressContainer.classList.add("hidden");
      fileInfo.classList.add("hidden");
      goBackButton.classList.add("hidden");

      // Reset button
      sendButton.disabled = false;

      // Clear progress items
      progressItems.innerHTML = "";
}
let currentSlide = 0;
  let slides = document.querySelectorAll('.slide');
  let dots = document.querySelectorAll('.dot');
  let slideInterval;

  function showSlide(index) {
    slides.forEach((slide, i) => {
      slide.style.display = i === index ? 'block' : 'none';
      dots[i].classList.toggle('active', i === index);
    });
    currentSlide = index;
  }

  function nextSlide() {
    let next = (currentSlide + 1) % slides.length;
    showSlide(next);
  }

  function startAutoScroll() {
    clearInterval(slideInterval);
    slideInterval = setInterval(nextSlide, 4000);
  }

  function goToSlide(index) {
    showSlide(index);
    startAutoScroll(); // restart auto-scroll on dot click
  }

  // Initial display and start scrolling
  showSlide(currentSlide);
  startAutoScroll();