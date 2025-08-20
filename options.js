// Settings page logic
const providerSel=document.getElementById('provider');
const apiKeyOpenAI=document.getElementById('apiKeyOpenAI');
const apiKeyGemini=document.getElementById('apiKeyGemini');
const saveOpenAI=document.getElementById('saveKeyOpenAI');
const saveGemini=document.getElementById('saveKeyGemini');

const file=document.getElementById('file');
const addBtn=document.getElementById('addResume');
const list=document.getElementById('resumeList');
const nameInput=document.getElementById('resumeName');

const kwInput=document.getElementById('kw');
const saveKw=document.getElementById('saveKw');

const watchInput=document.getElementById('watchlist');
const saveWatch=document.getElementById('saveWatch');

function toggleProviderRows(){
  document.getElementById('rowOpenAI').style.display = providerSel.value==='openai'? 'flex':'none';
  document.getElementById('rowGemini').style.display = providerSel.value==='gemini'? 'flex':'none';
}

async function refresh(){
  const s=await chrome.storage.local.get([
    'jobaid_provider','jobaid_api_key','jobaid_api_key_gemini',
    'jobaid_resumes','jobaid_keywords','jobaid_watchlist','jobaid_default_resume_id'
  ]);
  providerSel.value = s.jobaid_provider || 'gemini';
  apiKeyOpenAI.value = s.jobaid_api_key || '';
  apiKeyGemini.value = s.jobaid_api_key_gemini || '';
  kwInput.value = (s.jobaid_keywords||[]).join(', ');
  watchInput.value = (s.jobaid_watchlist||[]).join(', ');

  list.innerHTML='';
  (s.jobaid_resumes||[]).forEach(r=>{
    const div=document.createElement('div'); div.style.margin='8px 0';
    div.innerHTML=`<b>${r.name || r.id}</b> <span style="color:#64748b">• preview:</span> ${r.text.slice(0,120).replace(/</g,'&lt;')}`;
    const right=document.createElement('div');
    const setd=document.createElement('button'); setd.textContent='Set as default';
    setd.onclick=async()=>{ await chrome.storage.local.set({jobaid_default_resume_id:r.id}); refresh(); };
    const del=document.createElement('button'); del.style.marginLeft='6px'; del.textContent='Delete';
    del.onclick=async()=>{
      const arr=(await chrome.storage.local.get('jobaid_resumes')).jobaid_resumes||[];
      await chrome.storage.local.set({jobaid_resumes:arr.filter(x=>x.id!==r.id)});
      const cur=(await chrome.storage.local.get('jobaid_default_resume_id')).jobaid_default_resume_id;
      if (cur===r.id) await chrome.storage.local.set({jobaid_default_resume_id:null});
      refresh();
    };
    right.appendChild(setd); right.appendChild(del);
    div.appendChild(document.createElement('br')); div.appendChild(right);
    list.appendChild(div);
  });
  toggleProviderRows();
}

providerSel.onchange = async ()=>{ await chrome.storage.local.set({jobaid_provider: providerSel.value}); toggleProviderRows(); };
saveOpenAI.onclick = async ()=>{ await chrome.storage.local.set({jobaid_api_key: apiKeyOpenAI.value.trim()}); alert('Saved OpenAI key locally.'); };
saveGemini.onclick = async ()=>{ await chrome.storage.local.set({jobaid_api_key_gemini: apiKeyGemini.value.trim()}); alert('Saved Gemini key locally.'); };

saveKw.onclick = async ()=>{
  const terms=kwInput.value.split(',').map(s=>s.trim()).filter(Boolean);
  await chrome.storage.local.set({jobaid_keywords:terms});
  alert('Saved keywords. These will be used for highlighting & scoring.');
};

saveWatch.onclick = async ()=>{
  const terms=watchInput.value.split(',').map(s=>s.trim()).filter(Boolean);
  await chrome.storage.local.set({jobaid_watchlist:terms});
  // ping current tab to immediately re-highlight
  try{
    const [tab]=await chrome.tabs.query({active:true,currentWindow:true});
    chrome.tabs.sendMessage(tab.id, {type:'JOB_AID_WATCHLIST_UPDATE', terms}, ()=> void chrome.runtime.lastError);
  }catch(_){}
  alert('Saved watchlist. We’ll auto-highlight these words on pages.');
};

// Resume ingestion
async function readFileAsText(f){
  try{
    const ext=f.name.split('.').pop().toLowerCase();
    if(['txt','md','rtf'].includes(ext)) return await f.text();
    if(ext==='pdf') return await extractPdfText(f);
    if(ext==='docx') return await extractDocxText(f);
    return await f.text();
  }catch(err){
    console.error('Error reading file', err);
    alert(`Could not read ${f.name}: ${err.message}`);
    return '';
  }
}

addBtn.onclick = async ()=>{
  try{
    if(!file.files?.length) return alert('Pick files first');
    const existing=(await chrome.storage.local.get('jobaid_resumes')).jobaid_resumes||[];
    const providedName = (nameInput.value||'').trim();
    for(const f of file.files){
      const text=(await readFileAsText(f)).slice(0,50000);
      if(text){ existing.push({id:crypto.randomUUID(),name:providedName||f.name,text}); }
    }
    await chrome.storage.local.set({jobaid_resumes:existing});
    file.value=''; nameInput.value='';
    refresh();
  }catch(e){ console.error(e); alert('Could not add resume: '+ (e?.message||e)); }
};

window.addEventListener('load', refresh);
