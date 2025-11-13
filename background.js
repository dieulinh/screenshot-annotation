chrome.runtime.onInstalled.addListener(async () => {
  try {
    await chrome.sidePanel.setOptions({ enabled: true, path: "popup.html" });
  } catch (error) {
    console.warn('Unable to set side panel options during install:', error);
  }
});

chrome.action.onClicked.addListener(async (tab) => {
  try {
    await chrome.sidePanel.open({ tabId: tab.id });
  } catch (error) {
    console.error('Failed to open side panel:', error);
  }
});
