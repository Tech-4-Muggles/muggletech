const providerSel=document.getElementById('provider');
const apiKeyOpenAI=document.getElementById('apiKeyOpenAI');
const apiKeyGemini=document.getElementById('apiKeyGemini');
const saveOpenAI=document.getElementById('saveKeyOpenAI');
const saveGemini=document.getElementById('saveKeyGemini');
const file=document.getElementById('file');
const addBtn=document.getElementById('addResume');
const list=document.getElementById('resumeList');
const kwInput=document.getElementById('kw');
const saveKw=document.getElementById('saveKw');

function toggleProviderRows(){
  document.getElementById('rowOpenAI').style.display = providerSel.value==='openai'? 'flex':'none';
  document.getElementById('rowGemini').style.display = providerSel.value==='gemini'? 'flex':'none';
}

async function refresh(){
  const s=await chrome.storage.local.get(['jobaid_provider','jobaid_api_key','jobaid_api_key_gemini','jobaid_resumes','jobaid_keywords']);
  providerSel.value = s.jobaid_provider || 'gemini';
  apiKeyOpenAI.value = s.jobaid_api_key || '';
  apiKeyGemini.value = s.jobaid_api_key_gemini || '';
  kwInput.value = (s.jobaid_keywords||[]).join(', ');
  list.innerHTML='';
  (s.jobaid_resumes||[]).forEach(r=>{
    const div=document.createElement('div'); div.style.margin='6px 0';
    div.innerHTML=`<b>${r.name}</b> • ${Math.min(120,r.text.length)} chars preview: ${r.text.slice(0,120).replace(/</g,'&lt;')}<br>`;
    const del=document.createElement('button'); del.textContent='Delete'; del.onclick=async()=>{
      const arr=(await chrome.storage.local.get('jobaid_resumes')).jobaid_resumes||[];
      await chrome.storage.local.set({jobaid_resumes:arr.filter(x=>x.id!==r.id)}); refresh(); };
    div.appendChild(del); list.appendChild(div);
  });
  toggleProviderRows();
}

providerSel.onchange = async ()=>{ await chrome.storage.local.set({jobaid_provider: providerSel.value}); toggleProviderRows(); };
saveOpenAI.onclick = async ()=>{ await chrome.storage.local.set({jobaid_api_key: apiKeyOpenAI.value.trim()}); alert('Saved OpenAI key locally.'); };
saveGemini.onclick = async ()=>{ await chrome.storage.local.set({jobaid_api_key_gemini: apiKeyGemini.value.trim()}); alert('Saved Gemini key locally.'); };
saveKw.onclick = async ()=>{ const terms=kwInput.value.split(',').map(s=>s.trim()).filter(Boolean); await chrome.storage.local.set({jobaid_keywords:terms}); alert('Saved keywords.'); };

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
    for(const f of file.files){
      const text=(await readFileAsText(f)).slice(0,50000);
      if(text){ existing.push({id:crypto.randomUUID(),name:f.name,text}); }
    }
    await chrome.storage.local.set({jobaid_resumes:existing}); file.value=''; refresh();
  }catch(e){ console.error(e); alert('Could not add resume: '+ (e?.message||e) + '\nTip: PDFs/DOCX need vendor libs. For quick testing, upload a .txt version.'); }
};

window.addEventListener('load', refresh);