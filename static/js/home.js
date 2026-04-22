// Hide loader when page loads
document.addEventListener('DOMContentLoaded', function() {
    setTimeout(() => {
        const loaderContainer = document.querySelector('.loader-container');
        if (loaderContainer) {
            loaderContainer.style.display = 'none';
        }
    }, 1000);
});

// Feature cards are now anchor links, so no need for click handlers

// Populate recent sessions
async function populateRecentSessions() {
    const sessionsGrid = document.querySelector('.sessions-grid');
    
    try {
        // Fetch actual session data from API
        const response = await fetch('/sidebar/get_all_sessions_and_projects', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ app_name: 'relaychat' })
        });
        
        if (!response.ok) {
            throw new Error('Failed to fetch sessions');
        }
        
        const data = await response.json();
        
        // Combine ungrouped sessions and grouped sessions
        let allSessions = [];
        
        // Add ungrouped sessions
        if (data.ungrouped_sessions) {
            allSessions = allSessions.concat(data.ungrouped_sessions);
        }
        
        // Add grouped sessions
        if (data.grouped_sessions) {
            for (const groupName in data.grouped_sessions) {
                const groupData = data.grouped_sessions[groupName];
                if (groupData.sessions) {
                    allSessions = allSessions.concat(groupData.sessions);
                }
            }
        }
        
        // Sort by last updated date (most recent first) and take first 5
        allSessions.sort((a, b) => {
            const dateA = new Date(a.session_last_updated_date);
            const dateB = new Date(b.session_last_updated_date);
            return dateB - dateA;
        });
        
        const recentSessions = allSessions.slice(0, 5);
        
        // Clear existing content
        sessionsGrid.innerHTML = '';
        
        if (recentSessions.length === 0) {
            // Show message when no sessions exist
            sessionsGrid.innerHTML = `
                <div class="no-sessions-message" style="text-align: center; padding: 20px; color: #666;">
                    <p>No recent sessions found. Start a new conversation!</p>
                </div>
            `;
            return;
        }
        
        // Create session items
        recentSessions.forEach((session, index) => {
            const sessionItem = document.createElement('div');
            sessionItem.className = 'session-item';
            
            // Format the session name (truncate if too long)
            const sessionName = session.session_name && session.session_name.length > 50 
                ? session.session_name.substring(0, 50) + '...' 
                : session.session_name || 'Untitled Session';
            
            // Format the date
            const sessionDate = session.session_last_updated_date 
                ? new Date(session.session_last_updated_date).toLocaleDateString() 
                : 'Unknown date';
            
            sessionItem.innerHTML = `
                <div class="session-left">
                    <img src="/static/images/lucide_icons/history.svg" alt="History" class="session-icon">
                    <div class="session-info">
                        <span class="session-text">${sessionName}</span>
                        <span class="session-date">${sessionDate}</span>
                    </div>
                </div>
                <div class="session-right">
                    <img src="/static/images/lucide_icons/chevron-right.svg" alt="View" class="session-action">
                    <div class="session-delete" onclick="deleteSession('${session.session_id}', ${index})">
                        <img src="/static/images/lucide_icons/trash-2.svg" alt="Delete">
                    </div>
                </div>
            `;
            
            // Add click handler for viewing session
            sessionItem.addEventListener('click', function(e) {
                if (!e.target.closest('.session-delete')) {
                    // Navigate to chat with this session
                    window.location.href = `/relaychat/${session.session_id}`;
                }
            });
            
            sessionsGrid.appendChild(sessionItem);
        });
        
    } catch (error) {
        console.error('Error fetching sessions:', error);
        // Show error message
        sessionsGrid.innerHTML = `
            <div class="error-message" style="text-align: center; padding: 20px; color: #ff4444;">
                <p>Failed to load recent sessions. Please try again.</p>
            </div>
        `;
    }
}

