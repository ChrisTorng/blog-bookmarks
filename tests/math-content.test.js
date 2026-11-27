import test from 'node:test';
import assert from 'node:assert/strict';
import MarkdownIt from 'markdown-it';
import {mathMarkdown,mathParts,truncateMathTitle,plainMathTitle,renderMathTitle} from '../src/math-content.js';

const md=mathMarkdown(new MarkdownIt({html:false}));
test('renders inline and display mathematics, including backslash delimiters',()=>{
 for(const source of ['$x^2$',String.raw`\(x^2\)`,'$$\n\\frac{a}{b}\n$$',String.raw`\[x^2\]`]){
  assert.match(md.render(source),/class="katex/);
 }
});
test('math remains atomic when shortening a title',()=>{
 const title='甲乙丙 $\\frac{x}{y}$ 丁戊';
 assert.equal(truncateMathTitle(title,8),'甲乙丙…');
 assert.equal(truncateMathTitle('$x^2$ 後續',3),'$x^2$…');
 assert.equal(plainMathTitle('$x^2$'),'x^2');
 assert.match(renderMathTitle(title),/class="katex/);
});
test('currency, literal code and unsupported TeX are isolated',()=>{
 assert.equal(mathParts('USD $20 and $30').some(p=>p.tex!==undefined),false);
 assert.doesNotMatch(md.render('\x60$x^2$\x60'),/class="katex/);
 assert.match(md.render('$\\unknownCommand$ and text'),/and text/);
 assert.doesNotMatch(md.render('$x^2$',{mathMode:'rss'}),/class="katex/);
 assert.match(md.render('$x^2$',{mathMode:'rss'}),/x\^2/);
});
