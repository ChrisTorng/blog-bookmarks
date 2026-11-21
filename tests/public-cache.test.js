import test from 'node:test'
import assert from 'node:assert/strict'
import worker from '../src/index.js'

test('anonymous public bookmark HTML is routed to the isolated cache entrypoint',async()=>{
  const forwarded=[]
  const ctx={exports:{PublicCache:{async fetch(req){
    forwarded.push(req)
    return new Response('<html><article>完整摘要</article></html>',{
      headers:{'Content-Type':'text/html; charset=utf-8'}
    })
  }}}}
  const env={AUTH_MODE:'access'}
  const req=new Request('https://christorng.idv.tw/bookmarks/an-article/?tag=ai',{
    headers:{Cookie:'CF_Authorization=private',Authorization:'Bearer secret'}
  })
  const response=await worker.fetch(req,env,ctx)
  assert.equal(response.status,200)
  assert.match(await response.text(),/完整摘要/)
  assert.equal(forwarded.length,1)
  assert.equal(forwarded[0].headers.get('Cookie'),null)
  assert.equal(forwarded[0].headers.get('Authorization'),null)
  assert.equal(new URL(forwarded[0].url).searchParams.get('tag'),'ai')
})

test('admin APIs never run through a public cache, even on GET',async()=>{
  let called=false
  const ctx={exports:{PublicCache:{async fetch(){called=true;return new Response('leak')}}}}
  const res=await worker.fetch(new Request('https://christorng.idv.tw/bookmarks/api/admin/'),
    {AUTH_MODE:'local'},ctx)
  assert.equal(res.status,401)
  assert.equal(called,false)
})
