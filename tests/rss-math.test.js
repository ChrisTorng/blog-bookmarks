import test from 'node:test'
import assert from 'node:assert/strict'
import { rssMathImage } from '../src/rss-math.js'
import { formula, renderMathTitle } from '../src/math-content.js'
test('RSS formulas have stable absolute PNG URLs and lossless escaped alt text',()=>{
 for(const tex of ['\\omega','9/4','VP \\neq VNP','\\frac{a}{b}']){
  const html=rssMathImage(tex,false)
  const url=html.match(/src="([^"]+)"/)?.[1]
  assert.equal(url,'https://christorng.idv.tw/bookmarks/math/v1/i/'+Buffer.from(tex).toString('base64url')+'.png')
  assert.ok(html.includes('alt="'))
  assert.equal(html,rssMathImage(tex,false))
  assert.match(formula(tex,true,'rss'),/\/math\/v1\/d\//)
  assert.match(formula(tex,false,'web'),/class="katex"/)
 }
 assert.match(renderMathTitle('公式 $x^2$','rss'),/<img /)
 assert.doesNotMatch(rssMathImage('\\notARealCommand'),/<img /)
 assert.doesNotMatch(rssMathImage('a'.repeat(1201)),/<img /)
 assert.match(rssMathImage('\\href{https://example.com}{x}'),/math-fallback/)
})
