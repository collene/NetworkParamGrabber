// popup.js
let allRequests = [];
let selectedTabId = 'all';
let tabsInfo = {};
let watchedParams = [];
let isCapturing = true;
let selectedValues = {}; // Store selected values for each parameter

function getFilteredRequests() {
  if (selectedTabId === 'all') {
    return allRequests;
  }
  return allRequests.filter(req => req.tabId === parseInt(selectedTabId));
}

function updateTabSelect(tabs) {
  const tabSelect = document.getElementById('tabSelect');
  const currentSelection = tabSelect.value;
  
  // Build a map of tabs
  tabsInfo = {};
  tabs.forEach(tab => {
    tabsInfo[tab.id] = {
      title: tab.title,
      url: tab.url
    };
  });
  
  // Find unique tabs that have requests
  const tabsWithRequests = new Set();
  allRequests.forEach(req => {
    if (req.tabId && req.tabId !== -1) {
      tabsWithRequests.add(req.tabId);
    }
  });
  
  // Build options
  let options = '<option value="all">All Tabs</option>';
  
  tabsWithRequests.forEach(tabId => {
    const tabInfo = tabsInfo[tabId];
    if (tabInfo) {
      const title = tabInfo.title.length > 50 
        ? tabInfo.title.substring(0, 50) + '...' 
        : tabInfo.title;
      const selected = currentSelection == tabId ? 'selected' : '';
      options += `<option value="${tabId}" ${selected}>Tab: ${title}</option>`;
    }
  });
  
  tabSelect.innerHTML = options;
  tabSelect.value = currentSelection;
}

function updateFilterStatus() {
  const filterStatus = document.getElementById('filterStatus');
  const clearFilterBtn = document.getElementById('clearFilter');
  
  if (selectedTabId === 'all') {
    const totalCount = allRequests.length;
    filterStatus.textContent = `Showing all ${totalCount} request(s) from all tabs`;
    clearFilterBtn.style.display = 'none';
  } else {
    const filteredRequests = getFilteredRequests();
    const tabInfo = tabsInfo[parseInt(selectedTabId)];
    const tabTitle = tabInfo ? tabInfo.title : 'Unknown Tab';
    filterStatus.textContent = `Showing ${filteredRequests.length} request(s) from: ${tabTitle}`;
    clearFilterBtn.style.display = 'inline-block';
  }
}

function addWatchedParam(paramName) {
  if (!paramName || watchedParams.includes(paramName)) {
    return;
  }
  
  watchedParams.push(paramName);
  updateParamTags();
  updateMultiSearchButtons();
  saveWatchedParams();
}

function removeWatchedParam(paramName) {
  watchedParams = watchedParams.filter(p => p !== paramName);
  updateParamTags();
  updateMultiSearchButtons();
  saveWatchedParams();
  
  // Remove selected value for this param
  delete selectedValues[paramName];
  saveSelectedValues();
  
  if (watchedParams.length === 0) {
    document.getElementById('multiFoundValues').innerHTML = '';
  }
}

function saveWatchedParams() {
  chrome.storage.local.set({ watchedParams: watchedParams });
}

function saveSelectedValues() {
  chrome.storage.local.set({ selectedValues: selectedValues });
}

function loadWatchedParams() {
  chrome.storage.local.get(['watchedParams'], (result) => {
    if (result.watchedParams && Array.isArray(result.watchedParams)) {
      watchedParams = result.watchedParams;
      updateParamTags();
      updateMultiSearchButtons();
      
      // If there are watched params and we have requests, automatically search
      if (watchedParams.length > 0 && allRequests.length > 0) {
        searchMultipleParameters();
      }
    }
  });
}

function loadSelectedValues() {
  chrome.storage.local.get(['selectedValues'], (result) => {
    if (result.selectedValues) {
      selectedValues = result.selectedValues;
    }
  });
}

function updateParamTags() {
  const container = document.getElementById('paramTags');
  
  if (watchedParams.length === 0) {
    container.innerHTML = '<div style="color: #888; font-size: 11px; font-style: italic;">No parameters added yet</div>';
    return;
  }
  
  container.innerHTML = watchedParams.map(param => `
    <span class="param-tag">
      ${param}
      <span class="remove-tag" data-param="${param}">x</span>
    </span>
  `).join('');
  
  // Add click handlers for remove buttons
  document.querySelectorAll('.remove-tag').forEach(btn => {
    btn.addEventListener('click', function() {
      const param = this.getAttribute('data-param');
      removeWatchedParam(param);
    });
  });
}

