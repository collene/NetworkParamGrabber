// background.js
const requests = [];
const MAX_REQUESTS = 100;
let isCapturing = true;

chrome.webRequest.onBeforeRequest.addListener(
  (details) => {
    // Skip if capturing is paused
    if (!isCapturing) {
      return;
    }
    
    const url = new URL(details.url);
    const params = {};
    
    // Extract URL parameters
    url.searchParams.forEach((value, key) => {
      params[key] = value;
    });
    
    // Extract POST data if available
    let postData = null;
    if (details.method === 'POST' && details.requestBody) {
      if (details.requestBody.formData) {
        postData = details.requestBody.formData;
      } else if (details.requestBody.raw) {
        try {
          const decoded = new TextDecoder().decode(details.requestBody.raw[0].bytes);
          postData = decoded;
        } catch (e) {
          postData = 'Binary data';
        }
      }
    }
    
    const requestData = {
      id: details.requestId,
      url: details.url,
      method: details.method,
      timestamp: new Date().toISOString(),
      urlParams: params,
      postData: postData,
      type: details.type,
      tabId: details.tabId,
      headers: {} // Will be populated by onSendHeaders
    };
    
    requests.unshift(requestData);
    if (requests.length > MAX_REQUESTS) {
      requests.pop();
    }
    
    chrome.storage.local.set({ requests });
  },
  { urls: ["<all_urls>"] },
  ["requestBody"]
);

chrome.webRequest.onSendHeaders.addListener(
  (details) => {
    // Skip if capturing is paused
    if (!isCapturing) {
      return;
    }
    
    // Find the matching request and add headers
    const request = requests.find(r => r.id === details.requestId);
    if (request && details.requestHeaders) {
      details.requestHeaders.forEach(header => {
        request.headers[header.name.toLowerCase()] = header.value;
      });
      chrome.storage.local.set({ requests });
    }
  },
  { urls: ["<all_urls>"] },
  ["requestHeaders"]
);

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'getRequests') {
    sendResponse({ requests, isCapturing });
  } else if (request.action === 'clearRequests') {
    if (request.tabId) {
      // Clear only requests from specific tab
      const initialLength = requests.length;
      for (let i = requests.length - 1; i >= 0; i--) {
        if (requests[i].tabId === request.tabId) {
          requests.splice(i, 1);
        }
      }
    } else {
      // Clear all requests
      requests.length = 0;
    }
    chrome.storage.local.set({ requests: [] });
    sendResponse({ success: true });
  } else if (request.action === 'getTabs') {
    chrome.tabs.query({}, (tabs) => {
      sendResponse({ tabs });
    });
    return true;
  } else if (request.action === 'getParamValue') {
    const paramName = request.paramName;
    const value = getLatestParamValue(paramName);
    sendResponse({ value });
  } else if (request.action === 'toggleCapture') {
    isCapturing = !isCapturing;
    sendResponse({ isCapturing });
  } else if (request.action === 'getCapturingStatus') {
    sendResponse({ isCapturing });
  } else if (request.action === 'getSelectedValue') {
    // This will be called from content script context menu
    const paramName = request.paramName;
    sendResponse({ value: null }); // Will be handled by popup
  }
  return true;
});

// Helper function to get the latest value for a parameter
function getLatestParamValue(paramName) {
  for (let req of requests) {
    // Check URL parameters
    if (req.urlParams && req.urlParams[paramName]) {
      return req.urlParams[paramName];
    }
    
    // Check headers
    if (req.headers) {
      if (req.headers[paramName.toLowerCase()]) {
        return req.headers[paramName.toLowerCase()];
      }
      
      // Special handling for bearer/token
      const lowerParam = paramName.toLowerCase();
      if ((lowerParam === 'bearer' || lowerParam === 'token') && req.headers['authorization']) {
        const authHeader = req.headers['authorization'];
        const bearerMatch = authHeader.match(/Bearer\s+(.+)/i);
        if (bearerMatch) {
          return bearerMatch[1];
        }
        return authHeader;
      }
    }
    
    // Check POST data
    if (req.postData) {
      if (typeof req.postData === 'object' && req.postData[paramName]) {
        return Array.isArray(req.postData[paramName]) 
          ? req.postData[paramName][0] 
          : req.postData[paramName];
      } else if (typeof req.postData === 'string') {
        try {
          const parsed = JSON.parse(req.postData);
          if (parsed[paramName]) {
            return parsed[paramName];
          }
        } catch (e) {
          const regex = new RegExp(`[?&]?${paramName}=([^&]*)`, 'i');
          const match = req.postData.match(regex);
          if (match && match[1]) {
            return decodeURIComponent(match[1]);
          }
        }
      }
    }
  }
  
  return null;
}

// Create context menus when extension is installed or updated
chrome.runtime.onInstalled.addListener(() => {
  updateContextMenus();
});

// Update context menus based on watched parameters
function updateContextMenus() {
  chrome.contextMenus.removeAll(() => {
    // Create parent menu
    chrome.contextMenus.create({
      id: 'networkGrabberParent',
      title: 'Network Grabber',
      contexts: ['editable']
    });
    
    // Load watched parameters and create submenus
    chrome.storage.local.get(['watchedParams'], (result) => {
      const watchedParams = result.watchedParams || [];
      
      if (watchedParams.length === 0) {
        chrome.contextMenus.create({
          id: 'noParams',
          parentId: 'networkGrabberParent',
          title: 'No parameters configured',
          contexts: ['editable'],
          enabled: false
        });
      } else {
        watchedParams.forEach(param => {
          chrome.contextMenus.create({
            id: `paste_${param}`,
            parentId: 'networkGrabberParent',
            title: `Paste ${param}`,
            contexts: ['editable']
          });
        });
      }
    });
  });
}

// Handle context menu clicks
chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId.startsWith('paste_')) {
    const paramName = info.menuItemId.replace('paste_', '');
    
    // Get selected value from storage
    chrome.storage.local.get(['selectedValues'], (result) => {
      const selectedValues = result.selectedValues || {};
      let value = selectedValues[paramName];
      
      // If no selected value, fall back to latest
      if (!value) {
        value = getLatestParamValue(paramName);
      }
      
      if (value) {
        // Send message to content script to paste the value
        chrome.tabs.sendMessage(tab.id, {
          action: 'pasteValue',
          value: value
        });
      } else {
        // Show notification if no value found
        chrome.tabs.sendMessage(tab.id, {
          action: 'showNotification',
          message: `No value found for parameter: ${paramName}`
        });
      }
    });
  }
});

// Listen for storage changes to update context menus
chrome.storage.onChanged.addListener((changes, namespace) => {
  if (namespace === 'local' && changes.watchedParams) {
    updateContextMenus();
  }
});