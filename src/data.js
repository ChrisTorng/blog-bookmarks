import { preferredRedirect, primaryUrl } from './redirect.js';
import { ensureSlug } from './slug.js';
const fields = "b.id,b.slug,b.url,b.normalized_url,b.redirect_url,b.title,b.title_original,b.title_zh,b.summary,b.source,b.reference_links,CASE WHEN b.stage=1 AND b.deferred=1 THEN 5 ELSE b.stage END AS status,b.created_at,b.updated_at,b.read_at,b.published_at,b.starred_at, CASE WHEN b.stage=4 THEN COALESCE(b.starred_at,b.published_at,b.created_at) WHEN b.stage=3 THEN COALESCE(b.published_at,b.created_at) ELSE b.created_at END AS status_at,COALESCE((SELECT json_group_array(t.name) FROM bookmark_tags bt JOIN tags t ON t.id=bt.tag_id WHERE bt.bookmark_id=b.id),'[]') AS tags";
const decode = row => {
  if(!row)return row;
  const {reference_links,...rest}=row;
  return {...rest,preferred_url:primaryUrl(row),
    tags:JSON.parse(row.tags||'[]'),references:JSON.parse(reference_links||'[]')};
};
// Public feeds, markup and API must not expose the visitor's precise collection/reading times.
const taipeiDay = date => date ? new Intl.DateTimeFormat('sv-SE',{
  timeZone:'Asia/Taipei',year:'numeric',month:'2-digit',day:'2-digit'
}).format(new Date(date)) : null;
const publicEntry = row => row && ({
  ...row,
  read_at:null,
  ...Object.fromEntries(['created_at','updated_at','published_at','starred_at','status_at']
   .map(key=>[key,taipeiDay(row[key])]))
});
export const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function normalUrl(input) {
  const u = new URL(input);
  if (!['https:', 'http:'].includes(u.protocol) || u.username || u.password) throw new Error('僅接受 HTTP(S) 網址');
  u.hash = '';
  return u.href;
}
export function normalizeReferences(input) {
  if (!Array.isArray(input)) throw new Error('參考網址格式無效');
  if (input.length > 12) throw new Error('參考網址最多 12 筆');
  const seen=new Set(),result=[];
  for (const item of input) {
    if (!item || typeof item !== 'object') throw new Error('參考網址格式無效');
    const url=normalUrl(String(item.url||'').trim());
    if (url.length > 4096) throw new Error('參考網址過長');
    if (seen.has(url)) continue;
    seen.add(url);
    const parsed=new URL(url);
    const isHn=parsed.hostname==='news.ycombinator.com' && parsed.pathname==='/item'
      && /^[0-9]+$/.test(parsed.searchParams.get('id')||'');
    const kind=item.kind==='hacker-news' && isHn?'hacker-news':'link';
    const title=String(item.title||'').trim() || parsed.hostname;
    if (title.length>500) throw new Error('參考標題過長');
    result.push({url,title,kind});
  }
  return result;
}
export function validate(raw) {
  if (!raw || typeof raw !== 'object') throw new Error('書籤格式無效');
  const url=String(raw.url || '').trim(), normalized_url=normalUrl(url);
  if (url.length > 4096) throw new Error('網址過長');
  const visible=String(raw.title||'').trim();
  const title_zh=String(raw.title_zh ?? (/[\u3400-\u9fff]/.test(visible)?visible:'')).trim();
  const title_original=String(raw.title_original||'').trim();
  const title=String(title_zh || visible || title_original || url).trim();
  const redirect_url=Object.prototype.hasOwnProperty.call(raw,'redirect_url')
    ? (String(raw.redirect_url ?? '').trim() || null)
    : preferredRedirect(url);
  const normalizedRedirect=redirect_url ? normalUrl(redirect_url) : null;
  if (normalizedRedirect && (normalizedRedirect.length>4096 || normalizedRedirect===normalized_url))
    throw new Error('重導向網址無效');
  if (title_original.length>500 || title_zh.length>500) throw new Error('標題過長');
  const summary=raw.summary == null ? null : String(raw.summary).trim();
  if (title.length > 500 || (summary && summary.length > 5000)) throw new Error('標題或摘要過長');
  const tagNames=Array.isArray(raw.tags) ? raw.tags.map(x=>String(x).trim()).filter(Boolean) : [];
  const tagMap=new Map();for(const name of tagNames)if(!tagMap.has(name.toLowerCase()))tagMap.set(name.toLowerCase(),name);
  const tags=[...tagMap.values()];
  if(tags.length>30 || tags.some(x=>x.length>80)) throw new Error('標籤過多或過長');
  return {url,normalized_url,redirect_url:normalizedRedirect,title,title_original:title_original||null,title_zh:title_zh||null,summary,tags,references:normalizeReferences(raw.references||[])};
}
export async function get(db,id,includePrivate=false) {
  const row=await db.prepare(`SELECT ${fields} FROM bookmarks b WHERE b.id=?${includePrivate?'':' AND b.stage>=3'}`).bind(id).first();
  return includePrivate?decode(row):publicEntry(decode(row));
}
export async function getBySlug(db,slug) {
  const row=await db.prepare(`SELECT ${fields} FROM bookmarks b WHERE b.slug=? AND b.stage>=3 LIMIT 1`).bind(slug).first();
  return publicEntry(decode(row));
}
export async function byUrl(db,url) {
  const row=await db.prepare(`SELECT ${fields} FROM bookmarks b WHERE b.normalized_url=? OR b.redirect_url=? LIMIT 1`).bind(normalUrl(url),normalUrl(url)).first();
  return decode(row);
}
export async function list(db, {privateList=false,filter='pending',page=1,tag='',sort='new',q='',from='',to=''}={}) {
  const n=Math.max(1,Math.min(100000,Number(page)||1)), params=[], conditions=[];
  if(!privateList) conditions.push('b.stage>=3');
  else if(filter==='pending') conditions.push('b.stage IN (0,1) AND b.deferred=0');
  else if(filter==='unread') conditions.push('b.stage=0');
  else if(filter==='readPending') conditions.push('b.stage=1 AND b.deferred=0');
  else if(filter==='deferred') conditions.push('b.stage=1 AND b.deferred=1');
  else if(filter==='private') conditions.push('b.stage=2');
  else if(filter==='decided') conditions.push('b.stage>=2');
  else if(filter==='read') conditions.push('b.stage>=1');
  else if(filter==='published') conditions.push('b.stage>=3');
  else if(filter==='starred') conditions.push('b.stage=4');
  if(tag){conditions.push("EXISTS(SELECT 1 FROM bookmark_tags t WHERE t.bookmark_id=b.id AND t.tag_id=?)");params.push(tag.toLowerCase());}
  if(q){conditions.push('(b.title LIKE ? OR b.title_original LIKE ? OR b.title_zh LIKE ? OR b.url LIKE ? OR b.redirect_url LIKE ? OR b.summary LIKE ?)');params.push(...Array(6).fill('%'+q.slice(0,100)+'%'));}
  const dateExpression=privateList?'b.created_at':`CASE WHEN b.stage=4 THEN COALESCE(b.starred_at,b.published_at,b.created_at) WHEN b.stage=3 THEN COALESCE(b.published_at,b.created_at) ELSE b.created_at END`;
  // SQLite applies the Taipei offset before extracting the public calendar date.
  if(/^\d{4}-\d{2}-\d{2}$/.test(from)){
    conditions.push(`date(${dateExpression}, '+8 hours') >= ?`);params.push(from);
  }
  if(/^\d{4}-\d{2}-\d{2}$/.test(to)){
    conditions.push(`date(${dateExpression}, '+8 hours') <= ?`);params.push(to);
  }
  const where=conditions.length?' WHERE '+conditions.join(' AND '):'';
  const total=(await db.prepare('SELECT COUNT(*) n FROM bookmarks b'+where).bind(...params).first()).n;
  const dateCol=privateList?'b.created_at':'status_at';
  const order=sort==='old'?`${dateCol} ASC,b.id ASC`:sort==='title'?'b.title COLLATE NOCASE ASC,b.id DESC':sort==='recommended'?`b.stage DESC,${dateCol} DESC,b.id DESC`:`${dateCol} DESC,b.id DESC`;
  const rows=await db.prepare(`SELECT ${fields} FROM bookmarks b${where} ORDER BY ${order} LIMIT 20 OFFSET ?`).bind(...params,(n-1)*20).all();
  return {items:rows.results.map(decode).map(row=>privateList?row:publicEntry(row)),page:n,pages:Math.max(1,Math.ceil(total/20)),total};
}
// Fast review: show newest decisions above the oldest undecided bookmarks.
// Reading an item must not alter its chronological position in the queue.
// Overfetch pending items to allow immediate advancement without a new request.
// Three chronological groups: deferred (collapsed), recently decided, oldest actionable.
// Deferred entries never block the pending queue and never leak into the public feed.
export async function reviewWindow(db,requested=3) {
  const size=[3,6,10].includes(Number(requested))?Number(requested):3;
  const [recent,deferred,pending,pendingCount,deferredCount]=await Promise.all([
    db.prepare(`SELECT ${fields} FROM bookmarks b WHERE b.stage IN (2,3,4)
      ORDER BY b.updated_at DESC,b.id DESC LIMIT ?`).bind(size).all(),
    db.prepare(`SELECT ${fields} FROM bookmarks b WHERE b.stage=1 AND b.deferred=1
      ORDER BY b.created_at ASC,b.id ASC LIMIT ?`).bind(size).all(),
    db.prepare(`SELECT ${fields} FROM bookmarks b WHERE b.stage IN (0,1) AND b.deferred=0
      ORDER BY b.created_at ASC,b.id ASC LIMIT ?`).bind(size+Math.max(12,size)).all(),
    db.prepare('SELECT COUNT(*) n FROM bookmarks WHERE stage IN (0,1) AND deferred=0').first(),
    db.prepare('SELECT COUNT(*) n FROM bookmarks WHERE stage=1 AND deferred=1').first()
  ]);
  return {recent:recent.results.map(decode).reverse(),deferred:deferred.results.map(decode),
    pending:pending.results.map(decode),remaining:Number(pendingCount.n),
    deferredRemaining:Number(deferredCount.n),size,pending_order:'oldest'};
}
export async function tagsList(db,includePrivate=false) {
  const rows=await db.prepare(`SELECT t.id,t.name,t.name_zh,COUNT(*) count FROM tags t JOIN bookmark_tags bt ON bt.tag_id=t.id JOIN bookmarks b ON b.id=bt.bookmark_id ${includePrivate?'':"WHERE b.stage>=3"} GROUP BY t.id,t.name,t.name_zh ORDER BY count DESC,t.name`).all();
  return rows.results;
}
async function replaceTags(db,id,tags) {
  const statements=[db.prepare('DELETE FROM bookmark_tags WHERE bookmark_id=?').bind(id)];
  for(const name of tags) {
    const existing=await db.prepare('SELECT id FROM tags WHERE name=? COLLATE NOCASE OR id=? LIMIT 1').bind(name,name.toLowerCase()).first();
    const key=existing?.id||name.toLowerCase();
    if(!existing)statements.push(db.prepare('INSERT OR IGNORE INTO tags(id,name) VALUES(?,?)').bind(key,name));
    statements.push(db.prepare('INSERT INTO bookmark_tags(bookmark_id,tag_id) VALUES(?,?)').bind(id,key));
  }
  await db.batch(statements);
}
export async function create(db,raw) {
  const x=validate(raw);
  const exists=await byUrl(db,x.url);
  if(exists) return {item:exists,alreadyExists:true};
  const now=new Date().toISOString(), id=crypto.randomUUID();
  const source=String(raw.source||'manual').slice(0,80);
  await db.prepare('INSERT INTO bookmarks(id,url,normalized_url,redirect_url,title,title_original,title_zh,summary,source,reference_links,status,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,0,?,?)').bind(id,x.url,x.normalized_url,x.redirect_url,x.title,x.title_original,x.title_zh,x.summary,source,JSON.stringify(x.references),now,now).run();
  await replaceTags(db,id,x.tags);
  return {item:await get(db,id,true),alreadyExists:false};
}
export async function patch(db,id,raw) {
  const current=await get(db,id,true);if(!current)return null;
  // Publication must have a persisted or concurrently submitted category.
  const desired='status' in raw?Number(raw.status):Number(current.status);
  const finalTags='tags' in raw
    ?(Array.isArray(raw.tags)?raw.tags.map(t=>String(t).trim()).filter(Boolean):[])
    :current.tags;
  if('status' in raw && [2,3,4].includes(desired) && !String(raw.summary??current.summary??'').trim())
    throw new Error('摘要不可空白，請先補上或貼全文重新摘要');
  if(desired>=3 && desired<=4 && !finalTags.some(tag=>String(tag).toLowerCase()!=='default'))
    throw new Error('公開或推薦必須先選擇至少一個分類');
  if('status' in raw){
    const status=Number(raw.status);
    if(!Number.isInteger(status)||status<0||status>5)throw new Error('狀態無效');
    const now=new Date().toISOString();
    if(current.status!==status){
      const stage=status===5?1:status;
      const legacyStatus=status===5?1:status===2?1:status>=3?status-1:status;
      const readAt=status===5?current.read_at:status>=1?(current.read_at||now):null;
      const publishAt=status>=3?(current.status>=3&&current.published_at?current.published_at:now):null;
      const starredAt=status===4?(current.status===4&&current.starred_at?current.starred_at:now):null;
      await db.prepare('UPDATE bookmarks SET stage=?,deferred=?,status=?,read_at=?,published_at=?,starred_at=?,updated_at=? WHERE id=?').bind(stage,status===5?1:0,legacyStatus,readAt,publishAt,starredAt,now,id).run();
    }
  }
  if(['url','redirect_url','title','title_original','title_zh','summary','tags','references'].some(x=>x in raw)){
    const x=validate({...current,...raw});
    const conflict=await db.prepare('SELECT id FROM bookmarks WHERE (normalized_url=? OR redirect_url=?) AND id<>? LIMIT 1').bind(x.normalized_url,x.normalized_url,id).first();
    if(conflict)throw new Error('網址已被其他書籤收藏');
    await db.prepare('UPDATE bookmarks SET url=?,normalized_url=?,redirect_url=?,title=?,title_original=?,title_zh=?,summary=?,reference_links=?,updated_at=? WHERE id=?').bind(x.url,x.normalized_url,x.redirect_url,x.title,x.title_original,x.title_zh,x.summary,JSON.stringify(x.references),new Date().toISOString(),id).run();
    if('tags' in raw)await replaceTags(db,id,x.tags);
  }
  const result=await get(db,id,true);
  // Allocate only on first publication, after the original title has been saved.
  // Never change an established slug on edits, unpublication, or re-publication.
  if((result.status===3 || result.status===4) && !result.slug){
    await ensureSlug(db,'bookmarks',id,result.title_original||result.title);
    return get(db,id,true);
  }
  return result;
}
export async function remove(db,id){
  const result=await db.prepare('DELETE FROM bookmarks WHERE id=?').bind(id).run();return Boolean(result.meta.changes);
}