function updateMultiSearchButtons() {
  const searchBtn = document.getElementById('searchAll');
  const clearBtn = document.getElementById('clearParams');
  
  if (watchedParams.length > 0) {
    searchBtn.style.display = 'block';
    clearBtn.style.display = 'block';
  } else {
    searchBtn.style.display = 'none';
    clearBtn.style.display = 'none';
  }
}

function searchMultipleParameters() {
  const filteredRequests = getFilteredRequests();
  const allResults = {};
  
  watchedParams.forEach(paramName => {
    allResults[paramName] = searchForParameter(paramName, filteredRequests);
  });
  
  displayMultiFoundValues(allResults);
}

function displayMultiFoundValues(allResults) {
  const container = document.getElementById('multiFoundValues');
  
  const totalResults = Object.values(allResults).reduce((sum, results) => sum + results.length, 0);
  
  if (totalResults === 0) {
    container.innerHTML = '<div style="margin-top: 10px; color: #888; font-style: italic;">No values found for the specified parameters</div>';
    return;
  }
  
  let html = '<div style="margin-top: 10px;">';
  
  Object.keys(allResults).forEach(paramName => {
    const results = allResults[paramName];
    
    if (results.length > 0) {
      html += `
        <div style="margin-bottom: 15px;">
          <div style="font-weight: bold; color: #1976d2; margin-bottom: 5px; font-size: 12px;">
            ${paramName} (${results.length} found)
          </div>
          ${results.map((result, index) => {
            const isFirst = index === 0;
            const isSelected = selectedValues[paramName] === result.value;
            const shouldCheck = isSelected || (!selectedValues[paramName] && isFirst);
            return `
            <div class="value-item ${shouldCheck ? 'selected' : ''}" data-param="${paramName}" data-index="${index}">
              <input type="radio" class="value-checkbox" name="select_${paramName}" data-param="${paramName}" data-value="${result.value.replace(/"/g, '&quot;')}" ${shouldCheck ? 'checked' : ''}>
              <div style="flex: 1;">
                <div class="param-name">${result.source}</div>
                <div class="value-text">${result.value}</div>
                <div style="font-size: 10px; color: #888; margin-top: 3px;">
                  ${new Date(result.timestamp).toLocaleString()}
                </div>
              </div>
              <button class="copy-btn" data-value="${result.value.replace(/"/g, '&quot;')}" data-param="${paramName}" data-index="${index}">
                Copy
              </button>
            </div>
          `;
          }).join('')}
        </div>
      `;
    }
  });
  
  html += '</div>';
  container.innerHTML = html;
  
  // Add click handlers to radio buttons
  document.querySelectorAll('#multiFoundValues .value-checkbox').forEach(radio => {
    radio.addEventListener('change', function() {
      const paramName = this.getAttribute('data-param');
      const value = this.getAttribute('data-value');
      
      // Store the selected value
      selectedValues[paramName] = value;
      saveSelectedValues();
      
      // Remove selected class from all items with this param
      document.querySelectorAll(`#multiFoundValues .value-item[data-param="${paramName}"]`).forEach(item => {
        item.classList.remove('selected');
      });
      
      // Add selected class to parent value-item
      this.closest('.value-item').classList.add('selected');
    });
  });
  
  // Add click handlers to copy buttons
  document.querySelectorAll('#multiFoundValues .copy-btn').forEach(btn => {
    btn.addEventListener('click', function() {
      const value = this.getAttribute('data-value');
      
      navigator.clipboard.writeText(value).then(() => {
        this.textContent = 'Copied!';
        this.classList.add('copied');
        
        setTimeout(() => {
          this.textContent = 'Copy';
          this.classList.remove('copied');
        }, 2000);
      });
    });
  });
}

