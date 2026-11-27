import assert from 'node:assert/strict'
const origin='https://christorng.idv.tw/bookmarks/math/v1/'
for(const [tex,mode] of [['\\omega','i'],['9/4','i'],['VP \\neq VNP','i'],['\\frac{a}{b}','d'],['\\begin{pmatrix}a&b\\\\c&d\\end{pmatrix}','d']]){
 const url=origin+mode+'/'+Buffer.from(tex).toString('base64url')+'.png'
 const res=await fetch(url,{signal:AbortSignal.timeout(20000)})
 assert.equal(res.status,200,url)
 assert.equal(res.headers.get('content-type'),'image/png')
 const png=Buffer.from(await res.arrayBuffer())
 assert.deepEqual([...png.subarray(0,8)],[137,80,78,71,13,10,26,10])
 assert.ok(png.readUInt32BE(16)>4&&png.readUInt32BE(20)>4)
 console.log(url,png.length,png.readUInt32BE(16)+'x'+png.readUInt32BE(20))
}
