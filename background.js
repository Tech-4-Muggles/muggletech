chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({ id: "jobaid-open-options", title: "JobAid: Open Settings", contexts: ["action"] });
});
chrome.contextMenus.onClicked.addListener((info) => { if (info.menuItemId === "jobaid-open-options") chrome.runtime.openOptionsPage(); });

// Fallback relay (rare) — popup prefers executeScript directly.
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === "GET_TAB_HTML") {
    chrome.scripting.executeScript({
      target: { tabId: sender.tab.id },
      func: () => {
        try{
          const host = location.hostname;
          let jd = '';
          if (/linkedin\.com/.test(host)) {
            jd = (document.querySelector('[data-test-id="job-details"]')
               || document.querySelector('.jobs-description')
               || document.querySelector('#job-details')
               || document.querySelector('.jobs-description__content'))?.innerText || '';
          }
          if (!jd && /indeed\./.test(host)) {
            jd = (document.querySelector('#jobDescriptionText')
               || document.querySelector('[data-testid="jobsearch-JobComponent-description"]'))?.innerText || '';
          }
          return (jd && jd.trim().length>120) ? jd : document.body.innerText;
        }catch(e){ return document.body.innerText; }
      }
    }).then((res) => sendResponse({ text: res?.[0]?.result || "" }))
      .catch((e)=> sendResponse({ text: '', error: String(e) }));
    return true;
  }
});
