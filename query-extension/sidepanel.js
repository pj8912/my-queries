// Default Configuration
const DEFAULTS = [
  { urlKey: 'chatgpt.com', className: 'whitespace-pre-wrap' },
  { urlKey: 'perplexity.ai', className: 'select-text' },
  { urlKey: 'gemini.google.com', className: 'query-text.gds-body-l' },
  { urlKey: 'gemini.google.com', className: 'query-text.gds-body-l'},
  { urlKey: 'chat.deepseek.com', className: 'fbb737a4'},
  { urlKey: 'kimi.com', className: 'user-content'}
];

document.addEventListener('DOMContentLoaded', async () => {
  const mainView = document.getElementById('main-view');
  const settingsView = document.getElementById('settings-view');
  const goToSettingsBtn = document.getElementById('go-to-settings');
  const backToMainBtn = document.getElementById('back-to-main');
  const addBtn = document.getElementById('add-btn');
  const refreshBtn = document.getElementById('refresh-btn');

  let settings = await loadSettings();
  renderSettings(settings);
  
  // Initial Fetch
  attemptAutoFetch(settings);

  // --- Event Listeners ---

  refreshBtn.addEventListener('click', () => {
    attemptAutoFetch(settings);
  });

  goToSettingsBtn.addEventListener('click', () => {
    mainView.classList.add('hidden');
    settingsView.classList.remove('hidden');
  });

  backToMainBtn.addEventListener('click', () => {
    settingsView.classList.add('hidden');
    mainView.classList.remove('hidden');
    // Reload settings in case they changed, then fetch
    loadSettings().then(newSettings => {
      settings = newSettings;
      attemptAutoFetch(settings);
    });
  });

  addBtn.addEventListener('click', () => {
    settings.push({ urlKey: '', className: '' });
    saveSettings(settings);
    renderSettings(settings);
  });
});

// --- Core Logic ---

async function attemptAutoFetch(settings) {
  const statusEl = document.getElementById('status');
  const listEl = document.getElementById('query-list');
  
  listEl.innerHTML = '';
  statusEl.textContent = "Detecting website...";

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  if (!tab || !tab.url) {
    statusEl.textContent = "No active tab detected.";
    return;
  }

  // Find a match in settings
  const match = settings.find(site => tab.url.includes(site.urlKey) && site.urlKey.trim() !== '');

  if (match) {
    statusEl.textContent = `Match found: ${match.urlKey}`;
    fetchMessages(tab.id, match.className);
  } else {
    statusEl.textContent = "No config found for this URL. Check Settings.";
  }
}

function fetchMessages(tabId, className) {
  const listEl = document.getElementById('query-list');
  const statusEl = document.getElementById('status');

  chrome.scripting.executeScript({
    target: { tabId: tabId },
    function: scrapeChatsFromPage, // Updates page DOM with IDs and returns data
    args: [className]
  }, (results) => {
    if (chrome.runtime.lastError || !results || !results[0]) {
      statusEl.textContent = "Error: Could not access page content.";
      return;
    }

    const messages = results[0].result;
    
    if (messages.length === 0) {
      statusEl.textContent = "No messages found.";
    } else {
      statusEl.textContent = `Found ${messages.length} queries.`;
    }

    messages.forEach(item => {
      const li = document.createElement('li');
      li.className = 'query-item';
      li.textContent = item.text;
      li.style.cursor="pointer"
      li.style.wordBreak="break-all"
      li.setAttribute("title", "Got to Chat")
      
      // Add click listener to scroll to element
      li.addEventListener('click', () => {
        scrollToElementInPage(tabId, item.id);
      });
      
      listEl.appendChild(li);
    });
  });
}

function scrollToElementInPage(tabId, elementId) {
  chrome.scripting.executeScript({
    target: { tabId: tabId },
    func: (id) => {
      const el = document.getElementById(id);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        // Optional: Highlight effect
        el.style.transition = "background-color 0.5s";
        const originalBg = el.style.backgroundColor;
        el.style.backgroundColor = "#ffffcc"; // Light yellow highlight
        setTimeout(() => { el.style.backgroundColor = originalBg; }, 1500);
      }
    },
    args: [elementId]
  });
}

// --- Settings Management ---

async function loadSettings() {
  const data = await chrome.storage.sync.get('scraperSettings');
  if (data.scraperSettings) {
    return data.scraperSettings;
  } else {
    // Re-declare defaults here to ensure scope access
    const defaults = [
      { urlKey: 'chatgpt.com', className: 'whitespace-pre-wrap' },
      { urlKey: 'perplexity.ai', className: 'select-text' },
      { urlKey: 'gemini.google.com', className: 'query-text.gds-body-l'},
      { urlKey: 'chat.deepseek.com', className: 'fbb737a4'},
      { urlKey: 'kimi.com', className: 'user-content'}
    ];
    await chrome.storage.sync.set({ scraperSettings: defaults });
    return defaults;
  }
}

async function saveSettings(newSettings) {
  await chrome.storage.sync.set({ scraperSettings: newSettings });
}

function renderSettings(settings) {
  const container = document.getElementById('settings-list');
  container.innerHTML = '';

  settings.forEach((site, index) => {
    const row = document.createElement('div');
    row.className = 'setting-row';

    // Inputs
    const urlInput = document.createElement('input');
    urlInput.placeholder = "URL part (e.g. chatgpt.com)";
    urlInput.value = site.urlKey;

    const classInput = document.createElement('input');
    classInput.placeholder = "Class name (e.g. whitespace-pre-wrap)";
    classInput.value = site.className;

    // Save on change
    const updateHandler = () => {
      settings[index].urlKey = urlInput.value.trim();
      settings[index].className = classInput.value.trim();
      saveSettings(settings);
    };
    urlInput.addEventListener('input', updateHandler);
    classInput.addEventListener('input', updateHandler);

    // Delete Button
    const actions = document.createElement('div');
    actions.className = 'setting-actions';
    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'delete-btn';
    deleteBtn.textContent = 'Remove';
    deleteBtn.onclick = () => {
      settings.splice(index, 1);
      saveSettings(settings);
      renderSettings(settings);
    };

    actions.appendChild(deleteBtn);
    row.appendChild(urlInput);
    row.appendChild(classInput);
    row.appendChild(actions);
    container.appendChild(row);
  });
}

// --- In-Page Script ---
// This function runs inside the tab context
function scrapeChatsFromPage(className) {
  try {
    
    const selector = className.startsWith('.') ? className : '.' + className;
    // const selector = '.' + className;
    const elements = document.querySelectorAll(selector);
    const data = [];

    elements.forEach((el, index) => {
      const text = el.innerText.trim();
      if (text) {
        // Generate a unique ID for this session so we can find it later
        // We use a prefix to avoid clashing with existing site IDs
        const uniqueId = 'ext-scraper-' + index + '-' + Date.now();
        el.setAttribute('id', uniqueId);
        
        data.push({
          text: text,
          id: uniqueId
        });
      }
    });

    return data;
  } catch (e) {
    return [];
  }
}
