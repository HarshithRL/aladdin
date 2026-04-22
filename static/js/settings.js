
const settingsPopup = document.querySelector('.settingsPopup');
const closePopupButton = document.getElementById('closePopup');
const tabs = document.querySelectorAll('.tab');
const contentPanels = document.querySelectorAll('.content-panel');
const memoriesList = document.getElementById('memoriesList');
const memoryWarning = document.getElementById('memoryWarning');
const newMemoryInput = document.getElementById('newMemoryInput');
const addMemoryButton = document.getElementById('addMemoryButton');
const deleteAllMemoriesButton = document.getElementById('deleteAllMemoriesButton');

// Memory Data
let memories = [];
const MEMORY_LIMIT = 30;


tabs.forEach(tab => {
    tab.addEventListener('click', () => {
        // Set active tab
        tabs.forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        
        // Show corresponding panel
        const panelId = `${tab.dataset.tab}-panel`;
        contentPanels.forEach(panel => {
            panel.classList.remove('active');
        });
        document.getElementById(panelId).classList.add('active');
        
        if (tab.dataset.tab === 'memory') {
            loadMemories();
        }
    });
});

addMemoryButton.addEventListener('click', addNewMemory);

deleteAllMemoriesButton.addEventListener('click', () => {
    if (confirm('Are you sure you want to delete all memories? This cannot be undone.')) {
        deleteAllMemories();
    }
});

// Functions
function loadMemories() {
    fetchAndSetUserPreferences();
    
    settingsPopup.style.display = 'flex';

    fetch('/user_memory/get_all_memories')
        .then(response => response.json())
        .then(data => {
            memories = data.memories || [];
            renderMemories();
            checkMemoryLimit();
        })
        .catch(error => {
            console.error('Error loading memories:', error);
        });
}

function renderMemories() {
    memoriesList.innerHTML = '';
    
    if (memories.length === 0) {
        memoriesList.innerHTML = '<p>No memories saved yet.</p>';
        return;
    }
    
    memories.forEach(memory => {
        const memoryItem = document.createElement('div');
        memoryItem.className = 'memory-item';
        memoryItem.dataset.id = memory.memory_id;
        
        // View mode
        const viewModeHtml = `
            <div class="memory-value">${escapeHtml(memory.memory_value)}</div>
            <div class="memory-actions">
                <button class="memory-action-btn memory-action-edit" title="Edit">
                    <img class="pencil-icon icon-svg" id="pencilIcon" src="/static/images/pencil.svg" />
                </button>
                <button class="memory-action-btn memory-action-delete" title="Delete">
                    <img class="trash-icon icon-svg" id="trashIcon" src="/static/images/trash-2.svg" />
                </button>
            </div>
        `;
        
        // Edit mode
        const editModeHtml = `
            <div class="memory-edit-form">
                <textarea class="add-memory-input edit-memory-input">${escapeHtml(memory.memory_value)}</textarea>
                <div class="memory-edit-actions">
                    <button class="button secondary-button cancel-edit-btn">Cancel</button>
                    <button class="button primary-button save-edit-btn">Save</button>
                </div>
            </div>
        `;
        
        memoryItem.innerHTML = viewModeHtml + editModeHtml;
        memoriesList.appendChild(memoryItem);
        
        // Add event listeners to the buttons
        const editBtn = memoryItem.querySelector('.memory-action-edit');
        const deleteBtn = memoryItem.querySelector('.memory-action-delete');
        const cancelEditBtn = memoryItem.querySelector('.cancel-edit-btn');
        const saveEditBtn = memoryItem.querySelector('.save-edit-btn');
        
        editBtn.addEventListener('click', () => {
            memoryItem.querySelector('.memory-value').style.display = 'none';
            memoryItem.querySelector('.memory-actions').style.display = 'none';
            memoryItem.querySelector('.memory-edit-form').style.display = 'block';
        });
        
        deleteBtn.addEventListener('click', () => {
            deleteMemory(memory.memory_id);
        });
        
        cancelEditBtn.addEventListener('click', () => {
            memoryItem.querySelector('.memory-value').style.display = 'block';
            memoryItem.querySelector('.memory-actions').style.display = 'flex';
            memoryItem.querySelector('.memory-edit-form').style.display = 'none';
        });
        
        saveEditBtn.addEventListener('click', () => {
            const newValue = memoryItem.querySelector('.edit-memory-input').value.trim();
            if (newValue) {
                editMemory(memory.memory_id, newValue);
            }
        });
    });
}

function checkMemoryLimit() {
    fetch('/user_memory/has_more_than_30_memories')
        .then(response => response.json())
        .then(data => {
            const isAtLimit = (memories.length >= MEMORY_LIMIT) || data.hasMoreThan30;
            memoryWarning.style.display = isAtLimit ? 'block' : 'none';
            addMemoryButton.disabled = isAtLimit;
        })
        .catch(error => {
            console.error('Error checking memory limit:', error);
        });
}