function searchForParameter(paramName, requests) {
  const results = [];
  
  if (!paramName || !requests) return results;
  
  requests.forEach(req => {
    // Search in URL parameters
    if (req.urlParams && req.urlParams[paramName]) {
      results.push({
        value: req.urlParams[paramName],
        source: 'URL Parameter',
        url: req.url,
        timestamp: req.timestamp,
        paramName: paramName
      });
    }
    
    // Search in Headers (including Authorization/Bearer tokens)
    if (req.headers) {
      // Check for exact header name match
      if (req.headers[paramName.toLowerCase()]) {
        results.push({
          value: req.headers[paramName.toLowerCase()],
          source: 'Header',
          url: req.url,
          timestamp: req.timestamp,
          paramName: paramName
        });
      }
      
      // Special handling for "bearer" or "token" searches
      const lowerParam = paramName.toLowerCase();
      if ((lowerParam === 'bearer' || lowerParam === 'token') && req.headers['authorization']) {
        const authHeader = req.headers['authorization'];
        // Extract bearer token if present
        const bearerMatch = authHeader.match(/Bearer\s+(.+)/i);
        if (bearerMatch) {
          results.push({
            value: bearerMatch[1],
            source: 'Bearer Token',
            url: req.url,
            timestamp: req.timestamp,
            paramName: 'Authorization'
          });
        } else {
          results.push({
            value: authHeader,
            source: 'Authorization Header',
            url: req.url,
            timestamp: req.timestamp,
            paramName: 'Authorization'
          });
        }
      }
    }
    
    // Search in POST data
    if (req.postData) {
      if (typeof req.postData === 'object' && req.postData[paramName]) {
        const value = Array.isArray(req.postData[paramName]) 
          ? req.postData[paramName][0] 
          : req.postData[paramName];
        results.push({
          value: value,
          source: 'POST Data',
          url: req.url,
          timestamp: req.timestamp,
          paramName: paramName
        });
      } else if (typeof req.postData === 'string') {
        // Try to parse JSON
        try {
          const parsed = JSON.parse(req.postData);
          if (parsed[paramName]) {
            results.push({
              value: parsed[paramName],
              source: 'POST JSON',
              url: req.url,
              timestamp: req.timestamp,
              paramName: paramName
            });
          }
        } catch (e) {
          // Check for form-encoded data
          const regex = new RegExp(`[?&]?${paramName}=([^&]*)`, 'i');
          const match = req.postData.match(regex);
          if (match && match[1]) {
            results.push({
              value: decodeURIComponent(match[1]),
              source: 'POST Form Data',
              url: req.url,
              timestamp: req.timestamp,
              paramName: paramName
            });
          }
        }
      }
    }
  });
  
  return results;
}

function displayFoundValues(results) {
  const container = document.getElementById('foundValues');
  
  if (results.length === 0) {
    container.innerHTML = '';
    return;
  }
  
  container.innerHTML = `
    <div style="margin-bottom: 8px; font-weight: bold; color: #333;">
      Found ${results.length} value(s):
    </div>
    ${results.map((result, index) => `
      <div class="value-item">
        <div style="flex: 1;">
          <div class="param-name">${result.paramName} (${result.source})</div>
          <div class="value-text">${result.value}</div>
          <div style="font-size: 10px; color: #888; margin-top: 3px;">
            ${new Date(result.timestamp).toLocaleString()}
          </div>
        </div>
        <button class="copy-btn" data-value="${result.value.replace(/"/g, '&quot;')}" data-index="${index}">
          Copy
        </button>
      </div>
    `).join('')}
  `;
  
  // Add click handlers to copy buttons
  document.querySelectorAll('#foundValues .copy-btn').forEach(btn => {
    btn.addEventListener('click', function() {
      const value = this.getAttribute('data-value');
      
      navigator.clipboard.writeText(value).then(() => {
        this.textContent = 'Copied!';
        this.classList.add('copied');
        
        setTimeout(() => {
          this.textContent = 'Copy';
          this.classList.remove('copied');
        }, 2000);
      });
    });
  });
}

function displayRequests(requests) {
  const container = document.getElementById('requests');
  
  if (!requests || requests.length === 0) {
    container.innerHTML = '<p class="no-params">No requests captured yet</p>';
    return;
  }
  
  container.innerHTML = requests.map(req => {
    const hasUrlParams = Object.keys(req.urlParams).length > 0;
    const hasPostData = req.postData !== null;
    
    let paramsHtml = '';
    if (hasUrlParams) {
      paramsHtml += '<div><strong>URL Parameters:</strong></div>';
      paramsHtml += '<div class="params">' + 
        JSON.stringify(req.urlParams, null, 2) + 
        '</div>';
    }
    
    if (hasPostData) {
      paramsHtml += '<div><strong>POST Data:</strong></div>';
      paramsHtml += '<div class="params">' + 
        (typeof req.postData === 'string' ? req.postData : JSON.stringify(req.postData, null, 2)) + 
        '</div>';
    }
    
    // Display headers if they exist
    if (req.headers && Object.keys(req.headers).length > 0) {
      paramsHtml += '<div><strong>Headers:</strong></div>';
      paramsHtml += '<div class="params">' + 
        JSON.stringify(req.headers, null, 2) + 
        '</div>';
    }
    
    if (!hasUrlParams && !hasPostData && (!req.headers || Object.keys(req.headers).length === 0)) {
      paramsHtml = '<div class="no-params">No parameters or headers</div>';
    }
    
    return `
      <div class="request">
        <div class="request-header">
          <span class="method ${req.method}">${req.method}</span>
          <span class="timestamp">${new Date(req.timestamp).toLocaleTimeString()}</span>
        </div>
        <div class="url">${req.url}</div>
        ${paramsHtml}
      </div>
    `;
  }).join('');
}

