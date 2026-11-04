const fields = "b.id,b.url,b.normalized_url,b.title,b.summary,b.source,b.status,b.created_at,b.updated_at,b.read_at,b.published_at,b.starred_at, CASE WHEN b.status=3 THEN COALESCE(b.starred_at,b.published_at,b.created_at) WHEN b.status=2 THEN COALESCE(b.published_at,b.created_at) ELSE b.created_at END AS status_at,COALESCE((SELECT json_group_array(t.name) FROM bookmark_tags bt JOIN tags t ON t.id=bt.tag_id WHERE bt.bookmark_id=b.id),'[]') AS tags";
const decode = row => row && ({...row, tags:JSON.parse(row.tags || '[]')});
export const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function normalUrl(input) {
  const u = new URL(input);
  if (!['https:', 'http:'].includes(u.protocol) || u.username || u.password) throw new Error('僅接受 HTTP(S) 網址');
  u.hash = '';
  return u.href;
}
export function validate(raw) {
  if (!raw || typeof raw !== 'object') throw new Error('書籤格式無效');
  const url=String(raw.url || '').trim(), normalized_url=normalUrl(url);
  if (url.length > 4096) throw new Error('網址過長');
  const title=String(raw.title || url).trim();
  const summary=raw.summary == null ? null : String(raw.summary).trim();
  if (title.length > 500 || (summary && summary.length > 5000)) throw new Error('標題或摘要過長');
  const tagNames=Array.isArray(raw.tags) ? raw.tags.map(x=>String(x).trim()).filter(Boolean) : [];
  const tagMap=new Map();for(const name of tagNames)if(!tagMap.has(name.toLowerCase()))tagMap.set(name.toLowerCase(),name);
  const tags=[...tagMap.values()];
  if(tags.length>30 || tags.some(x=>x.length>80)) throw new Error('標籤過多或過長');
  return {url,normalized_url,title,summary,tags};
}
export async function get(db,id,includePrivate=false) {
  const row=await db.prepare(`SELECT ${fields} FROM bookmarks b WHERE b.id=?${includePrivate?'':' AND b.status>=2'}`).bind(id).first();
  return decode(row);
}
export async function byUrl(db,url) {
  const row=await db.prepare(`SELECT ${fields} FROM bookmarks b WHERE b.normalized_url=?`).bind(normalUrl(url)).first();
  return decode(row);
}
export async function list(db, {privateList=false,filter='unread',page=1,tag='',sort='new',q=''}={}) {
  const n=Math.max(1,Math.min(100000,Number(page)||1)), params=[], conditions=[];
  if(!privateList) conditions.push('b.status>=2');
  else if(filter==='unread') conditions.push('b.status=0');
  else if(filter==='read') conditions.push('b.status>=1');
  else if(filter==='published') conditions.push('b.status>=2');
  else if(filter==='starred') conditions.push('b.status=3');
  if(tag){conditions.push("EXISTS(SELECT 1 FROM bookmark_tags t WHERE t.bookmark_id=b.id AND t.tag_id=?)");params.push(tag.toLowerCase());}
  if(q){conditions.push('(b.title LIKE ? OR b.url LIKE ? OR b.summary LIKE ?)');params.push(...Array(3).fill('%'+q.slice(0,100)+'%'));}
  const where=conditions.length?' WHERE '+conditions.join(' AND '):'';
  const total=(await db.prepare('SELECT COUNT(*) n FROM bookmarks b'+where).bind(...params).first()).n;
  const dateCol=privateList?'b.created_at':'status_at';
  const order=sort==='old'?`${dateCol} ASC,b.id ASC`:sort==='title'?'b.title COLLATE NOCASE ASC,b.id DESC':sort==='recommended'?`b.status DESC,${dateCol} DESC,b.id DESC`:`${dateCol} DESC,b.id DESC`;
  const rows=await db.prepare(`SELECT ${fields} FROM bookmarks b${where} ORDER BY ${order} LIMIT 20 OFFSET ?`).bind(...params,(n-1)*20).all();
  return {items:rows.results.map(decode),page:n,pages:Math.max(1,Math.ceil(total/20)),total};
}
export async function tagsList(db,includePrivate=false) {
  const rows=await db.prepare(`SELECT t.id,t.name,t.name_zh,COUNT(*) count FROM tags t JOIN bookmark_tags bt ON bt.tag_id=t.id JOIN bookmarks b ON b.id=bt.bookmark_id ${includePrivate?'':"WHERE b.status>=2"} GROUP BY t.id,t.name,t.name_zh ORDER BY count DESC,t.name`).all();
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
  await db.prepare('INSERT INTO bookmarks(id,url,normalized_url,title,summary,source,status,created_at,updated_at) VALUES(?,?,?,?,?,?,0,?,?)').bind(id,x.url,x.normalized_url,x.title,x.summary,source,now,now).run();
  await replaceTags(db,id,x.tags);
  return {item:await get(db,id,true),alreadyExists:false};
}
export async function patch(db,id,raw) {
  const current=await get(db,id,true);if(!current)return null;
  if('status' in raw){
    const status=Number(raw.status);
    if(!Number.isInteger(status)||status<0||status>3)throw new Error('狀態無效');
    const now=new Date().toISOString();
    if(current.status!==status){
      const readAt=status>=1?(current.read_at||now):null;
      const publishAt=status>=2?(current.status>=2&&current.published_at?current.published_at:now):null;
      const starredAt=status===3?(current.status===3&&current.starred_at?current.starred_at:now):null;
      await db.prepare('UPDATE bookmarks SET status=?,read_at=?,published_at=?,starred_at=?,updated_at=? WHERE id=?').bind(status,readAt,publishAt,starredAt,now,id).run();
    }
  }
  if(['url','title','summary','tags'].some(x=>x in raw)){
    const x=validate({...current,...raw});
    await db.prepare('UPDATE bookmarks SET url=?,normalized_url=?,title=?,summary=?,updated_at=? WHERE id=?').bind(x.url,x.normalized_url,x.title,x.summary,new Date().toISOString(),id).run();
    if('tags' in raw)await replaceTags(db,id,x.tags);
  }
  return get(db,id,true);
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
