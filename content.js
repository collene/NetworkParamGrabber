// content.js
// Listen for messages from the background script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'pasteValue') {
    const activeElement = document.activeElement;
    
    if (activeElement && (activeElement.tagName === 'INPUT' || activeElement.tagName === 'TEXTAREA')) {
      // Paste the value into the active input field
      activeElement.value = request.value;
      
      // Trigger input event so the page knows the value changed
      activeElement.dispatchEvent(new Event('input', { bubbles: true }));
      activeElement.dispatchEvent(new Event('change', { bubbles: true }));
      
      // Show a brief notification
      showNotification(`Pasted: ${request.value.substring(0, 50)}${request.value.length > 50 ? '...' : ''}`, 'success');
    }
  } else if (request.action === 'showNotification') {
    showNotification(request.message, 'error');
  }
  
  return true;
});

function showNotification(message, type = 'success') {
  // Remove any existing notifications
  const existing = document.getElementById('network-grabber-notification');
  if (existing) {
    existing.remove();
  }
  
  // Create notification element
  const notification = document.createElement('div');
  notification.id = 'network-grabber-notification';
  notification.textContent = message;
  notification.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    background-color: ${type === 'success' ? '#4CAF50' : '#f44336'};
    color: white;
    padding: 12px 20px;
    border-radius: 4px;
    box-shadow: 0 2px 5px rgba(0,0,0,0.3);
    z-index: 999999;
    font-family: Arial, sans-serif;
    font-size: 14px;
    max-width: 300px;
    word-wrap: break-word;
  `;
  
  document.body.appendChild(notification);
  
  // Remove after 3 seconds
  setTimeout(() => {
    notification.style.transition = 'opacity 0.3s';
    notification.style.opacity = '0';
    setTimeout(() => notification.remove(), 300);
  }, 3000);
}