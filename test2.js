
"use strict";
/* =========================================================================
   StockFlow â€” Application Logic
   A clean, workflow-focused metadata studio.
   ========================================================================= */

/* ---------- Constants ---------- */
const ADOBE_CATEGORIES = ["Animals","Buildings and Architecture","Business","Drinks","The Environment","States of Mind","Food","Graphic Resources","Hobbies and Leisure","Industry","Landscapes","Lifestyle","People","Plants and Flowers","Culture and Religion","Science","Society","Sports","Technology","Transport","Travel"];
const SHUTTERSTOCK_CATEGORIES = ["Abstract","Animals/Wildlife","Arts","Backgrounds/Textures","Beauty/Fashion","Buildings and Architecture","Business/Finance","Celebrities","Education","Food and Drink","Healthcare/Medical","Holidays","Industrial","Interiors","Miscellaneous","Nature","Objects","Parks/Outdoor","People","Religion","Science","Signs/Symbols","Sports/Recreation","Technology","Transportation","Vintage"];
const SUPPORTED_EXT = ["jpg","jpeg","png","eps","ai","svg"];
const DB_NAME = "stockflow_db";
const STORE = "kv";
const TITLE_MIN = 30, DESC_MIN = 50, KW_MIN = 15;
function categoriesFor(){ return state.settings.platform === "shutterstock" ? SHUTTERSTOCK_CATEGORIES : ADOBE_CATEGORIES; }

/* Category â†’ emoji + color mapping for professional colored badges.
   Maps both Adobe Stock and Shutterstock official categories to a recognizable
   emoji + accent color so the badge stands out from keyword text. */
const CATEGORY_STYLE = {
  // Adobe Stock
  "Animals": { emoji: "ðŸ¾", color: "#f59e0b" },
  "Buildings and Architecture": { emoji: "ðŸ¢", color: "#6366f1" },
  "Business": { emoji: "ðŸ’¼", color: "#0ea5e9" },
  "Drinks": { emoji: "ðŸ¹", color: "#ec4899" },
  "The Environment": { emoji: "ðŸŒ¿", color: "#16a34a" },
  "States of Mind": { emoji: "ðŸ§ ", color: "#a855f7" },
  "Food": { emoji: "ðŸ”", color: "#ef4444" },
  "Graphic Resources": { emoji: "ðŸŽ¨", color: "#8b5cf6" },
  "Hobbies and Leisure": { emoji: "ðŸŽ¯", color: "#f97316" },
  "Industry": { emoji: "ðŸ­", color: "#64748b" },
  "Landscapes": { emoji: "ðŸ”ï¸", color: "#14b8a6" },
  "Lifestyle": { emoji: "ðŸŒŸ", color: "#eab308" },
  "People": { emoji: "ðŸ‘¥", color: "#3b82f6" },
  "Plants and Flowers": { emoji: "ðŸŒ¸", color: "#22c55e" },
  "Culture and Religion": { emoji: "ðŸ›ï¸", color: "#d97706" },
  "Science": { emoji: "ðŸ”¬", color: "#06b6d4" },
  "Society": { emoji: "ðŸŒ", color: "#0891b2" },
  "Sports": { emoji: "âš½", color: "#f43f5e" },
  "Technology": { emoji: "âš™ï¸", color: "#3b82f6" },
  "Transport": { emoji: "ðŸš—", color: "#64748b" },
  "Travel": { emoji: "âœˆï¸", color: "#0ea5e9" },
  // Shutterstock
  "Abstract": { emoji: "ðŸ–Œï¸", color: "#8b5cf6" },
  "Animals/Wildlife": { emoji: "ðŸ¦", color: "#f59e0b" },
  "Arts": { emoji: "ðŸŽ­", color: "#ec4899" },
  "Backgrounds/Textures": { emoji: "ðŸ–¼ï¸", color: "#64748b" },
  "Beauty/Fashion": { emoji: "ðŸ’„", color: "#f43f5e" },
  "Business/Finance": { emoji: "ðŸ’°", color: "#0ea5e9" },
  "Celebrities": { emoji: "â­", color: "#eab308" },
  "Education": { emoji: "ðŸ“š", color: "#3b82f6" },
  "Food and Drink": { emoji: "ðŸ½ï¸", color: "#ef4444" },
  "Healthcare/Medical": { emoji: "ðŸ¥", color: "#16a34a" },
  "Holidays": { emoji: "ðŸŽ‰", color: "#dc2626" },
  "Industrial": { emoji: "ðŸ—ï¸", color: "#64748b" },
  "Interiors": { emoji: "ðŸ›‹ï¸", color: "#a855f7" },
  "Miscellaneous": { emoji: "ðŸ“¦", color: "#64748b" },
  "Nature": { emoji: "ðŸŒ¿", color: "#16a34a" },
  "Objects": { emoji: "ðŸ“·", color: "#0891b2" },
  "Parks/Outdoor": { emoji: "ðŸŒ³", color: "#22c55e" },
  "Religion": { emoji: "ðŸ•Šï¸", color: "#d97706" },
  "Signs/Symbols": { emoji: "ðŸ”¢", color: "#64748b" },
  "Sports/Recreation": { emoji: "ðŸ…", color: "#f43f5e" },
  "Transportation": { emoji: "ðŸš‚", color: "#64748b" },
  "Vintage": { emoji: "ðŸ“»", color: "#92400e" },
};
function categoryStyle(name){
  if(!name) return { emoji: "ðŸ“", color: "#64748b" };
  // Direct match
  if(CATEGORY_STYLE[name]) return CATEGORY_STYLE[name];
  // Fuzzy match by lowercase includes
  const lower=name.toLowerCase();
  for(const key in CATEGORY_STYLE){
    if(lower.includes(key.toLowerCase().split(" ")[0])) return CATEGORY_STYLE[key];
  }
  return { emoji: "ðŸ“", color: "#64748b" };
}

/* ---------- State ---------- */
const state = {
  assets: [],
  selected: new Set(),
  drawerId: null,
  settings: {
    platform: "adobe",
    model: "gemini-2.0-flash",
    rotateKeys: true,
    retryFailed: true,
    concurrency: 2,
    titleMax: 70,
    descMax: 180,
    kwMax: 35,
    keywordStructure: "mixed",
    metadataStrategy: "balanced",
    autoCategory: true,
    dedupeKw: true,
    negativeKeywords: "",
    customPrompt: "",
    enableCustomPrompt: false,
    mapExt: "keep"
  },
  apiKeys: [],
  keyIndex: 0,
  queue: [],
  processing: false,
  paused: false,
  cancelled: false,
  logs: [],
  history: [],
  historyIdx: -1,
  templates: []
};

/* ---------- Utility ---------- */
const $ = (s, el=document) => el.querySelector(s);
const $$ = (s, el=document) => Array.from(el.querySelectorAll(s));
const uid = () => Math.random().toString(36).slice(2,10) + Date.now().toString(36).slice(-4);
const escapeHtml = (s) => (s==null?"":String(s)).replace(/[&<>"']/g, c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const extOf = (name) => { const m = name.match(/\.([a-z0-9]+)$/i); return m ? m[1].toLowerCase() : ""; };
const baseName = (name) => name.replace(/\.[^.]+$/, "");
const clamp = (v,a,b) => Math.max(a, Math.min(b, v));
const sleep = (ms) => new Promise(r=>setTimeout(r,ms));

/* ---------- IndexedDB ---------- */
const idb = {
  db: null,
  async open() { return new Promise((res,rej)=>{ const req=indexedDB.open(DB_NAME,1); req.onupgradeneeded=e=>{const d=e.target.result; if(!d.objectStoreNames.contains(STORE))d.createObjectStore(STORE);}; req.onsuccess=e=>{this.db=e.target.result;res();}; req.onerror=()=>rej(req.error); }); },
  async set(k,v){ if(!this.db)return; return new Promise(res=>{const tx=this.db.transaction(STORE,"readwrite");tx.objectStore(STORE).put(v,k);tx.oncomplete=()=>res();tx.onerror=()=>res();}); },
  async get(k){ if(!this.db)return null; return new Promise(res=>{const tx=this.db.transaction(STORE,"readonly");const r=tx.objectStore(STORE).get(k);r.onsuccess=()=>res(r.result);r.onerror=()=>res(null);}); }
};
let saveTimer=null;
function scheduleSave(){ clearTimeout(saveTimer); saveTimer=setTimeout(async()=>{ try{ await idb.set("state",{settings:state.settings,apiKeys:state.apiKeys.map(k=>({key:k.key,status:k.status,uses:k.uses,lastError:k.lastError})),templates:state.templates}); }catch(e){} },800); }

/* ---------- Toast ---------- */
function toast(title,msg="",type="info",timeout=3400){
  const wrap=$("#toastWrap"); const el=document.createElement("div"); el.className="toast "+type;
  const icons={success:'<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--success)" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>',error:'<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--danger)" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>',warn:'<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--warning)" stroke-width="2.5"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>',info:'<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--info)" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>'};
  el.innerHTML=`<div class="ti-ic">${icons[type]||icons.info}</div><div class="ti-body"><div class="ti-title">${escapeHtml(title)}</div>${msg?`<div class="ti-msg">${escapeHtml(msg)}</div>`:""}</div>`;
  wrap.appendChild(el); setTimeout(()=>{el.classList.add("out");setTimeout(()=>el.remove(),250);},timeout);
}

/* ---------- Modal ---------- */
let _modalPrevFocus=null; // element that had focus before the modal opened (for restore on close)
function showModal(title,bodyHtml,opts={}){
  const mount=$("#modalMount"); const ic=opts.icon||'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>';
  mount.innerHTML=`<div class="modal-overlay"><div class="modal ${opts.large?'lg':''}"><div class="modal-head"><div class="mh-ic">${ic}</div><h3>${escapeHtml(title)}</h3><button class="btn icon ghost" data-close aria-label="Close"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button></div><div class="modal-body">${bodyHtml}</div>${opts.foot?`<div class="modal-foot">${opts.foot}</div>`:""}</div></div>`;
  // Save the element that had focus so we can restore it when the modal closes
  _modalPrevFocus=document.activeElement;
  const overlay=mount.querySelector(".modal-overlay"); overlay.addEventListener("click",e=>{if(e.target===overlay)closeModal();});
  mount.querySelector("[data-close]")?.addEventListener("click",closeModal);
  const modalEl=mount.querySelector(".modal");
  // Focus trap: keep Tab focus within the modal
  modalEl.addEventListener("keydown",e=>{
    if(e.key!=="Tab") return;
    const focusables=modalEl.querySelectorAll('a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])');
    if(focusables.length===0) return;
    const first=focusables[0], last=focusables[focusables.length-1];
    if(e.shiftKey){ if(document.activeElement===first){ e.preventDefault(); last.focus(); } }
    else { if(document.activeElement===last){ e.preventDefault(); first.focus(); } }
  });
  return modalEl;
}
function closeModal(){
  $("#modalMount").innerHTML="";
  // Restore focus to the element that had focus before the modal opened
  if(_modalPrevFocus && typeof _modalPrevFocus.focus==="function"){
    try{ _modalPrevFocus.focus({preventScroll:true}); }catch(e){}
  }
  _modalPrevFocus=null;
}

/* ---------- File Handling ---------- */
async function handleFiles(fileList){
  const files=Array.from(fileList).filter(f=>SUPPORTED_EXT.includes(extOf(f.name)));
  if(files.length===0){ toast("No supported files","JPG, JPEG, PNG, EPS, AI, SVG only","warn"); return; }
  let added=0, skipped=0;
  const existingNames=new Set(state.assets.map(a=>a.name));
  for(const file of files){
    if(existingNames.has(file.name)){ skipped++; continue; }
    const ext=extOf(file.name);
    const asset={id:uid(),file,name:file.name,ext,size:file.size,thumb:null,status:"pending",progress:0,meta:null,quality:null,issues:[],error:null,ts:Date.now()};
    state.assets.push(asset); existingNames.add(file.name); added++; generateThumb(asset);
  }
  if(added===0 && skipped>0){ toast("All files already added",`${skipped} duplicate(s) skipped`,"warn"); return; }
  const msg=skipped>0?`${added} added, ${skipped} duplicate(s) skipped`:`${added} asset(s) added`;
  toast("Import complete",msg,"success");
  renderAll(); scheduleSave();
}
async function generateThumb(asset){
  const ext=asset.ext;
  try{
    if(["jpg","jpeg","png"].includes(ext)){
      const url=URL.createObjectURL(asset.file); const img=new Image();
      img.onload=()=>{const canvas=document.createElement("canvas");const size=400;const r=Math.min(size/img.width,size/img.height);canvas.width=img.width*r;canvas.height=img.height*r;const ctx=canvas.getContext("2d");ctx.drawImage(img,0,0,canvas.width,canvas.height);asset.thumb=canvas.toDataURL("image/jpeg",0.75);URL.revokeObjectURL(url);renderGallery();scheduleSave();};
      img.onerror=()=>{asset.thumb=null;URL.revokeObjectURL(url);renderGallery();};
      img.src=url;
    } else if(ext==="svg"){
      const text=await asset.file.text(); const blob=new Blob([text],{type:"image/svg+xml"}); const url=URL.createObjectURL(blob); const img=new Image();
      img.onload=()=>{const canvas=document.createElement("canvas");const size=200;canvas.width=size;canvas.height=size;const ctx=canvas.getContext("2d");ctx.fillStyle="#fff";ctx.fillRect(0,0,size,size);const r=Math.min(size/img.width,size/img.height);const w=img.width*r,h=img.height*r;ctx.drawImage(img,(size-w)/2,(size-h)/2,w,h);asset.thumb=canvas.toDataURL("image/jpeg",0.8);asset._svgText=text;URL.revokeObjectURL(url);renderGallery();scheduleSave();};
      img.onerror=()=>{asset.thumb=null;URL.revokeObjectURL(url);renderGallery();};
      img.src=url;
    } else { asset.thumb=null; renderGallery(); scheduleSave(); }
  } catch(e){ asset.thumb=null; renderGallery(); scheduleSave(); }
}

/* ---------- Gemini API Client ---------- */
const gemini = {
  baseUrl: "https://generativelanguage.googleapis.com/v1beta/models",
  nextKey(){
    if(state.apiKeys.length===0) return null;
    if(!state.settings.rotateKeys) return state.apiKeys.find(k=>k.status!=="invalid"&&k.status!=="exhausted")||null;
    const n=state.apiKeys.length;
    for(let i=0;i<n;i++){ const k=state.apiKeys[(state.keyIndex+i)%n]; if(k.status!=="invalid"&&k.status!=="exhausted"){ state.keyIndex=(state.keyIndex+i+1)%n; return k; } }
    return null;
  },
  async testKey(key){
    try{
      const res=await fetch(`${this.baseUrl}/${state.settings.model}:generateContent?key=${encodeURIComponent(key)}`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({contents:[{parts:[{text:"ping"}]}],generationConfig:{maxOutputTokens:5}})});
      if(res.status===200) return {ok:true};
      const data=await res.json().catch(()=>({})); const msg=data?.error?.message||`HTTP ${res.status}`;
      if(res.status===429) return {ok:false,reason:"quota",msg};
      if(res.status===400||res.status===403) return {ok:false,reason:"invalid",msg};
      return {ok:false,reason:"error",msg};
    } catch(e){ return {ok:false,reason:"network",msg:e.message}; }
  },
  async generate(prompt,asset,retries=0){
    const keyObj=this.nextKey();
    if(!keyObj) throw new Error("No API key available. Open API Manager to add a key.");
    const apiKey=keyObj.key;
    const parts=[{text:prompt}]; let mimeType=null,imgData=null;
    if(["jpg","jpeg","png"].includes(asset.ext)){ imgData=await fileToBase64(asset.file); mimeType=asset.ext==="png"?"image/png":"image/jpeg"; }
    else if(asset.ext==="svg"&&asset._svgText){ const png=await svgTextToPngBase64(asset._svgText); if(png){imgData=png;mimeType="image/png";} }
    if(imgData) parts.push({inline_data:{mime_type:mimeType,data:imgData}});
    const body={contents:[{parts}],generationConfig:{temperature:0.7,topP:0.95,maxOutputTokens:2048,responseMimeType:"application/json"}};
    try{
      const res=await fetch(`${this.baseUrl}/${state.settings.model}:generateContent?key=${encodeURIComponent(apiKey)}`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});
      keyObj.uses++;
      if(res.status===429){ keyObj.status="exhausted";keyObj.lastError="Quota exceeded";renderApiManagerKeys();updateApiPill(); if(retries<state.apiKeys.length) return this.generate(prompt,asset,retries+1); throw new Error("All API keys exhausted (quota)."); }
      if(res.status===400||res.status===403){ const d=await res.json().catch(()=>({})); const msg=d?.error?.message||"Invalid request"; if(/API key not valid|API_KEY_INVALID/i.test(msg)){ keyObj.status="invalid";keyObj.lastError="Invalid key";renderApiManagerKeys();updateApiPill(); if(retries<state.apiKeys.length) return this.generate(prompt,asset,retries+1); throw new Error("No valid API key available."); } throw new Error(msg); }
      if(!res.ok){ const d=await res.json().catch(()=>({})); throw new Error(d?.error?.message||`HTTP ${res.status}`); }
      const data=await res.json(); const text=data?.candidates?.[0]?.content?.parts?.[0]?.text||"";
      if(!text) throw new Error("Empty response from Gemini");
      return text;
    } catch(e){ if(e.name==="TypeError"&&/fetch|network/i.test(e.message)){ if(retries<2){ await sleep(1200); return this.generate(prompt,asset,retries+1); } } throw e; }
  }
};
function fileToBase64(file){ return new Promise((res,rej)=>{const r=new FileReader();r.onload=()=>{const s=r.result;const i=s.indexOf(",");res(s.slice(i+1));};r.onerror=rej;r.readAsDataURL(file);}); }
async function svgTextToPngBase64(svgText){ return new Promise(res=>{ try{ const blob=new Blob([svgText],{type:"image/svg+xml"}); const url=URL.createObjectURL(blob); const img=new Image(); img.onload=()=>{const canvas=document.createElement("canvas");const size=512;canvas.width=size;canvas.height=size;const ctx=canvas.getContext("2d");ctx.fillStyle="#ffffff";ctx.fillRect(0,0,size,size);const r=Math.min(size/img.width,size/img.height)*0.9;const w=img.width*r,h=img.height*r;ctx.drawImage(img,(size-w)/2,(size-h)/2,w,h);URL.revokeObjectURL(url);const data=canvas.toDataURL("image/png");res(data.slice(data.indexOf(",")+1));}; img.onerror=()=>{URL.revokeObjectURL(url);res(null);}; img.src=url; }catch(e){res(null);} }); }

/* ---------- Prompt Engine (ordered construction) ---------- */
const VARIABLES = [
  {token:"{title_min}",label:"Title min",get:()=>TITLE_MIN},
  {token:"{title_max}",label:"Title max",get:()=>state.settings.titleMax},
  {token:"{description_min}",label:"Desc min",get:()=>DESC_MIN},
  {token:"{description_max}",label:"Desc max",get:()=>state.settings.descMax},
  {token:"{keyword_min}",label:"Keyword min",get:()=>KW_MIN},
  {token:"{keyword_max}",label:"Keyword max",get:()=>state.settings.kwMax},
  {token:"{platform}",label:"Platform",get:()=>state.settings.platform==="shutterstock"?"Shutterstock":"Adobe Stock"},
  {token:"{category}",label:"Category",get:()=>"auto-detected"}
];
function substituteVars(text){ let out=text; for(const v of VARIABLES) out=out.split(v.token).join(String(v.get())); return out; }

