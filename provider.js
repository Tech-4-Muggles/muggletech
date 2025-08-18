/* Provider: Gemini (free tier) or OpenAI. */
async function getProviderMeta(){
  const {jobaid_provider}=await chrome.storage.local.get('jobaid_provider');
  const provider=jobaid_provider||'gemini';
  if(provider==='openai') return {id:'openai', name:'OpenAI GPT-4o mini'};
  return {id:'gemini', name:'Gemini 1.5 Flash'};
}

async function getProvider(){
  const {jobaid_provider, jobaid_api_key, jobaid_api_key_gemini}=await chrome.storage.local.get(['jobaid_provider','jobaid_api_key','jobaid_api_key_gemini']);
  const provider=(jobaid_provider||'gemini');

  if(provider==='openai'){
    if(!jobaid_api_key) return null;
    return { async complete(prompt){
      try{
        const res=await fetch('https://api.openai.com/v1/chat/completions',{
          method:'POST', headers:{'Content-Type':'application/json','Authorization':`Bearer ${jobaid_api_key}`},
          body: JSON.stringify({ model:'gpt-4o-mini', messages:[{role:'system',content:'You are a concise writing and extraction assistant.'},{role:'user',content:prompt}], temperature:0.2 })
        });
        const data=await res.json();
        if(!res.ok) throw new Error(data.error?.message||('HTTP '+res.status));
        return data.choices?.[0]?.message?.content?.trim()||'';
      }catch(e){ return 'OpenAI error: '+e.message; }
    }};
  }

  // Default: Gemini
  if(!jobaid_api_key_gemini) return null;
  const GEMINI_MODEL='gemini-1.5-flash';
  const base='https://generativelanguage.googleapis.com/v1beta/models';
  return { async complete(prompt){
    try{
      const url=`${base}/${encodeURIComponent(GEMINI_MODEL)}:generateContent?key=${encodeURIComponent(jobaid_api_key_gemini)}`;
      const res=await fetch(url,{ method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ contents:[{role:'user', parts:[{text: prompt}]}], generationConfig:{temperature:0.2} }) });
      const data=await res.json();
      if(!res.ok) throw new Error(data.error?.message||('HTTP '+res.status));
      const text=data.candidates?.[0]?.content?.parts?.map(p=>p.text).join('')||'';
      return text.trim();
    }catch(e){ return 'Gemini error: '+e.message; }
  }};
}
