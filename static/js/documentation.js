// API Endpoints
const FILES_API = "/api/documentation/files"; // Fetch the file list
const CONTENT_API = "/api/documentation"; // Fetch markdown content

// DOM elements
const docList = document.getElementById("doc-list");
const markdownContainer = document.getElementById("markdown-container");
// Automatically activate the first sidebar item and load its content
function loadFileList() {
    fetch(FILES_API)
        .then(response => response.json())
        .then(files => {
            populateFileList(files);
            if (files.length > 0) {
                const firstFileLink = docList.querySelector("a");
                firstFileLink.classList.add("active"); // Make the first item active
                loadMarkdown(files[0]); // Automatically load the first file
            }
        })
        .catch(err => {
            console.error("Error fetching file list:", err);
            docList.innerHTML = "<li>Error loading file list.</li>";
        });
}

function populateFileList(files) {
    // Clear the existing list
    docList.innerHTML = "";

    files.forEach((file, index) => {
        const listItem = document.createElement("li");
        const link = document.createElement("a");

        link.textContent = file.replace(/\.md$/i, "");
        link.href = "#";
        link.className = index === 0 ? "active" : ""; // Set the first item as active by default

        link.onclick = (event) => {
            event.preventDefault();
            setActiveSidebar(link); // Set sidebar active class
            loadMarkdown(file); // Load the document
        };

        listItem.appendChild(link);
        docList.appendChild(listItem);
    });
}
// Helper function to toggle 'active' class in the sidebar
function setActiveSidebar(activeLink) {
    // Remove 'active' class from all links
    const links = docList.querySelectorAll("a");
    links.forEach(link => link.classList.remove("active"));

    // Add 'active' class to the clicked link
    activeLink.classList.add("active");
}
// DOM element for Table of Contents
const tocList = document.getElementById("toc-list");
function generateTOC() {
    // Clear the existing TOC
    tocList.innerHTML = "";

    // Find only the h1 and h2 headings inside the markdown container
    const headings = markdownContainer.querySelectorAll("h1, h2");

    headings.forEach((heading, index) => {
        // Ensure each heading has a unique ID
        if (!heading.id) {
            heading.id = `heading-${index}`;
        }

        // Create TOC div container for the link
        const tocItem = document.createElement("div");
        tocItem.className = "toc-item"; // Apply a class for styling
        if (index === 0) {
            tocItem.classList.add("active"); // Set the first item as active
        }

        // Create the clickable link
        const link = document.createElement("a");
        link.textContent = heading.textContent;
        link.href = `#${heading.id}`;
        link.onclick = (event) => {
            event.preventDefault();
            setActiveTOC(tocItem); // Update the active class in TOC
            heading.scrollIntoView({ behavior: "smooth" }); // Scroll to the selected heading
        };

        tocItem.appendChild(link);
        tocList.appendChild(tocItem);
    });
}

// Helper function to toggle 'active' class for TOC items
function setActiveTOC(activeDiv) {
    // Remove 'active' class from all TOC items
    const tocItems = tocList.querySelectorAll(".toc-item");
    tocItems.forEach(item => item.classList.remove("active"));

    // Add 'active' class to the clicked TOC item
    activeDiv.classList.add("active");
}

// Update loadMarkdown to also generate TOC after rendering
function loadMarkdown(filename) {
    fetch(`${CONTENT_API}/${filename}`)
        .then(response => response.json())
        .then(data => {
            if (data.content) {
                markdownContainer.innerHTML = marked.parse(data.content);
                generateTOC(); // Call TOC generation after rendering markdown
            } else {
                markdownContainer.innerHTML = `<p>Error: Could not load ${filename}</p>`;
                tocList.innerHTML = ""; // Clear TOC if error occurs
            }
        })
        .catch(err => {
            console.error("Error fetching markdown content:", err);
            markdownContainer.innerHTML = `<p>Error loading content for ${filename}</p>`;
            tocList.innerHTML = ""; // Clear TOC if error occurs
        });
}

// Initialize the app by loading the file list
loadFileList();
