// Estilos de novela: capitular, sangría, separadores de escena, títulos.
//
// Lo que se escribe va todo dentro de un bloque con marcas en la hoja de
// estilos. Fuera de esas marcas no se toca nada, así que lo que el autor haya
// escrito a mano sobrevive y volver a aplicar no va acumulando copias.
//
// Los ajustes se guardan como un comentario dentro del propio bloque: así el
// libro lleva encima su configuración y el diálogo se reabre como se dejó, sin
// depender de nada guardado en este ordenador.

import { resolvePath, spinePaths, type EpubBook } from './epub'

export interface NovelStyle {
  /** Familia tipográfica del cuerpo. Vacío: no se toca. */
  bodyFont: string
  lineHeight: number
  justify: boolean
  /** Partir palabras con guion al justificar. */
  hyphens: boolean
  /** Sangría de primera línea, en em. 0: sin sangría y con aire entre párrafos. */
  indent: number
  /** El primer párrafo tras un título no se sangra (es lo habitual al imprimir). */
  firstNoIndent: boolean
  /** Altura de la capitular en líneas. 0: sin capitular. */
  dropCap: number
  /** Ornamento del salto de escena. Vacío: no se tocan. */
  scene: string
  headingAlign: 'left' | 'center'
  headingSpaced: boolean
}

export const defaultNovelStyle: NovelStyle = {
  bodyFont: 'Georgia, "Iowan Old Style", "Times New Roman", serif',
  lineHeight: 1.5,
  justify: true,
  hyphens: true,
  indent: 1.2,
  firstNoIndent: true,
  dropCap: 3,
  scene: '⁂',
  headingAlign: 'center',
  headingSpaced: true,
}

/** Ornamentos que se ofrecen; cualquier texto vale igual. */
export const ORNAMENTS = ['⁂', '* * *', '❧', '◆ ◆ ◆', '· · ·', '—']

export const CLASS_DROP = 'capitular'
export const CLASS_SCENE = 'escena'

const START = '/* === estilos de novela (los gestiona el editor) === */'
const END = '/* === fin de los estilos de novela === */'

/** El CSS del bloque, ajustes incluidos. */
export function cssFor(s: NovelStyle): string {
  const out: string[] = [START, `/* ajustes: ${JSON.stringify(s)} */`]

  const body: string[] = []
  if (s.bodyFont) body.push(`  font-family: ${s.bodyFont};`)
  body.push(`  line-height: ${s.lineHeight};`)
  if (s.justify) {
    body.push('  text-align: justify;')
    // Sin esto, justificar en una pantalla estrecha abre ríos de blanco.
    if (s.hyphens) body.push('  hyphens: auto;', '  -webkit-hyphens: auto;', '  -epub-hyphens: auto;')
  }
  out.push(`body {\n${body.join('\n')}\n}`)

  const p = s.indent > 0
    ? `p {\n  margin: 0;\n  text-indent: ${s.indent}em;\n}`
    : 'p {\n  margin: 0 0 0.9em;\n  text-indent: 0;\n}'
  out.push(p)

  if (s.indent > 0 && s.firstNoIndent) {
    out.push([
      'h1 + p,',
      'h2 + p,',
      'h3 + p,',
      `p.${CLASS_SCENE} + p,`,
      `p.${CLASS_DROP} {`,
      '  text-indent: 0;',
      '}',
    ].join('\n'))
  }

  if (s.dropCap > 0) {
    // La capitular se mide en líneas: su alto es el alto de línea por tantas
    // líneas como se pidan.
    const size = +(s.dropCap * s.lineHeight).toFixed(2)
    out.push([
      `p.${CLASS_DROP}::first-letter {`,
      '  float: left;',
      `  font-size: ${size}em;`,
      '  line-height: 0.86;',
      '  padding-right: 0.06em;',
      '  padding-top: 0.02em;',
      '}',
    ].join('\n'))
  }

  if (s.scene) {
    out.push([
      `p.${CLASS_SCENE} {`,
      '  text-indent: 0;',
      '  text-align: center;',
      '  margin: 1.6em 0;',
      '  letter-spacing: 0.3em;',
      '  text-indent: 0.3em;', // compensa el espaciado de la última letra
      '  page-break-inside: avoid;',
      '}',
    ].join('\n'))
  }

  const h: string[] = [`  text-align: ${s.headingAlign};`, '  page-break-before: always;', '  margin: 2em 0 1.2em;']
  if (s.headingSpaced) h.push('  letter-spacing: 0.08em;', '  text-transform: uppercase;', '  font-weight: 500;')
  out.push(`h1 {\n${h.join('\n')}\n}`)
  out.push(`h2 {\n  text-align: ${s.headingAlign};\n  margin: 1.8em 0 1em;\n}`)

  out.push(END)
  return out.join('\n\n') + '\n'
}

/** La hoja donde escribir: la que enlaza el primer capítulo, o la primera. */
export function styleSheetFor(book: EpubBook): string | null {
  const first = spinePaths(book)[0]
  const text = first ? book.files.get(first)?.text : undefined
  if (text) {
    for (const m of text.matchAll(/<link\b[^>]*href\s*=\s*"([^"]+)"[^>]*>/gi)) {
      if (!/stylesheet/i.test(m[0])) continue
      const path = resolvePath(first, m[1])
      if (book.files.get(path)?.mediaType === 'text/css') return path
    }
  }
  const any = [...book.files.values()].find(f => f.mediaType === 'text/css')
  return any?.path ?? null
}

