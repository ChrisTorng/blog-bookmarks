import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const admin=readFileSync(new URL('../public/bookmarks/admin.js',import.meta.url),'utf8')
const script=readFileSync(new URL('../tampermonkey/BlogBookmarks.user.js',import.meta.url),'utf8')
test('admin selectors immediately refresh while text search keeps its submit action',()=>{
 assert.match(admin,/for\(const id of \['filter','tag','sort'\]\)/)
 assert.match(admin,/addEventListener\('change'/)
 assert.match(admin,/id="searchBtn"/)
 assert.match(admin,/id="manageTags"/)
 assert.match(admin,/id="tagsDialog"/)
 assert.match(admin,/name_zh/)
 assert.doesNotMatch(admin,/type="submit">篩選<\/button>/)
})
test('BetaCat toolbar shares full width with collapse control',()=>{
 assert.match(script,/tm-betacat-article-tools/)
 assert.match(script,/oldCollapseButton/)
 assert.match(script,/toolbar\.appendChild\(button\)/)
 assert.match(script,/tags\.join\(', '\)/)
 assert.match(script,/grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/)
})
