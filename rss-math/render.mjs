import { mathjax } from 'mathjax-full/js/mathjax.js'
import { TeX } from 'mathjax-full/js/input/tex.js'
import { SVG } from 'mathjax-full/js/output/svg.js'
import { liteAdaptor } from 'mathjax-full/js/adaptors/liteAdaptor.js'
import { RegisterHTMLHandler } from 'mathjax-full/js/handlers/html.js'
import 'mathjax-full/js/input/tex/base/BaseConfiguration.js'
import 'mathjax-full/js/input/tex/ams/AmsConfiguration.js'
import { initWasm, Resvg } from '@resvg/resvg-wasm'

const adaptor = liteAdaptor()
RegisterHTMLHandler(adaptor)
let initialization
export function initialize(wasm) {
  return initialization ??= initWasm(wasm)
}

export function renderPng(tex, display) {
  if (!tex || new TextEncoder().encode(tex).length > 1200 || /[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(tex))
    throw new Error('Invalid formula')
  // No package loading, external images, HTML commands or user-defined macros.
  const input = new TeX({
    packages: ['base','ams'],
    maxMacros: 200,
    maxBuffer: 3000,
    formatError: (_jax, error) => { throw error },
  })
  const output = new SVG({ fontCache: 'none' })
  const doc = mathjax.document('', { InputJax: input, OutputJax: output })
  const node = doc.convert(tex, { display, em: 16, ex: 8, containerWidth: 640 })
  let svg = adaptor.innerHTML(node)
  if (!svg.startsWith('<svg ') || /<merror|data-mjx-error|<image\b|<foreignObject\b|<script\b/i.test(svg))
    throw new Error('Unsupported formula')
  const width = Number(svg.match(/^<svg[^>]*\bwidth="([\d.]+)ex"/)?.[1]) * 8
  const height = Number(svg.match(/^<svg[^>]*\bheight="([\d.]+)ex"/)?.[1]) * 8
  if (!(width > 0 && height > 0 && width <= 1000 && height <= 360) || svg.length > 350000)
    throw new Error('Formula dimensions exceed limit')
  svg = svg.replace(/^<svg[^>]*>/, root => root
    .replace(/\bwidth="[^"]*"/, 'width="' + width + '"')
    .replace(/\bheight="[^"]*"/, 'height="' + height + '"')
    .replace(/\bstyle="[^"]*"/, ''))
    .replaceAll('currentColor', '#172033')
  const w = Math.ceil(width + 4), h = Math.ceil(height + 4)
  const framed = '<svg xmlns="http://www.w3.org/2000/svg" width="'+w+'" height="'+h+'" viewBox="0 0 '+w+' '+h+'"><rect width="100%" height="100%" fill="#ffffff"/><g transform="translate(2 2)">'+svg+'</g></svg>'
  const renderer = new Resvg(framed, { font: { loadSystemFonts: false } })
  let image
  try {
    image = renderer.render()
    return new Uint8Array(image.asPng())
  } finally {
    image?.free()
    renderer.free()
  }
}
