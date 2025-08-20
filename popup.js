(async function(){
  // --- DOM --------------------------------------------------------------------
  const output=document.getElementById('output');
  const btnAnalyze=document.getElementById('btnAnalyze');
  const btnBest=document.getElementById('btnBestResume');
  const btnCover=document.getElementById('btnCoverLetter');
  const warn=document.getElementById('modelWarn');
  const pageHint=document.getElementById('pageHint');
  const notice=document.getElementById('notice');

  const tabBtnAnalyze=document.getElementById('tabBtnAnalyze');
  const tabBtnOptimize=document.getElementById('tabBtnOptimize');
  const tabBtnResumes=document.getElementById('tabBtnResumes');
  const tabAnalyze=document.getElementById('tabAnalyze');
  const tabOptimize=document.getElementById('tabOptimize');
  const tabResumes=document.getElementById('tabResumes');

  // sub segment state inside Analyze card
  function setSubActive(which){
    [btnAnalyze,btnBest,btnCover].forEach(b=>b.classList.remove('active'));
    if (which==='analyze') btnAnalyze.classList.add('active');
    if (which==='best') btnBest.classList.add('active');
    if (which==='cover') btnCover.classList.add('active');
  }

  // Score & sponsorship
  const scoreWrap=document.getElementById('scoreWrap');
  const overallScore=document.getElementById('overallScore');
  const scoreNote=document.getElementById('scoreNote');
  const sponsorPill=document.getElementById('sponsorPill');

  // Optimize tab
  const optSel=document.getElementById('optResumeSel');
  const optInfo=document.getElementById('optInfo');
  const optPresent=document.getElementById('optPresent');
  const optMissing=document.getElementById('optMissing');
  const optEst=document.getElementById('optEst');
  const optGuidance=document.getElementById('optGuidance');
  const btnSuggest=document.getElementById('btnSuggest');

  // Resumes tab
  const file=document.getElementById('file');
  const resumeName=document.getElementById('resumeName');
  const addBtn=document.getElementById('addResume');
  const resList=document.getElementById('resList');

  const provider=await getProvider();
  const meta=await getProviderMeta();

  // Theme
  const themeToggle=document.getElementById('themeToggle');
  const thDark=document.getElementById('thDark');
  const thLight=document.getElementById('thLight');
  const state = await chrome.storage.local.get(['jobaid_theme']);
  applyTheme(state.jobaid_theme||'dark');
  function applyTheme(mode){ document.body.classList.toggle('light', mode==='light'); thDark.classList.toggle('on', mode==='dark'); thLight.classList.toggle('on', mode==='light'); }
  themeToggle.onclick = async (e)=>{ const t=e.target.closest('[data-mode]'); if(!t) return; const next=t.getAttribute('data-mode'); applyTheme(next); await chrome.storage.local.set({jobaid_theme:next}); };

  // Model badge
  warn.textContent = provider ? `Model: ${meta.name}` : 'Add an API key in Options (Gemini free tier works).';

  // utilities
  const showOutput = () => { output.style.display='block'; };
  const hideOutput = () => { output.style.display='none'; };
  function showToast(msg){ const t=document.createElement('div'); t.className='toast'; t.textContent=msg; document.body.appendChild(t); requestAnimationFrame(()=> t.classList.add('show')); setTimeout(()=>{ t.classList.remove('show'); setTimeout(()=> t.remove(), 200); }, 1600); }

  const STOP = new Set("a,an,the,and,or,of,to,in,for,on,with,by,at,from,as,is,are,was,were,be,been,being,that,this,these,those,it,its,into,over,across,via,about,within,per,using,across,through".split(','));
  const lower = s => (s||'').toLowerCase();
  const tokenizeRaw = s => lower(s).match(/[a-z0-9+#.]+/g)||[];
  const stem = t => t.replace(/(ing|ed|es|s)$/,'');
  const uniq = arr => Array.from(new Set(arr));

  // Canonical phrases for PM + domains (maps variants -> canonical token)
  const CANON = [
    ['go to market','gtm','go-to-market','product launch','launch strategy','market entry','commercialization','pricing & packaging','pricing and packaging','launch plan','product rollout','release plan','rollout plan'],'gtm',
    ['a/b testing','ab testing','experiments','experiment','experimentation','multivariate','split testing'],'abtest',
    ['user research','customer research','user interviews','discovery research','usability testing','user testing','customer discovery'],'userresearch',
    ['stakeholders','stakeholder management','cross functional','cross-functional','xfn','partner teams','executive alignment'],'stakeholders',
    ['roadmap','road-mapping','road mapping','roadmaps'],'roadmap',
    ['backlog','grooming','refinement','sprint planning'],'backlog',
    ['agile','scrum','kanban'],'agile',
    ['kpi','kpis','okr','okrs','metrics'],'metrics',
    ['product analytics','analytics','instrumentation','event tracking'],'analytics',
    ['retention','churn','activation','onboarding','funnel','conversion'],'growth',
    ['ux','ui','wireframes','prototypes','design review','usability'],'ux',
    ['api','apis','platform','integration','sdk'],'platform',
    ['saas','b2b','enterprise'],'saas',
    ['payments','fintech','banking'],'fintech',
    ['crypto','web3','blockchain'],'crypto',
    ['ml','ai','machine learning','llm','generative ai'],'mlai'
  ];
  const LOOK = new Map(); for(let i=0;i<CANON.length;i+=2){ CANON[i].forEach(v=>LOOK.set(v, CANON[i+1])); }
  const SYN = {
    gtm:['launch','pricing','rollout','market entry'],
    abtest:['experiments','testing','multivariate'],
    userresearch:['interviews','usability','discovery','surveys'],
    stakeholders:['alignment','cross functional','xfn','partners'],
    roadmap:['planning','prioritization','strategy'],
    backlog:['groom','refinement','tickets'],
    agile:['scrum','sprint','ceremonies','kanban'],
    metrics:['goals','targets','north star'],
    analytics:['events','instrumentation','tracking','amplitude','mixpanel','ga'],
    growth:['activation','retention','onboarding','funnel','conversion','churn'],
    ux:['design','usability','wireframes','prototype'],
    platform:['api','integration','sdk'],
    saas:['b2b','enterprise'],
    fintech:['payments','banking'],
    crypto:['blockchain','web3'],
    mlai:['machine learning','ai','llm','models']
  };

  function addCanon(text, bag){
    const t=lower(text);
    LOOK.forEach((canon, variant)=>{ if(t.includes(variant)) bag.push(canon); });
  }
  function tokensExpanded(text){
    const base = tokenizeRaw(text).filter(w=>!STOP.has(w)).map(stem);
    const bag = base.slice(); addCanon(text, bag);
    const set = new Set(bag);
    Object.entries(SYN).forEach(([canon,alts])=>{ if(set.has(canon)) alts.forEach(a=>bag.push(stem(a))); });
    return bag;
  }

  // Weighted cosine on expanded tokens
  function cosineWeighted(jdTokens, resTokens, keywords){
    const kw = new Set((keywords||[]).map(k=>stem(lower(k))));
    const A=new Map(), B=new Map();
    const w = (t)=> kw.has(t) || SYN[t] ? 3 : 1;
    for(const t of jdTokens) A.set(t,(A.get(t)||0)+w(t));
    for(const t of resTokens) B.set(t,(B.get(t)||0)+w(t));
    const vocab = uniq([...A.keys(),...B.keys()]);
    let dot=0, na=0, nb=0;
    for(const v of vocab){ const x=A.get(v)||0, y=B.get(v)||0; dot+=x*y; na+=x*x; nb+=y*y; }
    return (na&&nb)? dot/Math.sqrt(na*nb):0;
  }
  function phraseOverlapScore(jdText, resText){
    const a=new Set(), b=new Set(); LOOK.forEach((canon,variant)=>{ const t=lower(jdText); const r=lower(resText); if(t.includes(variant)) a.add(canon); if(r.includes(variant)) b.add(canon); });
    const inter=[...a].filter(x=>b.has(x)).length; const uni=new Set([...a,...b]).size; return uni? inter/uni:0;
  }
  function synonymCoverage(keywords, resTokens){
    if(!keywords?.length) return 0; const R=new Set(resTokens);
    let hit=0; for(const kw of keywords){ const s=stem(lower(kw)); if(R.has(s)){hit++;continue;} if(SYN[s]){ if(SYN[s].some(v=>R.has(stem(v)))) hit++; } }
    return hit/keywords.length;
  }
  function roleSignals(text){
    const t=lower(text);
    const senior = /director|head|vp|senior|lead/.test(t) ? 1 : /junior|associate|entry/.test(t) ? -1 : 0;
    const pm = /(product\s+manager|product\s+management|roadmap|backlog|user\s+research|launch|go[-\s]?to[-\s]?market|gtm|a\/b|experiments?)/.test(t) ? 1 : 0;
    const domain = /fintech|payments|banking|crypto|web3|blockchain|healthcare|education|e-?commerce|saas|platform|ai|ml/.test(t) ? 1 : 0;
    return { senior, pm, domain };
  }
  function compositeScore(jdText, resText, keywords){
    const jdTok = tokensExpanded(jdText);
    const rTok  = tokensExpanded(resText);
    const cos = cosineWeighted(jdTok, rTok, keywords);
    const jac = (()=>{
      const A=new Set(jdTok), B=new Set(rTok);
      const inter=[...A].filter(x=>B.has(x)).length;
      const uni=new Set([...A,...B]).size;
      return uni? inter/uni:0;
    })();
    const phr = phraseOverlapScore(jdText, resText);
    const syn = synonymCoverage(keywords, rTok);
    const { senior, pm, domain } = roleSignals(jdText + " " + resText);
    const roleBoost = (pm?0.08:0) + (domain?0.05:0) + (senior>0?0.05: senior<0?-0.03:0);
    let score = 0.45*cos + 0.20*phr + 0.15*jac + 0.10*syn + roleBoost;
    score = Math.max(0, Math.min(1, score));
    return { score, parts:{cos,phr,jac,syn,roleBoost} };
  }

  function sponsorshipSignal(text){
    const t=lower(text);
    const negative = /(no\s+sponsorship|cannot\s+sponsor|does\s+not\s+sponsor|must\s+be\s+(us|u\.s\.)\s*(citizen|green\s*card)|citizenship\s+required|without\s+sponsorship)/.test(t);
    const positive = /(visa\s*sponsorship|h-?1b|h1b|opt|cpt|work\s+authorization\s+provided|sponsor\s+visa)/.test(t);
    if (negative) return { label:'Unlikely', cls:'no' };
    if (positive) return { label:'Likely', cls:'ok' };
    return { label:'Unclear', cls:'maybe' };
  }

  const cleanSummary = (text) => (text||'').replace(/\*\*(.*?)\*\*/g, '$1').replace(/^\s*[-*]\s+/gm, '• ').replace(/\n{3,}/g, '\n\n').trim();
  function renderScore(score, label){
    const pct=(score*100).toFixed(1)+'%';
    overallScore.textContent=pct;
    overallScore.className='scoreBig '+(score>=0.55?'good':score>=0.35?'ok':'low');
    scoreNote.textContent = label || 'Overall match vs selected resume.';
    scoreWrap.style.display='flex';
  }
  function hideScore(){ scoreWrap.style.display='none'; }

  // Relevance & JD fetcher -----------------------------------------------------
  async function isRelevantJobPage(){
    const [tab]=await chrome.tabs.query({active:true,currentWindow:true});
    if (!tab?.url || !/^https?:/i.test(tab.url)) return false;
    const results = await chrome.scripting.executeScript({
      target:{tabId:tab.id, allFrames:true},
      func: () => {
        try{
          const host = location.hostname;
          const hasLinkedIn = /linkedin\.com/.test(host) && (
            document.querySelector('[data-test-id="job-details"], .jobs-description, #job-details, .jobs-description__content, .jobs-search__job-details--container, .jobs-search__job-details')
          );
          const hasIndeed = /indeed\./.test(host) && (
            document.querySelector('#jobDescriptionText, [data-testid="jobsearch-JobComponent-description"]')
          );
          return !!(hasLinkedIn || hasIndeed);
        }catch(_){ return false; }
      }
    });
    return (results||[]).some(r=>r.result === true);
  }

  async function getTabText(){
    const [tab]=await chrome.tabs.query({active:true,currentWindow:true});
    try{
      const results = await chrome.scripting.executeScript({
        target:{tabId:tab.id, allFrames:true},
        func: () => {
          try{
            const host = location.hostname;
            const visible = (el)=> !!el && el.offsetParent !== null && el.offsetHeight>40 && el.innerText?.trim().length>40;
            let node = null;
            if (/linkedin\.com/.test(host)) {
              node =
                document.querySelector('[data-test-id="job-details"]') ||
                document.querySelector('.jobs-description') ||
                document.querySelector('#job-details') ||
                document.querySelector('.jobs-description__content') ||
                document.querySelector('.jobs-search__job-details--container') ||
                document.querySelector('.jobs-search__job-details');
              if (node && !visible(node)) node = null;
            }
            if (!node && /indeed\./.test(host)) {
              node = document.querySelector('#jobDescriptionText') ||
                     document.querySelector('[data-testid="jobsearch-JobComponent-description"]');
              if (node && !visible(node)) node = null;
            }
            const text = node?.innerText || '';
            const bodyText = document.body?.innerText || '';
            const score = (node ? 2000 : 0) + (text ? text.length : 0) + Math.min(500, (node?.querySelectorAll('li, p').length || 0) * 5);
            return { score, text: (text && text.trim().length>80) ? text : '', fallback: (bodyText && bodyText.trim().length>120) ? bodyText : '' };
          }catch(e){ return { score:0, text:'', fallback:'' }; }
        }
      });
      const best = (results||[]).map(r=>r.result).filter(Boolean).sort((a,b)=>b.score-a.score)[0];
      if (!best) return '';
      return best.text || best.fallback || '';
    }catch(e){ return new Promise((resolve)=>{ chrome.runtime.sendMessage({type:'GET_TAB_HTML'},(res)=> resolve(res?.text||'')); }); }
  }

  // On-page highlighting (across frames, but we just msg the content script)
  async function highlightInPage(terms){
    const [tab]=await chrome.tabs.query({active:true,currentWindow:true});
    return await new Promise((resolve)=>{
      chrome.tabs.sendMessage(tab.id, {type:'JOB_AID_HIGHLIGHT', terms}, (res)=>{
        const err = chrome.runtime.lastError; if (err) resolve(0); else resolve(res?.count||0);
      });
    });
  }
  async function sponsorHighlightInPage(){
    const [tab]=await chrome.tabs.query({active:true,currentWindow:true});
    return await new Promise((resolve)=>{
      chrome.tabs.sendMessage(tab.id, {type:'JOB_AID_SPONSOR_HL'}, (res)=>{
        const err = chrome.runtime.lastError; if (err) resolve(0); else resolve(res?.count||0);
      });
    });
  }

  // --- Analyze & Highlight ----------------------------------------------------
  async function analyzeAndHighlight(){
    setSubActive('analyze');
    try{
      const isJob = await isRelevantJobPage();
      pageHint.style.display = isJob ? 'none' : 'block';
      pageHint.textContent = isJob ? '' : 'Open a LinkedIn/Indeed job to analyze.';
      hideScore(); sponsorPill.style.display='none'; notice.style.display='none';

      if (!isJob){ hideOutput(); return; }
      const text = await getTabText();
      if (!text || text.trim().length < 40) { showOutput(); output.textContent = 'Could not detect a job description on this page.'; return; }

      // Sponsorship
      const sp = sponsorshipSignal(text);
      sponsorPill.style.display='inline-block';
      sponsorPill.className = 'sponsor ' + sp.cls;
      sponsorPill.textContent = 'Sponsorship: ' + sp.label;
      sponsorHighlightInPage(); // explicit phrase highlighting on page

      // Summary
      let summary = '[No provider configured]';
      if (provider){
        const prompt=`Summarize this job description in 6 bullets. Use short lines, no markdown:\n\n${text.slice(0,15000)}`;
        summary = cleanSummary(await provider.complete(prompt));
      }

      // Keywords (prioritized & context-aware)
      let terms = [];
      if (provider){
        const kPrompt=`From the job description, return a single line CSV with ~18 PRIORITIZED resume-screening keywords.
Order by importance: core PM competencies first, then domain-specific concepts, then tools/tech.
Normalize plurals/synonyms (e.g., "go-to-market" ~ "GTM"; "A/B testing" ~ "experimentation"). Avoid duplicates.
Return only the comma-separated list, no headings.

JD:
${text.slice(0,15000)}`;
        const kRes = await provider.complete(kPrompt);
        terms = kRes ? kRes.split(/,|\n/).map(s=>s.trim()).filter(Boolean) : [];
      }
      // Heuristic fallback if provider missing or empty
      if (!terms.length){
        const counts = new Map();
        const toks = tokensExpanded(text);
        for (const t of toks){ counts.set(t,(counts.get(t)||0)+1); }
        terms = [...counts.entries()]
          .sort((a,b)=>b[1]-a[1]).map(([t])=>t)
          .filter(t=>t.length>2).slice(0,18);
      }
      await chrome.storage.local.set({ jobaid_keywords: terms });

      const total = await highlightInPage(terms);

      // Render
      output.innerHTML='';
      const sumHdr=document.createElement('div'); sumHdr.innerHTML='<b>Summary</b>'; output.appendChild(sumHdr);
      const sumTxt=document.createElement('div'); sumTxt.textContent=summary||''; output.appendChild(sumTxt);
      if (terms.length){
        const kwHdr=document.createElement('div'); kwHdr.style.marginTop='8px'; kwHdr.innerHTML='<b>Keywords</b>'; output.appendChild(kwHdr);
        const kwBox=document.createElement('div'); terms.forEach(t=>{ const s=document.createElement('span'); s.textContent=t; s.className='pill'; kwBox.appendChild(s); }); output.appendChild(kwBox);
      }
      showOutput();
      showToast(`Highlighted ${total} match${total===1?'':'es'}`);

      // Overall score against selected
      const s=await chrome.storage.local.get(['jobaid_resumes','jobaid_default_resume_id']);
      const resumes=s.jobaid_resumes||[];
      if (resumes.length){
        const chosenId = s.jobaid_default_resume_id || resumes[0].id;
        const chosen = resumes.find(r=>r.id===chosenId) || resumes[0];
        const {score}= compositeScore(text, chosen.text, terms);
        renderScore(score, 'Overall match vs selected resume (see Optimize).');
      } else { hideScore(); }
    }catch(e){ showOutput(); output.textContent = 'Error: ' + (e?.message || e); }
  }

  btnAnalyze.onclick = analyzeAndHighlight;
  analyzeAndHighlight(); // auto-run on popup open

  // --- Optimize tab -----------------------------------------------------------
  function splitPresentMissing(terms, resumeText){
    const R = new Set(tokensExpanded(resumeText));
    const present=[], missing=[];
    for(const t of (terms||[])){
      const s=stem(lower(t));
      if (R.has(s)) present.push(t);
      else {
        // treat synonyms/canon as present
        let hit=false;
        Object.entries(SYN).forEach(([canon,alts])=>{
          if (canon===s && (R.has(s) || alts.some(v=>R.has(stem(v))))) hit=true;
        });
        hit ? present.push(t) : missing.push(t);
      }
    }
    return {present, missing};
  }
  function renderPills(el, items, cls){ el.innerHTML=''; items.forEach(x=>{ const s=document.createElement('span'); s.textContent=x; s.className='pill '+cls; el.appendChild(s); }); }

  function estimateAfter(parts, missing, jdText, resText){
    const jdTok = new Set(tokensExpanded(jdText)), rTok = new Set(tokensExpanded(resText));
    let inter=[...jdTok].filter(x=>rTok.has(x)).length;
    let uni = new Set([...jdTok,...rTok]).size;
    inter += missing.length;
    uni += Math.round(missing.length*0.4);
    const jacEst = uni? inter/uni : parts.jac;
    const cosEst = Math.min(1, parts.cos + Math.min(0.03*missing.length, 0.18));
    const est = Math.max(0, Math.min(1, 0.45*cosEst + 0.20*parts.phr + 0.15*jacEst + 0.10*parts.syn + parts.roleBoost));
    return { jacEst, cosEst, est };
  }

  async function loadOptimize(autoSuggest=true){
    const jd = await getTabText();
    const terms = (await chrome.storage.local.get('jobaid_keywords')).jobaid_keywords||[];
    const s=await chrome.storage.local.get(['jobaid_resumes','jobaid_default_resume_id']);
    const resumes=s.jobaid_resumes||[];
    optSel.innerHTML='';
    if (!resumes.length){ optInfo.textContent='Upload a resume in the Resumes tab.'; optPresent.innerHTML=''; optMissing.innerHTML=''; optEst.textContent=''; optGuidance.style.display='none'; return; }
    resumes.forEach(r=>{ const o=document.createElement('option'); o.value=r.id; o.textContent=r.name||'(untitled)'; optSel.appendChild(o); });
    optSel.value = s.jobaid_default_resume_id || resumes[0].id;

    const r = resumes.find(x=>x.id===optSel.value) || resumes[0];
    const detail = compositeScore(jd, r.text, terms);
    const {present,missing} = splitPresentMissing(terms, r.text);
    renderPills(optPresent, present, 'good');
    renderPills(optMissing, missing, 'miss');
    optInfo.textContent = `Selected: ${r.name}`;
    const proj = estimateAfter(detail.parts, missing, jd, r.text);
    optEst.textContent = `Current score ${(detail.score*100).toFixed(1)}%. Estimated after adding missing: ${(proj.est*100).toFixed(1)}%.`;
    optGuidance.style.display='none';
    renderScore(detail.score, 'Overall match vs selected resume (Optimize).');

    if (autoSuggest) await btnSuggest.click(); // auto-run suggestions when opening Optimize
  }
  optSel.onchange = ()=> loadOptimize(false);

  function renderSuggestionPretty(raw){
    const txt=(raw||'').replace(/\r/g,'').trim();
    const bullets=[];
    txt.split('\n').forEach(l=>{
      const t=l.trim();
      if(!t) return;
      if (/^[-*•]\s+/.test(t) || /^\d+\.\s+/.test(t)) bullets.push(t.replace(/^[\d.]*\s*[-*•]?\s*/,''));
    });
    if(!bullets.length){
      txt.split(/(?:\*\s+|\n\*\s+)/).forEach(seg=>{
        const s=seg.trim(); if(s && s.length>8) bullets.push(s.replace(/^\*+/, '').trim());
      });
    }
    const summaryMatch = txt.match(/(summary|professional summary)[:\-]?\s*([\s\S]*?)$/i);
    const summary = summaryMatch ? summaryMatch[2].trim() : '';

    const wrap=document.createElement('div');
    const h1=document.createElement('div'); h1.innerHTML='<b>Add or revise bullets</b>'; wrap.appendChild(h1);
    const ul=document.createElement('ul'); ul.style.margin='6px 0'; ul.style.paddingLeft='18px';
    bullets.forEach(b=>{ const li=document.createElement('li'); li.textContent=b; ul.appendChild(li); });
    wrap.appendChild(ul);
    if(summary){
      const h2=document.createElement('div'); h2.style.marginTop='8px'; h2.innerHTML='<b>Improved summary</b>';
      const p=document.createElement('div'); p.style.whiteSpace='pre-wrap'; p.textContent=summary;
      wrap.appendChild(h2); wrap.appendChild(p);
    }
    return wrap;
  }

  btnSuggest.onclick = async ()=>{
    try{
      const jd = await getTabText();
      const {jobaid_resumes}=await chrome.storage.local.get('jobaid_resumes');
      if(!jobaid_resumes?.length) return showToast('Upload a resume first.');
      const r = jobaid_resumes.find(x=>x.id===optSel.value) || jobaid_resumes[0];
      const terms = (await chrome.storage.local.get('jobaid_keywords')).jobaid_keywords||[];
      const {present, missing} = splitPresentMissing(terms, r.text);

      const prompt = `Tailor resume to this Product Manager role.

Return ONLY plain text with two sections:

1) Add or revise bullets:
- 7–10 bullets, Action–Context–Result.
- START with a strong verb (Led, Built, Launched, Optimized, Increased, Reduced, Drove).
- END with a metric (%, $, #, time).
- Naturally weave in the highest-priority missing keywords (no stuffing).
- Write scannable bullets (max ~25 words each).

2) Summary:
- 1–2 lines positioning statement.

High‑priority missing keywords (address these first): ${missing.slice(0,8).join(', ') || '(none)'}
Other present keywords (avoid repeating needlessly): ${present.slice(0,12).join(', ') || '(none)'}

JOB DESCRIPTION (truncated):
${jd.slice(0,9000)}

CURRENT RESUME (truncated):
${r.text.slice(0,9000)}
`;
      const res = provider ? await provider.complete(prompt) : 'Provider not configured.';
      optGuidance.style.display='block';
      optGuidance.innerHTML='';
      optGuidance.appendChild(renderSuggestionPretty(res));
      showToast('Suggestions ready');
    }catch(e){ showToast('Could not get suggestions'); }
  };

  // --- Best‑fit ---------------------------------------------------------------
  function renderBestFit(text){
    return chrome.storage.local.get(['jobaid_resumes','jobaid_default_resume_id','jobaid_keywords']).then(s=>{
      const resumes=s.jobaid_resumes||[];
      if(!resumes.length){ showOutput(); output.textContent='Upload resumes in the Resumes tab first.'; hideScore(); return; }
      const kws=s.jobaid_keywords||[];
      const list = resumes.map(r=>({ id:r.id, name:r.name||'(untitled)', detail:compositeScore(text, r.text, kws) }));
      const sorted = list.sort((a,b)=> b.detail.score - a.detail.score);
      output.innerHTML='';
      const defId=s.jobaid_default_resume_id;
      if (defId){
        const def = sorted.find(x=>x.id===defId);
        if (def){
          const card=document.createElement('div');
          card.className='notice';
          card.innerHTML=`<div><b>Default resume</b></div>
          <div style="margin-top:6px">${def.name} — <b>${(def.detail.score*100).toFixed(1)}%</b></div>`;
          output.appendChild(card);
        }
      }
      const listEl=document.createElement('div'); listEl.style.marginTop='8px';
      sorted.forEach(s=>{
        const row=document.createElement('div'); row.style.margin='6px 0';
        row.textContent = `${s.name} — ${(s.detail.score*100).toFixed(1)}%`;
        listEl.appendChild(row);
      });
      output.appendChild(listEl);
      showOutput();
      const chosen = defId ? sorted.find(x=>x.id===defId) : sorted[0];
      renderScore(chosen?.detail.score||0, defId?'Overall match vs Default resume.':'Overall match vs best-scoring resume.');
    });
  }

  btnBest.onclick=async()=>{
    setSubActive('best');
    if (!(await isRelevantJobPage())) { showOutput(); output.textContent='Open a LinkedIn/Indeed job to compare.'; return; }
    const text=await getTabText(); 
    renderBestFit(text);
  };

  // --- Cover Letter -----------------------------------------------------------
  const clWrap = document.getElementById('clWrap');
  const clText = document.getElementById('clText');
  document.getElementById('btnCopyCL').onclick = async ()=>{ try{ await navigator.clipboard.writeText(clText.value||''); showToast('Copied cover letter'); }catch{} };
  document.getElementById('btnDownloadCL').onclick = ()=>{
    const w = window.open('', '_blank', 'width=720,height=900');
    const html = `<html><head><title>Cover Letter</title>
      <style>body{font:14px system-ui,-apple-system,Segoe UI,Roboto,sans-serif;line-height:1.5;padding:24px}</style>
      </head><body>${(clText.value||'').replace(/\n/g,'<br>')}</body></html>`;
    w.document.write(html); w.document.close(); w.focus(); w.print();
  };
  btnCover.onclick=async()=>{
    setSubActive('cover');
    try{
      if (!(await isRelevantJobPage())) { showOutput(); output.textContent='Open a LinkedIn/Indeed job to draft a cover letter.'; return; }
      const jd=await getTabText(); 
      const store=await chrome.storage.local.get(['jobaid_resumes','jobaid_keywords']);
      const resumes=store.jobaid_resumes||[]; const kws=store.jobaid_keywords||[];
      if(!resumes.length) return (showOutput(), output.textContent='Upload resumes in the Resumes tab first.');
      const best=resumes.map(r=>({r,sc:compositeScore(jd,r.text,kws)})).sort((a,b)=>b.sc.score-a.sc.score)[0].r;

      const prompt=`Write a concise, tailored cover letter (170–220 words) for this job using the candidate resume. Plain text only.
Emphasize 3–4 quantified PM achievements that map to the JD. Use natural language; mirror role keywords without stuffing.

JD:
${jd.slice(0,12000)}

Resume:
${best.text.slice(0,8000)}`;
      const res=provider? await provider.complete(prompt):'[No provider configured]';
      clWrap.style.display='block';
      clText.value = (res||'').trim();
      notice.style.display='block';
      notice.textContent = 'Cover letter generated. Edit below or use Copy / Download PDF.';
      output.style.display='none';
    }catch(e){ showOutput(); output.textContent = 'Error: ' + (e?.message || e); }
  };

  // --- Tabs -------------------------------------------------------------------
  function switchTab(which){
    const A = which==='analyze', O = which==='opt', R = which==='res';
    tabBtnAnalyze.classList.toggle('active', A);
    tabBtnOptimize.classList.toggle('active', O);
    tabBtnResumes.classList.toggle('active', R);
    tabAnalyze.style.display = A ? 'block' : 'none';
    tabOptimize.style.display = O ? 'block' : 'none';
    tabResumes.style.display = R ? 'block' : 'none';
    if (A) analyzeAndHighlight();
    if (O) loadOptimize(true);
    if (R) refreshResumes();
  }
  tabBtnAnalyze.onclick = ()=> switchTab('analyze');
  tabBtnOptimize.onclick = ()=> switchTab('opt');
  tabBtnResumes.onclick = ()=> switchTab('res');

  // Resumes tab management -----------------------------------------------------
  async function readFileAsText(f){
    try{
      const ext=f.name.split('.').pop().toLowerCase();
      if(['txt','md','rtf'].includes(ext)) return await f.text();
      if(ext==='pdf') return await extractPdfText(f);
      if(ext==='docx') return await extractDocxText(f);
      return await f.text();
    }catch(err){ console.error('Error reading file', err); showToast(`Could not read ${f.name}`); return ''; }
  }
  addBtn.onclick = async ()=>{
    try{
      if(!file.files?.length) return alert('Pick files first');
      const existing=(await chrome.storage.local.get('jobaid_resumes')).jobaid_resumes||[];
      const providedName = (resumeName.value||'').trim();
      for(const f of file.files){
        const text=(await readFileAsText(f)).slice(0,50000);
        if(text){ existing.push({id:crypto.randomUUID(), name: providedName || f.name, text}); }
      }
      await chrome.storage.local.set({jobaid_resumes:existing}); file.value=''; resumeName.value='';
      await refreshResumes(); showToast('Resume(s) added');
    }catch(e){ console.error(e); alert('Could not add resume: '+ (e?.message||e)); }
  };
  async function refreshResumes(){
    const s=await chrome.storage.local.get(['jobaid_resumes','jobaid_default_resume_id','jobaid_keywords']);
    const resumes = s.jobaid_resumes||[];
    resList.innerHTML='';
    const jd = (await isRelevantJobPage()) ? await getTabText() : '';

    if (s.jobaid_default_resume_id){
      const defR = resumes.find(r=>r.id===s.jobaid_default_resume_id);
      if (defR){
        const {score}= jd ? compositeScore(jd, defR.text, s.jobaid_keywords||[]) : {score:0};
        const item=document.createElement('div'); item.className='item featured';
        const left=document.createElement('div'); left.className='left';
        left.innerHTML = `<div class="name">${defR.name || '(untitled)'}</div>
          <div><span class="preview">${defR.text.slice(0,140)}</span>
          <span class="badge">Score: ${(score*100).toFixed(1)}%</span>
          <span class="badge">DEFAULT</span></div>`;
        const actions=document.createElement('div'); actions.className='actions';
        const del=document.createElement('button'); del.className='btn'; del.textContent='Delete';
        del.onclick=async()=>{
          const arr=(await chrome.storage.local.get('jobaid_resumes')).jobaid_resumes||[];
          await chrome.storage.local.set({jobaid_resumes:arr.filter(x=>x.id!==defR.id)});
          const cur=(await chrome.storage.local.get('jobaid_default_resume_id')).jobaid_default_resume_id;
          if (cur===defR.id) await chrome.storage.local.set({jobaid_default_resume_id:null});
          refreshResumes();
        };
        actions.appendChild(del);
        item.appendChild(left); item.appendChild(actions);
        resList.appendChild(item);
      }
    }
    for(const r of resumes){
      if (r.id === s.jobaid_default_resume_id) continue;
      const {score}= jd ? compositeScore(jd, r.text, s.jobaid_keywords||[]) : {score:0};
      const item=document.createElement('div'); item.className='item';
      const left=document.createElement('div'); left.className='left';
      left.innerHTML = `<div class="name">${r.name || '(untitled)'}</div>
        <div><span class="preview">${r.text.slice(0,140)}</span>
        <span class="badge">Score: ${(score*100).toFixed(1)}%</span></div>`;
      const actions=document.createElement('div'); actions.className='actions';
      const setd=document.createElement('button'); setd.className='btn'; setd.textContent='Set default';
      setd.onclick=async()=>{ await chrome.storage.local.set({jobaid_default_resume_id:r.id}); refreshResumes(); };
      const del=document.createElement('button'); del.className='btn'; del.textContent='Delete';
      del.onclick=async()=>{
        const arr=(await chrome.storage.local.get('jobaid_resumes')).jobaid_resumes||[];
        await chrome.storage.local.set({jobaid_resumes:arr.filter(x=>x.id!==r.id)});
        const cur=(await chrome.storage.local.get('jobaid_default_resume_id')).jobaid_default_resume_id;
        if (cur===r.id) await chrome.storage.local.set({jobaid_default_resume_id:null});
        refreshResumes();
      };
      actions.appendChild(setd); actions.appendChild(del);
      item.appendChild(left); item.appendChild(actions);
      resList.appendChild(item);
    }
  }

  // Wire buttons
  btnAnalyze.onclick = analyzeAndHighlight;
  btnBest.onclick = btnBest.onclick; // (defined earlier)
})();
