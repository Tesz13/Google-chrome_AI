// Initialize popup state
document.addEventListener('DOMContentLoaded', async () => {
  await loadSettings();
  await updateStatus();
  setupEventListeners();
});

// Load saved settings from storage
async function loadSettings() {
  try {
    const result = await chrome.storage.sync.get(['enabled', 'filters']);
    
    // Set toggle state
    const enabledToggle = document.getElementById('enabled');
    if (enabledToggle) {
      enabledToggle.checked = result.enabled !== false; // Default to true
    }
    
    // Set filter checkboxes
    const filters = result.filters || {
      email: true,
      phone: true,
      ssn: true,
      credit_card: true,
      address: true,
      password: true,
      api_key: true
    };
    
    document.querySelectorAll('.filters input[type="checkbox"]').forEach(checkbox => {
      const type = checkbox.dataset.type;
      if (type && filters.hasOwnProperty(type)) {
        checkbox.checked = filters[type];
      }
    });
  } catch (error) {
    console.error('Error loading settings:', error);
  }
}

// Save settings to storage
async function saveSettings(settings) {
  try {
    await chrome.storage.sync.set(settings);
  } catch (error) {
    console.error('Error saving settings:', error);
  }
}

// Update status display
async function updateStatus() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    
    if (!tab || !tab.id) {
      showError('No active tab found');
      return;
    }
    
    // Send message to content script to get current status
    const response = await chrome.tabs.sendMessage(tab.id, { 
      type: 'get_status' 
    }).catch(() => null);
    
    if (response) {
      updatePIICount(response.maskedCount || 0);
      
      const statusElement = document.getElementById('status');
      if (statusElement) {
        if (response.initialized && response.enabled) {
          statusElement.textContent = 'Active';
          statusElement.className = 'status active';
        } else if (response.initialized && !response.enabled) {
          statusElement.textContent = 'Disabled';
          statusElement.className = 'status disabled';
        } else {
          statusElement.textContent = 'Initializing...';
          statusElement.className = 'status initializing';
        }
      }
    } else {
      // Content script might not be loaded yet
      const statusElement = document.getElementById('status');
      if (statusElement) {
        statusElement.textContent = 'Not loaded';
        statusElement.className = 'status error';
      }
    }
  } catch (error) {
    console.error('Error updating status:', error);
    showError('Failed to connect to page');
  }
}

// Update PII count display
function updatePIICount(count) {
  const countElement = document.getElementById('pii-count');
  if (countElement) {
    if (count === 0) {
      countElement.textContent = 'No PII detected';
    } else if (count === 1) {
      countElement.textContent = '1 PII item masked';
    } else {
      countElement.textContent = `${count} PII items masked`;
    }
  }
}

// Show error message
function showError(message) {
  const errorElement = document.getElementById('error-message');
  if (errorElement) {
    errorElement.textContent = message;
    errorElement.style.display = 'block';
    
    // Hide after 5 seconds
    setTimeout(() => {
      errorElement.style.display = 'none';
    }, 5000);
  }
}

// Setup all event listeners
function setupEventListeners() {
  // Main toggle switch
  const enabledToggle = document.getElementById('enabled');
  if (enabledToggle) {
    enabledToggle.addEventListener('change', async (e) => {
      const enabled = e.target.checked;
      
      try {
        // Save to storage
        await saveSettings({ enabled });
        
        // Send to content script
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (tab && tab.id) {
          await chrome.tabs.sendMessage(tab.id, {
            type: 'toggle',
            enabled: enabled
          });
          
          // Update status after toggle
          setTimeout(updateStatus, 500);
        }
      } catch (error) {
        console.error('Error toggling extension:', error);
        showError('Failed to toggle extension');
        // Revert toggle on error
        e.target.checked = !enabled;
      }
    });
  }
  
  // Filter checkboxes
  document.querySelectorAll('.filters input[type="checkbox"]').forEach(checkbox => {
    checkbox.addEventListener('change', async (e) => {
      const type = e.target.dataset.type;
      const enabled = e.target.checked;
      
      if (!type) return;
      
      try {
        // Load current filters
        const result = await chrome.storage.sync.get(['filters']);
        const filters = result.filters || {};
        
        // Update specific filter
        filters[type] = enabled;
        
        // Save updated filters
        await saveSettings({ filters });
        
        // Send to content script
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (tab && tab.id) {
          await chrome.tabs.sendMessage(tab.id, {
            type: 'filter_change',
            piiType: type,
            enabled: enabled
          });
          
          // Trigger rescan after filter change
          await chrome.tabs.sendMessage(tab.id, {
            type: 'rescan'
          });
        }
      } catch (error) {
        console.error('Error updating filter:', error);
        showError('Failed to update filter');
        // Revert checkbox on error
        e.target.checked = !enabled;
      }
    });
  });
  
  // Rescan button (if exists)
  const rescanButton = document.getElementById('rescan-btn');
  if (rescanButton) {
    rescanButton.addEventListener('click', async () => {
      rescanButton.disabled = true;
      rescanButton.textContent = 'Scanning...';
      
      try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (tab && tab.id) {
          await chrome.tabs.sendMessage(tab.id, {
            type: 'rescan'
          });
          
          // Wait a bit then update status
          setTimeout(async () => {
            await updateStatus();
            rescanButton.disabled = false;
            rescanButton.textContent = 'Rescan Page';
          }, 1000);
        }
      } catch (error) {
        console.error('Error rescanning:', error);
        showError('Failed to rescan page');
        rescanButton.disabled = false;
        rescanButton.textContent = 'Rescan Page';
      }
    });
  }
  
  // Settings/Options button (if exists)
  const settingsButton = document.getElementById('settings-btn');
  if (settingsButton) {
    settingsButton.addEventListener('click', () => {
      chrome.runtime.openOptionsPage();
    });
  }
  
  // Refresh status button (if exists)
  const refreshButton = document.getElementById('refresh-status-btn');
  if (refreshButton) {
    refreshButton.addEventListener('click', updateStatus);
  }
}

// Listen for messages from content script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === 'pii_count') {
    updatePIICount(request.count);
  } else if (request.type === 'status_update') {
    updateStatus();
  }
  
  sendResponse({ received: true });
});

// Refresh status periodically while popup is open
setInterval(updateStatus, 5000);