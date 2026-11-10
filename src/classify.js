import {invalidSummary} from './metadata.js';

// Stable category ids are used as the model's vocabulary. Display labels may be renamed.
export const CATEGORY_GUIDANCE = Object.freeze({
  ai:'人工智慧、LLM、機器學習與核心 AI 應用；非任何提到 AI 的新聞',
  security:'資安、漏洞、駭侵、惡意軟體、認證或防護',
  tech:'一般科技及科技產品；已由較精確的技術分類涵蓋時不必重複',
  programming:'程式語言、框架、軟體工程、程式開發實作及工具',
  hardware:'晶片、電子零組件、電腦硬體與實體裝置',
  science:'科學研究、發現、實驗及科學方法',
  past:'歷史、考古、歷史文獻與過去事件',
  world:'政治、公共政策、國際及社會議題；不是所有企業或科技新聞',
  future:'長期未來趨勢、未來預測、願景；不可只因出現「未來」而選',
  art:'藝術作品、藝術創作與美學',
  law:'法律、訴訟、司法、法律規範及制度',
  math:'數學、統計、定理與形式數學',
  nature:'動植物、生態與自然環境',
  design:'視覺設計、字型、互動設計、使用者介面',
  thinking:'哲學、思想、認知、思考方法與價值反省',
  believing:'信仰、宗教與超自然信念',
  gaming:'電玩遊戲與遊戲產業；AI 只用遊戲做測試不一定屬於遊戲',
  management:'組織管理、領導力、工作流程及企業管理',
  music:'音樂、樂器、作曲與演奏；純音訊編碼工程不算',
  space:'太空、航太、衛星、天文與宇宙研究'
});
export const CLASSIFIER_MODEL='@cf/google/gemma-4-26b-a4b-it';
export const CLASSIFIER_VERSION='bookmarks-2026-11-11-v1';

export function parseSuggestedTags(output, categories) {
  const response=output?.choices?.[0]?.message?.content ?? output?.response ?? '';
  const raw=typeof response==='string'?JSON.parse(response):response;
  if(!Array.isArray(raw?.tags))throw new Error('AI 未回傳標籤清單');
  const available=new Map();
  for(const tag of categories) {
    available.set(String(tag.id).toLowerCase(),tag.name);
    available.set(String(tag.name).toLowerCase(),tag.name);
  }
  const result=[],seen=new Set();
  for(const value of raw.tags) {
    const name=available.get(String(value).trim().toLowerCase());
    if(name&&!seen.has(name.toLowerCase())) {
      seen.add(name.toLowerCase());
      result.push(name);
    }
    if(result.length>=3)break;
  }
  return result;
}

// Do not fetch the target webpage at star-click time. Work only with already captured metadata.
export async function suggestBookmarkTags(env,raw) {
  if(!env.AI)throw new Error('Workers AI binding missing');
  const result=await env.DB.prepare("SELECT id,name,name_zh FROM tags WHERE id<>'default' ORDER BY id").all();
  const catalog=result.results||[];
  if(!catalog.length)return [];
  const available=catalog.map(t=>({id:t.id,name:t.name,name_zh:t.name_zh||'',scope:CATEGORY_GUIDANCE[t.id]||''}));
  const cleanedSummary=invalidSummary(raw.summary)?'':String(raw.summary||'').slice(0,1800);
  const information={
    title_original:String(raw.title_original||'').slice(0,500),
    title_zh:String(raw.title_zh||raw.title||'').slice(0,500),
    summary:cleanedSummary,
    source:String(raw.source||'').slice(0,80),
    url_path:(()=>{try{const x=new URL(raw.redirect_url||raw.url);return x.hostname+x.pathname.slice(0,180)}catch{return ''}})()
  };
  const out=await env.AI.run(CLASSIFIER_MODEL,{
    messages:[
      {role:'system',content:
        '你正在為個人書籤決定主題標籤。只選取真正的主題，選 1 到 3 個最適合的既有 id，不需要填滿三個。' +
        '不得因為文章順帶提及一項技術就選取該標籤。' +
        '不可新造標籤、不可使用 default。' +
        '標籤及意義：'+JSON.stringify(available)+
        '。只輸出合法 JSON：{"tags":["id1","id2"]}。不要解釋。'
      },
      {role:'user',content:JSON.stringify(information)}
    ],
    response_format:{type:'json_object'},
    chat_template_kwargs:{enable_thinking:false},
    temperature:0,
    max_tokens:160
  });
  return parseSuggestedTags(out,catalog);
}

export function mergeBookmarkTags(manual,inferred){
  const names=new Map();
  for(const raw of [...(Array.isArray(manual)?manual:[]),...(Array.isArray(inferred)?inferred:[])]) {
    const name=String(raw||'').trim();
    if(name&&!names.has(name.toLowerCase()))names.set(name.toLowerCase(),name);
  }
  // 'default' is a placeholder; remove it only when a real category is available.
  if(names.size>1)names.delete('default');
  return [...names.values()].slice(0,30);
}