export async function renameTag(db,id,value){
  const current=await db.prepare('SELECT id,name,name_zh FROM tags WHERE id=?').bind(id).first();
  if(!current)return null;
  const name=String(value.name??current.name).trim();
  const nameZh=String(value.name_zh??current.name_zh??'').trim();
  if(!name||name.length>80||nameZh.length>80)throw new Error('標籤名稱不可為空或超過 80 字');
  const conflict=await db.prepare('SELECT id FROM tags WHERE name=? COLLATE NOCASE AND id<>?').bind(name,id).first();
  if(conflict)throw new Error('英文標籤名稱已存在');
  await db.prepare('UPDATE tags SET name=?,name_zh=? WHERE id=?').bind(name,nameZh||null,id).run();
  return db.prepare('SELECT id,name,name_zh FROM tags WHERE id=?').bind(id).first();
}

/**
 * Create a bilingual tag and attach it in one D1 batch (transaction).
 * Never alter an existing tag's name or a bookmark's other manual selections.
 */
export async function createAndAttachTag(db,raw) {
 const name=String(raw?.name||'').trim(), name_zh=String(raw?.name_zh||'').trim();
 const bookmarkId=String(raw?.bookmark_id||'');
 if(!name||!name_zh||name.length>80||name_zh.length>80)
  throw Error('英文與繁體中文分類名稱都必須填寫（最多 80 字）');
 if(!/^[0-9a-f-]{36}$/i.test(bookmarkId))throw Error('書籤 ID 無效');
 if(!await get(db,bookmarkId,true))throw Error('書籤不存在');
 const existing=await db.prepare('SELECT id FROM tags WHERE name=? COLLATE NOCASE').bind(name).first();
 if(existing)throw Error('英文分類名稱已存在，請直接選取原有分類');
 let id=name.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
 if(!id||id==='default')id='tag-'+crypto.randomUUID().slice(0,12);
 if(await db.prepare('SELECT id FROM tags WHERE id=?').bind(id).first())
  id+='-'+crypto.randomUUID().slice(0,8);
 await db.batch([
  db.prepare('INSERT INTO tags(id,name,name_zh) VALUES(?,?,?)').bind(id,name,name_zh),
  db.prepare("DELETE FROM bookmark_tags WHERE bookmark_id=? AND tag_id='default'").bind(bookmarkId),
  db.prepare('INSERT INTO bookmark_tags(bookmark_id,tag_id) VALUES(?,?)').bind(bookmarkId,id)
 ]);
 return {tag:{id,name,name_zh},item:await get(db,bookmarkId,true)};
}
