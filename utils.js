async function extractPdfText(file){
  try{
    const buf = await file.arrayBuffer();
    const pdfjsLib = window.pdfjsLib || (await (async()=>{throw new Error('pdf.js not loaded');})());
    if (pdfjsLib?.GlobalWorkerOptions) {
      pdfjsLib.GlobalWorkerOptions.workerSrc = chrome.runtime.getURL('vendor/pdf.worker.js');
    }
    const pdf = await pdfjsLib.getDocument({ data: buf }).promise; 
    let out='';
    for(let i=1;i<=pdf.numPages;i++){
      const page=await pdf.getPage(i);
      const tc=await page.getTextContent();
      out+=tc.items.map(it=>it.str).join(' ')+'\n';
    }
    return out;
  }catch(e){
    throw new Error('PDF parsing is not set up yet. Ensure vendor/pdf.js and vendor/pdf.worker.js exist.');
  }
}

async function extractDocxText(file){
  try{
    const JSZip=await import(chrome.runtime.getURL('vendor/jszip.min.mjs'));
    const zip=await JSZip.default.loadAsync(await file.arrayBuffer());
    const xml=await zip.file('word/document.xml').async('string');
    return xml.replace(/<[^>]+>/g,' ').replace(/\s+/g,' ');
  }catch(e){
    throw new Error('DOCX parsing is not set up yet. Place JSZip ESM build in /vendor/jszip.min.mjs or upload a .txt resume.');
  }
}

function tokenize(s){return (s||'').toLowerCase().match(/[a-z0-9+#.]+/g)||[]}
function jaccardScore(a,b){ const A=new Set(tokenize(a)); const B=new Set(tokenize(b)); const inter=[...A].filter(x=>B.has(x)).length; const union=new Set([...A,...B]).size; return union? inter/union:0; }
