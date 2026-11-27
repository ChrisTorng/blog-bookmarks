// Versioned self-hosted URL, shared by the three feed producers.
// No AI, external image service, database or private source data.
import katex from 'katex'

const origin='https://christorng.idv.tw/bookmarks/math/v1/'
const escape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))
export function rssMathImage(tex,display=false) {
 const value=String(tex??'').trim()
 const bytes=new TextEncoder().encode(value)
 const fallback='<span class="math-fallback">'+escape(value)+'</span>'
 if(!bytes.length||bytes.length>1200||/[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(value))return fallback
 // Only the common TeX/AMS subset; leave commands with external effects
 // or package-specific behavior as readable source.
 if(/\\(?:includegraphics|html\w*|href|url|require|unicode|def|newcommand|renewcommand|gdef|class|style|color|bbox|verb|label|ref|tag)\b/i.test(value))return fallback
 try { katex.renderToString(value,{displayMode:display,throwOnError:true,trust:false,maxExpand:200,maxSize:20}) }
 catch { return fallback }
 const encoded=btoa(String.fromCharCode(...bytes)).replaceAll('+','-').replaceAll('/','_').replace(/=+$/,'')
 const src=origin+(display?'d':'i')+'/'+encoded+'.png'
 return '<img src="'+src+'" alt="'+escape(value)+'" title="'+escape(value)+'" style="max-width:100%;height:auto;'+(display?'display:block;margin:0.5em auto':'vertical-align:middle')+'" />'
}
export function plainRssMathTitle(value){
 return String(value??'').replace(/(?<!\\)\\\((.+?)\\\)|(?<!\\)\\\[(.+?)\\\]|(?<![\\$])\$\$([^$\r\n]+?)\$\$|(?<![\\$])\$(?![\s$])([^$\r\n]+?)(?<![\s\\])\$(?![\d$])/g,(_,a,b,c,d)=>a??b??c??d)
}