/* ---------- Metadata Strategies ---------- */
const METADATA_STRATEGIES = {
  balanced: {
    name: "Balanced SEO",
    desc: "Recommended for most Adobe Stock uploads.",
    prompt: `GENERATION STRATEGY â€” Balanced SEO:
- Use natural, commercially useful titles that read well to humans.
- Write balanced descriptions covering both visible elements and commercial context.
- Generate well-rounded keywords covering literal, conceptual, and commercial terms.
- Prioritize overall quality and strong Adobe Stock compatibility.
- Avoid keyword stuffing or unnatural phrasing.`
  },
  keyword_rich: {
    name: "Keyword Rich",
    desc: "Generate additional relevant keyword variations.",
    prompt: `GENERATION STRATEGY â€” Keyword Rich:
- Generate MORE keyword variations than usual â€” include synonyms, related terms, and variant phrasings.
- Maximize keyword relevance and coverage for the asset's subject matter.
- Best suited for icons, vectors, and design collections where broad discoverability matters.
- Still remove duplicates and avoid spam or irrelevant terms.
- Titles and descriptions should be natural; the richness applies to keywords.`
  },
  seo_precision: {
    name: "SEO Precision",
    desc: "Optimized for search ranking and discoverability.",
    prompt: `GENERATION STRATEGY â€” SEO Precision:
- Create strong, search-focused titles that include the primary search term early.
- Order keywords strictly by search importance and commercial intent (most valuable first).
- Prioritize maximum discoverability while maintaining strict relevance to the visible content.
- Filter out weak, marginal, or tangential keywords aggressively.
- Descriptions should include key search phrases naturally within readable sentences.`
  },
  editorial: {
    name: "Editorial",
    desc: "Neutral wording for editorial assets.",
    prompt: `GENERATION STRATEGY â€” Editorial:
- Use neutral, factual wording throughout all metadata.
- Write literal, journalistic descriptions without marketing language or subjective adjectives.
- Select keywords that literally and factually describe what is visible in the asset.
- Avoid promotional or commercial phrasing.
- Suitable for news, documentary, and editorial stock content.`
  },
  icon_collection: {
    name: "ðŸŽ¨ Icon Collection",
    desc: "Specialized multi-stage analysis for icon sheets and icon packs.",
    isSpecial: true,
    helperText: "Specialized AI analysis for icon collections. Every icon is analyzed individually before generating one highly optimized metadata package for the entire collection.",
    prompt: null // Handled separately in buildPrompt via buildIconCollectionPrompt
  }
};

function buildIconCollectionPrompt(){
  const s=state.settings;
  const platformName=s.platform==="shutterstock"?"Shutterstock":"Adobe Stock";
  const cats=categoriesFor();
  let p=`You are an expert ${platformName} metadata specialist specializing in icon collections, icon packs, and icon sheets. You understand that these assets contain multiple individual icons carefully designed as a cohesive collection, and you treat them as premium creative assets.

CORE PHILOSOPHY:
This is NOT a single illustration. This is a professional icon collection containing multiple icons.
Every icon must be analyzed individually, then combined into ONE highly optimized metadata package.
Prioritize keyword quality and search relevance over quantity.
Treat every icon collection as a premium asset that reflects significant design effort.

PLATFORM RULES (${platformName}):
- Metadata must be compatible with ${platformName} upload requirements.
- Use natural, commercially useful language suitable for stock licensing.
${s.platform==="adobe"?"- Follow Adobe Stock best practices strictly.":""}

MULTI-STAGE ANALYSIS WORKFLOW:
You MUST perform the following stages mentally before generating metadata:

STAGE 1 â€” DETECT EVERY ICON:
Scan the entire icon sheet. Identify every visible icon individually.
Examples of what you might find: battery, solar panel, wind turbine, cloud, hospital, calendar, shopping cart, camera, user, heart, leaf, lock, truck, phone, etc.

STAGE 2 â€” UNDERSTAND EACH ICON:
Understand what each detected icon represents and its meaning.

STAGE 3 â€” IDENTIFY THE COLLECTION THEME:
Determine the overall theme of the entire collection.
Examples: Business, Healthcare, Finance, Technology, Education, Travel, Food, Transportation, Renewable Energy, Weather, Communication, Security, Commerce, User Interface, etc.

STAGE 4 â€” GENERATE ONE OPTIMIZED METADATA PACKAGE:
Combine your understanding of every icon into a single, highly optimized metadata set representing the entire collection.

METADATA GENERATION RULES:

TITLE:
- Generate ONE professional commercial title.
- Natural English, human-readable, with commercial search intent.
- Describe the OVERALL collection, not individual icons.
- Avoid keyword stuffing and unnecessary repetition.
- Maximum ${s.titleMax} characters (minimum ${TITLE_MIN}). Do NOT exceed ${s.titleMax} characters.

DESCRIPTION:
- Generate ONE professional description.
- Describe the icon collection naturally.
- Explain the primary theme.
- Mention the visual style only when relevant.
- Mention practical commercial uses naturally.
- Avoid marketing fluff.
- Maximum ${s.descMax} characters (minimum ${DESC_MIN}). Do NOT exceed ${s.descMax} characters.

KEYWORDS (HIGHEST PRIORITY):
- Combine the understanding of EVERY icon into ONE optimized keyword list.
- Do NOT generate separate keyword lists for individual icons.
- Prioritize the most commercially valuable keywords.
- Cover the entire collection comprehensively.
- Include major objects represented by the icons.
- Include the overall theme.
- Include relevant industries and use cases.
- Order keywords by importance (most important first).
- Remove duplicate keywords.
- Remove weak or generic keywords.
- Avoid keyword stuffing.
- Avoid repeating singular/plural variations unless genuinely valuable.
- Every keyword must have a clear SEO purpose.
- Maximum ${s.platform==="shutterstock"?Math.min(s.kwMax,50):s.kwMax} keywords (minimum ${KW_MIN}). Never exceed ${s.platform==="shutterstock"?Math.min(s.kwMax,50):s.kwMax} keywords.${s.platform==="shutterstock"?" Never exceed 50 total.":""}
- The final keyword list should feel carefully curated by an experienced ${platformName} contributor.

CATEGORY (STRICT â€” MUST OBEY):
- Choose exactly ONE category from ${platformName}'s official category list. Never invent, abbreviate, or paraphrase a category name.
- Do NOT output a keyword as the category. The category must be one of these EXACT values:
  ${cats.map(c=>`"${c}"`).join(", ")}.
- Base the decision on the overall theme of the entire collection, not on one individual icon.
- Never guess randomly. Always choose the category with the highest confidence. If multiple categories could apply, choose the ONE strongest match.

SAFETY:
- Never include trademarked terms, brand names, celebrity names, or logos.

`;
  // Keyword Structure
  const ks=s.keywordStructure;
  if(ks==="single") p+=`KEYWORD STRUCTURE: Generate ONLY individual single-word keywords.\n\n`;
  else if(ks==="double") p+=`KEYWORD STRUCTURE: Generate ONLY two-word keyword phrases. Never force unnatural combinations.\n\n`;
  else p+=`KEYWORD STRUCTURE: Generate a balanced MIX of single-word and two-word keyword phrases appropriate for an icon collection.\n\n`;
  // User Custom Instructions
  if(s.enableCustomPrompt && s.customPrompt && s.customPrompt.trim()){
    p+=`ADDITIONAL USER INSTRUCTIONS (these supplement, but do not override, the above rules):\n${substituteVars(s.customPrompt.trim())}\n\n`;
  }
  // Output schema
  p+=`Analyze the provided icon collection image, perform the multi-stage analysis workflow, and return ONLY a valid JSON object with this exact schema (no markdown, no commentary):
{
  "title": "string",
  "description": "string",
  "keywords": ["string", "..."],
  "category": "one of the listed categories",
  "confidence": 95,
  "alternatives": ["category", "category"]
}`;
  return p;
}

function buildPrompt(){
  const s=state.settings;
  // Specialized prompt for Icon Collection strategy
  if(s.metadataStrategy==="icon_collection"){
    return buildIconCollectionPrompt();
  }
  // Platform-specific engines
  if(s.platform==="shutterstock"){
    return buildShutterstockPrompt();
  }
  return buildAdobePrompt();
}

function buildAdobePrompt(){
  const s=state.settings;
  const cats=ADOBE_CATEGORIES;
  const targetTitleMin = Math.max(TITLE_MIN, Math.floor(s.titleMax * 0.7));
  const targetDescMin = Math.max(DESC_MIN, Math.floor(s.descMax * 0.8));
  let p=`You are an expert Adobe Stock metadata specialist. Generate high-quality metadata that follows established best practices.

CORE PHILOSOPHY:
Prioritize accuracy, relevance, natural language, commercial usefulness, and specificity.
Avoid keyword stuffing, generic titles, irrelevant concepts, repeated keywords, and misleading metadata.
Do NOT attempt to manipulate rankings. Generate only truthful, descriptive metadata reflecting what is actually present in the asset.

PLATFORM RULES (Adobe Stock):
- Metadata must be compatible with Adobe Stock upload requirements.
- Use natural, commercially useful language suitable for stock licensing.
- Follow Adobe Stock best practices strictly.

METADATA RULES:
- Title: natural, human-readable, specific, accurate, descriptive. No spam, no clickbait, no generic phrases (e.g. avoid "Beautiful Image", "Nice Background"), no unnecessary repetition.
- Description: accurately describe the content; mention useful context and intended commercial usage when appropriate. Do NOT repeat the title. Avoid filler language.
- Keywords: highly relevant, no duplicates, no stuffing, no irrelevant terms. Order by importance (most important first). Include conceptual keywords only when genuinely appropriate.

LENGTH RULES (MUST OBEY):
- Title: write a title between ${targetTitleMin} and ${s.titleMax} characters. Do NOT exceed ${s.titleMax} characters.
- Description: write a description between ${targetDescMin} and ${s.descMax} characters. Do NOT exceed ${s.descMax} characters.
- Keywords: generate up to ${s.kwMax} keywords (minimum ${KW_MIN}). Never exceed ${s.kwMax} keywords.

CATEGORY RULES (STRICT â€” MUST OBEY):
- Choose exactly ONE category from Adobe Stock's official category list (provided below). Never invent, abbreviate, or paraphrase a category name.
- Do NOT output a keyword as the category. The category must be one of these EXACT values:
  ${cats.map(c=>`"${c}"`).join(", ")}.
- Intelligently determine the single best-matching official category based on the image's dominant subject, theme, and commercial intent. Choose the category with the highest semantic confidence for Adobe Stock search.
- If multiple categories could apply, choose the ONE strongest match. Never output more than one category.
- Provide a confidence score (0-100) and up to 3 alternative categories from the SAME official list above.

`;
  const ks=s.keywordStructure;
  if(ks==="single") p+=`KEYWORD STRUCTURE: Generate ONLY individual single-word keywords.\n\n`;
  else if(ks==="double") p+=`KEYWORD STRUCTURE: Generate ONLY two-word keyword phrases. Never force unnatural combinations.\n\n`;
  else p+=`KEYWORD STRUCTURE: Generate a balanced MIX of single-word and two-word keyword phrases. Intelligently decide the ratio based on the asset content. Never create unnatural or repetitive combinations. Never force two-word phrases when they are not meaningful. Always prioritize keyword quality over quantity.\n\n`;
  p+=`Never include trademarked terms, brand names, celebrity names, or logos.\n\n`;
  const strategy = METADATA_STRATEGIES[s.metadataStrategy] || METADATA_STRATEGIES.balanced;
  if(strategy.prompt){ p+=strategy.prompt + `\n\n`; }
  if(s.enableCustomPrompt && s.customPrompt && s.customPrompt.trim()){
    p+=`ADDITIONAL USER INSTRUCTIONS (these supplement, but do not override, the above rules):\n${substituteVars(s.customPrompt.trim())}\n\n`;
  }
  p+=`Analyze the provided visual asset and return ONLY a valid JSON object with this exact schema (no markdown, no commentary):
{
  "title": "string",
  "description": "string",
  "keywords": ["string", "..."],
  "category": "one of the listed categories",
  "confidence": 95,
  "alternatives": ["category", "category"]
}`;
  return p;
}

function buildShutterstockPrompt(){
  const s=state.settings;
  const cats=SHUTTERSTOCK_CATEGORIES;
  const targetTitleMin = Math.max(TITLE_MIN, Math.floor(s.titleMax * 0.7));
  const targetDescMin = Math.max(DESC_MIN, Math.floor(s.descMax * 0.8));
  let p=`You are an expert Shutterstock metadata specialist. Generate high-quality metadata that follows Shutterstock's official contributor requirements and best practices.

CORE PHILOSOPHY:
Prioritize accuracy, commercial value, search relevance, and natural language.
Avoid keyword stuffing, generic titles, irrelevant concepts, repeated keywords, and misleading metadata.
Do NOT attempt to manipulate rankings. Generate only truthful, descriptive metadata reflecting what is actually present in the asset.

PLATFORM RULES (Shutterstock):
- Metadata must be compatible with Shutterstock upload requirements.
- Use natural, commercially useful English language suitable for stock licensing.
- Follow Shutterstock contributor best practices strictly.

TITLE RULES:
- Natural, human-readable, specific, accurate, descriptive.
- No spam, no clickbait, no generic phrases (e.g. avoid "Beautiful Image", "Nice Background").
- No unnecessary repetition. No emojis. No hashtags. No HTML. No URLs.
- No camera metadata. No software names. No file names. No promotional language.

DESCRIPTION RULES:
- Accurately describe the content in natural English.
- Mention useful context and intended commercial usage when appropriate.
- Do NOT repeat the title. Avoid filler language.
- No emojis. No hashtags. No HTML. No URLs. No camera metadata.
- No software names. No file names. No promotional language. No unnecessary punctuation.
- Use proper grammar and professional tone.

KEYWORD RULES (CRITICAL):
- English only. Highly relevant. Unique. Search focused.
- No duplicates. No keyword stuffing. No repeated stems (e.g. "flower" and "flowers" together is discouraged unless genuinely valuable).
- No irrelevant words. No misleading keywords.
- No trademarks. No celebrity names. No company names. No copyrighted brands. No camera metadata.
- Maximum 50 keywords. NEVER exceed 50.
- First keywords must describe the primary subject. Then include: Objects, Concepts, Usage, Industry, Style, Emotion, Composition, Commercial intent.
- Do NOT add keywords simply to reach the maximum count. Quality over quantity.
- Order by importance (most important first).

LENGTH RULES (MUST OBEY):
- Title: write a title between ${targetTitleMin} and ${s.titleMax} characters. Do NOT exceed ${s.titleMax} characters.
- Description: write a description between ${targetDescMin} and ${s.descMax} characters. Do NOT exceed ${s.descMax} characters.
- Keywords: up to ${Math.min(s.kwMax, 50)} keywords (minimum ${KW_MIN}). Never exceed ${Math.min(s.kwMax, 50)} keywords. Never exceed 50 total.

CATEGORY RULES (STRICT â€” MUST OBEY):
- Choose exactly ONE category from Shutterstock's official category list (provided below). Never invent, abbreviate, or paraphrase a category name.
- Do NOT output a keyword as the category. The category must be one of these EXACT values:
  ${cats.map(c=>`"${c}"`).join(", ")}.
- Intelligently determine the single best-matching official category based on the image's dominant subject, theme, and commercial intent. Base the decision on commercial accuracy before visual similarity.
- Never invent categories. Never use categories from other platforms. If multiple categories could apply, choose the ONE strongest match.
- Provide a confidence score (0-100) and up to 3 alternative categories from the SAME official list above.

`;
  const ks=s.keywordStructure;
  if(ks==="single") p+=`KEYWORD STRUCTURE: Generate ONLY individual single-word keywords.\n\n`;
  else if(ks==="double") p+=`KEYWORD STRUCTURE: Generate ONLY two-word keyword phrases. Never force unnatural combinations.\n\n`;
  else p+=`KEYWORD STRUCTURE: Generate a balanced MIX of single-word and two-word keyword phrases. Intelligently decide the ratio based on the asset content. Never create unnatural or repetitive combinations. Never force two-word phrases when they are not meaningful. Always prioritize keyword quality over quantity.\n\n`;
  p+=`Never include trademarked terms, brand names, celebrity names, or logos.\n\n`;
  p+=`CHARACTER RESTRICTIONS: Do not use emojis, special Unicode characters, invisible characters, or unsupported punctuation in any field. Use standard ASCII English characters. Normalize quotation marks to standard double quotes. Normalize dashes to hyphens.\n\n`;
  const strategy = METADATA_STRATEGIES[s.metadataStrategy] || METADATA_STRATEGIES.balanced;
  if(strategy.prompt){ p+=strategy.prompt + `\n\n`; }
  if(s.enableCustomPrompt && s.customPrompt && s.customPrompt.trim()){
    p+=`ADDITIONAL USER INSTRUCTIONS (these supplement, but do not override, the above rules):\n${substituteVars(s.customPrompt.trim())}\n\n`;
  }
  p+=`Analyze the provided visual asset and return ONLY a valid JSON object with this exact schema (no markdown, no commentary):
{
  "title": "string",
  "description": "string",
  "keywords": ["string", "..."],
  "category": "one of the listed Shutterstock categories",
  "confidence": 95,
  "alternatives": ["category", "category"]
}`;
  return p;
}

function buildBuiltinPrompt(){ return buildPrompt(); }

/* ---------- Negative keyword filtering ---------- */
function getNegativeKwSet(){ return new Set(state.settings.negativeKeywords.split(/[,\n]/).map(s=>s.trim().toLowerCase()).filter(Boolean)); }
function applyKeywordFilters(keywords){
  const neg=getNegativeKwSet(); const seen=new Set();
  return keywords.filter(k=>{ const lk=k.toLowerCase(); if(state.settings.dedupeKw&&seen.has(lk))return false; if(neg.has(lk))return false; seen.add(lk); return true; });
}