function loadRequests() {
  chrome.runtime.sendMessage({ action: 'getRequests' }, (response) => {
    allRequests = response.requests;
    isCapturing = response.isCapturing;
    updateCaptureButton();
    
    // Get all tabs to populate the dropdown
    chrome.runtime.sendMessage({ action: 'getTabs' }, (tabResponse) => {
      updateTabSelect(tabResponse.tabs);
      updateFilterStatus();
      
      const filteredRequests = getFilteredRequests();
      displayRequests(filteredRequests);
      
      // Re-run search if there's text in the search box
      const searchInput = document.getElementById('searchParam');
      if (searchInput.value) {
        const results = searchForParameter(searchInput.value, filteredRequests);
        displayFoundValues(results);
      }
      
      // Re-run multi-param search if params are set
      if (watchedParams.length > 0) {
        searchMultipleParameters();
      }
    });
  });
}

function updateCaptureButton() {
  const btn = document.getElementById('toggleCapture');
  if (isCapturing) {
    btn.textContent = 'Stop Capturing';
    btn.className = 'toggle-capture-btn capturing';
  } else {
    btn.textContent = 'Resume Capturing';
    btn.className = 'toggle-capture-btn paused';
  }
}

// Initialize param tags display and load saved params
loadWatchedParams();
loadSelectedValues();
loadRequests();

document.getElementById('tabSelect').addEventListener('change', function(e) {
  selectedTabId = e.target.value;
  updateFilterStatus();
  
  const filteredRequests = getFilteredRequests();
  displayRequests(filteredRequests);
  
  // Re-run search with filtered requests
  const searchInput = document.getElementById('searchParam');
  if (searchInput.value) {
    const results = searchForParameter(searchInput.value, filteredRequests);
    displayFoundValues(results);
  } else {
    document.getElementById('foundValues').innerHTML = '';
  }
});

document.getElementById('clearFilter').addEventListener('click', function() {
  selectedTabId = 'all';
  document.getElementById('tabSelect').value = 'all';
  updateFilterStatus();
  
  displayRequests(allRequests);
  
  // Re-run search with all requests
  const searchInput = document.getElementById('searchParam');
  if (searchInput.value) {
    const results = searchForParameter(searchInput.value, allRequests);
    displayFoundValues(results);
  }
  
  // Re-run multi-param search if params are set
  if (watchedParams.length > 0) {
    searchMultipleParameters();
  }
});

// Multi-parameter search handlers
document.getElementById('addParam').addEventListener('click', function() {
  const input = document.getElementById('multiParamInput');
  const paramName = input.value.trim();
  
  if (paramName) {
    addWatchedParam(paramName);
    input.value = '';
  }
});

document.getElementById('multiParamInput').addEventListener('keypress', function(e) {
  if (e.key === 'Enter') {
    const paramName = this.value.trim();
    if (paramName) {
      addWatchedParam(paramName);
      this.value = '';
    }
  }
});

document.getElementById('searchAll').addEventListener('click', function() {
  searchMultipleParameters();
});

document.getElementById('clearParams').addEventListener('click', function() {
  watchedParams = [];
  selectedValues = {};
  updateParamTags();
  updateMultiSearchButtons();
  saveWatchedParams();
  saveSelectedValues();
  document.getElementById('multiFoundValues').innerHTML = '';
});

document.getElementById('searchParam').addEventListener('input', function(e) {
  const paramName = e.target.value.trim();
  const filteredRequests = getFilteredRequests();
  
  if (paramName) {
    const results = searchForParameter(paramName, filteredRequests);
    displayFoundValues(results);
  } else {
    document.getElementById('foundValues').innerHTML = '';
  }
});

document.getElementById('refresh').addEventListener('click', loadRequests);

document.getElementById('clear').addEventListener('click', () => {
  const clearTabId = selectedTabId === 'all' ? null : parseInt(selectedTabId);
  chrome.runtime.sendMessage({ 
    action: 'clearRequests',
    tabId: clearTabId
  }, () => {
    loadRequests();
  });
});

document.getElementById('toggleCapture').addEventListener('click', () => {
  chrome.runtime.sendMessage({ action: 'toggleCapture' }, (response) => {
    isCapturing = response.isCapturing;
    updateCaptureButton();
  });
});