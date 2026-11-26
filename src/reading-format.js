import MarkdownIt from 'markdown-it';

const md=new MarkdownIt({html:false});
const marker=/^(#{2,6})[ \t]+(?:\[id:([^\]\r\n]+)\][ \t]+)?(.+?)\s*$/gm;
const encodeFragment=s=>encodeURIComponent(s).replace(/[-!'()*]/g,c=>'%'+c.charCodeAt(0).toString(16).toUpperCase());
export function plainReadingBody(body){
 return String(body||'').replace(marker,(_,level,id,title)=>title);
}
export function readingInput(body){
 const headings=[];
 const text=String(body||'').replace(marker,(_,level,id,title)=>{
  const h={level,title:title.trim(),id:null};
  if(id)try{h.id=decodeURIComponent(id)}catch{}
  headings.push(h);
  return level+' [S'+headings.length+'] '+h.title;
 });
 return {text,headings};
}
export function linkReadingSections(answer,headings,url){
 const base=new URL(url);base.hash='';
 if(!['http:','https:'].includes(base.protocol)||base.username||base.password)return String(answer);
 const seen=new Set();
 return String(answer).replace(/^(#{2,6})\s+\[S(\d+)\][ \t]*(.*)$/gm,(_,level,index,label)=>{
  const h=headings[Number(index)-1];
  if(!h||seen.has(index))return level+' '+label;
  seen.add(index);
  const title=(label.trim()||h.title).replace(/\\/g,'\\\\').replace(/[\[\]]/g,'\\$&');
  let hash='';
  if(h.id&&headings.filter(x=>x.id===h.id).length===1)hash='#'+encodeFragment(h.id);
  else if(h.title.length>=4&&h.title.length<=300&&headings.filter(x=>x.title===h.title).length===1)hash='#:~:text='+encodeFragment(h.title);
  return h.level+' '+(hash?'['+title+']('+base.href.replace(/[()]/g,c=>c==='('? '%28':'%29')+hash+')':title);
 });
}
function markdownText(markdown){
 const values=[];
 for(const token of md.parse(String(markdown||''),{})){
  if(token.type==='inline'){
   values.push((token.children||[]).map(t=>['text','code_inline','image','html_inline'].includes(t.type)?t.content:['softbreak','hardbreak'].includes(t.type)?' ':'').join(''));
  }else if(['code_block','fence'].includes(token.type))values.push(token.content);
 }
 return values.join('\n');
}
export function textMetrics(text){
 const s=String(text||'');
 const chars=[...s].filter(c=>!/\s/u.test(c)).length;
 const cjk=(s.match(/[\u3400-\u9fff\u3040-\u30ff]/g)||[]).length;
 const english=(s.match(/[a-zA-Z0-9]+(?:['-][a-zA-Z0-9]+)*/g)||[]).length;
 return {chars,cjk,english,words:cjk+english,minutes:chars?Math.max(1,Math.round((cjk/280+english/180)*1.1)):0};
}
export function readingDisplay(row){
 if(!row?.summary||!row.body_hash||row.summary_hash!==row.body_hash)return null;
 const original={chars:row.chars,words:row.words,cjk:row.cjk,english:row.english,minutes:row.minutes};
 const summary=textMetrics(markdownText(row.summary));
 const reduction_percent=original.chars>0?Math.round((1-summary.chars/original.chars)*100):null;
 const label=(name,m)=>name+' '+(m.chars??'未知')+' 字元'+(m.cjk||m.english?'（'+[m.cjk?m.cjk+' 中文字':'',m.english?m.english+' 英文單字':''].filter(Boolean).join(' / ')+'）':'')+(m.minutes!=null?' · 約 '+m.minutes+' 分鐘':'');
 const stats_lines=[label('原文',original),label('摘要',summary)];
 if(reduction_percent!==null)stats_lines.push((reduction_percent>=0?'縮減 ':'增加 ')+Math.abs(reduction_percent)+'%'+(original.minutes!=null&&original.minutes>summary.minutes?' · 節省約 '+(original.minutes-summary.minutes)+' 分鐘':''));
 return {summary:row.summary,original,summary_metrics:summary,reduction_percent,stats_lines};
}
// Only fetch current summary/measurements for already-authorized bookmark rows.
// Never expose article body, timestamps, model budget, leases or ingest errors.
export async function attachPublicReading(db,items){
 const urls=[...new Set(items.map(x=>x?.normalized_url||x?.url).filter(Boolean))];
 const map=new Map();
 for(let i=0;i<urls.length;i+=50){
  const batch=urls.slice(i,i+50);
  const result=await db.prepare('SELECT url,chars,words,minutes,cjk,english,summary,body_hash,summary_hash FROM article_reading WHERE summary IS NOT NULL AND summary_hash=body_hash AND url IN ('+batch.map(()=>'?').join(',')+')').bind(...batch).all();
  for(const row of result.results){const details=readingDisplay(row);if(details)map.set(row.url,details);}
 }
 return items.map(x=>x?{...x,reading_summary:map.get(x.normalized_url||x.url)||null}:x);
}
