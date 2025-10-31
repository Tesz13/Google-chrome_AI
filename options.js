// Load settings when page loads
document.addEventListener('DOMContentLoaded', async () => {
  await loadSettings();
  setupEventListeners();
});

// Load saved settings
async function loadSettings() {
  try {
    const result = await chrome.storage.sync.get([
      'enabled', 'filters', 'useAI', 'autoScan', 'imageModeration', 'trackingAnalysis'
    ]);
    
    // General settings (defaults ON)
    const enableProtection = result.enabled !== false;
    const imageModeration = result.imageModeration !== false;
    const trackingAnalysis = result.trackingAnalysis !== false;
    const useAI = result.useAI !== false;
    const autoScan = result.autoScan !== false;

    const enableCheckbox = document.getElementById('enable-protection');
    if (enableCheckbox) enableCheckbox.checked = enableProtection;

    const imgModCheckbox = document.getElementById('image-moderation');
    if (imgModCheckbox) imgModCheckbox.checked = imageModeration;

    const trackingCheckbox = document.getElementById('tracking-analysis');
    if (trackingCheckbox) trackingCheckbox.checked = trackingAnalysis;

    const useAICheckbox = document.getElementById('use-ai');
    if (useAICheckbox) useAICheckbox.checked = useAI;

    const autoScanCheckbox = document.getElementById('auto-scan');
    if (autoScanCheckbox) autoScanCheckbox.checked = autoScan;
    
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
        checkbox.checked = !!filters[type];
      }
    });

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
      if (type) filters[type] = !!checkbox.checked;
    });
    
    // General settings
    const enabled = document.getElementById('enable-protection')?.checked ?? true;
    const imageModeration = document.getElementById('image-moderation')?.checked ?? true;
    const trackingAnalysis = document.getElementById('tracking-analysis')?.checked ?? true;
    const useAI = document.getElementById('use-ai')?.checked ?? true;
    const autoScan = document.getElementById('auto-scan')?.checked ?? true;

    // Save to storage
    await chrome.storage.sync.set({
      enabled,
      filters,
      imageModeration,
      trackingAnalysis,
      useAI,
      autoScan
    });
    
    // Show success message
    showSuccessMessage();
    
    // Notify all tabs to reload settings
    const tabs = await chrome.tabs.query({});
    for (const tab of tabs) {
      try {
        await chrome.tabs.sendMessage(tab.id, { type: 'settings_updated' });
      } catch {
        // Tab might not have a content script (ignore)
      }
    }
    
  } catch (error) {
    console.error('Error saving settings:', error);
    alert('Failed to save settings. Please try again.');
  }
}

// Reset to default settings
async function resetSettings() {
  if (!confirm('Are you sure you want to reset all settings to defaults?')) return;
  
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
      autoScan: true,
      imageModeration: true,
      trackingAnalysis: true
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
    setTimeout(() => { message.style.display = 'none'; }, 3000);
  }
}

// Setup event listeners
function setupEventListeners() {
  // Save button
  const saveBtn = document.getElementById('save-btn');
  if (saveBtn) saveBtn.addEventListener('click', saveSettings);
  
  // Keyboard shortcut Ctrl+S / Cmd+S to save
  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 's') {
      e.preventDefault();
      saveSettings();
    }
  });
}