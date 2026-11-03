import { esc } from './data.js';
export function layout(title,body) {
 return '<!doctype html><html lang="zh-Hant"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,follow"><title>'+esc(title)+'</title><style>.bm{max-width:850px;margin:auto;padding:20px}.bm article{padding:16px 0;border-bottom:1px solid #8885}.bm p{line-height:1.7}.bm form{display:flex;gap:12px;flex-wrap:wrap}.bm time{opacity:.65;font-size:.85rem}</style></head><body><main class="bm">'+body+'</main></body></html>';
}
export const adminPage = '<!doctype html><html lang="zh-Hant"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>書籤管理</title><link rel="stylesheet" href="/bookmarks/admin.css"></head><body><div id="app"></div><script type="module" src="/bookmarks/admin.js"></script></body></html>';
