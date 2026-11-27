import katex from 'katex';

const escape = s => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]);
const pattern = /(?<!\\)\\\((.+?)\\\)|(?<!\\)\\\[(.+?)\\\]|(?<![\\$])\$\$([^$\r\n]+?)\$\$|(?<![\\$])\$(?![\s$])([^$\r\n]+?)(?<![\s\\])\$(?![\d$])/g;
export function mathParts(text) {
 const input=String(text??'');
 const parts=[];
 let start=0;
 for(const m of input.matchAll(pattern)){
  if(m.index>start)parts.push({raw:input.slice(start,m.index)});
  parts.push({raw:m[0],tex:m.slice(1).find(x=>x!==undefined)});
  start=m.index+m[0].length;
 }
 if(start<input.length)parts.push({raw:input.slice(start)});
 return parts;
}
export function plainMathTitle(text){
 return mathParts(text).map(p=>p.tex===undefined?p.raw:p.tex).join('');
}
export function truncateMathTitle(text,limit){
 let result='',remaining=limit;
 for(const p of mathParts(text)){
  const chars=Array.from(p.raw);
  if(chars.length>remaining){
   if(p.tex!==undefined)return result?result.trimEnd()+'…':p.raw+(p.raw===text?'':'…');
   return (result+chars.slice(0,remaining).join('')).trimEnd()+'…';
  }
  result+=p.raw;remaining-=chars.length;
 }
 return result;
}
export function formula(tex,display=false,mode='web'){
 const value=String(tex);
 if(value.length>4000)return escape(value);
 try{
  if(mode==='rss'){
   // RSS readers may strip MathML/CSS. Preserve a visible, lossless textual fallback.
   return '<span class="math-fallback" style="font-family:serif;white-space:normal">'+escape(value)+'</span>';
  }
  const html=katex.renderToString(value,{displayMode:display,throwOnError:true,trust:false,maxExpand:1000,maxSize:20});
  return '<span class="notranslate'+(display?' block max-w-full overflow-x-auto':'')+'">'+html+'</span>';
 }catch{return escape(value)}
}
export function renderMathTitle(text,mode='web'){
 return mathParts(text).map(p=>p.tex===undefined?escape(p.raw):formula(p.tex,false,mode)).join('');
}
export function mathMarkdown(md){
 // Markdown-it skips code spans/fences before invoking these rules.
 md.inline.ruler.before('escape','math_inline',(state,silent)=>{
  const start=state.pos;
  const tail=state.src.slice(start);
  const part=mathParts(tail)[0];
  if(!part||part.tex===undefined)return false;
  if(!silent){const token=state.push('math_inline','math',0);token.content=part.tex;}
  state.pos+=part.raw.length;
  return true;
 });
 md.block.ruler.before('fence','math_block',(state,start,end,silent)=>{
  const first=state.src.slice(state.bMarks[start]+state.tShift[start],state.eMarks[start]);
  const open=first.startsWith('$$')?'$$':first.startsWith('\\[')?'\\[':null;
  if(!open)return false;
  const close=open==='$$'?'$$':'\\]';
  let text=first.slice(2),line=start;
  while(!text.trimEnd().endsWith(close)&&++line<end){
   text+='\n'+state.src.slice(state.bMarks[line]+state.tShift[line],state.eMarks[line]);
  }
  if(!text.trimEnd().endsWith(close))return false;
  const value=text.trimEnd().slice(0,-2).trim();
  if(!value)return false;
  if(silent)return true;
  const token=state.push('math_block','math',0);token.block=true;token.content=value;token.map=[start,line+1];
  state.line=line+1;
  return true;
 },{alt:['paragraph','reference','blockquote','list']});
 md.renderer.rules.math_inline=(tokens,i,options,env)=>formula(tokens[i].content,false,env.mathMode);
 md.renderer.rules.math_block=(tokens,i,options,env)=>'<div>'+formula(tokens[i].content,true,env.mathMode)+'</div>\n';
 return md;
}
