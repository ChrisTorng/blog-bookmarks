import MarkdownIt from 'markdown-it';
import { esc } from './data.js';

// Mirrors the public site's SafeMarkdown: untrusted inline HTML is inert,
// CommonMark/GFM tables and autolinks work, and soft line breaks stay legible.
const md = new MarkdownIt({html:false,linkify:true,breaks:true,typographer:false});

export const bookmarkPermalink = item => item.slug
  ? '/bookmarks/' + encodeURIComponent(item.slug) + '/'
  : '/bookmarks/view/?id=' + encodeURIComponent(item.id);
export const bookmarkTarget = item => item.preferred_url || item.redirect_url || item.url;
export const bookmarkDate = item => (item.status_at || item.published_at || item.created_at || '').slice(0,10);

export function bookmarkTags(item,categories=[]) {
  const byName = new Map(categories.map(t=>[t.name.toLowerCase(),t]));
  return (item.tags||[]).map(name=>{
    const category=byName.get(String(name).toLowerCase());
    return {id:category?.id||String(name).toLowerCase(),name:category?.name_zh||category?.name||name};
  });
}
export function bookmarkSource(url) {
  try {
    const u=new URL(url);
    if(u.protocol!=='https:' && u.protocol!=='http:')return '';
    const first=u.pathname.split('/').filter(Boolean)[0]||'';
    let decoded=first;
    try{decoded=decodeURIComponent(first)}catch{}
    const label=u.hostname+(decoded?'/'+decoded:'');
    return '<span class="inline-flex max-w-full min-w-0 items-center gap-1.5" title="'+esc(label)+'">'+
      '<img src="https://www.google.com/s2/favicons?domain='+encodeURIComponent(u.hostname)+
      '&amp;sz=32" alt="" width="16" height="16" loading="lazy" decoding="async" referrerpolicy="no-referrer" class="h-4 w-4 shrink-0 rounded-sm">'+
      '&nbsp;<span class="min-w-0 truncate">'+esc(label)+'</span></span>';
  }catch{return ''}
}
export function bookmarkReferences(item) {
  const links=(item.references||[]).filter(ref=>{
    try{return ['http:','https:'].includes(new URL(ref.url).protocol)}catch{return false}
  });
  if(!links.length)return '';
  return '<div class="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-sm" aria-label="延伸參考網址">'+
    links.map(ref=>{
      const hn=ref.kind==='hacker-news';
      const label=hn?'Hacker News 留言':ref.title||new URL(ref.url).hostname;
      const icon=hn
        ?'<img src="https://news.ycombinator.com/favicon.ico" width="16" height="16" alt="" loading="lazy" class="h-4 w-4 shrink-0">'
        :'<span aria-hidden="true">↗</span>';
      return '<a href="'+esc(ref.url)+'" target="_blank" rel="noopener noreferrer" title="'+esc(hn?ref.title||label:label)+
        '" class="inline-flex max-w-full min-w-0 items-center gap-1.5 text-primary-500 hover:text-primary-600">'+
        icon+'<span class="min-w-0 break-words">'+esc(label)+'</span></a>';
    }).join('')+'</div>';
}
export function renderSummary(markdown,baseUrl) {
  return md.render(String(markdown||'')).replace(/\b(href|src)="([^"]*)"/gi,(full,attr,encoded)=>{
    const value=encoded.replaceAll('&amp;','&');
    try {
      const u=new URL(value,baseUrl);
      if(!['http:','https:','mailto:'].includes(u.protocol))return attr+'="#"';
      return attr+'="'+esc(u.href)+'"';
    }catch{return attr+'="#"'}
  });
}
// The article is the canonical public content contract: the Worker detail and
// both RSS representations use this exact complete HTML, not parallel summaries.
export function bookmarkArticleHtml(item,categories=[],relatedNotesHtml='',permalink='',showAdminLink=false) {
  const target=bookmarkTarget(item),date=bookmarkDate(item);
  const english=item.title_original && item.title_original!==item.title
    ? '<p lang="en" class="mt-1 text-sm leading-snug text-gray-600 dark:text-gray-300">'+esc(item.title_original)+'</p>' : '';
  let image=null;
  try {
    const uri=new URL(item.image_url||'');
    if(uri.protocol==='https:' && !uri.username && !uri.password)image=uri.href;
  }catch{}
  const thumbnail=image
    ? '<a href="'+esc(target)+'" target="_blank" rel="noopener noreferrer" '+
      'class="mt-2 block w-full max-w-56 md:col-start-2 md:row-span-2 md:mt-0 md:max-w-none" aria-label="開啟原始文章">'+
      '<img src="'+esc(image)+'" alt="" width="176" loading="lazy" decoding="async" referrerpolicy="no-referrer" '+
      'class="max-h-40 w-full rounded-md object-contain" style="max-width:100%;height:auto;max-height:160px;object-fit:contain"></a>'
    : '';
  const summary=item.summary
    ? '<div class="my-2 text-gray-700 dark:text-gray-200"><div class="prose max-w-none text-sm dark:prose-invert">'+
      renderSummary(item.summary,item.url)+'</div></div>' : '';
  const reading=item.reading_summary?.summary
    ? '<section class="my-3 min-w-0" aria-label="精讀摘要"><p class="font-bold">精讀摘要</p><div class="mb-2 text-xs text-gray-600 dark:text-gray-300">'+
      (item.reading_summary.stats_lines||[]).map(line=>'<div>'+esc(line)+'</div>').join('')+'</div><div class="prose max-w-none text-sm dark:prose-invert">'+renderSummary(item.reading_summary.summary,item.url)+'</div></section>' : '';
  const original=target!==item.url
    ? '<a href="'+esc(item.url)+'" target="_blank" rel="noopener noreferrer" class="hidden max-w-full truncate underline md:inline">原始網址：'+esc(item.url)+'</a>' : '';
  const tags=bookmarkTags(item,categories).map(t=>
    '<a class="text-primary-500" href="/bookmarks/?tag='+encodeURIComponent(t.id)+'">#'+esc(t.name)+'</a>').join(' ');
  const status=item.status===4?'<span class="text-primary-500">☆ 推薦</span>':
    item.status!==3?'<span class="text-gray-500">未公開</span>':'';
  const referenceLink=permalink
    ? '<a class="text-primary-500" href="'+esc(permalink)+'">書籤永久連結</a>' : '';
  const adminLink=showAdminLink && item.id
    ? '<a class="text-gray-500 hover:text-primary-500" href="/bookmarks/admin/?edit='+encodeURIComponent(item.id)+'" target="_blank" rel="noopener noreferrer">後台管理 ↗</a>' : '';
  const relatedNotes=relatedNotesHtml
    ? '<aside aria-label="引用隨筆" class="mt-3 min-w-0 rounded-r-lg border-l-4 border-primary-500 bg-gray-50/60 px-3 py-2 dark:bg-gray-800/40">'+
      '<hr><p><strong>引用隨筆</strong></p>'+relatedNotesHtml+'</aside>' : '';
  return '<article class="border-b border-gray-300/40 py-4 dark:border-gray-700">'+
    '<div class="mb-2 flex items-center justify-between gap-3 text-xs">'+
    '<time class="text-gray-500" datetime="'+esc(date)+'">'+esc(date)+'</time>'+status+adminLink+'</div>'+
    '<div class="'+(image?'grid grid-cols-1 gap-x-4 md:grid-cols-[minmax(0,1fr)_11rem]':'block')+'">'+
    '<div class="min-w-0"><h1 class="text-xl leading-snug font-bold"><a class="text-primary-500 hover:text-primary-600 dark:hover:text-primary-400" href="'+
    esc(target)+'" target="_blank" rel="noopener noreferrer">'+esc(item.title)+'</a></h1>'+
    english+'</div>'+thumbnail+(summary?'<div class="min-w-0">'+summary+'</div>':'')+'</div>'+reading+
    '<div class="mt-2 flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-600 dark:text-gray-300">'+
    bookmarkSource(item.url)+original+'</div>'+
    (referenceLink?'<p class="mt-2 text-xs">'+referenceLink+'</p>':'')+bookmarkReferences(item)+
    '<div class="mt-2 flex flex-wrap items-center gap-3 text-sm">'+tags+'</div>'+relatedNotes+'</article>';
}
