import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { initialize, renderPng } from './render.mjs'

await initialize(await WebAssembly.compile(await readFile(new URL('./node_modules/@resvg/resvg-wasm/index_bg.wasm',import.meta.url))))
test('reported and complex formulas are real non-empty PNGs',()=>{
 for (const [tex,display] of [['\\omega',false],['9/4',false],['VP \\neq VNP',false],['\\frac{a}{b}',true],['\\int_0^1 x^2 dx',true],['\\begin{pmatrix}a&b\\\\c&d\\end{pmatrix}',true]]){
  const png=renderPng(tex,display)
  assert.deepEqual([...png.slice(0,8)],[137,80,78,71,13,10,26,10])
  const view=new DataView(png.buffer,png.byteOffset,png.byteLength)
  assert.ok(view.getUint32(16)>4&&view.getUint32(20)>4&&png.length>100)
 }
})
test('bounds and unsupported TeX fail safely',()=>{
 assert.throws(()=>renderPng('x'.repeat(1201),false))
 assert.throws(()=>renderPng('\\includegraphics{https://example.com/a.png}',false))
 assert.throws(()=>renderPng('\\notARealCommand',false))
})