/* ---------- Shutterstock text sanitization ---------- */
function sanitizeShutterstockText(text){
  if(!text) return text;
  let s = String(text);
  // Remove emojis and special Unicode
  s = s.replace(/[\u{1F000}-\u{1FFFF}]/gu, "");
  s = s.replace(/[\u{2600}-\u{27BF}]/gu, "");
  // Remove invisible characters
  s = s.replace(/[\u200B-\u200F\uFEFF\u00A0]/g, " ");
  // Remove HTML tags
  s = s.replace(/<[^>]*>/g, "");
  // Remove URLs
  s = s.replace(/https?:\/\/\S+/gi, "");
  s = s.replace(/www\.\S+/gi, "");
  // Remove hashtags
  s = s.replace(/#[^\s#]+/g, "");
  // Normalize quotation marks
  s = s.replace(/[\u201C\u201D\u201E\u201F\u00AB\u00BB]/g, '"');
  s = s.replace(/[\u2018\u2019\u201A\u201B]/g, "'");
  // Normalize dashes
  s = s.replace(/[\u2013\u2014\u2015]/g, "-");
  // Remove excessive punctuation
  s = s.replace(/!{2,}/g, "!");
  s = s.replace(/\?{2,}/g, "?");
  s = s.replace(/\.{4,}/g, "...");
  // Trim extra spaces
  s = s.replace(/[ \t]+/g, " ");
  s = s.replace(/\n{3,}/g, "\n\n");
  s = s.trim();
  return s;
}
function sanitizeShutterstockKeywords(keywords){
  return keywords.map(k => {
    let s = String(k).trim();
    s = s.replace(/[\u{1F000}-\u{1FFFF}]/gu, "");
    s = s.replace(/[\u200B-\u200F\uFEFF\u00A0\0]/g, " ");
    s = s.replace(/[<>"'{}|\\^~]/g, "");
    s = s.replace(/\s+/g, " ").trim();
    return s;
  }).filter(Boolean);
}

/* ---------- Validation & Quality ---------- */
const GENERIC_TITLES=["beautiful image","nice background","amazing design","image","photo","picture","background","design","wallpaper","art","graphic","vector","illustration"];
function validateAsset(asset){
  const issues=[]; if(!asset.meta) return issues;
  const {title,desc,keywords,category}=asset.meta; const s=state.settings;
  const isShutterstock = s.platform==="shutterstock";
  const maxKw = isShutterstock ? Math.min(s.kwMax, 50) : s.kwMax;
  if(!title) issues.push({sev:"error",field:"title",msg:"Missing title"});
  else {
    if(title.length < TITLE_MIN) issues.push({sev:"warn",field:"title",msg:`Title may be too short (${title.length} chars)`});
    if(title.length>s.titleMax) issues.push({sev:"warn",field:"title",msg:`Title too long (${title.length}/${s.titleMax} chars)`,fix:"shorten"});
    if(GENERIC_TITLES.some(g=>title.toLowerCase().includes(g))&&title.split(" ").length<=3) issues.push({sev:"warn",field:"title",msg:"Title may be too generic",fix:"regenerate"});
    const words=title.toLowerCase().split(/\s+/); const dup=words.filter((w,i)=>words.indexOf(w)!==i);
    if(dup.length) issues.push({sev:"warn",field:"title",msg:`Duplicate words: ${[...new Set(dup)].join(", ")}`,fix:"dedupe"});
    if(isShutterstock){
      if(/[\u{1F000}-\u{1FFFF}]/u.test(title)) issues.push({sev:"warn",field:"title",msg:"Title contains emojis",fix:"regenerate"});
      if(/<[^>]*>/.test(title)) issues.push({sev:"warn",field:"title",msg:"Title contains HTML tags",fix:"regenerate"});
      if(/https?:\/\//i.test(title)) issues.push({sev:"warn",field:"title",msg:"Title contains URLs",fix:"regenerate"});
      if(/#[^\s#]+/.test(title)) issues.push({sev:"warn",field:"title",msg:"Title contains hashtags",fix:"regenerate"});
    }
  }
  if(!desc) issues.push({sev:"error",field:"desc",msg:"Missing description"});
  else {
    if(desc.length>s.descMax) issues.push({sev:"warn",field:"desc",msg:`Description too long (${desc.length}/${s.descMax} chars)`,fix:"shorten"});
    if(isShutterstock){
      if(/[\u{1F000}-\u{1FFFF}]/u.test(desc)) issues.push({sev:"warn",field:"desc",msg:"Description contains emojis",fix:"regenerate"});
      if(/<[^>]*>/.test(desc)) issues.push({sev:"warn",field:"desc",msg:"Description contains HTML tags",fix:"regenerate"});
      if(/https?:\/\//i.test(desc)) issues.push({sev:"warn",field:"desc",msg:"Description contains URLs",fix:"regenerate"});
      if(/#[^\s#]+/.test(desc)) issues.push({sev:"warn",field:"desc",msg:"Description contains hashtags",fix:"regenerate"});
    }
  }
  if(!keywords||keywords.length===0) issues.push({sev:"error",field:"keywords",msg:"No keywords"});
  else {
    if(keywords.length>maxKw) issues.push({sev:"warn",field:"keywords",msg:`Too many keywords (${keywords.length}/${maxKw})`,fix:"trim"});
    const lower=keywords.map(k=>k.toLowerCase()); const dup=lower.filter((w,i)=>lower.indexOf(w)!==i);
    if(dup.length) issues.push({sev:"error",field:"keywords",msg:`Duplicate keywords: ${[...new Set(dup)].join(", ")}`,fix:"dedupe"});
    if(isShutterstock){
      // Check for repeated stems (e.g. flower/flowers)
      const stems = lower.map(k => k.replace(/(s|es|ing|ed|er)$/, ""));
      const stemDup = stems.filter((w,i)=>stems.indexOf(w)!==i);
      if(stemDup.length>2) issues.push({sev:"info",field:"keywords",msg:`Possible repeated keyword stems: ${[...new Set(stemDup)].slice(0,5).join(", ")}`,fix:"trim"});
    }
  }
  const cats=categoriesFor();
  if(category&&!cats.includes(category)) issues.push({sev:"warn",field:"category",msg:`"${category}" is not an official ${isShutterstock?"Shutterstock":"Adobe Stock"} category â€” must be one of the exact official values`,fix:"regenerate"});
  return issues;
}
function computeQuality(asset){
  if(!asset.meta) return 0;
  const {title,desc,keywords,category,confidence}=asset.meta; const s=state.settings; let score=0;
  const isShutterstock = s.platform==="shutterstock";
  const maxKw = isShutterstock ? Math.min(s.kwMax, 50) : s.kwMax;
  let t=0; if(title){ t=18; if(title.length<=s.titleMax&&title.length>=20)t+=5; else if(title.length>=10)t+=2; if(GENERIC_TITLES.some(g=>title.toLowerCase().includes(g))&&title.split(" ").length<=3)t-=6; const words=title.toLowerCase().split(/\s+/); if(words.filter((w,i)=>words.indexOf(w)!==i).length)t-=4; } score+=clamp(t,0,25);
  let d=0; if(desc){ d=18; if(desc.length<=s.descMax&&desc.length>=30)d+=7; else if(desc.length>=15)d+=3; } score+=clamp(d,0,25);
  let k=0; if(keywords&&keywords.length){ k=15; if(keywords.length<=maxKw&&keywords.length>=KW_MIN)k+=7; else if(keywords.length>=5)k+=3; const lower=keywords.map(x=>x.toLowerCase()); if(lower.filter((w,i)=>lower.indexOf(w)!==i).length)k-=6; } score+=clamp(k,0,25);
  score+=clamp(Math.round((confidence||0)/100*15),0,15);
  score+=8;
  return Math.round(clamp(score,0,100));
}

/* ---------- Metadata Generation ---------- */
async function generateForAsset(asset){
  const prompt=buildPrompt();
  asset.status="processing"; asset.progress=20; asset.error=null;
  renderGallery(); updateStats();
  try{
    asset.progress=40; renderGallery();
    const raw=await gemini.generate(prompt,asset);
    asset.progress=80; renderGallery();
    let parsed;
    try{ const clean=raw.replace(/^```json\s*/i,"").replace(/^```\s*/,"").replace(/```\s*$/,"").trim(); parsed=JSON.parse(clean); }
    catch(e){ const m=raw.match(/\{[\s\S]*\}/); if(m)parsed=JSON.parse(m[0]); else throw new Error("Could not parse AI response as JSON"); }
    let keywords=Array.isArray(parsed.keywords)?parsed.keywords:(typeof parsed.keywords==="string"?parsed.keywords.split(",").map(s=>s.trim()).filter(Boolean):[]);
    keywords=keywords.map(k=>String(k).trim()).filter(Boolean);
    keywords=applyKeywordFilters(keywords);
    const maxKw = state.settings.platform==="shutterstock" ? Math.min(state.settings.kwMax, 50) : state.settings.kwMax;
    if(keywords.length>maxKw) keywords=keywords.slice(0,maxKw);
    const cats=categoriesFor();
    let category=state.settings.autoCategory?(parsed.category||cats[0]):cats[0];
    if(!cats.includes(category)){ const guess=cats.find(c=>c.toLowerCase()===String(category).toLowerCase()); category=guess||cats[0]; }
    let alternatives=Array.isArray(parsed.alternatives)?parsed.alternatives.filter(a=>cats.includes(a)).slice(0,3):[];
    function truncateText(text, max, isDesc){
      if(!text||text.length<=max) return text;
      let t=text.substring(0,max);
      const lastSpace=t.lastIndexOf(" ");
      if(lastSpace>0) t=t.substring(0,lastSpace);
      t=t.replace(/[.,:;-]+$/,"");
      return isDesc ? t+"." : t;
    }
    let title=truncateText(String(parsed.title||"").trim(), state.settings.titleMax, false);
    let desc=truncateText(String(parsed.description||parsed.desc||"").trim(), state.settings.descMax, true);
    // Shutterstock post-generation sanitization
    if(state.settings.platform==="shutterstock"){
      title=sanitizeShutterstockText(title);
      desc=sanitizeShutterstockText(desc);
      keywords=sanitizeShutterstockKeywords(keywords);
    }
    asset.meta={title,desc,keywords,category,confidence:clamp(parseInt(parsed.confidence)||70,0,100),alternatives};
    asset.status="done"; asset.progress=100;
    asset.quality=computeQuality(asset); asset.issues=validateAsset(asset);
  } catch(e){ asset.status="error"; asset.error=e.message; asset.progress=0; }
  renderGallery(); updateStats(); if(state.processing) { const done=state.assets.filter(a=>a.status==="done").length; const total=state.queue.length+done+state.assets.filter(a=>a.status==="processing").length; updateProgressDisplay(done,total); } if(state.drawerId===asset.id) renderDrawer(); scheduleSave();
}

/* ---------- Batch Processing ---------- */
async function startBatch(assetsToProcess){
  if(state.apiKeys.length===0){ toast("No API key","Open API Manager to add a key","error"); openApiSettings(); return; }
  if(state.processing) return;
  const targets=assetsToProcess||state.assets.filter(a=>a.status==="pending"||a.status==="error");
  if(targets.length===0){ toast("Nothing to process","All assets already have metadata","warn"); return; }
  // Lock platform once generation starts
  lockPlatform();
  state.processing=true; state.paused=false; state.cancelled=false; state.queue=targets.slice();
  targets.forEach(a=>{if(a.status!=="done")a.status="queued";});
  $("#progressSection").classList.add("show"); $("#psBar").classList.remove("complete"); $("#psPct").classList.remove("complete"); $("#psTitle").textContent="Generating Metadata..."; $("#btnGenerateAll").disabled=true; renderGallery();
  const concurrency=clamp(state.settings.concurrency,1,10); const total=targets.length; let done=0; const startTime=Date.now();
  async function worker(){ while(state.queue.length&&!state.cancelled){ if(state.paused){await sleep(300);continue;} const asset=state.queue.shift(); if(!asset)break; await generateForAsset(asset); done++; updateProgressDisplay(done,total); } }
  const workers=[]; for(let i=0;i<concurrency;i++) workers.push(worker());
  await Promise.all(workers);
  state.processing=false; $("#btnGenerateAll").disabled=false;
  if(state.cancelled){ $("#psTitle").textContent="Cancelled"; setTimeout(()=>{ $("#progressSection").classList.remove("show"); },1500); }
  else { $("#psBar").classList.add("complete"); $("#psPct").classList.add("complete"); $("#psTitle").textContent="Complete"; updateProgressDisplay(total,total,true); }
  if(!state.cancelled){ renderGallery(); }
}
function formatEta(sec){ if(!isFinite(sec)||sec<0)return"â€”"; if(sec<60)return Math.ceil(sec)+"s"; const m=Math.floor(sec/60),s=Math.ceil(sec%60); return m+"m "+s+"s"; }
function pauseBatch(){ state.paused=true; $("#btnPause").style.display="none"; $("#btnResume").style.display="grid"; $("#psTitle").textContent="Paused"; }
function resumeBatch(){ state.paused=false; $("#btnPause").style.display="grid"; $("#btnResume").style.display="none"; $("#psTitle").textContent="Generating Metadata..."; }
function cancelBatch(){ state.cancelled=true; state.paused=false; state.queue=[]; state.assets.forEach(a=>{if(a.status==="queued"||a.status==="processing")a.status="pending";}); $("#btnGenerateAll").disabled=false; state.processing=false; $("#psFill").style.width="0%"; $("#psPct").textContent="0%"; $("#psPct").classList.remove("complete"); $("#psBar").classList.remove("complete");
  // Unlock platform if no generated assets remain
  const hasGenerated = state.assets.some(a=>a.status==="done"||a.status==="edited");
  if(!hasGenerated) unlockPlatform();
  renderGallery(); }
function updateProgressDisplay(done,total,complete){
  const t=total||state.assets.length;
  const d=done!=null?done:state.assets.filter(a=>a.status==="done").length;
  const p=state.assets.filter(a=>a.status==="pending"||a.status==="queued"||a.status==="processing").length;
  const e=state.assets.filter(a=>a.status==="error").length;
  $("#psTotal").textContent=t;
  $("#psDone").textContent=d;
  $("#psPending").textContent=p;
  $("#psError").textContent=e;
  const pct=t>0?Math.round(d/t*100):0;
  $("#psFill").style.width=pct+"%";
  $("#psPct").textContent=pct+"%";
  if(complete){ $("#psBar").classList.add("complete"); $("#psPct").classList.add("complete"); }
}

/* ---------- Filename Mapping & Export ---------- */
function mapFilename(name){ const ext=state.settings.mapExt; if(ext==="keep")return name; return baseName(name)+"."+ext; }
function csvEscape(v){ if(v==null)return""; v=String(v); if(/[",\n\r]/.test(v))return'"'+v.replace(/"/g,'""')+'"'; return v; }
function buildCSV(){
  const fmt=state.settings.platform; const assets=state.assets.filter(a=>a.meta); let headers,rows;
  if(fmt==="shutterstock"){ headers=["Filename","Description","Keywords","Category","Editorial","Mature Content"]; rows=assets.map(a=>[mapFilename(a.name),a.meta.desc||a.meta.title||"",(a.meta.keywords||[]).join(", "),a.meta.category||"","FALSE","FALSE"]); }
  else { headers=["Filename","Title","Keywords","Category","Releases"]; rows=assets.map(a=>[mapFilename(a.name),a.meta.title||"",(a.meta.keywords||[]).join(", "),a.meta.category||"",""]); }
  return {headers,rows,csv:[headers,...rows].map(r=>r.map(csvEscape).join(",")).join("\r\n")};
}
function buildTXT(){ return state.assets.filter(a=>a.meta).map(a=>`Filename: ${mapFilename(a.name)}\nTitle: ${a.meta.title||""}\nDescription: ${a.meta.desc||""}\nKeywords: ${(a.meta.keywords||[]).join(", ")}\nCategory: ${a.meta.category||""}\n${"=".repeat(60)}`).join("\n\n"); }
function buildJSON(){ return JSON.stringify({exportedAt:new Date().toISOString(),platform:state.settings.platform,settings:state.settings,assets:state.assets.filter(a=>a.meta).map(a=>({filename:mapFilename(a.name),originalName:a.name,title:a.meta.title,description:a.meta.desc,keywords:a.meta.keywords,category:a.meta.category,confidence:a.meta.confidence,alternatives:a.meta.alternatives,quality:a.quality}))},null,2); }
function buildXLSX(){
  const assets=state.assets.filter(a=>a.meta); const headers=["Filename","Title","Description","Keywords","Category","Quality"];
  function escXml(s){return(s==null?"":String(s)).replace(/[<>&"']/g,c=>({"<":"&lt;",">":"&gt;","&":"&amp;",'"':"&quot;","'":"&apos;"}[c]));}
  let rowsXml=`<row r="1">`+headers.map((h,i)=>`<c r="${colLetter(i)}1" t="inlineStr"><is><t>${escXml(h)}</t></is></c>`).join("")+`</row>`;
  assets.forEach((a,ri)=>{const r=ri+2; const vals=[mapFilename(a.name),a.meta.title||"",a.meta.desc||"",(a.meta.keywords||[]).join(", "),a.meta.category||"",String(a.quality||0)]; rowsXml+=`<row r="${r}">`+vals.map((v,i)=>`<c r="${colLetter(i)}${r}" t="inlineStr"><is><t xml:space="preserve">${escXml(v)}</t></is></c>`).join("")+`</row>`;});
  const sheetXml=`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${rowsXml}</sheetData></worksheet>`;
  const workbookXml=`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Metadata" sheetId="1" r:id="rId1"/></sheets></workbook>`;
  const workbookRels=`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>`;
  const rootRels=`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`;
  const contentTypes=`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>`;
  return zipStore([["[Content_Types].xml",contentTypes],["_rels/.rels",rootRels],["xl/workbook.xml",workbookXml],["xl/_rels/workbook.xml.rels",workbookRels],["xl/worksheets/sheet1.xml",sheetXml]]);
}
function colLetter(i){let s="";i++;while(i>0){const m=(i-1)%26;s=String.fromCharCode(65+m)+s;i=Math.floor((i-1)/26);}return s;}
function zipStore(files){ const enc=new TextEncoder(); const chunks=[]; const central=[]; let offset=0; for(const [name,content] of files){ const nameBytes=enc.encode(name); const data=enc.encode(content); const crc=crc32(data); const lh=new Uint8Array(30+nameBytes.length); const dv=new DataView(lh.buffer); dv.setUint32(0,0x04034b50,true); dv.setUint16(4,20,true); dv.setUint16(8,0,true); dv.setUint16(10,0,true); dv.setUint16(12,0,true); dv.setUint32(14,crc,true); dv.setUint32(18,data.length,true); dv.setUint32(22,data.length,true); dv.setUint16(26,nameBytes.length,true); dv.setUint16(28,0,true); lh.set(nameBytes,30); chunks.push(lh,data); const ch=new Uint8Array(46+nameBytes.length); const cv=new DataView(ch.buffer); cv.setUint32(0,0x02014b50,true); cv.setUint16(4,20,true); cv.setUint16(6,20,true); cv.setUint16(8,0,true); cv.setUint16(10,0,true); cv.setUint16(12,0,true); cv.setUint16(14,0,true); cv.setUint32(16,crc,true); cv.setUint32(20,data.length,true); cv.setUint32(24,data.length,true); cv.setUint16(28,nameBytes.length,true); cv.setUint16(42,offset,true); ch.set(nameBytes,46); central.push(ch); offset+=lh.length+data.length; } const centralBytes=central.reduce((acc,c)=>{const n=new Uint8Array(acc.length+c.length);n.set(acc);n.set(c,acc.length);return n;},new Uint8Array(0)); const cdOffset=offset,cdSize=centralBytes.length; const end=new Uint8Array(22); const ev=new DataView(end.buffer); ev.setUint32(0,0x06054b50,true); ev.setUint16(8,files.length,true); ev.setUint16(10,files.length,true); ev.setUint32(12,cdSize,true); ev.setUint32(16,cdOffset,true); const all=[chunks.reduce((acc,c)=>{const n=new Uint8Array(acc.length+c.length);n.set(acc);n.set(c,acc.length);return n;},new Uint8Array(0)),centralBytes,end]; const total=all.reduce((s,a)=>s+a.length,0); const out=new Uint8Array(total); let p=0; all.forEach(a=>{out.set(a,p);p+=a.length;}); return out; }
function crc32(bytes){let c=~0;for(let i=0;i<bytes.length;i++){c^=bytes[i];for(let k=0;k<8;k++)c=(c>>>1)^(0xEDB88320&-(c&1));}return(~c)>>>0;}
function downloadBlob(content,filename,mime){ const blob=content instanceof Uint8Array?new Blob([content],{type:mime}):new Blob([content],{type:mime}); const url=URL.createObjectURL(blob); const a=document.createElement("a"); a.href=url; a.download=filename; document.body.appendChild(a); a.click(); setTimeout(()=>{URL.revokeObjectURL(url);a.remove();},100); }
function doExport(type){
  const done=state.assets.filter(a=>a.meta);
  if(done.length===0&&type!=="json"){ toast("Nothing to export","Generate metadata first","warn"); return; }
  try{
    if(type==="csv"){
      const {csv}=buildCSV();
      const dateStr=new Date().toISOString().slice(0,10);
      const fname=state.settings.platform==="shutterstock"?`StockFlow_Shutterstock_${dateStr}.csv`:`StockFlow_AdobeStock_${dateStr}.csv`;
      const content="\uFEFF"+csv;
      downloadBlob(content,fname,"text/csv;charset=utf-8");
      saveCsvHistory(fname, content, done.length);
      toast("CSV exported",`${done.length} rows Â· ${state.settings.platform==="shutterstock"?"Shutterstock":"Adobe Stock"}`,"success");
      // Unlock platform after CSV is downloaded
      unlockPlatform();
    }
    else if(type==="txt"){ downloadBlob(buildTXT(),"metadata-backup.txt","text/plain"); toast("TXT exported","","success"); }
    else if(type==="json"){ downloadBlob(buildJSON(),"StockFlow-project.json","application/json"); toast("JSON exported","","success"); }
    else if(type==="xlsx"){ downloadBlob(buildXLSX(),"metadata.xlsx","application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"); toast("XLSX exported","","success"); }
    else if(type==="clipboard"){ const {csv}=buildCSV(); navigator.clipboard.writeText(csv).then(()=>toast("Copied","CSV in clipboard","success"),()=>toast("Clipboard blocked","Use CSV export","error")); }
  } catch(e){ toast("Export failed",e.message,"error"); }
}

/* ---------- CSV Export History (IndexedDB) ---------- */
async function saveCsvHistory(filename, content, assetCount){
  try{
    let history = (await idb.get("csv_history")) || [];
    const now = new Date();
    const record = {
      id: uid(),
      filename,
      content,
      dateStr: now.toLocaleDateString(),
      timeStr: now.toLocaleTimeString([], {hour:"2-digit",minute:"2-digit"}),
      platform: state.settings.platform === "shutterstock" ? "Shutterstock" : "Adobe Stock",
      assetCount,
      fileSize: new Blob([content]).size,
      ts: now.getTime()
    };
    history.unshift(record);
    if(history.length > 5) history = history.slice(0, 5);
    await idb.set("csv_history", history);
  }catch(e){}
}
function fmtFileSize(bytes){
  if(bytes < 1024) return bytes + " B";
  if(bytes < 1048576) return (bytes/1024).toFixed(1) + " KB";
  return (bytes/1048576).toFixed(1) + " MB";
}
async function openCsvHistory(){
  let history = [];
  try{ history = (await idb.get("csv_history")) || []; }catch(e){}
  const listHtml = history.length === 0
    ? `<div class="gallery-empty" style="padding:32px;"><div class="ic"><svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg></div><h3>No exports yet</h3><p>Your recent CSV exports will appear here for quick re-download.</p></div>`
    : history.map((r,i)=>`<div class="tmpl-item" style="align-items:flex-start;">
        <div class="ic" style="width:32px;height:32px;border-radius:9px;background:var(--accent-muted);color:var(--accent);display:grid;place-items:center;flex-shrink:0;"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg></div>
        <div style="flex:1;min-width:0;">
          <div class="tn">${escapeHtml(r.filename)}</div>
          <div style="font-size:10.5px;color:var(--fg-muted);margin-top:3px;display:flex;gap:10px;flex-wrap:wrap;">
            <span>${escapeHtml(r.dateStr)} ${escapeHtml(r.timeStr)}</span>
            <span style="color:var(--accent);font-weight:600;">${escapeHtml(r.platform)}</span>
            <span>${r.assetCount} assets</span>
            <span>${fmtFileSize(r.fileSize)}</span>
          </div>
        </div>
        <button class="btn sm" data-dl-history="${i}" title="Download again"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg> Download</button>
        <button class="btn sm ghost" data-del-history="${i}" style="color:var(--danger);" title="Delete"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/></svg></button>
      </div>`).join("");
  const body = `<div style="font-size:10.5px;font-weight:700;color:var(--fg-muted);text-transform:uppercase;letter-spacing:0.08em;margin-bottom:10px;">Recent CSV Exports (${history.length}/5)</div><div id="csvHistoryList">${listHtml}</div>${history.length>0?`<div style="margin-top:14px;"><button class="btn sm danger block" id="btnClearHistory"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/></svg> Clear All History</button></div>`:""}`;
  const ic = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 8v4l3 3"/><circle cx="12" cy="12" r="10"/></svg>';
  const modal = showModal("Recent CSV Exports", body, {icon:ic});
  if(history.length > 0){
    modal.querySelector("#btnClearHistory")?.addEventListener("click", async ()=>{
      if(!confirm("Delete all CSV export history?")) return;
      await idb.set("csv_history", []);
      closeModal();
      toast("History cleared","","info",1500);
    });
    modal.querySelector("#csvHistoryList").addEventListener("click", async e=>{
      const dl = e.target.closest("[data-dl-history]");
      const del = e.target.closest("[data-del-history]");
      if(dl){
        const idx = +dl.dataset.dlHistory;
        const h = (await idb.get("csv_history")) || [];
        if(h[idx]) downloadBlob(h[idx].content, h[idx].filename, "text/csv;charset=utf-8");
        toast("Downloaded", h[idx].filename, "success", 1500);
      }
      if(del){
        const idx = +del.dataset.delHistory;
        let h = (await idb.get("csv_history")) || [];
        h.splice(idx, 1);
        await idb.set("csv_history", h);
        closeModal();
        openCsvHistory();
        toast("Deleted from history","","info",1500);
      }
    });
  }
}

/* ---------- Platform Lock ---------- */
function lockPlatform(){
  const seg = $("#platformSeg");
  const badge = $("#platformLockBadge");
  if(seg) seg.classList.add("locked");
  if(badge) badge.style.display = "flex";
}
function unlockPlatform(){
  const seg = $("#platformSeg");
  const badge = $("#platformLockBadge");
  if(seg) seg.classList.remove("locked");
  if(badge) badge.style.display = "none";
}

/* ---------- Rendering ---------- */
function renderAll(){ renderGallery(); updateStats(); updateApiPill(); updateExportLabel(); }
function statusLabel(s){ return {pending:"Pending",queued:"Queued",processing:"Processing",done:"Done",error:"Error",edited:"Edited"}[s]||s; }

function renderGallery(){
  const g=$("#gallery");
  if(state.assets.length===0){
    $("#galleryToolbar").style.display="none";
    $("#progressSection").classList.remove("show");
    $("#uploadZone").classList.remove("compact");
    // Unlock platform when workspace is cleared
    unlockPlatform();
    // Smart empty state: no API key vs no assets
    const hasKey = state.apiKeys.length > 0;
    if(!hasKey){
      g.innerHTML=`<div class="gallery-empty"><div class="ic warning"><svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"/></svg></div><h3>No API key configured</h3><p>Add a Google Gemini API key to start generating metadata for your assets.</p><div class="ge-actions"><button class="btn primary sm" data-empty-action="open-api"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="M7 8h.01M11 8h6M7 12h.01M11 12h6M7 16h.01M11 16h6"/></svg> Open API Manager</button><button class="btn sm" data-empty-action="upload"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg> Upload Images</button></div></div>`;
    } else {
      g.innerHTML=`<div class="gallery-empty"><div class="ic"><svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="9" cy="9" r="2"/><path d="M21 15l-5-5L5 21"/></svg></div><h3>Welcome to StockFlow</h3><p>Generate professional AI-powered metadata for Adobe Stock and Shutterstock. Drag and drop your assets to begin.</p><div class="ge-actions"><button class="btn primary" data-empty-action="upload"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg> Upload Images</button></div></div>`;
    }
    return;
  }
  $("#galleryToolbar").style.display="flex";
  $("#uploadZone").classList.add("compact");
  $("#ucCount").textContent=state.assets.length;
  $("#btnRemoveSel").disabled = state.selected.size===0;
  // Show Retry Failed button only when there are failed assets
  const failedCount = state.assets.filter(a=>a.status==="error").length;
  $("#btnRetryFailed").style.display = failedCount > 0 && !state.processing ? "inline-flex" : "none";
  // Show Retry Selected button only when assets are selected
  $("#btnRetrySelected").style.display = state.selected.size > 0 && !state.processing ? "inline-flex" : "none";
  // Show progress section when there are assets
  $("#progressSection").classList.add("show");
  if(!state.processing){ updateProgressDisplay(); }
  g.innerHTML = state.assets.map(a=>{
    const sel=state.selected.has(a.id)?"selected":"";
    const isGenerating = a.status==="processing" || a.status==="queued";
    const isError = a.status==="error";
    const thumb=a.thumb?`<img src="${a.thumb}" alt="" />`:`<div class="ph">${a.ext.toUpperCase()}</div>`;
    const m=a.meta||{};
    const hasTitle=!!m.title;
    const hasDesc=!!m.desc;
    const allKw=(m.keywords||[]);
    const kwText=allKw.join(", ");
    const kwCountHtml=allKw.length?`<span class="ac-lbl-count">${allKw.length}</span>`:"";
    const titleCountHtml=hasTitle?`<span class="ac-lbl-count">${m.title.length}</span>`:"";
    const descCountHtml=hasDesc?`<span class="ac-lbl-count">${m.desc.length}</span>`:"";
    // Category: colored badge with emoji + name
    const hasCat=!!m.category;
    const cs=categoryStyle(m.category);
    const catBadge = hasCat
      ? `<div class="ac-cat-badge" style="border-color:${cs.color}33;background:${cs.color}14;"><span class="ac-cat-emoji">${cs.emoji}</span><span class="ac-cat-name" style="color:${cs.color};">${escapeHtml(m.category)}</span></div>`
      : `<div class="ac-cat-badge empty"><span class="ac-cat-emoji">ðŸ“</span><span class="ac-cat-name">No category</span></div>`;
    const qc=a.quality!=null?a.quality:0;
    const qcolor=qc>=70?"var(--success)":qc>=40?"var(--warning)":"var(--danger)";
    const qdot=a.meta?`<span class="qdot" style="background:${qcolor}"></span>`:"";
    const statusCls=a.status;
    // Shared SVG icons
    const copySvg='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>';
    const editSvg='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>';
    const regenSvg='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>';
    const copyAllSvg='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>';
    const trashSvg='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>';
    // Skeleton loading state for generating cards â€” field-box style skeletons
    const skeletonHtml = `
      <div class="ac-field">
        <div class="ac-field-label"><span>Title</span></div>
        <div class="ac-sk-field"><div class="ac-sk-line title"></div><div class="ac-sk-line title"></div></div>
      </div>
      <div class="ac-field">
        <div class="ac-field-label"><span>Description</span></div>
        <div class="ac-sk-field"><div class="ac-sk-line desc"></div><div class="ac-sk-line desc"></div><div class="ac-sk-line desc"></div></div>
      </div>
      <div class="ac-field">
        <div class="ac-field-label"><span>Keywords</span></div>
        <div class="ac-sk-field"><div class="ac-sk-line kw" style="width:90%;"></div><div class="ac-sk-line kw" style="width:70%;"></div></div>
      </div>
      <div class="ac-field">
        <div class="ac-field-label"><span>Category</span></div>
        <div class="ac-sk-field" style="flex-direction:row;align-items:center;gap:8px;padding:8px 14px;"><div class="ac-sk-line" style="width:18px;height:18px;border-radius:50%;"></div><div class="ac-sk-line" style="width:100px;height:12px;"></div></div>
      </div>`;
    // Error state
    const errorBanner = isError ? `<div class="ac-error"><div class="ae-ic"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg></div><div class="ae-msg"><b>Metadata generation failed.</b> ${a.error?escapeHtml(a.error.length>140?a.error.slice(0,140)+"â€¦":a.error):"Please try again."}</div></div>` : "";
    // Metadata fields â€” only render real metadata when done/edited; skeleton while generating; nothing when pending
    let metaSections;
    if(isGenerating){
      metaSections = skeletonHtml;
    } else if(a.meta){
      metaSections = `
        <div class="ac-field ac-meta-fade">
          <div class="ac-field-label"><span>Title</span>${titleCountHtml}</div>
          <div class="ac-field-box" data-field="title" data-id="${a.id}">
            <textarea readonly rows="1" data-ac-text="title" data-id="${a.id}" placeholder="No title yet" aria-label="Title">${hasTitle?escapeHtml(m.title):""}</textarea>
            <button class="ac-field-copy" data-copy="title" data-id="${a.id}" title="Copy title" aria-label="Copy title" tabindex="-1">${copySvg}</button>
          </div>
        </div>
        <div class="ac-field ac-meta-fade">
          <div class="ac-field-label"><span>Description</span>${descCountHtml}</div>
          <div class="ac-field-box ac-field-desc" data-field="desc" data-id="${a.id}">
            <textarea readonly rows="3" data-ac-text="desc" data-id="${a.id}" placeholder="No description yet" aria-label="Description">${hasDesc?escapeHtml(m.desc):""}</textarea>
            <button class="ac-field-copy" data-copy="desc" data-id="${a.id}" title="Copy description" aria-label="Copy description" tabindex="-1">${copySvg}</button>
          </div>
        </div>
        <div class="ac-field ac-meta-fade">
          <div class="ac-field-label"><span>Keywords</span>${kwCountHtml}</div>
          <div class="ac-field-box ac-field-kw" data-field="keywords" data-id="${a.id}">
            <textarea readonly rows="2" data-ac-text="keywords" data-id="${a.id}" placeholder="No keywords yet" aria-label="Keywords">${kwText?escapeHtml(kwText):""}</textarea>
            <button class="ac-field-copy" data-copy="keywords" data-id="${a.id}" title="Copy keywords" aria-label="Copy keywords" tabindex="-1">${copySvg}</button>
          </div>
        </div>
        <div class="ac-field ac-meta-fade">
          <div class="ac-field-label"><span>Category</span></div>
          ${catBadge}
        </div>`;
    } else {
      // Pending state (not yet generating, no metadata)
      metaSections = `<div class="ac-field"><div class="ac-field-box"><textarea readonly rows="1" placeholder="Awaiting metadataâ€¦"></textarea></div></div>`;
    }
    // Action bar: 4 equally sized buttons â€” Edit, Regenerate, Copy All, Remove
    return `<div class="asset-card ${sel} ${a.status==="processing"?"processing":""}" data-id="${a.id}">
      <div class="ac-thumb ${isGenerating?"generating":""}">${thumb}
        <div class="ac-filetype">${escapeHtml(a.ext.toUpperCase())}</div>
        ${a.status==="processing"?`<div class="ac-gen-spinner"></div>`:""}
        <div class="ac-status ${statusCls}"><span class="sd"></span>${statusLabel(a.status)}</div>
        ${isGenerating?`<div class="ac-progress" style="width:${a.progress||0}%"></div>`:""}
      </div>
      <div class="ac-body">
        <div class="ac-fname">${qdot}${escapeHtml(a.name)}</div>
        ${metaSections}
        ${errorBanner}
        <div class="ac-foot">
          <button class="ac-foot-btn" data-edit="${a.id}" title="Edit metadata">${editSvg}<span>Edit</span></button>
          <button class="ac-foot-btn" data-regen="${a.id}" title="Regenerate metadata">${regenSvg}<span>Regenerate</span></button>
          <button class="ac-foot-btn" data-copy-all="${a.id}" title="Copy all metadata">${copyAllSvg}<span>Copy All</span></button>
          <button class="ac-foot-btn danger" data-remove="${a.id}" title="Remove asset">${trashSvg}<span>Remove</span></button>
        </div>
      </div>
    </div>`;
  }).join("");
}
function updateStats(){ }
function updateExportLabel(){ $("#exportPlatformTxt").textContent = state.settings.platform==="shutterstock"?"Shutterstock":"Adobe Stock"; }
function updateApiPill(){
  const pill=$("#apiPill"); const txt=$("#apiPillTxt"); pill.className="api-pill";
  if(state.apiKeys.length===0){
    txt.textContent="API Not Connected"; pill.classList.add("err");
    pill.title="No API key configured â€” click to manage API settings";
  } else {
    const valid=state.apiKeys.filter(k=>k.status!=="invalid"&&k.status!=="exhausted").length;
    const total=state.apiKeys.length;
    if(valid===0){
      txt.textContent="API Not Connected"; pill.classList.add("err");
      pill.title=`${total} key(s) added, none valid â€” click to manage API settings`;
    } else if(valid<total){
      txt.textContent="Partial Configuration"; pill.classList.add("warn");
      pill.title=`${valid}/${total} keys valid â€” click to manage API settings`;
    } else {
      txt.textContent="API Connected"; pill.classList.add("ok");
      pill.title=`${valid}/${total} keys valid â€” click to manage API settings`;
    }
  }
  // Sync any open API settings modal's key list + status
  const apiModalBody=document.querySelector("#apiSettingsModal .modal-body");
  if(apiModalBody){ renderApiKeysList(); updateApiStatusSummary(); }
}
function renderApiManagerKeys(){
  // Legacy hook â€” kept for gemini.generate() error handler which calls renderApiManagerKeys().
  // Forwards to the new API Settings modal key list if open, otherwise no-op (the navbar pill
  // status is updated separately via updateApiPill).
  const newList=document.querySelector("#apiKeysList");
  if(newList){ renderApiKeysList(); updateApiStatusSummary(); return; }
  const list=$("#apiKeyList");
  if(!list) return;
  if(state.apiKeys.length===0){ list.innerHTML=`<div class="gallery-empty" style="padding:24px;"><p>No API keys added yet.</p></div>`; return; }
  const activeKey=gemini.nextKey();
  list.innerHTML=state.apiKeys.map((k,i)=>{ const masked=k.key.length>12?k.key.slice(0,6)+"â€¢â€¢â€¢â€¢"+k.key.slice(-4):k.key; const isActive=activeKey&&activeKey.key===k.key; return `<div class="key-row ${isActive?"active-key":""}"><span class="kstat ${k.status}"></span><div style="flex:1;min-width:0;"><div class="kval">${escapeHtml(masked)} ${isActive?'<span style="color:var(--accent);font-weight:700;">â— ACTIVE</span>':''}</div><div class="kmeta"><span>Status: <b style="color:${k.status==='valid'?'var(--success)':k.status==='invalid'?'var(--danger)':k.status==='exhausted'?'var(--warning)':'var(--fg-muted)'}">${k.status}</b></span><span>Uses: ${k.uses||0}</span></div>${k.lastError?`<div class="kerr">${escapeHtml(k.lastError)}</div>`:""}</div><button class="btn icon sm ghost" data-del-key="${i}" style="color:var(--fg-muted);"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button></div>`; }).join("");
}

/* ---------- Metadata Editor Modal ---------- */
function openDrawer(id){ state.drawerId=id; renderMetadataModal(); $("#metaOverlay").classList.add("show"); }
function closeDrawer(){
  const modal=$("#metaModal");
  modal.classList.add("closing");
  setTimeout(()=>{ $("#metaOverlay").classList.remove("show"); modal.classList.remove("closing"); state.drawerId=null; }, 180);
}
function renderMetadataModal(){
  const a=state.assets.find(x=>x.id===state.drawerId);
  if(!a){ closeDrawer(); return; }
  $("#metaFname").textContent=a.name;
  const m=a.meta||{title:"",desc:"",keywords:[],category:categoriesFor()[0],confidence:0,alternatives:[]};
  const cats=categoriesFor();
  const isSuggested = m.confidence && m.confidence > 0;
  // Status dot color
  const sdotColor = a.status==="done"?"var(--success)":a.status==="error"?"var(--danger)":a.status==="processing"?"var(--warning)":a.status==="queued"?"var(--info)":"var(--fg-dim)";
  // LEFT column - image preview + info
  const thumb=a.thumb?`<img src="${a.thumb}" alt="" />`:`<div class="ph">${a.ext.toUpperCase()}</div>`;
  // Get image dimensions if available
  let resolution = "â€”";
  if(a.thumb && ["jpg","jpeg","png"].includes(a.ext)){
    const img = new Image();
    img.src = a.thumb;
    if(img.complete && img.naturalWidth) resolution = `${img.naturalWidth} Ã— ${img.naturalHeight}`;
    else { img.onload = ()=>{ const el=document.getElementById("metaResolution"); if(el) el.textContent=`${img.naturalWidth} Ã— ${img.naturalHeight}`; }; }
  }
  $("#metaLeft").innerHTML=`
    <div class="meta-preview">${thumb}</div>
    <div class="meta-info">
      <div class="meta-info-row"><span class="mir-lbl">Filename</span><span class="mir-val" title="${escapeHtml(a.name)}">${escapeHtml(a.name)}</span></div>
      <div class="meta-info-row"><span class="mir-lbl">Resolution</span><span class="mir-val" id="metaResolution">${resolution}</span></div>
      <div class="meta-info-row"><span class="mir-lbl">File Type</span><span class="mir-val">${a.ext.toUpperCase()}</span></div>
      <div class="meta-info-row"><span class="mir-lbl">Category</span><span class="mir-val accent">${escapeHtml(m.category||"â€”")}${isSuggested?` <span style="font-size:10px;color:var(--fg-muted);">(${m.confidence}%)</span>`:""}</span></div>
      <div class="meta-info-row"><span class="mir-lbl">Status</span><span class="mir-val status"><span class="sd" style="background:${sdotColor}"></span>${statusLabel(a.status)}</span></div>
    </div>
  `;
  // RIGHT column - editor
  const kwHtml=(m.keywords||[]).map((k,i)=>`<span class="kw-chip" draggable="true" data-kw-idx="${i}">${escapeHtml(k)}<span class="kw-x" data-del-kw="${i}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></span></span>`).join("");
  $("#metaRight").innerHTML=`
    <div class="meta-field">
      <label>Title <span class="mf-counter" id="titleCounter">${(m.title||"").length} / ${state.settings.titleMax}</span></label>
      <input class="input" id="mTitle" value="${escapeHtml(m.title||"")}" placeholder="Enter a descriptive title..." maxlength="${state.settings.titleMax+50}" />
    </div>
    <div class="meta-field">
      <label>Description <span class="mf-counter" id="descCounter">${(m.desc||"").length} / ${state.settings.descMax}</span></label>
      <textarea class="textarea" id="mDesc" placeholder="Enter a detailed description..." style="min-height:100px;" maxlength="${state.settings.descMax+100}">${escapeHtml(m.desc||"")}</textarea>
    </div>
    <div class="meta-field">
      <label>Keywords <span class="mf-counter" id="kwCounter">${(m.keywords||[]).length} keywords</span></label>
      <div class="kw-chips ${((m.keywords||[]).length===0)?"empty":""}" id="mKwChips">${kwHtml}</div>
      <div class="kw-add-row"><input class="input" id="mKwInput" placeholder="Type a keyword and press Enter..." /><button class="btn sm" id="mKwAdd">Add</button></div>
    </div>
    <div class="meta-field">
      <label>Category ${isSuggested?`<span class="mf-counter" style="color:var(--success);">AI Suggested Â· ${m.confidence}%</span>`:""}</label>
      <div class="cat-search" id="mCatSearch">
        <input class="input" id="mCatInput" value="${escapeHtml(m.category||"")}" placeholder="Search or select category..." autocomplete="off" />
        <div class="cs-dropdown" id="mCatDropdown"></div>
      </div>
    </div>
    <div class="meta-field" style="margin-bottom:0;">
      <label>Optional Notes <span class="mf-counter">Private</span></label>
      <textarea class="textarea" id="mNotes" placeholder="Internal notes (not exported)..." style="min-height:60px;">${escapeHtml(a.notes||"")}</textarea>
    </div>
  `;
  // Wire up live counters
  const titleInput=$("#mTitle"), descInput=$("#mDesc");
  titleInput.addEventListener("input", ()=>{ const v=titleInput.value.length; const max=state.settings.titleMax; const c=$("#titleCounter"); c.textContent=`${v} / ${max}`; c.classList.toggle("over", v>max); c.classList.toggle("ok", v>=TITLE_MIN && v<=max); });
  descInput.addEventListener("input", ()=>{ const v=descInput.value.length; const max=state.settings.descMax; const c=$("#descCounter"); c.textContent=`${v} / ${max}`; c.classList.toggle("over", v>max); c.classList.toggle("ok", v>=DESC_MIN && v<=max); });
  // Keyword add
  const kwInput=$("#mKwInput");
  $("#mKwAdd").addEventListener("click", ()=>{ const v=kwInput.value.trim(); if(!v)return; if(!a.meta)a.meta={title:"",desc:"",keywords:[],category:cats[0],confidence:0,alternatives:[]}; if(!a.meta.keywords)a.meta.keywords=[]; a.meta.keywords.push(v); kwInput.value=""; renderMetadataModal(); $("#mKwInput").focus(); });
  kwInput.addEventListener("keydown", e=>{ if(e.key==="Enter"){e.preventDefault();$("#mKwAdd").click();} });
  // Keyword remove
  $("#mKwChips").addEventListener("click", e=>{ const d=e.target.closest("[data-del-kw]"); if(d){ const i=+d.dataset.delKw; a.meta.keywords.splice(i,1); renderMetadataModal(); $("#mKwInput").focus(); } });
  // Keyword drag reorder
  setupKwDragReorder(a);
  // Category searchable dropdown
  setupCatSearch(a, m, cats);
  // Autosave edits locally while open (debounced)
  const autoSave = ()=>{ if(!a.meta)a.meta={title:"",desc:"",keywords:[],category:cats[0],confidence:0,alternatives:[]}; a.meta.title=titleInput.value.trim(); a.meta.desc=descInput.value.trim(); a.notes=$("#mNotes").value.trim(); scheduleSave(); };
  titleInput.addEventListener("input", autoSave);
  descInput.addEventListener("input", autoSave);
  $("#mNotes").addEventListener("input", autoSave);
}
// Keyword drag-to-reorder
function setupKwDragReorder(a){
  const chips=$("#mKwChips"); if(!chips)return;
  let dragIdx=null;
  chips.querySelectorAll(".kw-chip").forEach(chip=>{
    chip.addEventListener("dragstart", e=>{ dragIdx=+chip.dataset.kwIdx; chip.classList.add("dragging"); e.dataTransfer.effectAllowed="move"; });
    chip.addEventListener("dragend", ()=>{ chip.classList.remove("dragging"); });
    chip.addEventListener("dragover", e=>{ e.preventDefault(); e.dataTransfer.dropEffect="move"; });
    chip.addEventListener("drop", e=>{ e.preventDefault(); const dropIdx=+chip.dataset.kwIdx; if(dragIdx===null||dragIdx===dropIdx)return; if(!a.meta||!a.meta.keywords)return; const moved=a.meta.keywords.splice(dragIdx,1)[0]; a.meta.keywords.splice(dropIdx,0,moved); renderMetadataModal(); });
  });
}
// Searchable category dropdown
function setupCatSearch(a, m, cats){
  const wrap=$("#mCatSearch"), input=$("#mCatInput"), dropdown=$("#mCatDropdown");
  function renderDropdown(filter=""){
    const f=filter.toLowerCase();
    const opts = cats.filter(c=>c.toLowerCase().includes(f));
    dropdown.innerHTML = opts.map(c=>{
      const isSug = c===m.category && m.confidence>0;
      return `<div class="cs-opt ${c===input.value?'active':''}" data-cat="${escapeHtml(c)}">${escapeHtml(c)}${isSug?'<span class="cs-sug">AI</span>':""}</div>`;
    }).join("") || '<div style="padding:10px;color:var(--fg-muted);font-size:12px;">No matches</div>';
  }
  input.addEventListener("focus", ()=>{ renderDropdown(input.value); wrap.classList.add("open"); });
  input.addEventListener("input", ()=>{ renderDropdown(input.value); wrap.classList.add("open"); });
  input.addEventListener("click", ()=>{ renderDropdown(input.value); wrap.classList.add("open"); });
  dropdown.addEventListener("click", e=>{ const opt=e.target.closest(".cs-opt"); if(opt){ input.value=opt.dataset.cat; if(!a.meta)a.meta={title:"",desc:"",keywords:[],category:cats[0],confidence:0,alternatives:[]}; a.meta.category=opt.dataset.cat; wrap.classList.remove("open"); scheduleSave(); } });
  document.addEventListener("click", e=>{ if(!wrap.contains(e.target)) wrap.classList.remove("open"); });
}

/* ---------- API Manager ---------- */
/* ---------- API Settings Modal (global, opened from navbar) ---------- */
function openApiManager(){ openApiSettings(); }

function openApiSettings(){
  const ic='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"/></svg>';
  // Icons for each section
  const modelIc='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2a3 3 0 0 1 3 3c0 1.31-.83 2.42-2 2.83V9h3a4 4 0 0 1 4 4v1.17c1.17.41 2 1.52 2 2.83a3 3 0 0 1-6 0c0-1.31.83-2.42 2-2.83V13a1 1 0 0 0-1-1h-3v6.17c1.17.41 2 1.52 2 2.83a3 3 0 0 1-6 0c0-1.31.83-2.42 2-2.83V12H8a1 1 0 0 0-1 1v1.17c1.17.41 2 1.52 2 2.83a3 3 0 0 1-6 0c0-1.31.83-2.42 2-2.83V13a4 4 0 0 1 4-4h3V7.83A3.01 3.01 0 0 1 9 5a3 3 0 0 1 3-3z"/></svg>';
  const keysIc='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"/></svg>';
  const rotateIc='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>';
  const concurrencyIc='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 12h4l3-9 4 18 3-9h4"/></svg>';
  const retryIc='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/></svg>';
  const testIc='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>';

  const body=`
    <div id="apiSettingsModal">
      <div class="api-sec">
        <div class="api-status-banner" id="apiStatusBanner">
          <span class="asb-dot"></span>
          <div><div class="asb-text" id="apiStatusText">â€”</div><div class="asb-sub" id="apiStatusSub">â€”</div></div>
        </div>
      </div>
      <div class="api-sec">
        <div class="api-sec-head"><div class="as-ic">${modelIc}</div><h4>Gemini Model</h4></div>
        <div class="api-sec-desc">Choose the Gemini model used for all metadata generation.</div>
        <div class="field" style="margin:0;">
          <select class="select" id="apiModelSelect" style="max-width:320px;">
            <option value="gemini-2.0-flash">gemini-2.0-flash</option>
            <option value="gemini-2.5-flash">gemini-2.5-flash</option>
            <option value="gemini-1.5-flash">gemini-1.5-flash</option>
            <option value="gemini-2.0-flash-lite">gemini-2.0-flash-lite</option>
          </select>
        </div>
      </div>
      <div class="api-sec">
        <div class="api-sec-head"><div class="as-ic">${keysIc}</div><h4>API Keys</h4><span class="as-badge" id="apiKeyCountBadge">0 keys</span></div>
        <div class="api-sec-desc">Add one or more Gemini API keys. Keys are stored locally in your browser and never sent anywhere except Google's Gemini API.</div>
        <div id="apiKeysList" style="max-height:240px;overflow-y:auto;margin-bottom:8px;"></div>
        <div class="api-add-row">
          <input type="password" class="input" id="apiAddKeyInput" placeholder="Paste API key (AIza...)" autocomplete="off" />
          <button class="btn primary" id="apiAddKeyBtn"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg> Add</button>
          <button class="btn" id="apiImportTxtBtn" title="Import keys from .txt file"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg></button>
        </div>
      </div>
      <div class="api-sec">
        <div class="api-sec-head"><div class="as-ic">${rotateIc}</div><h4>API Rotation</h4></div>
        <div class="api-sec-desc">Automatically switches to the next available API key when quota is reached or a request fails.</div>
        <div class="toggle-row" style="margin:0;"><div class="tr-info"><div class="tr-label">Enable Automatic API Rotation</div><div class="tr-desc">Cycle through keys on quota/failure</div></div><label class="switch"><input type="checkbox" id="apiRotateToggle" ${state.settings.rotateKeys?'checked':''} /><span class="slider-tg"></span></label></div>
      </div>
      <div class="api-sec">
        <div class="api-sec-head"><div class="as-ic">${concurrencyIc}</div><h4>Concurrency</h4></div>
        <div class="api-sec-desc">Number of simultaneous metadata requests sent to the Gemini API.</div>
        <div class="api-concurrency">
          <input type="number" class="input" id="apiConcurrencyInput" value="${state.settings.concurrency}" min="1" max="10" />
          <span class="ac-range-hint">Min 1 Â· Recommended 2 Â· Max 10</span>
        </div>
      </div>
      <div class="api-sec">
        <div class="api-sec-head"><div class="as-ic">${retryIc}</div><h4>Retry Failed Requests</h4></div>
        <div class="api-sec-desc">Automatically retry failed assets using another available API key.</div>
        <div class="toggle-row" style="margin:0;"><div class="tr-info"><div class="tr-label">Auto-Retry on Failure</div><div class="tr-desc">Retry with the next available key</div></div><label class="switch"><input type="checkbox" id="apiRetryToggle" ${state.settings.retryFailed?'checked':''} /><span class="slider-tg"></span></label></div>
      </div>
      <div class="api-sec">
        <div class="api-sec-head"><div class="as-ic">${testIc}</div><h4>Test Connection</h4></div>
        <div class="api-sec-desc">Verify that your API keys are valid and the Gemini API is reachable.</div>
        <div class="row" style="gap:8px;">
          <button class="btn" id="apiTestCurrentBtn">Test Current Key</button>
          <button class="btn" id="apiTestAllBtn">Test All Keys</button>
        </div>
        <div class="api-test-result" id="apiTestResult"></div>
      </div>
    </div>
  `;
  const foot=`
    <button class="btn ghost" data-close>Cancel</button>
    <button class="btn primary" id="apiSaveBtn"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg> Save Settings</button>
  `;
  const modal=showModal("API Settings",body,{icon:ic,foot});
  modal.classList.add("api-settings-modal");
  // Set model dropdown to current value
  const modelSel=modal.querySelector("#apiModelSelect");
  if(modelSel){ modelSel.value=state.settings.model; }

  // Render keys list + status banner
  renderApiKeysList();
  updateApiStatusSummary();

  // Focus management: focus the first interactive element
  setTimeout(()=>{ modelSel?.focus(); }, 50);

  // Add key
  const addKeyInput=modal.querySelector("#apiAddKeyInput");
  const doAddKey=()=>{
    const v=addKeyInput.value.trim();
    if(!v){ toast("Enter a key","","warn"); return; }
    if(state.apiKeys.some(k=>k.key===v)){ toast("Key already exists","","warn"); return; }
    state.apiKeys.push({key:v,status:"untested",uses:0,lastError:""});
    addKeyInput.value="";
    renderApiKeysList(); updateApiPill(); updateApiStatusSummary();
    if(state.assets.length===0)renderGallery();
    scheduleSave();
    toast("Key added","Test it to verify","success");
  };
  modal.querySelector("#apiAddKeyBtn").addEventListener("click",doAddKey);
  addKeyInput.addEventListener("keydown",e=>{ if(e.key==="Enter"){ e.preventDefault(); doAddKey(); } });
  modal.querySelector("#apiImportTxtBtn").addEventListener("click",()=>$("#keyFileInput").click());

  // Key list actions (delete / edit)
  modal.querySelector("#apiKeysList").addEventListener("click",e=>{
    const del=e.target.closest("[data-del-key]");
    if(del){ const i=+del.dataset.delKey; state.apiKeys.splice(i,1); renderApiKeysList(); updateApiPill(); updateApiStatusSummary(); if(state.assets.length===0)renderGallery(); scheduleSave(); return; }
    const edit=e.target.closest("[data-edit-key]");
    if(edit){
      const i=+edit.dataset.editKey; const k=state.apiKeys[i]; if(!k)return;
      // Inline edit: prompt for new key value
      const nv=prompt("Edit API key:", k.key);
      if(nv && nv.trim() && nv.trim()!==k.key){
        const t=nv.trim();
        if(state.apiKeys.some((x,idx)=>idx!==i && x.key===t)){ toast("Key already exists","","warn"); return; }
        k.key=t; k.status="untested"; k.lastError="";
        renderApiKeysList(); updateApiPill(); updateApiStatusSummary(); scheduleSave();
        toast("Key updated","Test it to verify","info");
      }
    }
  });

  // Toggle / input change handlers (live update state + persist)
  modal.querySelector("#apiRotateToggle").addEventListener("change",e=>{ state.settings.rotateKeys=e.target.checked; scheduleSave(); });
  modal.querySelector("#apiRetryToggle").addEventListener("change",e=>{ state.settings.retryFailed=e.target.checked; scheduleSave(); });
  modal.querySelector("#apiConcurrencyInput").addEventListener("change",e=>{ state.settings.concurrency=clamp(+e.target.value||3,1,10); e.target.value=state.settings.concurrency; scheduleSave(); });
  modal.querySelector("#apiModelSelect").addEventListener("change",e=>{ state.settings.model=e.target.value; const sb=$("#modelSelect"); if(sb) sb.value=e.target.value; scheduleSave(); });

  // Test connection
  const testResult=modal.querySelector("#apiTestResult");
  const showTestResult=(cls,msg,sub)=>{
    testResult.className="api-test-result show "+cls;
    testResult.innerHTML = (cls==="testing"?'<svg class="spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>':'') + "<span>"+escapeHtml(msg)+(sub?'</span><span style="font-weight:400;color:var(--fg-muted);margin-left:6px;">'+escapeHtml(sub)+'</span>':'</span>');
  };
  modal.querySelector("#apiTestCurrentBtn").addEventListener("click",async()=>{
    const k=gemini.nextKey();
    if(!k){ showTestResult("error","No valid key available","Add a key first"); return; }
    showTestResult("testing","Testing current key...","");
    const r=await gemini.testKey(k.key);
    k.status=r.ok?"valid":(r.reason==="quota"?"exhausted":"invalid"); k.lastError=r.msg||"";
    renderApiKeysList(); updateApiPill(); updateApiStatusSummary(); scheduleSave();
    if(r.ok) showTestResult("success","Current key is valid","Ready to generate metadata");
    else showTestResult("error","Current key failed",r.msg||r.reason);
  });
  modal.querySelector("#apiTestAllBtn").addEventListener("click",async()=>{
    if(state.apiKeys.length===0){ showTestResult("error","No keys to test","Add a key first"); return; }
    showTestResult("testing","Testing all keys...","0 / "+state.apiKeys.length);
    let valid=0; let done=0;
    for(const k of state.apiKeys){
      k.status="untested"; renderApiKeysList();
      const r=await gemini.testKey(k.key);
      k.status=r.ok?"valid":(r.reason==="quota"?"exhausted":"invalid"); k.lastError=r.msg||"";
      if(r.ok) valid++;
      done++;
      showTestResult("testing","Testing all keys...",done+" / "+state.apiKeys.length);
      renderApiKeysList(); updateApiPill(); updateApiStatusSummary();
    }
    scheduleSave();
    if(valid>0) showTestResult("success","Test complete",valid+"/"+state.apiKeys.length+" keys valid");
    else showTestResult("error","Test complete","0/"+state.apiKeys.length+" keys valid");
  });

  // Save button â€” persist and close
  modal.querySelector("#apiSaveBtn").addEventListener("click",()=>{
    // Read final values from the modal controls (in case user typed but didn't blur)
    state.settings.model=modal.querySelector("#apiModelSelect").value;
    state.settings.rotateKeys=modal.querySelector("#apiRotateToggle").checked;
    state.settings.retryFailed=modal.querySelector("#apiRetryToggle").checked;
    state.settings.concurrency=clamp(+modal.querySelector("#apiConcurrencyInput").value||2,1,10);
    // Sync the sidebar Gemini model dropdown
    const sb=$("#modelSelect"); if(sb) sb.value=state.settings.model;
    scheduleSave();
    closeModal();
    // Return focus to the API button
    setTimeout(()=>{ $("#apiPill")?.focus({preventScroll:true}); }, 50);
    toast("Settings saved","","success",1800);
  });
}

// Render the API keys list inside the API Settings modal
function renderApiKeysList(){
  const list=document.querySelector("#apiKeysList");
  if(!list) return;
  if(state.apiKeys.length===0){
    list.innerHTML=`<div style="padding:24px;text-align:center;color:var(--fg-muted);font-size:12px;">No API keys added yet.<br><span style="font-size:10.5px;color:var(--fg-dim);">Paste a key below or import from .txt</span></div>`;
    const badge=document.querySelector("#apiKeyCountBadge");
    if(badge) badge.textContent="0 keys";
    return;
  }
  const activeKey=gemini.nextKey();
  list.innerHTML=state.apiKeys.map((k,i)=>{
    const masked=k.key.length>12?k.key.slice(0,6)+"â€¢â€¢â€¢â€¢"+k.key.slice(-4):k.key;
    const isActive=activeKey&&activeKey.key===k.key;
    const statusColor=k.status==='valid'?'var(--success)':k.status==='invalid'?'var(--danger)':k.status==='exhausted'?'var(--warning)':'var(--fg-dim)';
    const editSvg='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>';
    const delSvg='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>';
    return `<div class="api-key-row ${isActive?"active-key":""}">
      <span class="akr-status" style="background:${statusColor};box-shadow:0 0 0 3px ${statusColor}22;"></span>
      <div class="akr-info">
        <div class="akr-key">${escapeHtml(masked)} ${isActive?'<span class="akr-active-tag">Active</span>':''}</div>
        <div class="akr-meta">
          <span>Status: <b class="akr-status-text ${k.status}">${k.status}</b></span>
          <span>Uses: ${k.uses||0}</span>
        </div>
        ${k.lastError?`<div class="akr-err">${escapeHtml(k.lastError)}</div>`:""}
      </div>
      <div class="akr-actions">
        <button class="ac-icon-btn" data-edit-key="${i}" title="Edit key">${editSvg}</button>
        <button class="ac-icon-btn danger" data-del-key="${i}" title="Delete key">${delSvg}</button>
      </div>
    </div>`;
  }).join("");
  const badge=document.querySelector("#apiKeyCountBadge");
  if(badge){
    const valid=state.apiKeys.filter(k=>k.status==="valid").length;
    badge.textContent = valid>0 ? `${valid}/${state.apiKeys.length} valid` : `${state.apiKeys.length} key${state.apiKeys.length>1?"s":""}`;
  }
}

// Update the status banner at the top of the API Settings modal
function updateApiStatusSummary(){
  const banner=document.querySelector("#apiStatusBanner");
  if(!banner) return;
  const text=document.querySelector("#apiStatusText");
  const sub=document.querySelector("#apiStatusSub");
  if(!text||!sub) return;
  if(state.apiKeys.length===0){
    banner.className="api-status-banner err";
    text.textContent="API Not Connected";
    sub.textContent="No API keys configured â€” add a key to start generating metadata";
  } else {
    const valid=state.apiKeys.filter(k=>k.status!=="invalid"&&k.status!=="exhausted").length;
    const total=state.apiKeys.length;
    if(valid===0){
      banner.className="api-status-banner err";
      text.textContent="API Not Connected";
      sub.textContent=`${total} key${total>1?"s":""} added, none valid â€” test your keys to verify`;
    } else if(valid<total){
      banner.className="api-status-banner warn";
      text.textContent="Partial Configuration";
      sub.textContent=`${valid} of ${total} keys are valid`;
    } else {
      banner.className="api-status-banner ok";
      text.textContent="API Connected";
      sub.textContent=`All ${total} key${total>1?"s":""} are valid and ready`;
    }
  }
}

/* ---------- Custom Instructions Templates Removed ---------- */

/* ---------- More Formats modal ---------- */

/* ---------- History ---------- */
function pushHistory(){ const snap=state.assets.map(a=>({id:a.id,meta:a.meta?JSON.parse(JSON.stringify(a.meta)):null,status:a.status,quality:a.quality,issues:a.issues?JSON.parse(JSON.stringify(a.issues)):null})); state.history=state.history.slice(0,state.historyIdx+1); state.history.push(snap); if(state.history.length>50)state.history.shift(); state.historyIdx=state.history.length-1; }
function undo(){ if(state.historyIdx<=0){toast("Nothing to undo","","info");return;} state.historyIdx--; applyHistory(); toast("Undo","","info",1500); }
function redo(){ if(state.historyIdx>=state.history.length-1){toast("Nothing to redo","","info");return;} state.historyIdx++; applyHistory(); toast("Redo","","info",1500); }
function applyHistory(){ const snap=state.history[state.historyIdx]; if(!snap)return; snap.forEach(s=>{const a=state.assets.find(x=>x.id===s.id);if(a){a.meta=s.meta?JSON.parse(JSON.stringify(s.meta)):null;a.status=s.status;a.quality=s.quality;a.issues=s.issues?JSON.parse(JSON.stringify(s.issues)):null;}}); renderAll(); if(state.drawerId)renderDrawer(); }

/* ---------- Sliders ---------- */
function initSlider(el, onChange){
  const input=el.querySelector("input[type=range]"); const fill=el.querySelector(".fill");
  const min=+input.min, max=+input.max;
  function update(){ const v=+input.value; const pct=(v-min)/(max-min)*100; fill.style.width=pct+"%"; onChange(v); }
  input.addEventListener("input",update); update();
}

/* ---------- Flyout for collapsed sidebar ---------- */
const FLYOUT_GAP = 10;       // gap between sidebar and flyout (8â€“12px)
const FLYOUT_SAFE = 18;      // viewport safe margin (16â€“20px)

function ensureFlyout(section){
  let flyout=section.querySelector(".section-flyout");
  if(!flyout){
    flyout=document.createElement("div");
    flyout.className="section-flyout";
    flyout.setAttribute("role","dialog");
    flyout.setAttribute("aria-label", (section.querySelector(".lbl")?.textContent||"") + " panel");
    flyout.setAttribute("tabindex","-1");
    section.appendChild(flyout);
  }
  // Separate arrow element (lives outside the flyout so it isn't clipped by overflow:hidden)
  let arrow=section.querySelector(".sfly-arrow");
  if(!arrow){
    arrow=document.createElement("div");
    arrow.className="sfly-arrow";
    arrow.setAttribute("aria-hidden","true");
    section.appendChild(arrow);
  }
  // Clone the section body content into the flyout FIRST (so we can measure real height)
  const body=section.querySelector(".section-body");
  const lbl=section.querySelector(".lbl")?.textContent || "";
  const ic=section.querySelector(".ic")?.cloneNode(true) || "";
  flyout.innerHTML=`<div class="sfly-title">${ic.outerHTML||""} ${escapeHtml(lbl)}</div>`;
  if(body){
    const bodyWrapper=document.createElement("div");
    bodyWrapper.className="sfly-body";
    const clone=body.cloneNode(true);
    clone.style.display="block";
    clone.classList.remove("section-body");
    bodyWrapper.appendChild(clone);
    flyout.appendChild(bodyWrapper);
    rewireFlyout(section.dataset.section, flyout);
  }
  // Now position the flyout + arrow relative to the clicked icon
  const head=section.querySelector(".section-head");
  if(head){
    positionFlyout(flyout, head.getBoundingClientRect(), arrow);
  }
}

/* Smart positioning: vertically center the flyout on the clicked icon,
   then clamp to viewport with safe margins. The flyout grows naturally with
   its content up to ~82% of the viewport; only after that does the body
   become scrollable. Height + top changes animate via CSS transition.
   overrideNaturalH: when provided (e.g. after a card expand/collapse), use
   this pre-computed height instead of measuring â€” enables a single smooth
   transition instead of multiple jittery re-measurements. */
function positionFlyout(flyout, iconRect, arrow, overrideNaturalH){
  const VW=window.innerWidth, VH=window.innerHeight;

  // Measure natural content height (or use the override)
  let naturalH;
  if(overrideNaturalH != null){
    naturalH = overrideNaturalH;
  } else {
    const titleEl=flyout.querySelector(".sfly-title");
    const bodyEl=flyout.querySelector(".sfly-body");
    const titleH = titleEl ? titleEl.offsetHeight : 0;
    const bodyH  = bodyEl  ? bodyEl.scrollHeight  : 0;
    naturalH = titleH + bodyH;
  }

  // Responsive max-height: 82vh on desktop, 80vh on laptop, 75vh on small screens
  let maxRatio = 0.82;
  if (VH < 700) maxRatio = 0.75;
  else if (VH < 900) maxRatio = 0.80;
  // Also respect safe margins so the flyout is never cut off
  const maxH = Math.min(maxRatio * VH, VH - 2 * FLYOUT_SAFE);
  const effectiveH = Math.min(naturalH, maxH);

  // Only update max-height if it actually changed (avoids restarting the
  // CSS transition needlessly). On first open maxHeight is "" so this sets it.
  const prevMaxH = flyout.style.maxHeight;
  const newMaxH = effectiveH + "px";
  if (prevMaxH !== newMaxH) {
    flyout.style.maxHeight = newMaxH;
  }

  // ---- X position: to the right of the icon with a small gap ----
  const flyoutW = flyout.offsetWidth || 300;
  let left = iconRect.right + FLYOUT_GAP;
  let arrowOnLeft = true; // arrow points left (flyout is right of icon)
  // If it overflows the right edge, flip to the left side of the icon
  if (left + flyoutW > VW - FLYOUT_SAFE) {
    left = iconRect.left - FLYOUT_GAP - flyoutW;
    arrowOnLeft = false; // arrow would point right
  }
  // Final clamp so nothing is cut off horizontally
  left = Math.max(FLYOUT_SAFE, Math.min(left, VW - flyoutW - FLYOUT_SAFE));
  flyout.style.left = left + "px";

  // ---- Y position: vertically center on the icon's center ----
  const iconCenterY = iconRect.top + iconRect.height / 2;
  let top = iconCenterY - effectiveH / 2;

  // If overflowing the top, pin with safe margin
  if (top < FLYOUT_SAFE) top = FLYOUT_SAFE;
  // If overflowing the bottom, pin with safe margin
  if (top + effectiveH > VH - FLYOUT_SAFE) top = VH - FLYOUT_SAFE - effectiveH;
  // Extra safety: never let top go below the safe margin
  if (top < FLYOUT_SAFE) top = FLYOUT_SAFE;
  flyout.style.top = top + "px";

  // Position the little arrow pointer at the icon's vertical center
  if (arrow) {
    const arrowTopClamped = Math.max(20, Math.min(iconCenterY - top, effectiveH - 20));
    arrow.style.top = (top + arrowTopClamped) + "px";
    if (arrowOnLeft) {
      arrow.style.left = (left - 7) + "px"; // nestled just left of the flyout
      arrow.style.transform = "translateY(-50%) rotate(45deg)";
    } else {
      arrow.style.left = (left + flyoutW - 5) + "px"; // just right of the flyout
      arrow.style.transform = "translateY(-50%) rotate(225deg)";
    }
  }
}

/* Open a flyout with animation + focus management */
function openFlyout(section){
  // Close any other flyouts (immediate, no animation, to keep switching snappy)
  $$(".section.floating").forEach(s=>{
    if(s!==section){
      closeFlyout(s, true);
      const h=s.querySelector(".section-head");
      if(h) h.setAttribute("aria-expanded","false");
    }
  });
  section.classList.add("floating");
  ensureFlyout(section);
  // Move focus into the flyout for keyboard users
  const flyout=section.querySelector(".section-flyout");
  if(flyout){
    // Defer focus so the opening transition runs first
    requestAnimationFrame(()=>{ flyout.focus({preventScroll:true}); });
  }
}

/* Close a flyout. If immediate, skip the closing animation.
   returnFocus=true restores focus to the triggering icon (Escape / same-icon click). */
function closeFlyout(section, immediate, returnFocus){
  const flyout=section.querySelector(".section-flyout");
  const arrow=section.querySelector(".sfly-arrow");
  if(!flyout || immediate){
    section.classList.remove("floating");
    if(flyout) flyout.classList.remove("closing");
    if(arrow) arrow.classList.remove("closing");
    if(returnFocus) section.querySelector(".section-head")?.focus({preventScroll:true});
    return;
  }
  if(flyout.classList.contains("closing")) return; // already closing
  flyout.classList.add("closing");
  if(arrow) arrow.classList.add("closing");
  let cleaned=false;
  const cleanup=()=>{
    if(cleaned) return; cleaned=true;
    flyout.classList.remove("closing");
    if(arrow) arrow.classList.remove("closing");
    section.classList.remove("floating");
    flyout.removeEventListener("animationend", onEnd);
    flyout.removeEventListener("animationcancel", onEnd);
    // Return focus to the triggering icon for keyboard users
    if(returnFocus) section.querySelector(".section-head")?.focus({preventScroll:true});
  };
  const onEnd=(e)=>{
    // Only react to the flyoutOut animation on this element (not children)
    if(e.target===flyout && (e.animationName==="flyoutOut")) cleanup();
  };
  flyout.addEventListener("animationend", onEnd);
  flyout.addEventListener("animationcancel", onEnd);
  // Safety net: if animationend never fires, force cleanup after 260ms
  setTimeout(cleanup, 260);
}

/* Reposition an already-open flyout (used on resize / scroll) */
function repositionOpenFlyout(){
  const openSection=$(".section.floating");
  if(!openSection) return;
  const head=openSection.querySelector(".section-head");
  const flyout=openSection.querySelector(".section-flyout");
  const arrow=openSection.querySelector(".sfly-arrow");
  if(head && flyout) positionFlyout(flyout, head.getBoundingClientRect(), arrow);
}
function rewireFlyout(sectionName, flyout){
  // Re-attach event listeners for key controls in the flyout
  const $f=(s)=>flyout.querySelector(s);
  if(sectionName==="platform"){
    $f(".platform-card")?.parentElement?.querySelectorAll(".platform-card").forEach(c=>{
      c.addEventListener("click",()=>{ $$("#platformSeg .platform-card").forEach(x=>x.classList.remove("active")); c.classList.add("active"); state.settings.platform=c.dataset.platform; updateExportLabel(); renderAll(); scheduleSave(); });
    });
  }
  if(sectionName==="strategy"){
    // Replace the dropdown with a flat list of expandable strategy cards.
    // Each card can be expanded to reveal the full strategy prompt, and the
    // flyout itself grows to accommodate the expanded content (up to ~82vh)
    // before the body becomes scrollable.
    const fDd=$f("#strategyDropdown");
    if(fDd){
      const current=state.settings.metadataStrategy||"balanced";
      const chevSvg='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="6 9 12 15 18 9"/></svg>';
      const cardsHtml=Object.entries(METADATA_STRATEGIES).map(([key,s])=>{
        const isRec=key==="balanced"; const isActive=key===current;
        // Build the detail content: full prompt text, or helper text for special strategies
        let detailHtml="";
        if(s.helperText){
          detailHtml=`<div class="ss-helper">${escapeHtml(s.helperText)}</div>`;
        } else if(s.prompt){
          detailHtml=`<div class="ss-prompt">${escapeHtml(s.prompt)}</div>`;
        }
        return `<div class="sfly-strat-card ${isActive?"active":""}" data-strategy="${key}">
          <div class="ss-row" data-action="select">
            <div class="ss-ic">${STRATEGY_ICONS[key]||""}</div>
            <div class="ss-info">
              <div class="ss-name">${escapeHtml(s.name)}${isRec?'<span class="ss-rec">Recommended</span>':""}</div>
              <div class="ss-desc">${escapeHtml(s.desc)}</div>
            </div>
            <button class="ss-toggle" data-action="toggle" aria-expanded="false" aria-label="Show strategy details" tabindex="0">${chevSvg}</button>
          </div>
          ${detailHtml?`<div class="ss-detail"><div class="ss-detail-inner">${detailHtml}</div></div>`:""}
        </div>`;
      }).join("");
      fDd.outerHTML=`<div class="sfly-strategy-list" id="sflyStrategyList">${cardsHtml}</div>`;
      // Re-query after outerHTML replacement
      const list=$f("#sflyStrategyList");
      if(list){
        // Click on card body â†’ select strategy
        list.querySelectorAll(".ss-row").forEach(row=>{
          row.addEventListener("click",e=>{
            if(e.target.closest("[data-action=toggle]")) return; // toggle button handles its own click
            const card=row.closest("[data-strategy]");
            if(!card) return;
            state.settings.metadataStrategy=card.dataset.strategy;
            // Update active states in the flyout
            list.querySelectorAll(".sfly-strat-card").forEach(c=>c.classList.toggle("active",c.dataset.strategy===card.dataset.strategy));
            // Update the main sidebar dropdown button + menu
            renderStrategyMenu(); updateStrategyButton();
            scheduleSave();
            toast("Strategy updated",METADATA_STRATEGIES[card.dataset.strategy].name,"info",1800);
          });
        });
        // Click on toggle â†’ expand/collapse card + reposition flyout with smooth animation
        list.querySelectorAll(".ss-toggle").forEach(btn=>{
          const handler=(e)=>{
            e.stopPropagation();
            e.preventDefault();
            const card=btn.closest("[data-strategy]");
            if(!card) return;
            const wasExpanded=card.classList.contains("expanded");

            // Compute the FINAL natural height after the toggle, so we can set
            // the flyout's max-height once and let the CSS transition animate
            // it smoothly (instead of multiple jittery re-measurements).
            //
            // detailInner.scrollHeight always returns the FULL content height of
            // the detail section, regardless of whether it's collapsed (0fr) or
            // expanded (1fr). This lets us predict the final height before the
            // grid transition even starts.
            const detailInner=card.querySelector(".ss-detail-inner");
            const detailContentH = detailInner ? detailInner.scrollHeight : 0;
            const bodyEl=flyout.querySelector(".sfly-body");
            const titleEl=flyout.querySelector(".sfly-title");
            const currentBodyH = bodyEl ? bodyEl.scrollHeight : 0;
            const titleH = titleEl ? titleEl.offsetHeight : 0;
            // If expanding: add detailContentH. If collapsing: subtract it.
            const finalBodyH = wasExpanded ? (currentBodyH - detailContentH) : (currentBodyH + detailContentH);
            const finalNaturalH = titleH + Math.max(0, finalBodyH);

            // Toggle the class â€” the grid-template-rows transition starts (220ms)
            card.classList.toggle("expanded");
            btn.setAttribute("aria-expanded", wasExpanded?"false":"true");
            btn.setAttribute("aria-label", wasExpanded?"Show strategy details":"Hide strategy details");

            // Update the flyout's max-height + top to the final values.
            // The CSS transition on max-height (0.22s) + top (0.22s) animates
            // smoothly, tracking the grid transition on the card detail.
            const section=card.closest(".section");
            const head=section?.querySelector(".section-head");
            const arrow=section?.querySelector(".sfly-arrow");
            if(head){
              positionFlyout(flyout, head.getBoundingClientRect(), arrow, finalNaturalH);
            }
          };
          btn.addEventListener("click",handler);
          btn.addEventListener("keydown",e=>{
            if(e.key==="Enter"||e.key===" "){ handler(e); }
          });
        });
      }
    }
  }
  if(sectionName==="ai"){
    $f("#modelSelect")?.addEventListener("change",e=>{state.settings.model=e.target.value;scheduleSave();});
  }
  if(sectionName==="metadata"){
    $f("#autoCategory")?.addEventListener("change",e=>{state.settings.autoCategory=e.target.checked;scheduleSave();});
    $f("#dedupeKw")?.addEventListener("change",e=>{state.settings.dedupeKw=e.target.checked;scheduleSave();});
    $f("#negativeKeywords")?.addEventListener("input",e=>{state.settings.negativeKeywords=e.target.value;scheduleSave();});
    // Sliders
    const ts=$f("#titleSlider"); if(ts){ ts.querySelector("input").value=state.settings.titleMax; initSlider(ts,v=>{state.settings.titleMax=v;$f("#titleVal").textContent=v+" chars";scheduleSave();}); }
    const ds=$f("#descSlider"); if(ds){ ds.querySelector("input").value=state.settings.descMax; initSlider(ds,v=>{state.settings.descMax=v;$f("#descVal").textContent=v+" chars";scheduleSave();}); }
    const ks=$f("#kwSlider"); if(ks){ ks.querySelector("input").value=state.settings.kwMax; initSlider(ks,v=>{state.settings.kwMax=v;$f("#kwVal").textContent=v+" keywords";scheduleSave();}); }
  }
  if(sectionName==="keyword-strategy"){
    $f(".kw-option")?.parentElement?.querySelectorAll(".kw-option").forEach(o=>{
      o.addEventListener("click",()=>{ $$("#kwStrategyOpts .kw-option").forEach(x=>x.classList.remove("active")); o.classList.add("active"); state.settings.keywordStructure=o.dataset.mode; scheduleSave(); });
    });
  }
  if(sectionName==="instructions"){
    const ciTa=$f("#customInstructions"), ciCounter=$f("#ciCounter");
    const ciToggle=$f("#enableCustomPromptToggle");
    if(ciToggle) {
      ciToggle.checked = state.settings.enableCustomPrompt;
      const ciBody=$f("#ciBody");
      if(ciBody) ciBody.style.display = state.settings.enableCustomPrompt ? "block" : "none";
      ciToggle.addEventListener("change", e=>{
        state.settings.enableCustomPrompt = e.target.checked;
        scheduleSave();
        if(ciBody) ciBody.style.display = e.target.checked ? "block" : "none";
        // Sync state back to the original hidden sidebar elements
        const mainToggle = document.querySelector(".sidebar #enableCustomPromptToggle");
        if(mainToggle) mainToggle.checked = e.target.checked;
        const mainBody = document.querySelector(".sidebar #ciBody");
        if(mainBody) mainBody.style.display = e.target.checked ? "block" : "none";
      });
    }
    if(ciTa){ ciTa.value=state.settings.customPrompt||""; ciTa.addEventListener("input",()=>{ state.settings.customPrompt=ciTa.value; if(ciCounter) ciCounter.textContent=`${ciTa.value.length} / 5000`; scheduleSave(); }); }
    $f("#btnResetInstructions")?.addEventListener("click",()=>{ if(ciTa){ciTa.value=""; state.settings.customPrompt="";} if(ciCounter) ciCounter.textContent="0 / 5000"; scheduleSave(); });
  }
}

/* ---------- Strategy Dropdown ---------- */
const STRATEGY_ICONS = {
  balanced: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2v20M5 7h14M7 7l-3 6h6L7 7zm10 0l-3 6h6l-3-6z"/></svg>',
  keyword_rich: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></svg>',
  seo_precision: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>',
  editorial: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 22h16a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2H8a2 2 0 0 0-2 2v16a2 2 0 0 1-2 2zm0 0a2 2 0 0 1-2-2v-9c0-1.1.9-2 2-2h2"/><path d="M18 14h-8M15 18h-5M10 6h8v4h-8V6z"/></svg>',
  icon_collection: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>'
};
function renderStrategyMenu(){
  const menu=$("#strategyMenu"); if(!menu) return;
  const current=state.settings.metadataStrategy||"balanced";
  menu.innerHTML = Object.entries(METADATA_STRATEGIES).map(([key,s])=>{
    const isRec = key==="balanced";
    const isActive = key===current;
    return `<div class="strategy-opt ${isActive?"active":""}" data-strategy="${key}">
      <div class="so-ic">${STRATEGY_ICONS[key]||""}</div>
      <div class="so-info">
        <div class="so-name">${escapeHtml(s.name)}${isRec?'<span class="so-rec">Recommended</span>':""}</div>
        <div class="so-desc">${escapeHtml(s.desc)}</div>
      </div>
    </div>`;
  }).join("");
}
function updateStrategyButton(){
  const key=state.settings.metadataStrategy||"balanced";
  const s=METADATA_STRATEGIES[key]||METADATA_STRATEGIES.balanced;
  const isRec = key==="balanced";
  const sbName=$("#sbName"), sbDesc=$("#sbDesc"), sbIcon=$("#sbIcon");
  if(sbName) sbName.innerHTML = escapeHtml(s.name) + (isRec?' <span class="sb-rec">Recommended</span>':"");
  if(sbDesc) sbDesc.textContent = s.desc;
  if(sbIcon) sbIcon.innerHTML = STRATEGY_ICONS[key]||STRATEGY_ICONS.balanced;
  // Show helper text for icon_collection strategy
  let helper = $("#strategyHelper");
  if(s.helperText){
    if(!helper){
      helper = document.createElement("div");
      helper.id = "strategyHelper";
      helper.style.cssText = "font-size:10.5px;color:var(--fg-muted);margin-top:8px;line-height:1.45;padding:8px 10px;background:var(--accent-muted);border-radius:var(--radius-sm);border-left:2px solid var(--accent);";
      const dd = $("#strategyDropdown");
      if(dd) dd.after(helper);
    }
    helper.textContent = s.helperText;
    helper.style.display = "block";
  } else if(helper){
    helper.style.display = "none";
  }
}
function setupStrategyDropdown(){
  renderStrategyMenu();
  updateStrategyButton();
  const dd=$("#strategyDropdown"), btn=$("#strategyBtn"), menu=$("#strategyMenu");
  if(!dd||!btn||!menu) return;
  btn.addEventListener("click",e=>{ e.stopPropagation(); dd.classList.toggle("open"); });
  menu.addEventListener("click",e=>{
    const opt=e.target.closest("[data-strategy]");
    if(!opt) return;
    state.settings.metadataStrategy=opt.dataset.strategy;
    renderStrategyMenu(); updateStrategyButton();
    dd.classList.remove("open");
    scheduleSave();
    toast("Strategy updated", METADATA_STRATEGIES[opt.dataset.strategy].name, "info", 1800);
  });
  document.addEventListener("click",e=>{ if(!dd.contains(e.target)) dd.classList.remove("open"); });
}

/* ---------- Event Wiring ---------- */

// View switching
function switchView(view){
  const ws=$("#workspaceView"), ab=$("#aboutView");
  const tabs=$$(".nav-tab");
  tabs.forEach(t=>t.classList.toggle("active", t.dataset.view===view));
  const navTabsContainer=$(".nav-tabs");
  if(navTabsContainer) navTabsContainer.dataset.active = view;
  // Hide all
  if(ws) ws.classList.remove("show"); 
  if(ab) ab.classList.remove("show");
  // Show selected
  if(view==="about"){ ab.classList.add("show"); setTimeout(()=>{ ab.scrollTop=0; },10); }
  else { ws.classList.add("show"); }
}

// Populate features grid
const OVERVIEW_FEATURES=[
  "Batch Metadata Generation","AI SEO Titles","Professional Descriptions","Commercial Keywords",
  "Keyword Structure Control","Icon Collection Mode","Custom Instructions","Multiple Gemini API Rotation",
  "Retry Failed Assets","Auto Save Settings","Recent CSV History","Adobe Stock CSV Export",
  "Shutterstock CSV Export","Output Extension Mapping","Professional Category Detection"
];
function renderOverviewFeatures(){
  const grid=$("#ovFeatGrid"); if(!grid) return;
  const checkSvg='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="14" height="14"><polyline points="20 6 9 17 4 12"/></svg>';
  grid.innerHTML = OVERVIEW_FEATURES.map(f=>`<div class="ov-feat-card"><div class="of-ic">${checkSvg}</div><span>${escapeHtml(f)}</span></div>`).join("");
}

// Populate FAQ
const FAQ_DATA=[
  {q:"Is StockFlow free?",a:"Yes, StockFlow is 100% free. There are no subscriptions, no hidden fees, and no premium tiers. The application runs entirely in your browser."},
  {q:"Does it upload my files?",a:"No. StockFlow processes all files locally in your browser. The only external requests are to the Google Gemini API for metadata generation, and only if you provide your own API key. Your images never leave your computer."},
  {q:"Which file types are supported?",a:"StockFlow supports JPG, JPEG, PNG, EPS, AI, and SVG files. These cover the most common formats used by Adobe Stock and Shutterstock contributors."},
  {q:"Which AI models are supported?",a:"StockFlow uses Google Gemini AI models including gemini-2.0-flash, gemini-2.5-flash, gemini-1.5-flash, and gemini-2.0-flash-lite. You can use multiple API keys with automatic rotation."},
  {q:"Can I edit metadata before export?",a:"Absolutely. StockFlow includes a professional metadata editor modal where you can edit titles, descriptions, keywords (as removable chips), and categories. All changes are saved automatically and reflected in the exported CSV."}
];
function renderFaq(){
  const faq=$("#ovFaq"); if(!faq) return;
  faq.innerHTML = FAQ_DATA.map((f,i)=>`<div class="ov-faq-item" data-faq="${i}">
    <div class="ov-faq-q">${escapeHtml(f.q)}<svg class="of-chev" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="6 9 12 15 18 9"/></svg></div>
    <div class="ov-faq-a"><p>${escapeHtml(f.a)}</p></div>
  </div>`).join("");
  faq.addEventListener("click",e=>{ const item=e.target.closest("[data-faq]"); if(item) item.classList.toggle("open"); });
}

// About page: features, tech, FAQ
const ABOUT_FEATURES=[
  "AI Metadata Generation","Icon Collection Analysis","Professional SEO Titles","Commercial Keywords",
  "Category Detection","Adobe Stock Export","Shutterstock Export","Retry Failed Assets",
  "Recent CSV History","Auto Save Settings","Multiple Gemini API Rotation","Local Processing",
  "Fast Batch Workflow","Custom AI Instructions"
];
const ABOUT_TECH=["HTML5","CSS3","JavaScript","Gemini AI","CSV Processing","Local Storage","Responsive Design","Offline Friendly"];
const ABOUT_FAQ=[
  {q:"Is StockFlow free?",a:"Yes, StockFlow is 100% free. No subscriptions, no hidden fees. It runs entirely in your browser."},
  {q:"Does it upload my files?",a:"No. All file processing happens locally. Only AI metadata requests go to Google Gemini, and only if you provide your own API key."},
  {q:"Where is my data stored?",a:"Your settings and metadata are stored locally in your browser using IndexedDB. Nothing is sent to any server except Google Gemini API for generation."},
  {q:"Which AI models are supported?",a:"StockFlow uses Google Gemini models including gemini-2.0-flash, gemini-2.5-flash, gemini-1.5-flash, and gemini-2.0-flash-lite with multi-key rotation."},
  {q:"Does it support icon sheets?",a:"Yes! StockFlow has a specialized Icon Collection strategy that analyzes every icon individually before generating one optimized metadata package."},
  {q:"Can I edit metadata before export?",a:"Absolutely. The metadata editor modal lets you edit titles, descriptions, keywords as chips, and categories. All changes auto-save."}
];
function renderAboutContent(){
  const checkSvg='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="18" height="18"><polyline points="20 6 9 17 4 12"/></svg>';
  const fg=$("#abFeatGrid"); if(fg) fg.innerHTML=ABOUT_FEATURES.map(f=>`<div class="ab-feat-card"><div class="af-ic">${checkSvg}</div><span>${escapeHtml(f)}</span></div>`).join("");
  const tg=$("#abTechGrid"); if(tg){
    const techIcons={"HTML5":'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>',"CSS3":'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="9" y1="3" x2="9" y2="21"/></svg>',"JavaScript":'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>',"Gemini AI":'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2a3 3 0 0 1 3 3c0 1.31-.83 2.42-2 2.83V9h3a4 4 0 0 1 4 4v1.17c1.17.41 2 1.52 2 2.83a3 3 0 0 1-6 0"/></svg>',"CSV Processing":'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="8" y1="13" x2="16" y2="13"/></svg>',"Local Storage":'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/></svg>',"Responsive Design":'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>',"Offline Friendly":'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>'};
    tg.innerHTML=ABOUT_TECH.map(t=>`<div class="ab-tech-card"><div class="at-ic">${techIcons[t]||techIcons["HTML5"]}</div><span>${escapeHtml(t)}</span></div>`).join("");
  }
  const faq=$("#abFaq"); if(faq){
    faq.innerHTML=ABOUT_FAQ.map((f,i)=>`<div class="ab-faq-item" data-abfaq="${i}"><div class="ab-faq-q">${escapeHtml(f.q)}<svg class="abf-chev" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="6 9 12 15 18 9"/></svg></div><div class="ab-faq-a"><p>${escapeHtml(f.a)}</p></div></div>`).join("");
    faq.addEventListener("click",e=>{ const item=e.target.closest("[data-abfaq]"); if(item) item.classList.toggle("open"); });
  }
}

function wire(){
  // Overview features + FAQ
  renderOverviewFeatures();
  renderFaq();
  // Nav tabs
  $$(".nav-tab").forEach(t=>t.addEventListener("click",()=>switchView(t.dataset.view)));
  $("#ovOpenWorkspace")?.addEventListener("click",()=>switchView("workspace"));
  $("#ovLearnMore")?.addEventListener("click",()=>{ $("#overviewView").scrollTo({top:600,behavior:"smooth"}); });
  $("#ovLearnMoreCreator")?.addEventListener("click",()=>switchView("about"));
  // About page
  renderAboutContent();
  $("#abOpenWorkspace")?.addEventListener("click",()=>switchView("workspace"));
  $("#abViewFeatures")?.addEventListener("click",()=>{ const e=$("#aboutView").querySelector("#abFeatGrid"); e?.scrollIntoView({behavior:"smooth",block:"start"}); });
  $$("[data-ab-nav]").forEach(b=>b.addEventListener("click",()=>{
    const t=b.dataset.abNav;
    if(t==="workspace"){ switchView("workspace"); }
    else if(t==="overview"){ switchView("overview"); setTimeout(()=>$("#overviewView").scrollTo({top:0,behavior:"smooth"}),100); }
    else if(t==="about"){ switchView("about"); setTimeout(()=>$("#aboutView").scrollTo({top:0,behavior:"smooth"}),100); }
    else if(t==="creator"){ switchView("about"); setTimeout(()=>{ $("#aboutView").querySelector(".ab-creator")?.scrollIntoView({behavior:"smooth",block:"start"}); },150); }
  }));
  // About fade-in observer
  const abObserver=new IntersectionObserver((entries)=>{ entries.forEach(e=>{ if(e.isIntersecting){ e.target.classList.add("visible"); abObserver.unobserve(e.target); } }); }, {threshold:0.1, rootMargin:"0px 0px -50px 0px"});
  $$(".ab-fade-in").forEach(el=>abObserver.observe(el));
  // Creator link buttons (hidden if no links configured â€” currently placeholder)
  $$("[data-creator-link]").forEach(b=>{ b.style.display="none"; }); // Hidden until links are configured
  // Footer navigation
  $$("[data-footer-nav]").forEach(b=>b.addEventListener("click",()=>{
    const target=b.dataset.footerNav;
    if(target==="workspace"){ switchView("workspace"); }
    else if(target==="overview"){ switchView("overview"); setTimeout(()=>$("#overviewView").scrollTo({top:0,behavior:"smooth"}),100); }
    else { switchView("overview"); setTimeout(()=>{ const el={"features":"#ovFeatGrid","faq":"#ovFaq","creator":".ov-creator"}[target]; if(el){ const e=$("#overviewView").querySelector(el); e?.scrollIntoView({behavior:"smooth",block:"start"}); } },150); }
  }));
  // Scroll fade-in animation
  const observer=new IntersectionObserver((entries)=>{ entries.forEach(e=>{ if(e.isIntersecting){ e.target.classList.add("visible"); observer.unobserve(e.target); } }); }, {threshold:0.1, rootMargin:"0px 0px -50px 0px"});
  $$(".ov-fade-in").forEach(el=>observer.observe(el));
  // Section collapse (expanded/compact modes) + floating panel (collapsed mode)
  $$(".section-head").forEach(h=>{
    // Make section-head keyboard-accessible in collapsed mode
    h.setAttribute("tabindex","0");
    h.setAttribute("role","button");
    h.setAttribute("aria-expanded","false");
    const handleToggle=(e)=>{
      const section=h.parentElement;
      const sidebar=$("#leftPanel");
      if(sidebar.classList.contains("mode-collapsed")){
        e.stopPropagation();
        e.preventDefault();
        const wasFloating=section.classList.contains("floating");
        if(wasFloating){
          closeFlyout(section, false, true);
          h.setAttribute("aria-expanded","false");
        } else {
          openFlyout(section);
          h.setAttribute("aria-expanded","true");
        }
      } else {
        section.classList.toggle("collapsed");
      }
    };
    h.addEventListener("click",handleToggle);
    h.addEventListener("keydown",e=>{
      if(e.key==="Enter"||e.key===" "){ handleToggle(e); }
    });
    // Add tooltip span for collapsed mode
    const lbl=h.querySelector(".lbl");
    if(lbl){
      const tip=document.createElement("span"); tip.className="section-tip"; tip.textContent=lbl.textContent;
      h.appendChild(tip);
    }
  });
  // Close floating panels when clicking outside (no focus steal â€” let the click target keep focus)
  document.addEventListener("click",e=>{
    if(!e.target.closest(".section.floating") && !e.target.closest(".section-head")){
      $$(".section.floating").forEach(s=>{
        const head=s.querySelector(".section-head");
        closeFlyout(s, false, false);
        if(head) head.setAttribute("aria-expanded","false");
      });
    }
  });
  // Close floating panel on Escape and return focus to the triggering icon
  document.addEventListener("keydown",e=>{
    if(e.key==="Escape"){
      const open=$(".section.floating");
      if(open){
        e.stopPropagation();
        const head=open.querySelector(".section-head");
        closeFlyout(open, false, true);
        if(head) head.setAttribute("aria-expanded","false");
      }
    }
  });
  // Reposition open flyout on viewport resize (so it never gets cut off)
  let flyoutResizeRaf=null;
  window.addEventListener("resize",()=>{
    if(flyoutResizeRaf) cancelAnimationFrame(flyoutResizeRaf);
    flyoutResizeRaf=requestAnimationFrame(repositionOpenFlyout);
  });
  // If the sidebar body scrolls while a flyout is open, reposition too
  $(".sidebar-body")?.addEventListener("scroll",()=>{
    if(flyoutResizeRaf) cancelAnimationFrame(flyoutResizeRaf);
    flyoutResizeRaf=requestAnimationFrame(repositionOpenFlyout);
  });

  // ===== Two-state Sidebar Toggle =====
  const SIDEBAR_EXPANDED=300, SIDEBAR_COLLAPSED=76;
  const sidebar=$("#leftPanel"), toggleBtn=$("#sidebarToggle"), root=document.documentElement;
  let isCollapsed=false;
  function setSidebarState(collapsed){
    isCollapsed=collapsed;
    if(collapsed){
      sidebar.classList.add("mode-collapsed");
      toggleBtn.classList.add("collapsed");
      toggleBtn.title="Expand sidebar";
      root.setAttribute("data-sidebar","collapsed");
      root.style.setProperty("--left-w", SIDEBAR_COLLAPSED+"px");
    } else {
      sidebar.classList.remove("mode-collapsed");
      toggleBtn.classList.remove("collapsed");
      toggleBtn.title="Collapse sidebar";
      root.setAttribute("data-sidebar","expanded");
      root.style.setProperty("--left-w", SIDEBAR_EXPANDED+"px");
      // Close any floating panels when expanding (immediate, no animation)
      $$(".section.floating").forEach(s=>{ closeFlyout(s, true); const h=s.querySelector(".section-head"); if(h) h.setAttribute("aria-expanded","false"); });
    }
    try{ localStorage.setItem("stockflow_sidebar_collapsed", collapsed?"1":"0"); }catch(e){}
  }
  toggleBtn.addEventListener("click",()=>setSidebarState(!isCollapsed));
  // Restore saved state
  try{
    const saved=localStorage.getItem("stockflow_sidebar_collapsed")==="1";
    setSidebarState(saved);
  }catch(e){ setSidebarState(false); }
  // Platform
  $$("#platformSeg .platform-card").forEach(c=>c.addEventListener("click",()=>{ $$("#platformSeg .platform-card").forEach(x=>x.classList.remove("active")); c.classList.add("active"); state.settings.platform=c.dataset.platform; updateExportLabel(); renderAll(); scheduleSave(); }));
  // Metadata Strategy
  setupStrategyDropdown();
  // Theme
  $("#btnTheme").addEventListener("click",()=>{const cur=document.documentElement.dataset.theme;const next=cur==="dark"?"light":"dark";document.documentElement.dataset.theme=next;$("#iconTheme").innerHTML=next==="dark"?'<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>':'<circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>';idb.set("theme",next);});
  // Upload
  const uz=$("#uploadZone");
  uz.addEventListener("click",e=>{ if(e.target.closest("#btnAddMore")) return; $("#fileInput").click(); });
  uz.addEventListener("dragover",e=>{e.preventDefault();uz.classList.add("drag");});
  uz.addEventListener("dragleave",()=>uz.classList.remove("drag"));
  uz.addEventListener("drop",e=>{e.preventDefault();uz.classList.remove("drag");handleFiles(e.dataTransfer.files);});
  $("#fileInput").addEventListener("change",e=>{handleFiles(e.target.files);e.target.value="";});
  $("#btnAddMore").addEventListener("click",e=>{ e.stopPropagation(); $("#fileInput").click(); });
  // API â€” navbar button opens the global API Settings modal
  $("#apiPill").addEventListener("click",openApiSettings);
  $("#keyFileInput").addEventListener("change",async e=>{const f=e.target.files[0];if(!f)return;const text=await f.text();const keys=text.split(/\r?\n/).map(s=>s.trim()).filter(s=>s&&!s.startsWith("#"));let added=0;keys.forEach(k=>{if(!state.apiKeys.some(x=>x.key===k)){state.apiKeys.push({key:k,status:"untested",uses:0,lastError:""});added++;}});e.target.value="";renderApiKeysList();updateApiPill();if(state.assets.length===0)renderGallery();scheduleSave();toast("Keys imported",`${added} of ${keys.length} added`,"success");});

  $("#autoCategory").addEventListener("change",e=>{state.settings.autoCategory=e.target.checked;scheduleSave();});
  $("#dedupeKw").addEventListener("change",e=>{state.settings.dedupeKw=e.target.checked;scheduleSave();});
  $("#negativeKeywords").addEventListener("input",e=>{state.settings.negativeKeywords=e.target.value;scheduleSave();});
  $("#mapExt").addEventListener("change",e=>{state.settings.mapExt=e.target.value;scheduleSave();});
  // Sliders
  initSlider($("#titleSlider"),v=>{state.settings.titleMax=v;$("#titleVal").textContent=v+" chars";scheduleSave();});
  initSlider($("#descSlider"),v=>{state.settings.descMax=v;$("#descVal").textContent=v+" chars";scheduleSave();});
  initSlider($("#kwSlider"),v=>{state.settings.kwMax=v;$("#kwVal").textContent=v+" keywords";scheduleSave();});
  // Keyword structure
  $$("#kwStrategyOpts .kw-option").forEach(o=>o.addEventListener("click",()=>{$$("#kwStrategyOpts .kw-option").forEach(x=>x.classList.remove("active"));o.classList.add("active");state.settings.keywordStructure=o.dataset.mode;scheduleSave();}));
  // Custom Instructions
  const ciTa=$("#customInstructions"), ciCounter=$("#ciCounter");
  const ciToggle=$("#enableCustomPromptToggle");
  $("#ciToggleLabel")?.addEventListener("click",e=>e.stopPropagation());
  if(ciToggle){
    ciToggle.addEventListener("change", e=>{
      state.settings.enableCustomPrompt=e.target.checked;
      scheduleSave();
      if(e.target.checked) $("#ciBody").style.display = "block";
      else $("#ciBody").style.display = "none";
    });
  }
  ciTa.value=state.settings.customPrompt||"";
  function updateCiCounter(){ const v=ciTa.value.length; ciCounter.textContent=`${v} / 5000`; ciCounter.style.color = v>5000?"var(--danger)":""; }
  updateCiCounter();
  ciTa.addEventListener("input",()=>{ state.settings.customPrompt=ciTa.value; updateCiCounter(); scheduleSave(); });
  $("#btnResetInstructions").addEventListener("click",()=>{ ciTa.value=""; state.settings.customPrompt=""; updateCiCounter(); scheduleSave(); toast("Instructions cleared","","info",1500); });
  // Templates removed
  // Export
  $("#btnExportCsv").addEventListener("click",()=>doExport("csv"));
  $("#btnCsvHistory").addEventListener("click",openCsvHistory);
  // Gallery toolbar
  $("#btnGenerateAll").addEventListener("click",()=>{const sel=state.assets.filter(a=>state.selected.has(a.id));const targets=sel.length?sel.filter(a=>a.status==="pending"||a.status==="error"):null;if(sel.length&&!targets?.length){toast("Selected assets already processed","","warn");return;}startBatch(targets);});
  $("#btnSelectAll").addEventListener("click",()=>{if(state.selected.size===state.assets.length)state.selected.clear();else state.assets.forEach(a=>state.selected.add(a.id));renderGallery();});
  $("#btnRemoveSel").addEventListener("click",()=>{if(!state.selected.size)return;if(!confirm(`Remove ${state.selected.size} asset(s)?`))return;state.assets=state.assets.filter(a=>!state.selected.has(a.id));state.selected.clear();renderAll();scheduleSave();toast("Removed","","info");});
  // Retry Failed â€” only retry assets with status "error"
  $("#btnRetryFailed").addEventListener("click",()=>{
    const failed=state.assets.filter(a=>a.status==="error");
    if(failed.length===0){ toast("No failed assets","","warn"); return; }
    failed.forEach(a=>{ a.status="pending"; a.progress=0; a.error=null; });
    startBatch(failed);
    toast("Retrying failed", `${failed.length} asset(s)`, "info", 2000);
  });
  // Retry Selected â€” only retry manually selected assets
  $("#btnRetrySelected").addEventListener("click",()=>{
    const sel=state.assets.filter(a=>state.selected.has(a.id));
    if(sel.length===0){ toast("Select assets to retry","","warn"); return; }
    sel.forEach(a=>{ a.status="pending"; a.progress=0; a.error=null; });
    startBatch(sel);
    toast("Retrying selected", `${sel.length} asset(s)`, "info", 2000);
  });
  // Batch controls
  $("#btnPause").addEventListener("click",pauseBatch);
  $("#btnResume").addEventListener("click",resumeBatch);
  $("#btnCancel").addEventListener("click",cancelBatch);
  // Gallery clicks
  $("#gallery").addEventListener("click",e=>{
    // Empty state actions
    const emptyAction=e.target.closest("[data-empty-action]");
    if(emptyAction){
      e.stopPropagation();
      const action=emptyAction.dataset.emptyAction;
      if(action==="open-api"){ openApiSettings(); }
      else if(action==="upload"){ $("#fileInput").click(); }
      return;
    }
    // Per-field copy buttons (title / keywords / description) â€” copies text, shows check feedback
    const copyBtn=e.target.closest("[data-copy]");
    if(copyBtn){
      e.stopPropagation();
      const id=copyBtn.dataset.id;
      const field=copyBtn.dataset.copy;
      const a=state.assets.find(x=>x.id===id);
      if(!a||!a.meta){ return; }
      let text="";
      let toastTitle="";
      if(field==="title"){ text=a.meta.title||""; toastTitle="Title copied"; }
      else if(field==="keywords"){ text=(a.meta.keywords||[]).join(", "); toastTitle="Keywords copied"; }
      else if(field==="desc"){ text=a.meta.desc||""; toastTitle="Description copied"; }
      if(!text){ toast("Nothing to copy","","warn"); return; }
      navigator.clipboard.writeText(text).then(()=>{
        // Visual feedback: swap icon to check for 1.2s + glow the field box
        const original=copyBtn.innerHTML;
        copyBtn.classList.add("copied");
        copyBtn.innerHTML='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>';
        const box=copyBtn.closest(".ac-field-box");
        if(box){ box.classList.add("copied"); setTimeout(()=>box.classList.remove("copied"),1200); }
        setTimeout(()=>{ copyBtn.classList.remove("copied"); copyBtn.innerHTML=original; }, 1200);
        toast(toastTitle,"","success",1500);
      },()=>toast("Clipboard blocked","Copy manually","error"));
      return;
    }
    // "Copy All" button â€” copies title + description + keywords + category as a formatted block
    const copyAllBtn=e.target.closest("[data-copy-all]");
    if(copyAllBtn){
      e.stopPropagation();
      const a=state.assets.find(x=>x.id===copyAllBtn.dataset.copyAll);
      if(!a||!a.meta){ toast("No metadata to copy","","warn"); return; }
      const m=a.meta;
      const block=[
        "Title: "+(m.title||""),
        "Description: "+(m.desc||""),
        "Keywords: "+(m.keywords||[]).join(", "),
        "Category: "+(m.category||"")
      ].join("\n");
      navigator.clipboard.writeText(block).then(()=>{
        toast("All metadata copied","Pasted-ready format","success",1800);
      },()=>toast("Clipboard blocked","Copy manually","error"));
      return;
    }
    // "Remove" button â€” removes the asset from the gallery
    const removeBtn=e.target.closest("[data-remove]");
    if(removeBtn){
      e.stopPropagation();
      const id=removeBtn.dataset.remove;
      const a=state.assets.find(x=>x.id===id);
      if(!a) return;
      if(!confirm(`Remove "${a.name}"?`)) return;
      state.assets=state.assets.filter(x=>x.id!==id);
      state.selected.delete(id);
      renderAll(); scheduleSave();
      toast("Asset removed","","info",1500);
      return;
    }
    // Edit / Regenerate action buttons
    const edit=e.target.closest("[data-edit]"); const regen=e.target.closest("[data-regen]");
    if(edit){ e.stopPropagation(); openDrawer(edit.dataset.edit); return; }
    if(regen){ e.stopPropagation(); const a=state.assets.find(x=>x.id===regen.dataset.regen); if(a){a.status="pending";a.progress=0;a.error=null;startBatch([a]);} return; }
    const card=e.target.closest(".asset-card");
    if(card){ const id=card.dataset.id; if(e.shiftKey||e.ctrlKey||e.metaKey){ if(state.selected.has(id))state.selected.delete(id);else state.selected.add(id); renderGallery(); } else { openDrawer(id); } }
  });
  // Drawer
  $("#metaClose").addEventListener("click",closeDrawer);
  $("#metaOverlay").addEventListener("click",e=>{ if(e.target===$("#metaOverlay")) closeDrawer(); });
  $("#metaSave").addEventListener("click",()=>{
    const a=state.assets.find(x=>x.id===state.drawerId); if(!a)return;
    pushHistory();
    if(!a.meta)a.meta={title:"",desc:"",keywords:[],category:categoriesFor()[0],confidence:0,alternatives:[]};
    a.meta.title=$("#mTitle").value.trim();
    a.meta.desc=$("#mDesc").value.trim();
    if($("#mCatInput").value) a.meta.category=$("#mCatInput").value;
    a.notes=$("#mNotes").value.trim();
    a.quality=computeQuality(a); a.issues=validateAsset(a);
    if(a.status==="done")a.status="edited";
    renderGallery(); scheduleSave();
    toast("Changes saved","","success",1800);
  });
  $("#metaRegenerate").addEventListener("click",()=>{const a=state.assets.find(x=>x.id===state.drawerId);if(a){a.status="pending";a.progress=0;a.error=null;closeDrawer();startBatch([a]);}});
  $("#metaPrev").addEventListener("click",()=>{const idx=state.assets.findIndex(a=>a.id===state.drawerId);if(idx>0){state.drawerId=state.assets[idx-1].id;renderMetadataModal();}});
  $("#metaNext").addEventListener("click",()=>{const idx=state.assets.findIndex(a=>a.id===state.drawerId);if(idx<state.assets.length-1){state.drawerId=state.assets[idx+1].id;renderMetadataModal();}});

  // Scroll to top button logic
  const btnScrollTop = document.createElement("button");
  btnScrollTop.className = "scroll-to-top";
  btnScrollTop.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="18 15 12 9 6 15"/></svg>';
  document.body.appendChild(btnScrollTop);
  let activeScrollContainer = null;
  [$("#aboutView"), $("#overviewView"), $(".ws-scroll")].forEach(el => {
    if(!el) return;
    el.addEventListener("scroll", () => {
      if(el.scrollTop > 300) {
        btnScrollTop.classList.add("show");
        activeScrollContainer = el;
      } else {
        if(activeScrollContainer === el) {
          btnScrollTop.classList.remove("show");
          activeScrollContainer = null;
        }
      }
    });
  });
  btnScrollTop.addEventListener("click", () => {
    if(activeScrollContainer) activeScrollContainer.scrollTo({top: 0, behavior: 'smooth'});
  });

  // Shortcuts & mobile
  $("#btnLeftMobile").addEventListener("click",()=>$("#leftPanel").classList.toggle("mobile-open"));
  document.addEventListener("keydown",handleShortcut);
}

function handleShortcut(e){
  if(e.target.isContentEditable||/^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)){if(e.key!=="Escape")return;}
  if(e.key==="Escape"){closeModal();closeDrawer();}
}

/* ---------- Init ---------- */
async function init(){
  await idb.open();
  const savedTheme=await idb.get("theme");
  if(savedTheme){document.documentElement.dataset.theme=savedTheme;if(savedTheme==="dark")$("#iconTheme").innerHTML='<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>';}
  const saved=await idb.get("state");
  if(saved){
    if(saved.settings)Object.assign(state.settings,saved.settings);
    if(state.settings.concurrency === 3) state.settings.concurrency = 2;
    if(saved.apiKeys)state.apiKeys=saved.apiKeys.map(k=>({...k,status:k.status||"untested",uses:k.uses||0,lastError:k.lastError||""}));
    if(saved.templates)state.templates=saved.templates;
    // Assets are intentionally NOT loaded from IDB so the workspace resets on refresh
  }
  // init UI
  state.settings.enableCustomPrompt = false;
  $("#enableCustomPromptToggle").checked=state.settings.enableCustomPrompt;
  if(!state.settings.enableCustomPrompt) $("#ciBody").style.display = "none";
  else $("#ciBody").style.display = "block";
  $("#autoCategory").checked=state.settings.autoCategory;
  $("#dedupeKw").checked=state.settings.dedupeKw;
  $("#negativeKeywords").value=state.settings.negativeKeywords;
  $("#mapExt").value=state.settings.mapExt;
  $$("#platformSeg .platform-card").forEach(c=>c.classList.toggle("active",c.dataset.platform===state.settings.platform));
  $$("#kwStrategyOpts .kw-option").forEach(o=>o.classList.toggle("active",o.dataset.mode===state.settings.keywordStructure));
  $("#titleSlider").querySelector("input").value=state.settings.titleMax;
  $("#descSlider").querySelector("input").value=state.settings.descMax;
  $("#kwSlider").querySelector("input").value=state.settings.kwMax;
  $("#titleVal").textContent=state.settings.titleMax+" chars";
  $("#descVal").textContent=state.settings.descMax+" chars";
  $("#kwVal").textContent=state.settings.kwMax+" keywords";
  wire(); renderAll(); updateExportLabel();
  // Show workspace by default
  switchView("workspace");
}
document.addEventListener("DOMContentLoaded",init);

</body>
</html>