// Delete session function
async function deleteSession(sessionId, index) {
    event.stopPropagation();
    
    try {
        // Make API call to delete the session
        const response = await fetch('/sidebar/delete_session', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ session_id: sessionId })
        });
        
        if (response.ok) {
            // Remove the session item from DOM
            const sessionItems = document.querySelectorAll('.session-item');
            if (sessionItems[index]) {
                sessionItems[index].remove();
            }
            console.log(`Session ${sessionId} deleted successfully`);
        } else {
            console.error('Failed to delete session');
        }
    } catch (error) {
        console.error('Error deleting session:', error);
    }
}

// Make sidebar navigation functional
document.addEventListener('DOMContentLoaded', function() {
    const navIcons = document.querySelectorAll('.nav-icon');
    
    navIcons.forEach((icon, index) => {
        icon.addEventListener('click', function() {
            // Remove active class from all icons
            navIcons.forEach(i => i.classList.remove('active'));
            
            // Add active class to clicked icon
            icon.classList.add('active');
            
            // Handle navigation based on icon index
            switch(index) {
                case 0: // Home
                    window.location.href = '/';
                    break;
                case 1: // Folder
                    // Navigate to folder/projects
                    break;
                case 2: // Send/Export
                    // Handle export functionality
                    break;
                case 3: // Plus
                    // Handle new session
                    window.location.href = 'http://localhost:00/relaychat/';
                    break;
                case 4: // Settings
                    window.location.href = '/settings';
                    break;
                case 5: // User
                    // Handle user profile
                    break;
            }
        });
    });
    
    // Set home icon as active by default
    const homeIcon = document.querySelector('.nav-icon');
    if (homeIcon) {
        homeIcon.classList.add('active');
    }
});

// Initialize page
document.addEventListener('DOMContentLoaded', function() {
    populateRecentSessions();
});

// Function to render feature cards
function renderCard(gridId, id, title, description, link, isBookmarked, icon) {
    const grid = document.getElementById(gridId);
    const cardHTML = `
        <div class="card-container">
            <a href="${link}" class="feature-card" id="${id}">
                <div class="card-bookmark">
                    <img src="${isBookmarked ? "/static/images/lucide_icons/bookmark-check.svg" : "/static/images/lucide_icons/bookmark.svg"}" 
                         alt="Bookmark" 
                         class="icon-svg" 
                         data-link="${link}" 
                         app-id="${id}"
                         data-bookmarked="${isBookmarked}">
                </div>
                <div class="card-icon-wrapper">
                    <div class="card-icon">
                        <img src="/static/images/${icon}" alt="${title}" class="icon-svg">
                    </div>
                </div>
                <div class="card-tag">Service Point</div>
                <h3 class="card-title">${title}</h3>
                <p class="card-description">${description}</p>
            </a>
        </div>
    `;

    grid.innerHTML += cardHTML;
}

// Fetch all cards and render them
function loadAllCards() {
    fetch("/get_all_cards")
        .then((response) => response.json())
        .then((apps) => {
            const appsGrid = document.getElementById("appsGrid");
            appsGrid.innerHTML = ''; // Clear existing content
            
            apps.forEach((app) => {
                document.querySelector(".loader-container").style.display = "none";
                renderCard(
                    "appsGrid", // gridId: The id of the grid element
                    app.app_id, // id: Unique app_id
                    app.app_title, // title: The title of the app
                    app.app_description || "", // description: App description (empty string if not available)
                    app.app_link, // link: The app link
                    app.is_bookmarked === 'True' || app.is_bookmarked === true, // isBookmarked: Convert string/boolean to boolean
                    app.app_icon // icon: The icon for the app
                );
            });
        })
        .catch((error) => console.error("Error fetching apps:", error));
}

