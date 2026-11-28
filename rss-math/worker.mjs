import wasm from './resvg.wasm'
import { initialize, renderPng } from './render.mjs'

const PREFIX = '/bookmarks/math/v1/'
const reject = (status = 400) => new Response(null,{status,headers:{'Cache-Control':'no-store'}})
export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url)
    if (!['GET','HEAD'].includes(request.method)) return reject(405)
    if (!url.pathname.startsWith(PREFIX) || url.search) return reject(404)
    const match = url.pathname.slice(PREFIX.length).match(/^(i|d)\/([A-Za-z0-9_-]{1,1600})\.png$/)
    if (!match) return reject()
    let tex
    try {
      const base64 = match[2].replaceAll('-','+').replaceAll('_','/')
      const bytes = Uint8Array.from(atob(base64), c=>c.charCodeAt(0))
      tex = new TextDecoder('utf-8',{fatal:true}).decode(bytes)
      if (!tex || bytes.length > 1200) return reject()
      const normalized = btoa(String.fromCharCode(...bytes)).replaceAll('+','-').replaceAll('/','_').replace(/=+$/,'')
      if (normalized !== match[2]) return reject()
    } catch { return reject() }
    const key = new Request(url.href)
    const cache = globalThis.caches?.default
    const hit = cache && await cache.match(key)
    if (hit) return request.method === 'HEAD' ? new Response(null,{headers:hit.headers}) : hit
    try {
      await initialize(wasm)
      const png = renderPng(tex,match[1]==='d')
      const response = new Response(png,{headers:{
        'Content-Type':'image/png',
        'Cache-Control':'public, max-age=31536000, immutable',
        'X-Content-Type-Options':'nosniff',
        'Content-Length':String(png.length),
      }})
      if (cache) ctx.waitUntil(cache.put(key,response.clone()).catch(()=>{}))
      return request.method === 'HEAD' ? new Response(null,{headers:response.headers}) : response
    } catch { return reject(422) }
  }
}