function addNewMemory() {
    const memoryValue = newMemoryInput.value.trim();
    if (!memoryValue) return;
    
    if (memories.length >= MEMORY_LIMIT) {
        alert('Memory limit reached! Please delete some memories to add new ones.');
        return;
    }
    
    fetch('/user_memory/add_memory', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ memory_value: memoryValue }),
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            newMemoryInput.value = '';
            loadMemories();
        } else {
            alert(data.error || 'Failed to add memory');
        }
    })
    .catch(error => {
        console.error('Error adding memory:', error);
    });
}

function editMemory(memoryId, newValue) {
    fetch('/user_memory/edit_memory', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ memory_id: memoryId, memory_value: newValue }),
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            loadMemories();
        } else {
            alert(data.error || 'Failed to edit memory');
        }
    })
    .catch(error => {
        console.error('Error editing memory:', error);
    });
}

function deleteMemory(memoryId) {
    if (confirm('Are you sure you want to delete this memory?')) {
        fetch('/user_memory/delete_memory', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ memory_id: memoryId }),
        })
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                loadMemories();
            } else {
                alert(data.error || 'Failed to delete memory');
            }
        })
        .catch(error => {
            console.error('Error deleting memory:', error);
        });
    }
}

function deleteAllMemories() {
    fetch('/user_memory/delete_all_memories', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            loadMemories();
        } else {
            alert(data.error || 'Failed to delete all memories');
        }
    })
    .catch(error => {
        console.error('Error deleting all memories:', error);
    });
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

renderMemories();
checkMemoryLimit();

// Fetch and set user preferences on settings open
async function fetchAndSetUserPreferences() {
    try {
        const response = await fetch('/settings/preferences');
        if (!response.ok) return;
        const prefs = await response.json();
        // Theme
        if (prefs.is_dark_mode_enabled !== undefined) {
            document.getElementById('themeSelect').value = prefs.is_dark_mode_enabled ? 'dark' : 'light';
        }
        // Emojis
        if (prefs.is_emojis_enabled !== undefined) {
            document.getElementById('toggleEmojis').checked = !!prefs.is_emojis_enabled;
        }
        // Acknowledgement
        if (prefs.is_acknowledgement_enabled !== undefined) {
            document.getElementById('toggleAcknowledge').checked = !!prefs.is_acknowledgement_enabled;
        }
    } catch (e) {
        // Optionally handle error
        console.log('Error fetching user preferences:', e);
    }
}
fetchAndSetUserPreferences();


// Select all elements with 'settings-button' class
const settingsButtons = document.querySelectorAll(".settings-button");

// Add a click event listener to each button
settingsButtons.forEach((button) => {
  button.addEventListener("click", () => {
    console.log("A settings button was clicked! 🎉");
    fetchAndSetUserPreferences();
    loadMemories();
    showSettingsCard();
  });
});


// Function to update theme preference
async function updateThemePreference(isDark) {
    try {
        const response = await fetch('/settings/theme', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ is_dark_mode_enabled: isDark })
        });
        const data = await response.json();
        if (response.ok && data.success) {
            console.log('Theme preference update success');
        } else {
            console.error('Theme preference update failed', data.error || data);
        }
    } catch (e) {
        console.error('Theme preference update failed', e);
    }
}

// Function to update emoji preference
async function updateEmojiPreference(isEnabled) {
    try {
        const response = await fetch('/settings/emojis', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ is_emojis_enabled: isEnabled })
        });
        const data = await response.json();
        if (response.ok && data.success) {
            console.log('Emoji preference update success');
        } else {
            console.error('Emoji preference update failed', data.error || data);
        }
    } catch (e) {
        console.error('Emoji preference update failed', e);
    }
}

// Function to update acknowledgment preference
async function updateAcknowledgmentPreference(isEnabled) {
    try {
        const response = await fetch('/settings/acknowledgments', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ is_acknowledgement_enabled: isEnabled })
        });
        const data = await response.json();
        if (response.ok && data.success) {
            console.log('Acknowledgment preference update success');
        } else {
            console.error('Acknowledgment preference update failed', data.error || data);
        }
    } catch (e) {
        console.error('Acknowledgment preference update failed', e);
    }
}
// Theme select
const themeSelect = document.getElementById('themeSelect');
if (themeSelect) {
    themeSelect.addEventListener('change', function () {
        const isDark = this.value === 'dark';
        document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light');
        const themeStylesheet = document.getElementById('theme-stylesheet');
        console.log(isDark)
        updateThemePreference(isDark); // Call the individual function for theme updates
        if (isDark){
            console.log("changed source to dark")
            themeStylesheet.href = "https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.11.1/styles/github-dark.min.css";
            themeStylesheet.removeAttribute('integrity');
        } else{
            console.log("changed source to light")
            themeStylesheet.href = "https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.11.1/styles/github.min.css";
            themeStylesheet.removeAttribute('integrity');
        }
    });
}

// Emojis toggle
const toggleEmojis = document.getElementById('toggleEmojis');
if (toggleEmojis) {
    toggleEmojis.addEventListener('change', function () {
        updateEmojiPreference(this.checked); // Call the individual function for emoji updates
    });
}

// Acknowledgment toggle
const toggleAcknowledge = document.getElementById('toggleAcknowledge');
if (toggleAcknowledge) {
    toggleAcknowledge.addEventListener('change', function () {
        updateAcknowledgmentPreference(this.checked); // Call the individual function for acknowledgment updates
    });
}
