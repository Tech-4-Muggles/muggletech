// Content script: page-side highlighting (keywords, watchlist, sponsorship)
// -----------------------------------------------------------------------------
const STYLE_ID = "jobaid-style";
const HL = "jobaid-highlight";      // JD keywords (from Analyze)
const WATCH = "jobaid-watch";        // Default watchlist (from Options)
const SP = "jobaid-sponsor";         // Sponsorship phrases

function ensureStyle() {
  if (document.getElementById(STYLE_ID)) return;
  const s = document.createElement("style");
  s.id = STYLE_ID;
  s.textContent = `
    mark.${HL}{ background:#fff59d; color:inherit; border-radius:3px; padding:0 2px; }
    mark.${WATCH}{ background:#bbf7d0; color:#064e3b; border-radius:3px; padding:0 2px; }
    mark.${SP}{ background:#fecaca; color:#7f1d1d; border-radius:3px; padding:0 2px; }

    .jobaid-banner{
      position:fixed; top:12px; right:12px; z-index:2147483647;
      font:12px system-ui,-apple-system,Segoe UI,Roboto,sans-serif;
      color:#0f172a; background:#ffffff; border:1px solid #e5e7eb; border-radius:12px;
      box-shadow:0 10px 24px rgba(0,0,0,.15); padding:6px 10px; display:flex; gap:8px; align-items:center;
    }
    .jobaid-tag{ font-size:11px; padding:2px 8px; border-radius:999px; border:1px solid #e5e7eb; }
    .jobaid-tag.hl{ background:#fff7c2; }
    .jobaid-tag.watch{ background:#dcfce7; }
    .jobaid-tag.sp{ background:#fee2e2; }
    .jobaid-banner .close{ margin-left:6px; cursor:pointer; user-select:none; }
  `;
  document.documentElement.appendChild(s);
}
function escapeRE(s){ return s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'); }

function highlightTerms(terms, cls){
  ensureStyle();
  if(!Array.isArray(terms) || !terms.length) return 0;

  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null);
  const nodes = [];
  while (walker.nextNode()){
    const n = walker.currentNode;
    if (!n.nodeValue) continue;
    if (n.parentElement.closest('script,style,textarea,code,pre,[contenteditable="true"]')) continue;
    nodes.push(n);
  }

  const pattern = '\\b(' + terms.map(escapeRE).join('|') + ')\\b';
  const re = new RegExp(pattern, 'gi');
  let count = 0;

  for (const node of nodes){
    const txt = node.nodeValue;
    if (!re.test(txt)) continue;
    const matches = txt.match(re);
    if (matches) count += matches.length;

    const span = document.createElement('span');
    span.innerHTML = txt.replace(new RegExp(pattern,'gi'), m=>`<mark class="${cls}">${m}</mark>`);
    node.parentNode.replaceChild(span, node);
  }
  return count;
}

function addBanner(items){
  if (!items || !items.length) return;
  const old = document.getElementById('jobaid-banner');
  if (old) old.remove();

  const b = document.createElement('div');
  b.id = 'jobaid-banner';
  b.className = 'jobaid-banner';
  items.forEach(it=>{
    const tag = document.createElement('span');
    tag.className = 'jobaid-tag ' + it.cls;
    tag.textContent = `${it.label}: ${it.value}`;
    b.appendChild(tag);
  });
  const x = document.createElement('span');
  x.className = 'close';
  x.textContent = '×';
  x.onclick = ()=> b.remove();
  b.appendChild(x);
  document.documentElement.appendChild(b);
}

// Sponsorship highlighting via phrases
function highlightSponsorship() {
  ensureStyle();
  const positive = [
    'visa sponsorship','sponsor visa','work authorization provided','h1b','h-1b','opt','cpt'
  ];
  const negative = [
    'no sponsorship','cannot sponsor','does not sponsor','must be us citizen','u.s. citizen',
    'green card required','citizenship required','without sponsorship'
  ];
  const posCount = highlightTerms(positive, SP);
  const negCount = highlightTerms(negative, SP);
  if (posCount || negCount) {
    const label = negCount ? 'Unlikely' : (posCount ? 'Likely' : '—');
    addBanner([
      {label:'Sponsorship', value: label, cls:'sp'},
      {label:'Phrases', value: (posCount+negCount), cls:'sp'}
    ]);
  }
  return posCount + negCount;
}

// Init: auto-highlight user watchlist
(async function init(){
  try{
    ensureStyle();
    const { jobaid_watchlist } = await chrome.storage.local.get('jobaid_watchlist');
    if (Array.isArray(jobaid_watchlist) && jobaid_watchlist.length){
      const hits = highlightTerms(jobaid_watchlist, WATCH);
      if (hits) addBanner([{label:'Watchlist', value: hits, cls:'watch'}]);
    }
  }catch(_){}
})();

// React to messages from popup
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse)=>{
  try{
    if (msg?.type === 'JOB_AID_HIGHLIGHT' && Array.isArray(msg.terms)){
      const n = highlightTerms(msg.terms, HL);
      sendResponse({count:n}); return;
    }
    if (msg?.type === 'JOB_AID_WATCHLIST_UPDATE' && Array.isArray(msg.terms)){
      const n = highlightTerms(msg.terms, WATCH);
      if (n) addBanner([{label:'Watchlist', value: n, cls:'watch'}]);
      sendResponse({count:n}); return;
    }
    if (msg?.type === 'JOB_AID_SPONSOR_HL'){
      const n = highlightSponsorship();
      sendResponse({count:n}); return;
    }
  }catch(e){ sendResponse({error:String(e)}); }
});

// React to storage changes (watchlist updates)
chrome.storage.onChanged.addListener((changes)=>{
  if (changes.jobaid_watchlist){
    const val = changes.jobaid_watchlist.newValue;
    if (Array.isArray(val) && val.length){
      try{ highlightTerms(val, WATCH); }catch(_){}
    }
  }
});