// Fetch all bookmarked cards and render them
function loadBookmarkedCards() {
    fetch("/get_bookmarked_cards")
        .then((response) => response.json())
        .then((apps) => {
            const bookmarkedGrid = document.getElementById("bookmarkedAppsGrid");
            bookmarkedGrid.innerHTML = ''; // Clear existing content
            
            if (apps.length > 0) {
                apps.forEach((app) => {
                    document.querySelector(".loader").style.display = "none";
                    document.querySelector(".bookmarked-section").style.display = "block";
                    document.querySelector(".separator-line-apps").style.display = "block";
                    renderCard(
                        "bookmarkedAppsGrid", // gridId: The id of the grid element
                        app.app_id, // id: Unique app_id
                        app.app_title, // title: The title of the app
                        app.app_description || "", // description: App description (empty string if not available)
                        app.app_link, // link: The app link
                        true, // isBookmarked: Always true for bookmarked apps
                        app.app_icon // icon: The icon for the app
                    );
                });
            } else {
                document.querySelector(".bookmarked-section").style.display = "none";
                document.querySelector(".separator-line-apps").style.display = "none";
            }
        })
        .catch((error) => console.error("Error fetching bookmarked apps:", error));
}

// Function to handle bookmark clicks
document.addEventListener("click", function (event) {
    if (event.target.classList.contains("icon-svg") && 
        event.target.closest('.card-bookmark')) {
        event.preventDefault(); // Prevent default navigation
        event.stopPropagation(); // Stop event bubbling

        const bookmarkIcon = event.target;
        const app_id = bookmarkIcon.getAttribute("app-id");
        const isCurrentlyBookmarked = bookmarkIcon.getAttribute("data-bookmarked") === "true";
        const url = isCurrentlyBookmarked ? "/remove_bookmark" : "/add_bookmark";

        fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ app_id: app_id }),
        })
            .then((response) => response.json())
            .then((data) => {
                if (data.success) {
                    // Get all bookmark icons with the same app_id
                    const allIcons = document.querySelectorAll(`[app-id="${app_id}"] img`);

                    if (isCurrentlyBookmarked) {
                        // Update all icons to unbookmarked
                        allIcons.forEach((icon) => {
                            icon.setAttribute("data-bookmarked", "false");
                            icon.src = "/static/images/lucide_icons/bookmark.svg";
                        });

                        // Remove from bookmarked section
                        const bookmarkedGrid = document.getElementById("bookmarkedAppsGrid");
                        const bookmarkedCards = bookmarkedGrid.querySelectorAll(`#${app_id}`);

                        bookmarkedCards.forEach((card) => {
                            const cardContainer = card.closest(".card-container");
                            if (cardContainer) {
                                cardContainer.remove();
                            }
                        });

                        // Hide the bookmarked section if it's empty
                        if (bookmarkedGrid.children.length === 0) {
                            document.querySelector(".bookmarked-section").style.display = "none";
                            document.querySelector(".separator-line-apps").style.display = "none";
                        }
                    } else {
                        // Update all icons to bookmarked
                        allIcons.forEach((icon) => {
                            icon.setAttribute("data-bookmarked", "true");
                            icon.src = "/static/images/lucide_icons/bookmark-check.svg";
                        });

                        // Clone and add to bookmarked section
                        const bookmarkedGrid = document.getElementById("bookmarkedAppsGrid");
                        const originalCard = document.getElementById(app_id);
                        if (originalCard) {
                            const clonedCardContainer = document.createElement("div");
                            clonedCardContainer.classList.add("card-container");
                            clonedCardContainer.appendChild(originalCard.cloneNode(true));

                            // Ensure the bookmark icon in the cloned card is also set to bookmarked
                            const clonedBookmarkIcon = clonedCardContainer.querySelector(".bookmark-icon img");
                            clonedBookmarkIcon.setAttribute("data-bookmarked", "true");
                            clonedBookmarkIcon.src = "/static/images/lucide_icons/bookmark-check.svg";

                            bookmarkedGrid.appendChild(clonedCardContainer);
                        }

                        // Show the bookmarked section if it's hidden
                        document.querySelector(".bookmarked-section").style.display = "block";
                        document.querySelector(".separator-line-apps").style.display = "block";
                    }
                } else {
                    console.error("Error updating bookmark:", data.error);
                }
            })
            .catch((error) => console.error("Request failed:", error));
    }
});

// Load cards when page loads
document.addEventListener('DOMContentLoaded', function() {
    loadAllCards();
    loadBookmarkedCards();
});
