// One-time/reusable archive index collector: only public BetaCat post URLs and image URLs.
// Never send the private bookmarks/D1 contents to GitHub Actions.
import { setTimeout as delay } from 'node:timers/promises';

const begin = new Date('2026-10-15T00:00:00Z');
const end = new Date('2026-11-20T00:00:00Z');
const days = [];
for (let time=begin.getTime();time<=end.getTime();time+=86400000)
  days.push(new Date(time).toISOString().slice(0,10));

function parseDatePage(html,date) {
  const posts=html.split(/<article\b[^>]*class="post-item[^>]*>/i).slice(1);
  const entries=[];
  let imageCount=0;
  for (const article of posts) {
    const link=article.match(/<a\b[^>]*class="post-url"[^>]*href="([^"]+)"/i);
    const picture=article.match(/<a\b[^>]*class="feature-image"[^>]*href="(\/image\/[^"?#]+)"/i);
    if (!link) continue;
    if (picture) imageCount++;
    let url;
    try {
      const normalized=new URL(link[1].replaceAll('&amp;','&'));
      if (!['http:','https:'].includes(normalized.protocol)) continue;
      normalized.hash='';
      url=normalized.href;
    } catch { continue; }
    entries.push({
      url,
      image_url:picture?'https://hackernews.betacat.io'+picture[1]:null,
      date
    });
  }
  return {entries,posts:entries.length,withImages:imageCount};
}

async function getPage(day) {
  const url='https://hackernews.betacat.io/daily/'+day+'/';
  for(let attempt=1;attempt<=4;attempt++){
    try {
      const response=await fetch(url,{
        headers: {
          'User-Agent':'Mozilla/5.0 (compatible; ChrisTorng-personal-bookmark-backfill/1.0)',
          'Accept':'text/html,application/xhtml+xml'
        },
        signal:AbortSignal.timeout(25000),
      });
      if (!response.ok) throw Error('HTTP '+response.status);
      const html=await response.text();
      if (!html.includes('class="post-item"'))
        throw Error('Archive page has no article entries');
      return parseDatePage(html,day);
    } catch(error) {
      if(attempt===4)throw error;
      await delay(1500*attempt);
    }
  }
}

const all=[],report=[];
for(const day of days){
  try{
    const {entries,posts,withImages}=await getPage(day);
    all.push(...entries);
    report.push({day,posts,withImages});
    console.log('BETACAT_DATE '+day+' posts='+posts+' withImages='+withImages);
  }catch(error){
    report.push({day,error:String(error).slice(0,220)});
    console.error('BETACAT_DATE_ERROR '+day+' '+String(error).slice(0,220));
  }
  await delay(200);
}
// Archive pages can repeat the same URL; retain each dated occurrence for
// matching against the actual bookmark record's creation date.
for(let i=0;i<all.length;i+=16)
  console.log('BETACAT_INDEX_CHUNK:'+JSON.stringify(all.slice(i,i+16)));
console.log('BETACAT_RESULT:'+JSON.stringify({
  dateFrom:days[0],dateTo:days.at(-1),
  days:days.length,scanned:report.filter(x=>!x.error).length,
  errors:report.filter(x=>x.error),
  posts:all.length,withImage:all.filter(x=>x.image_url).length,
  uniqueUrl:new Set(all.map(x=>x.url)).size
}));
if(report.some(x=>x.error))process.exitCode=1;
