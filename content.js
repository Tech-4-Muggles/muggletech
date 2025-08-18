const HIGHLIGHT_CLASS = "jobaid-highlight";
const STYLE_ID = "jobaid-style";

function ensureStyle() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `.${HIGHLIGHT_CLASS}{background:#fff59d;outline:1px solid rgba(0,0,0,.1);border-radius:2px;padding:0 2px}`;
  document.head.appendChild(style);
}

function escapeRegExp(s){
  // Safely escape any term for use inside a RegExp
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function highlightTerms(terms){
  ensureStyle();
  if (!Array.isArray(terms) || !terms.length) return 0;

  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null);
  const nodes = [];
  while (walker.nextNode()) {
    const n = walker.currentNode;
    if (!n.nodeValue || n.parentElement.closest("script,style,textarea,code,pre")) continue;
    nodes.push(n);
  }

  // Use a plain string (not a template literal) so we can safely escape the backslashes.
  const regex = new RegExp('\\b(' + terms.map(escapeRegExp).join('|') + ')\\b', 'gi');

  let count = 0;
  for (const node of nodes) {
    const text = node.nodeValue;
    if (!regex.test(text)) continue;
    const matches = text.match(regex);
    if (matches) count += matches.length;

    const span = document.createElement("span");
    span.innerHTML = text.replace(regex, m => `<mark class="${HIGHLIGHT_CLASS}">${m}</mark>`);
    node.parentNode.replaceChild(span, node);
  }
  return count;
}

// Auto-highlight if keywords already exist
(async function init(){ 
  const { jobaid_keywords } = await chrome.storage.local.get("jobaid_keywords");
  if (jobaid_keywords?.length) highlightTerms(jobaid_keywords);
})();

// Respond to explicit highlight requests from the popup (no reload)
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg && msg.type === 'JOB_AID_HIGHLIGHT' && Array.isArray(msg.terms)) {
    try {
      const count = highlightTerms(msg.terms);
      sendResponse({ ok: true, count });
    } catch (e) {
      sendResponse({ ok: false, error: String(e) });
    }
  }
});