/** Mete o reemplaza el bloque, dejando intacto el resto de la hoja. */
export function writeBlock(css: string, block: string): string {
  const from = css.indexOf(START)
  const to = css.indexOf(END)
  if (from >= 0 && to > from) {
    return css.slice(0, from) + block.trimEnd() + css.slice(to + END.length)
  }
  return css.replace(/\s*$/, '\n\n') + block
}

/** Los ajustes que ya tiene el libro, si los tiene. */
export function readStyle(book: EpubBook): NovelStyle | null {
  const path = styleSheetFor(book)
  const css = path ? book.files.get(path)?.text : undefined
  if (!css) return null
  const m = css.match(/\/\* ajustes: (\{[\s\S]*?\}) \*\//)
  if (!m) return null
  try {
    return { ...defaultNovelStyle, ...JSON.parse(m[1]) }
  } catch {
    return null
  }
}

const addClass = (tag: string, cls: string): string => {
  const has = tag.match(/\sclass\s*=\s*"([^"]*)"/i)
  if (!has) return tag.replace(/\s*(\/?)>$/, ` class="${cls}"$1>`)
  if (has[1].split(/\s+/).includes(cls)) return tag
  return tag.replace(has[0], ` class="${(has[1] + ' ' + cls).trim()}"`)
}

const removeClass = (tag: string, cls: string): string => {
  const has = tag.match(/\sclass\s*=\s*"([^"]*)"/i)
  if (!has) return tag
  const left = has[1].split(/\s+/).filter(c => c && c !== cls).join(' ')
  return tag.replace(has[0], left ? ` class="${left}"` : '')
}

const bodyOf = (xhtml: string) => xhtml.match(/(<body\b[^>]*>)([\s\S]*?)(<\/body>)/i)

/**
 * Un párrafo es un salto de escena si su texto es solo un adorno. El guion
 * suelto se deja fuera a propósito: en castellano abre diálogo.
 */
const ORNAMENT_ONLY = /^(?:\*(?:\s*\*){0,4}|#{1,3}|~{1,5}|·(?:\s*·){1,4}|⁂|❧|◆(?:\s*◆){0,4}|[-–—]{3,6})$/

function markBody(inner: string, s: NovelStyle): { out: string; drop: boolean; scenes: number } {
  let drop = false
  let scenes = 0

  const out = inner.replace(/<p\b([^>]*)>([\s\S]*?)<\/p>/gi, (whole, attrs: string, content: string) => {
    const tag = `<p${attrs}>`
    const plain = content.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim()
    const wasScene = /\bclass\s*=\s*"[^"]*\bescena\b[^"]*"/i.test(tag)

    // Separadores de escena: se reconocen por su contenido, y los ya marcados
    // se vuelven a escribir para que cambiar el ornamento los alcance.
    if (s.scene && (wasScene || ORNAMENT_ONLY.test(plain))) {
      scenes++
      return `${addClass(tag, CLASS_SCENE)}${s.scene}</p>`
    }
    if (wasScene) return whole

    // La capitular va en el primer párrafo de verdad del capítulo.
    if (!drop && plain) {
      drop = true
      const next = s.dropCap > 0 ? addClass(tag, CLASS_DROP) : removeClass(tag, CLASS_DROP)
      return next === tag ? whole : `${next}${content}</p>`
    }
    return whole
  })

  return { out, drop, scenes }
}

export interface StyleResult {
  /** Hoja de estilos donde quedó el bloque. */
  sheet: string
  chapters: number
  scenes: number
}

/**
 * Aplica los estilos: escribe el bloque en la hoja y marca en los capítulos lo
 * que el CSS no puede alcanzar solo (la capitular y los saltos de escena).
 */
export function applyNovelStyle(book: EpubBook, s: NovelStyle): StyleResult | null {
  const sheet = styleSheetFor(book)
  if (!sheet) return null
  const css = book.files.get(sheet)!
  css.text = writeBlock(css.text ?? '', cssFor(s))

  let chapters = 0
  let scenes = 0
  for (const path of spinePaths(book)) {
    const f = book.files.get(path)
    if (f?.text == null) continue
    const body = bodyOf(f.text)
    if (!body) continue
    const { out, drop, scenes: n } = markBody(body[2], s)
    if (out === body[2]) continue
    // Se recompone cortando y pegando: un replace con el texto del capítulo
    // dentro leería sus "$" como grupos.
    const at = body.index!
    f.text = f.text.slice(0, at) + body[1] + out + body[3] + f.text.slice(at + body[0].length)
    if (drop && s.dropCap > 0) chapters++
    scenes += n
  }

  return { sheet, chapters, scenes }
}

/** Un capítulo de mentira para ver cómo queda antes de tocar el libro. */
export function previewDoc(s: NovelStyle): string {
  const scene = s.scene ? `<p class="${CLASS_SCENE}">${s.scene}</p>` : ''
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><style>
html { background: #fbf8f1; color: #1b1a17; padding: 18px 22px; font-size: 15px; }
${cssFor(s)}
</style></head>
<body>
<h1>Capítulo uno</h1>
<p class="${CLASS_DROP}">La nieve llevaba tres días cayendo sobre el valle y nadie en la casa se atrevía a decir en voz alta lo que todos pensaban: que el camino no volvería a abrirse hasta la primavera.</p>
<p>Clara dejó la taza sobre la mesa y escuchó el silencio, que era un silencio con peso, como el de una habitación en la que acaba de hablar alguien.</p>
${scene}
<p>Al otro lado de la montaña, en cambio, el tren seguía saliendo todas las mañanas a las seis y cuarto, y el mundo continuaba sin enterarse de nada.</p>
</body></html>`
}
