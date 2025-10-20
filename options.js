// Load settings when page loads
document.addEventListener('DOMContentLoaded', async () => {
  await loadSettings();
  setupEventListeners();
});

// Load saved settings
async function loadSettings() {
  try {
    const result = await chrome.storage.sync.get(['enabled', 'filters', 'useAI', 'autoScan']);
    
    // Load filter checkboxes
    const filters = result.filters || {
      email: true,
      phone: true,
      ssn: true,
      credit_card: true,
      address: true,
      password: true,
      api_key: true
    };
    
    document.querySelectorAll('[data-type]').forEach(checkbox => {
      const type = checkbox.dataset.type;
      if (type && filters.hasOwnProperty(type)) {
        checkbox.checked = filters[type];
      }
    });
    
    // Load advanced settings
    const useAI = result.useAI !== false; // Default true
    const autoScan = result.autoScan !== false; // Default true
    
    const useAICheckbox = document.getElementById('use-ai');
    if (useAICheckbox) useAICheckbox.checked = useAI;
    
    const autoScanCheckbox = document.getElementById('auto-scan');
    if (autoScanCheckbox) autoScanCheckbox.checked = autoScan;
    
  } catch (error) {
    console.error('Error loading settings:', error);
  }
}

// Save settings
async function saveSettings() {
  try {
    // Get all filter states
    const filters = {};
    document.querySelectorAll('[data-type]').forEach(checkbox => {
      const type = checkbox.dataset.type;
      if (type) {
        filters[type] = checkbox.checked;
      }
    });
    
    // Get advanced settings
    const useAI = document.getElementById('use-ai')?.checked ?? true;
    const autoScan = document.getElementById('auto-scan')?.checked ?? true;
    
    // Save to storage
    await chrome.storage.sync.set({
      filters,
      useAI,
      autoScan
    });
    
    // Show success message
    showSuccessMessage();
    
    // Notify all tabs to reload settings
    const tabs = await chrome.tabs.query({});
    for (const tab of tabs) {
      try {
        await chrome.tabs.sendMessage(tab.id, {
          type: 'settings_updated'
        });
      } catch (error) {
        // Tab might not have content script loaded
      }
    }
    
  } catch (error) {
    console.error('Error saving settings:', error);
    alert('Failed to save settings. Please try again.');
  }
}

// Reset to default settings
async function resetSettings() {
  if (!confirm('Are you sure you want to reset all settings to defaults?')) {
    return;
  }
  
  try {
    const defaults = {
      enabled: true,
      filters: {
        email: true,
        phone: true,
        ssn: true,
        credit_card: true,
        address: true,
        password: true,
        api_key: true
      },
      useAI: true,
      autoScan: true
    };
    
    await chrome.storage.sync.set(defaults);
    
    // Reload the page to show default values
    window.location.reload();
    
  } catch (error) {
    console.error('Error resetting settings:', error);
    alert('Failed to reset settings. Please try again.');
  }
}

// Show success message
function showSuccessMessage() {
  const message = document.getElementById('success-message');
  if (message) {
    message.style.display = 'block';
    
    // Hide after 3 seconds
    setTimeout(() => {
      message.style.display = 'none';
    }, 3000);
  }
}

// Setup event listeners
function setupEventListeners() {
  // Save button
  const saveBtn = document.getElementById('save-btn');
  if (saveBtn) {
    saveBtn.addEventListener('click', saveSettings);
  }
  
  // Reset button
  const resetBtn = document.getElementById('reset-btn');
  if (resetBtn) {
    resetBtn.addEventListener('click', resetSettings);
  }
  
  // Auto-save on checkbox change
  document.querySelectorAll('input[type="checkbox"]').forEach(checkbox => {
    checkbox.addEventListener('change', () => {
      // Optional: Auto-save on every change
      // saveSettings();
    });
  });
}