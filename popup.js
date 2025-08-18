(async function(){
  const output=document.getElementById('output'); const warn=document.getElementById('modelWarn');
  const provider=await getProvider();
  const meta=await getProviderMeta();
  if(!provider){ warn.textContent='Add an API key in Options (Gemini free tier works).'; }
  else { warn.textContent=`Model: ${meta.name}`; }

  // theme + layout
  const state = await chrome.storage.local.get(['jobaid_theme','jobaid_compact']);
  applyTheme(state.jobaid_theme||'dark');
  applyCompact(!!state.jobaid_compact);
  document.getElementById('btnTheme').onclick = async ()=>{
    const next = (document.body.classList.contains('light') ? 'dark' : 'light');
    applyTheme(next); await chrome.storage.local.set({jobaid_theme: next});
  };
  document.getElementById('btnCompact').onclick = async ()=>{
    const next = !document.body.classList.contains('compact');
    applyCompact(next); await chrome.storage.local.set({jobaid_compact: next});
  };
  function applyTheme(mode){ document.body.classList.toggle('light', mode==='light'); document.getElementById('btnTheme').textContent = (mode==='light'?'☀️':'🌙'); }
  function applyCompact(on){ document.body.classList.toggle('compact', on); }

  async function getTabText(){
    const [tab]=await chrome.tabs.query({active:true,currentWindow:true});
    try{
      const [{result:text}] = await chrome.scripting.executeScript({
        target:{tabId:tab.id},
        func: () => {
          try{
            const host = location.hostname;
            let jd = '';
            if (/linkedin\.com/.test(host)) {
              const cand = document.querySelector('[data-test-id="job-details"]')
                 || document.querySelector('.jobs-description')
                 || document.querySelector('#job-details')
                 || document.querySelector('.jobs-description__content')
                 || document.querySelector('.jobs-search__job-details--container')
                 || document.querySelector('.jobs-search__job-details');
              jd = cand?.innerText || '';
            }
            if (!jd && /indeed\./.test(host)) {
              jd = (document.querySelector('#jobDescriptionText')
                 || document.querySelector('[data-testid="jobsearch-JobComponent-description"]'))?.innerText || '';
            }
            return (jd && jd.trim().length>120) ? jd : document.body.innerText;
          }catch(e){ return document.body.innerText; }
        }
      });
      return text||'';
    }catch(e){
      return new Promise((resolve)=>{
        chrome.runtime.sendMessage({type:'GET_TAB_HTML'},(res)=> resolve(res?.text||''));
      });
    }
  }

  async function getResumes(){ const {jobaid_resumes}=await chrome.storage.local.get('jobaid_resumes'); return jobaid_resumes||[]; }
  function renderList(items){ output.innerHTML=''; items.forEach(t=>{const s=document.createElement('span'); s.textContent=t; s.className='pill'; output.appendChild(s);}); }
  const showError = e => { output.textContent = 'Error: ' + (e?.message || e); };
  function showToast(msg){ const t=document.createElement('div'); t.className='toast'; t.textContent=msg; document.body.appendChild(t); requestAnimationFrame(()=> t.classList.add('show')); setTimeout(()=>{ t.classList.remove('show'); setTimeout(()=> t.remove(), 200); }, 1600); }

  document.getElementById('btnSummarize').onclick=async()=>{
    try{
      const text=await getTabText();
      const prompt=`Summarize this job description in 6 bullets:

${text.slice(0,15000)}`;
      const res=provider? await provider.complete(prompt) : '[No provider configured]';
      output.textContent=res;
    }catch(e){ showError(e); }
  };

  document.getElementById('btnKeywords').onclick=async()=>{
    try{
      const text=await getTabText();
      const prompt=`Extract 12–18 must-have keywords/skills from the job description. Return a comma-separated list only. JD:
${text.slice(0,15000)}`;
      const res=provider? await provider.complete(prompt):'';
      const terms = res ? res.split(/,|\n/).map(s => s.trim()).filter(Boolean) : [];
      await chrome.storage.local.set({jobaid_keywords:terms});
      renderList(terms);
    }catch(e){ showError(e); }
  };

  document.getElementById('btnHighlight').onclick = async () => {
    try {
      const { jobaid_keywords } = await chrome.storage.local.get('jobaid_keywords');
      if (!jobaid_keywords?.length) return alert('No keywords yet. Click Keywords first.');

      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!/^https?:/i.test(tab.url || '')) return alert('Highlighting works only on http/https pages (e.g., LinkedIn, Indeed).');

      const send = () => new Promise((resolve, reject) => {
        chrome.tabs.sendMessage(tab.id, { type: 'JOB_AID_HIGHLIGHT', terms: jobaid_keywords }, (res) => {
          const err = chrome.runtime.lastError; if (err && !/message port closed/i.test(err.message)) reject(err); else resolve(res||{ok:true,count:0});
        });
      });

      try { const res = await send(); showToast(`Highlighted ${res.count||0} match${(res.count||0)==1?'':'es'}`); }
      catch (_) { await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['content.js'] }); const res=await send(); showToast(`Highlighted ${res.count||0} match${(res.count||0)==1?'':'es'}`); }
    } catch (e) { const output = document.getElementById('output'); output.textContent = 'Error: ' + (e?.message || e); }
  };

  document.getElementById('btnBestResume').onclick=async()=>{
    try{ const text=await getTabText(); const resumes=await getResumes(); if(!resumes.length) return (output.textContent='Upload resumes in Options first.'); const scores=resumes.map(r=>({id:r.id,name:r.name,score:jaccardScore(text,r.text)})).sort((a,b)=>b.score-a.score); output.innerHTML=`Best fit: <b>${scores[0].name}</b> (similarity ${(scores[0].score*100).toFixed(1)}%)`; }
    catch(e){ showError(e); }
  };

  document.getElementById('btnCoverLetter').onclick=async()=>{
    try{ const jd=await getTabText(); const resumes=await getResumes(); if(!resumes.length) return (output.textContent='Upload resumes in Options first.'); const best=resumes.sort((a,b)=> jaccardScore(jd,b.text)-jaccardScore(jd,a.text))[0]; const prompt=`Write a concise, tailored cover letter (170–220 words) for this job using the candidate resume. Focus on 3–4 relevant achievements, avoid fluff, and mirror the role's keywords naturally.
JD: ${jd.slice(0,12000)}
Resume: ${best.text.slice(0,8000)}`; const res=provider? await provider.complete(prompt):'[No provider configured]'; output.textContent=res; }
    catch(e){ showError(e); }
  };
})();