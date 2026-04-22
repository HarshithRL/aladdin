// ==================== DRAG AND DROP HANDLING ====================
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

function handleDragOver(event) {
      event.preventDefault();
      event.stopPropagation();

      // Show the overlay
      const overlay = document.getElementById("dragDropOverlay");
      if (overlay) {
            overlay.classList.add("active");
      }
}

function handleDragLeave(event) {
      event.preventDefault();
      event.stopPropagation();

      // Hide the overlay
      const overlay = document.getElementById("dragDropOverlay");
      if (overlay) {
            overlay.classList.remove("active");
      }
}

function handleDrop(event) {
      event.preventDefault();
      event.stopPropagation();

      // Hide the overlay
      const overlay = document.getElementById("dragDropOverlay");
      if (overlay) {
            overlay.classList.remove("active");
      }

      const files = Array.from(event.dataTransfer.files);
      if (files.length === 0) return;

      const imageFiles = files.filter((file) => file.type.startsWith("image/"));
      const validExtensions = /\.(pdf|doc|docx|xls|xlsx|csv|ppt|pptx|png|jpe?g|gif|webp)$/i;
      const acceptedFiles = files.filter((file) => validExtensions.test(file.name));

      // Handle image files using the existing paste-like logic
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

      // Handle non-image files
      const nonImageFiles = acceptedFiles.filter((file) => !file.type.startsWith("image/"));

      if (nonImageFiles.length > 0) {
            processUploadedFiles(nonImageFiles);
      }

      if (imageFiles.length === 0 && nonImageFiles.length === 0) {
            showNotification("Unsupported file type dropped.", "warning", 3);
      }
}
