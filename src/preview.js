import { CLASSIFIER_MODEL } from './classify.js';
export const PREVIEW_VERSION='betacat-personal-2026-11-19-v1';
const clamp=n=>Math.max(0,Math.min(100,Math.round(Number(n)||0)));
const tidy=(s,n=500)=>String(s??'').replace(/\s+/g,' ').trim().slice(0,n);
function norm(raw){
 const u=new URL(raw.url);
 if(!['http:','https:'].includes(u.protocol)||u.username||u.password||u.href.length>4096)throw Error('文章網址無效');
 u.hash='';
 return {url:u.href,title:tidy(raw.title_original||raw.title),summary:tidy(raw.summary,1500),
  hn_id:/^\d{1,15}$/.test(String(raw.hn_id||''))?String(raw.hn_id):null,
  points:raw.points!=null&&Number.isFinite(+raw.points)?Math.max(0,Math.min(500000,Math.round(+raw.points))):null,
  comments:raw.comments!=null&&Number.isFinite(+raw.comments)?Math.max(0,Math.min(500000,Math.round(+raw.comments))):null};
}
function hash(x){let h=2166136261;for(const c of x.title+'\n'+x.summary)h=Math.imul(h^c.charCodeAt(0),16777619);return (h>>>0).toString(16)}
const ai=/\b(?:AI|LLM|AGI|GPT[-\s]?\d|Qwen[\\w.-]*|Gemini|Claude|Anthropic|OpenAI|DeepSeek|Mistral|Llama|Kimi|Copilot|Codex|Ollama|MLX|MoE|Machine Learning|AI model|Neural Network|OpenCode|Hugging Face|transformer|diffusion)\b|人工智慧|語言模型|模型量化|推論模型/i;
const past=/\b(?:archaeolog\\w*|ancient|histori\\w*|artifact|centur|medieval|excavation|museum|roman|egyptian|fossil|dinosaur)\b|考古|史料|歷史|古代|古文明|化石|出土|古蹟/i;
const science=/\b(?:science|research|experiment|physics|chemistry|biology|astronomy|mathematics|proof|discovery|nature)\b|研究|科學|數學|化學|物理|生物|天文|實驗|證明|發現/i;
const transient=/\b(?:outage|disruption|downtime|service restored|incident report|flight grounded|temporarily unavailable)\b|服務中斷|短暫故障|恢復正常|緊急警報|停機公告/i;
export function previewRule(raw){
 const x=norm(raw),text=x.title+' '+x.summary;
 let interest=56,publish=52,recommend=28,reason='僅依標題摘要初評；仍需確認原文內容。';
 const a=ai.test(text),p=past.test(text),s=science.test(text);
 if(a){interest+=28;publish+=27;recommend+=28;reason='AI 模型與產業動態是長期追蹤興趣，公告也有資訊價值。';}
 if(p){interest+=21;publish+=22;recommend+=18;reason='歷史與考古的新發現本身具有探索及學習價值。';}
 if(s){interest+=13;publish+=14;recommend+=15;reason='包含科學、研究與方法探索。';}
 if(transient.test(text)&&!a&&!p&&!s){interest-=26;publish-=30;recommend-=15;reason='即時事件資訊，若缺乏後續分析，價值可能隨時間下降。';}
 const popular=Math.min(6,Math.round((Math.log2(1+(x.points||0))+Math.log2(1+(x.comments||0)))*.3));
 interest=clamp(interest+popular);publish=Math.min(interest,clamp(publish+popular*.6));recommend=Math.min(publish,clamp(recommend+popular*.5));
 return {interest,publish,recommend,reason,basis:'rules',confidence:'uncalibrated',version:PREVIEW_VERSION,signature:hash(x),model:null};
}
function cached(row){
 try{const p=JSON.parse(row?.prediction||'null');return row.prediction_version===PREVIEW_VERSION&&p?.signature===hash({title:row.title_original,summary:row.summary})?p:null;}catch{return null;}
}
async function learnedExamples(db){
 const pos=await db.prepare("SELECT title_original,title,substr(summary,1,200) summary,stage FROM bookmarks WHERE stage IN(0,1,3,4) ORDER BY CASE WHEN stage=4 THEN 0 ELSE 1 END,updated_at DESC LIMIT 16").all();
 const rejected=await db.prepare("SELECT title_original,title,substr(summary,1,200) summary FROM bookmarks WHERE stage=2 ORDER BY updated_at DESC LIMIT 10").all();
 const bypassed=await db.prepare("SELECT title_original,substr(summary,1,200) summary FROM betacat_observations o WHERE o.summary_viewed_at IS NOT NULL AND julianday(o.summary_viewed_at)<julianday('now','-1 day') AND NOT EXISTS(SELECT 1 FROM bookmarks b WHERE b.normalized_url=o.url) AND NOT EXISTS(SELECT 1 FROM betacat_bookmark_actions a WHERE a.url=o.url AND a.selected=1) ORDER BY o.summary_viewed_at DESC LIMIT 12").all();
 return {starred:pos.results.map(x=>({title:x.title_original||x.title,summary:x.summary,published:x.stage>=3})),not_public_after_read:rejected.results.map(x=>({title:x.title_original||x.title,summary:x.summary})),read_preview_but_not_starred:bypassed.results};
}
const probability=x=>{const n=typeof x==='number'?x:x?.probability??x?.value??x?.yes;return typeof n==='number'&&n>=0&&n<=1?clamp(n*100):null};
async function clef(aiBinding,item,examples){
 const answer=await aiBinding.run('@cf/cloudflare/clef-flash',{
  model:'clef-flash',
  state:{preference:'User enjoys AI model releases, performance and product announcements, also archaeology and history, science and creative technology. Short-lived incident notices without additional explanation have less value. Languages are not a barrier. This is a preview only.',article:item},
  questions:{
   interest:{type:'noul',instructions:'Would this user bookmark this preview to read later?'},
   publish:{type:'noul',instructions:'After reading, would this user publish it in their learning blog? AI product announcements and archaeological discoveries can be valuable in themselves.'},
   recommend:{type:'noul',instructions:'Would this user consider the article exceptionally worth recommending, not just publishing?'}
  }
 });
 const v=['interest','publish','recommend'].map(k=>probability(answer?.answers?.[k]));
 if(v.some(n=>n===null))throw Error('Clef scores missing');
 const [interest,publish,recommend]=v;
 return {...previewRule(item),interest,publish:Math.min(interest,publish),recommend:Math.min(interest,publish,recommend),basis:'decision-ai',model:'clef-flash',assessed_at:new Date().toISOString()};
}
async function gemma(aiBinding,items,examples){
 const instruction='預測這名使用者讀 BetaCats 標題摘要後會按星號的傾向 interest、讀正文後會公開 publish、以及特別推薦 recommend。不是一般文章品質。使用者高度重視 AI 新模型與產品公告（Qwen4-Max、Gemini 等）、AI 效能與產業新聞，對歷史、考古、科學與創意也有興趣。無實質內容的短效事件才降低分數。不能以語言、摘要短就扣分。每篇 0-100，且 recommend<=publish<=interest。只輸出 JSON {"items":[{"url":"...","interest":80,"publish":75,"recommend":40,"reason":"繁體中文簡短理由"}]}。';
 const result=await aiBinding.run(CLASSIFIER_MODEL,{messages:[{role:'system',content:instruction},{role:'user',content:JSON.stringify({examples,items})}],response_format:{type:'json_object'},chat_template_kwargs:{enable_thinking:false},temperature:0,max_tokens:950});
 const content=result?.choices?.[0]?.message?.content??result?.response;
 const list=typeof content==='string'?JSON.parse(content):content;
 if(!Array.isArray(list?.items))throw Error('AI response invalid');
 const byUrl=new Map(list.items.map(x=>[x.url,x]));
 return items.map(item=>{
  const x=byUrl.get(item.url);if(!x||['interest','publish','recommend'].some(k=>!Number.isFinite(Number(x[k]))))throw Error('AI scores incomplete');
  const interest=clamp(x.interest),publish=Math.min(interest,clamp(x.publish));
  return {...previewRule(item),interest,publish,recommend:Math.min(publish,clamp(x.recommend)),reason:tidy(x.reason,170),basis:'decision-ai',model:CLASSIFIER_MODEL,assessed_at:new Date().toISOString()};
 });
}
const running=new Set();
async function updateScores(env,candidates){
 const group=candidates.slice(0,4);if(!env.AI||!group.length)return;
 const key=group.map(x=>x.url).join('|');if(running.has(key))return;
 running.add(key);
 try{
  const examples=await learnedExamples(env.DB);
  let scores;
  try{scores=await Promise.all(group.map(x=>clef(env.AI,x,examples)));}
  catch(error){console.warn('Clef fallback',String(error).slice(0,220));scores=await gemma(env.AI,group,examples);}
  const at=new Date().toISOString();
  await env.DB.batch(group.map((x,i)=>env.DB.prepare('UPDATE betacat_observations SET prediction=?,prediction_version=?,prediction_at=? WHERE url=? AND title_original=? AND summary=?').bind(JSON.stringify(scores[i]),PREVIEW_VERSION,at,x.url,x.title,x.summary)));
 }catch(error){console.warn('BetaCats prediction failed',String(error).slice(0,350));}
 finally{running.delete(key);}
}
export async function previewInsights(env,raw,ctx){
 const mode=['snapshot','lookup','viewed','selection'].includes(raw?.mode)?raw.mode:'snapshot';
 if(!Array.isArray(raw?.items)||!raw.items.length||raw.items.length>55)throw Error('一次最多 55 篇文章');
 const items=[...new Map(raw.items.map(v=>{const x=norm(v);return [x.url,x]})).values()];
 const snapshot=String(raw.snapshot_id||''),now=new Date().toISOString(),page=tidy(raw.page_url,400);
 if(mode!=='lookup'&&!/^[0-9a-f-]{36}$/i.test(snapshot))throw Error('無效快照 ID');
 if(mode==='snapshot'){
  const bookmarks=await env.DB.prepare('SELECT normalized_url FROM bookmarks WHERE normalized_url IN ('+items.map(()=>'?').join(',')+')').bind(...items.map(x=>x.url)).all();
  const chosen=new Set(bookmarks.results.map(x=>x.normalized_url));
  await env.DB.batch(items.flatMap(x=>[
   env.DB.prepare('INSERT INTO betacat_observations(url,title_original,summary,hn_id,source_page,first_seen_at,last_seen_at,seen_count,points,comments) VALUES(?,?,?,?,?,?,?,1,?,?) ON CONFLICT(url) DO UPDATE SET title_original=excluded.title_original,summary=excluded.summary,hn_id=COALESCE(excluded.hn_id,betacat_observations.hn_id),source_page=excluded.source_page,last_seen_at=excluded.last_seen_at,seen_count=betacat_observations.seen_count+1,points=COALESCE(excluded.points,betacat_observations.points),comments=COALESCE(excluded.comments,betacat_observations.comments)').bind(x.url,x.title,x.summary,x.hn_id,page,now,now,x.points,x.comments),
   env.DB.prepare('INSERT OR IGNORE INTO betacat_snapshot_items(snapshot_id,url,page_loaded_at,source_page,was_bookmarked) VALUES(?,?,?,?,?)').bind(snapshot,x.url,now,page,chosen.has(x.url)?1:0)
  ]));
 }else if(mode==='selection'){
  if(items.length!==1||typeof raw.selected!=='boolean')throw Error('星號事件格式錯誤');
  await env.DB.prepare('INSERT INTO betacat_bookmark_actions(snapshot_id,url,selected,acted_at) VALUES(?,?,?,?)')
   .bind(snapshot,items[0].url,raw.selected?1:0,now).run();
 }else if(mode==='viewed'){
  await env.DB.batch(items.flatMap(x=>[
   env.DB.prepare('UPDATE betacat_observations SET summary_viewed_at=?,summary_view_count=summary_view_count+1 WHERE url=?').bind(now,x.url),
   env.DB.prepare('UPDATE betacat_snapshot_items SET viewed_summary=1 WHERE snapshot_id=? AND url=?').bind(snapshot,x.url)
  ]));
 }
 const rows=await env.DB.prepare('SELECT url,title_original,summary,prediction,prediction_version FROM betacat_observations WHERE url IN ('+items.map(()=>'?').join(',')+')').bind(...items.map(x=>x.url)).all();
 const found=new Map(rows.results.map(x=>[x.url,x]));
 const predictions=items.map(x=>({url:x.url,...(cached(found.get(x.url))||previewRule(x))}));
 const missing=mode==='selection'?[]:items.filter(x=>!cached(found.get(x.url)));
 if(ctx?.waitUntil&&mode!=='viewed'&&missing.length)ctx.waitUntil(updateScores(env,missing));
 return {version:PREVIEW_VERSION,recorded:mode==='snapshot'?items.length:0,viewed:mode==='viewed'?items.length:0,predictions};
}
