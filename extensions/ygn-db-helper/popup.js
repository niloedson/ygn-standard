/**
 * @file popup.js
 * @description Controller for the YGN Dueling Book Helper popup UI.
 */

document.addEventListener('DOMContentLoaded', () => {
  const chainSelect = document.getElementById('chainFormatSelect');
  const visSelect = document.getElementById('visibilitySelect');
  const btnExport = document.getElementById('btnExport');
  const statusText = document.getElementById('statusText');

  // Load saved preferences
  if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.sync) {
    chrome.storage.sync.get(['chainFormat', 'visibility'], (items) => {
      if (items.chainFormat) chainSelect.value = items.chainFormat;
      if (items.visibility) visSelect.value = items.visibility;
    });

    // Check status on current active tab
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0] && tabs[0].url && tabs[0].url.includes('duelingbook.com')) {
        chrome.tabs.sendMessage(tabs[0].id, { action: 'get_status' }, (response) => {
          if (chrome.runtime.lastError || !response) {
            statusText.innerText = 'Connected (Refresh page if needed)';
          } else if (response.hasDuelLog) {
            statusText.innerText = response.isReplay ? 'Replay Log Loaded' : 'Duel Log Active';
          } else {
            statusText.innerText = 'Waiting for duel moves...';
          }
        });
      } else {
        statusText.innerText = 'Dueling Book tab not active';
      }
    });
  }

  // Save changes automatically
  chainSelect.addEventListener('change', () => {
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.sync) {
      chrome.storage.sync.set({ chainFormat: chainSelect.value });
    }
  });

  visSelect.addEventListener('change', () => {
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.sync) {
      chrome.storage.sync.set({ visibility: visSelect.value });
    }
  });

  // Handle Export button click
  btnExport.addEventListener('click', () => {
    if (typeof chrome !== 'undefined' && chrome.tabs) {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs[0] && tabs[0].id) {
          chrome.tabs.sendMessage(tabs[0].id, { action: 'export_ygn' }, (response) => {
            if (chrome.runtime.lastError) {
              alert('Please open or refresh a Dueling Book tab first.');
            } else {
              window.close();
            }
          });
        }
      });
    }
  });
});
