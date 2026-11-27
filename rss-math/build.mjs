import { build } from 'esbuild'
import { readFile, writeFile, mkdir, rm } from 'node:fs/promises'
import { gzipSync } from 'node:zlib'

await rm('dist',{recursive:true,force:true})
await mkdir('dist',{recursive:true})
await build({entryPoints:['worker.mjs'],outfile:'dist/worker.js',bundle:true,format:'esm',platform:'browser',minify:true,external:['./resvg.wasm']})
const wasm=await readFile('node_modules/@resvg/resvg-wasm/index_bg.wasm')
const js=await readFile('dist/worker.js')
const compressed=gzipSync(js).length+gzipSync(wasm).length
console.log('Compressed deployment bytes:',compressed)
if(compressed>3_000_000)throw Error('Worker exceeds free-tier bundle budget')
const base64=wasm.toString('base64')
const parts=[]
for(let i=0;i<base64.length;i+=400000){
 const name='resvg-'+parts.length+'.b64'
 await writeFile('dist/'+name,base64.slice(i,i+400000))
 parts.push(name)
}
await writeFile('dist/manifest.json',JSON.stringify({wasmBytes:wasm.length,parts,compressed},null,2)+'\n')
