// Fuentes incrustadas.
//
// Meter una fuente en un EPUB son tres cosas: el archivo dentro del libro, su
// entrada en el manifest y una regla @font-face en la hoja de estilos que le
// dé nombre, grosor y estilo. Luego, otra regla que la use para el texto, los
// títulos o la capitular. Aquí se hace todo junto.
//
// De cada archivo se leen sus propios datos (tablas `name` y `OS/2`): la
// familia, el grosor, si es cursiva y qué permite su licencia. Una fuente
// marcada como «licencia restringida» no se puede incrustar legalmente, y es
// mejor saberlo antes de publicar. Las WOFF2 van comprimidas con Brotli y no
// se pueden leer sin más; de esas se deduce todo del nombre del archivo, que
// casi siempre es del tipo «Lora-BoldItalic.woff2».
//
// Las reglas viven en un bloque de la hoja marcado con comentarios, como los
// estilos de novela. Los selectores llevan `html` delante para ganar a los
// estilos de novela, que fijan `body { font-family }`, vayan antes o después.

import { addToOpf, dirname, relativePath, removeFromOpf, resolvePath, type EpubBook } from './epub'
import { CLASS_DROP, styleSheetFor } from './novelStyle'

export type FontFormat = 'ttf' | 'otf' | 'woff' | 'woff2'

/** Lo que permite la licencia (campo fsType de la tabla OS/2). */
export type Embedding = 'installable' | 'editable' | 'preview' | 'restricted' | 'unknown'

export interface FontInfo {
  family: string
  weight: number
  italic: boolean
  embedding: Embedding
  /** Descripción de la licencia que trae la fuente, si trae. */
  license?: string
  format: FontFormat
  /** false: los datos salen del nombre del archivo. */
  fromFile: boolean
}

export interface Face {
  path: string
  family: string
  weight: number
  italic: boolean
}

export type Fallback = 'serif' | 'sans-serif'

export interface FontRoles {
  /** Familia para el texto; vacío es la del lector. */
  body: string
  headings: string
  dropCap: string
  fallback: Fallback
}

export const noRoles: FontRoles = { body: '', headings: '', dropCap: '', fallback: 'serif' }

export const WEIGHTS: { value: number; label: string }[] = [
  { value: 100, label: 'Fina' },
  { value: 200, label: 'Extraligera' },
  { value: 300, label: 'Ligera' },
  { value: 400, label: 'Normal' },
  { value: 500, label: 'Media' },
  { value: 600, label: 'Seminegrita' },
  { value: 700, label: 'Negrita' },
  { value: 800, label: 'Extranegrita' },
  { value: 900, label: 'Negra' },
]

export const isFontPath = (path: string) => /\.(ttf|otf|woff2?)$/i.test(path)

export const fontFormat = (path: string): FontFormat =>
  (path.match(/\.(ttf|otf|woff2?)$/i)?.[1].toLowerCase() ?? 'ttf') as FontFormat

/** Cómo se llama un estilo, para enseñarlo: «Negrita cursiva». */
export function styleLabel(weight: number, italic: boolean): string {
  const w = WEIGHTS.find(x => x.value === weight)?.label ?? String(weight)
  if (!italic) return w
  return weight === 400 ? 'Cursiva' : `${w} cursiva`
}

// ---------- leer el archivo ----------

const STYLE_WORDS: [RegExp, number][] = [
  [/^(thin|hairline)$/i, 100],
  [/^(extra|ultra)light$/i, 200],
  [/^light$/i, 300],
  [/^(regular|book|normal|roman|text)$/i, 400],
  [/^medium$/i, 500],
  [/^(semi|demi)bold$/i, 600],
  [/^bold$/i, 700],
  [/^(extra|ultra)bold$/i, 800],
  [/^(black|heavy)$/i, 900],
]

/**
 * Familia, grosor y cursiva a partir del nombre del archivo:
 * «PlayfairDisplay-BoldItalic.ttf» → Playfair Display, 700, cursiva.
 */
export function guessFromName(fileName: string): { family: string; weight: number; italic: boolean } {
  const base = fileName.split('/').pop()!.replace(/\.[^.]+$/, '')
  const parts = base.split(/[-_ ]+/).filter(Boolean)
  let weight = 400
  let italic = false
  // Las palabras de estilo van al final: se quitan mientras lo sean.
  while (parts.length > 1) {
    let word = parts[parts.length - 1]
    const it = word.match(/^(.*?)(italic|oblique|it)$/i)
    if (it && (it[1] === '' || STYLE_WORDS.some(([re]) => re.test(it[1])))) {
      italic = true
      word = it[1]
    }
    const w = STYLE_WORDS.find(([re]) => re.test(word))
    if (w) weight = w[1]
    else if (word !== '') break
    parts.pop()
  }
  // «PlayfairDisplay» → «Playfair Display»; «EBGaramond» → «EB Garamond».
  const family = parts.join(' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .trim() || base
  return { family, weight, italic }
}

interface Table {
  offset: number
  length: number
  /** WOFF: tamaño comprimido; si es menor que `length`, va con zlib. */
  compLength?: number
}

const tag = (v: DataView, at: number) =>
  String.fromCharCode(v.getUint8(at), v.getUint8(at + 1), v.getUint8(at + 2), v.getUint8(at + 3))

async function inflate(data: Uint8Array): Promise<Uint8Array> {
  const stream = new Response(data as BodyInit).body!.pipeThrough(new DecompressionStream('deflate'))
  return new Uint8Array(await new Response(stream).arrayBuffer())
}

/** Las tablas que interesan, ya descomprimidas si hace falta. */
async function readTables(bytes: Uint8Array): Promise<Map<string, DataView> | null> {
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  if (bytes.length < 12) return null
  const sig = tag(v, 0)
  const dir = new Map<string, Table>()

  if (sig === 'wOFF') {
    const n = v.getUint16(12)
    for (let i = 0; i < n; i++) {
      const at = 44 + i * 20
      dir.set(tag(v, at), { offset: v.getUint32(at + 4), compLength: v.getUint32(at + 8), length: v.getUint32(at + 12) })
    }
  } else if (sig === 'OTTO' || sig === 'true' || v.getUint32(0) === 0x00010000) {
    const n = v.getUint16(4)
    for (let i = 0; i < n; i++) {
      const at = 12 + i * 16
      dir.set(tag(v, at), { offset: v.getUint32(at + 8), length: v.getUint32(at + 12) })
    }
  } else {
    return null
  }

  const out = new Map<string, DataView>()
  for (const name of ['name', 'OS/2', 'head']) {
    const t = dir.get(name)
    if (!t) continue
    let data = bytes.subarray(t.offset, t.offset + (t.compLength ?? t.length))
    if (t.compLength != null && t.compLength < t.length) data = await inflate(data)
    out.set(name, new DataView(data.buffer, data.byteOffset, data.byteLength))
  }
  return out
}

/** Un texto de la tabla `name`: primero el de Windows en inglés, luego cualquiera. */
function nameString(t: DataView, id: number): string | undefined {
  const count = t.getUint16(2)
  const strings = t.getUint16(4)
  let best: { score: number; text: string } | undefined
  for (let i = 0; i < count; i++) {
    const at = 6 + i * 12
    if (at + 12 > t.byteLength || t.getUint16(at + 6) !== id) continue
    const platform = t.getUint16(at)
    const lang = t.getUint16(at + 4)
    const len = t.getUint16(at + 8)
    const off = strings + t.getUint16(at + 10)
    if (off + len > t.byteLength) continue
    let text = ''
    if (platform === 3 || platform === 0) {
      for (let k = 0; k + 1 < len; k += 2) text += String.fromCharCode(t.getUint16(off + k))
    } else if (platform === 1) {
      for (let k = 0; k < len; k++) text += String.fromCharCode(t.getUint8(off + k))
    } else continue
    const score = (platform === 3 ? 2 : 0) + (lang === 0x409 || (platform === 1 && lang === 0) ? 1 : 0)
    if (!best || score > best.score) best = { score, text: text.trim() }
  }
  return best?.text || undefined
}

function embeddingOf(fsType: number): Embedding {
  // Los bits 1, 2 y 3; el que más permite manda si vienen varios.
  if (fsType & 0x0008) return 'editable'
  if (fsType & 0x0004) return 'preview'
  if (fsType & 0x0002) return 'restricted'
  return 'installable'
}

/**
 * Solo la licencia, y sin esperas, para la revisión de antes de publicar. Lee
 * TTF y OTF; las WOFF van comprimidas y quedan como «no se sabe».
 */
export function embeddingSync(bytes: Uint8Array): Embedding {
  try {
    const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
    const sig = tag(v, 0)
    if (sig !== 'OTTO' && sig !== 'true' && v.getUint32(0) !== 0x00010000) return 'unknown'
    const n = v.getUint16(4)
    for (let i = 0; i < n; i++) {
      const at = 12 + i * 16
      if (tag(v, at) === 'OS/2') return embeddingOf(v.getUint16(v.getUint32(at + 8) + 8))
    }
  } catch { /* archivo raro */ }
  return 'unknown'
}

/** Los datos de una fuente. Si el archivo no se puede leer, los saca del nombre. */
export async function readFontInfo(bytes: Uint8Array, fileName: string): Promise<FontInfo> {
  const format = fontFormat(fileName)
  const guess = guessFromName(fileName)
  const fallback: FontInfo = { ...guess, embedding: 'unknown', format, fromFile: false }

  let tables: Map<string, DataView> | null = null
  try {
    tables = await readTables(bytes)
  } catch {
    return fallback
  }
  const name = tables?.get('name')
  if (!tables || !name) return fallback

  try {
    // 16/17 son la familia y el estilo «tipográficos»; 1/2 los de siempre,
    // que en familias grandes parten la familia («Lora Medium»).
    const family = nameString(name, 16) ?? nameString(name, 1) ?? guess.family
    const sub = nameString(name, 17) ?? nameString(name, 2) ?? ''
    const os2 = tables.get('OS/2')
    const head = tables.get('head')
    const weight = os2 && os2.byteLength >= 6 ? os2.getUint16(4) : guess.weight
    const italic = (os2 && os2.byteLength >= 64 ? (os2.getUint16(62) & 1) === 1 : false)
      || (head && head.byteLength >= 46 ? (head.getUint16(44) & 2) === 2 : false)
      || /italic|oblique/i.test(sub)
    const embedding = os2 && os2.byteLength >= 10 ? embeddingOf(os2.getUint16(8)) : 'unknown'
    const license = nameString(name, 13)
    return {
      family,
      weight: Math.min(900, Math.max(100, Math.round(weight / 100) * 100 || 400)),
      italic,
      embedding,
      license: license ? license.slice(0, 400) : undefined,
      format,
      fromFile: true,
    }
  } catch {
    return fallback
  }
}

// ---------- el bloque de la hoja ----------

const START = '/* === fuentes incrustadas (las gestiona el editor) === */'
const END = '/* === fin de las fuentes incrustadas === */'

const FORMAT_CSS: Record<FontFormat, string> = { ttf: 'truetype', otf: 'opentype', woff: 'woff', woff2: 'woff2' }

const quote = (family: string) => `"${family.replace(/"/g, '')}"`

/** El bloque de CSS: un @font-face por archivo y las reglas que las usan. */
export function fontsCss(faces: Face[], roles: FontRoles, cssPath: string): string {
  const out: string[] = [START, `/* ajustes: ${JSON.stringify(roles)} */`]
  const sorted = [...faces].sort((a, b) =>
    a.family.localeCompare(b.family) || a.weight - b.weight || Number(a.italic) - Number(b.italic))
  for (const f of sorted) {
    out.push([
      '@font-face {',
      `  font-family: ${quote(f.family)};`,
      `  font-style: ${f.italic ? 'italic' : 'normal'};`,
      `  font-weight: ${f.weight};`,
      `  src: url("${relativePath(cssPath, f.path)}") format("${FORMAT_CSS[fontFormat(f.path)]}");`,
      '}',
    ].join('\n'))
  }
  const rule = (selector: string, family: string) => {
    if (family) out.push(`${selector} {\n  font-family: ${quote(family)}, ${roles.fallback};\n}`)
  }
  rule('html body', roles.body)
  rule('html h1,\nhtml h2,\nhtml h3', roles.headings)
  rule(`html p.${CLASS_DROP}::first-letter`, roles.dropCap)
  out.push(END)
  return out.join('\n\n') + '\n'
}

function writeFontsBlock(css: string, block: string | null): string {
  const from = css.indexOf(START)
  const to = css.indexOf(END)
  if (from >= 0 && to > from) {
    if (!block) return (css.slice(0, from).trimEnd() + '\n' + css.slice(to + END.length).replace(/^\s*\n/, '\n')).replace(/\n{3,}/g, '\n\n')
    return css.slice(0, from) + block.trimEnd() + css.slice(to + END.length)
  }
  if (!block) return css
  return css.replace(/\s*$/, '\n\n') + block
}

const FACE = /@font-face\s*\{([^}]*)\}/gi

/** Los @font-face de un CSS, con la ruta ya resuelta de cada archivo. */
export function parseFaces(css: string, cssPath: string): Face[] {
  const out: Face[] = []
  for (const m of css.matchAll(FACE)) {
    const body = m[1]
    const family = body.match(/font-family\s*:\s*(["']?)([^;"']+)\1/i)?.[2].trim()
    const weightRaw = body.match(/font-weight\s*:\s*([^;]+)/i)?.[1].trim() ?? '400'
    const weight = weightRaw === 'bold' ? 700 : weightRaw === 'normal' ? 400 : parseInt(weightRaw, 10) || 400
    const italic = /font-style\s*:\s*(italic|oblique)/i.test(body)
    if (!family) continue
    for (const u of body.matchAll(/url\(\s*(["']?)([^"')]+)\1\s*\)/gi)) {
      if (/^[a-z]+:/i.test(u[2])) continue
      out.push({ path: resolvePath(cssPath, u[2]), family, weight, italic })
    }
  }
  return out
}

export interface FontSetup {
  /** La hoja donde va el bloque. */
  cssPath: string | null
  /** Los archivos de fuente del libro con sus datos, tal como los conoce el bloque. */
  faces: Face[]
  roles: FontRoles
  /**
   * Fuentes que ya tienen su @font-face escrito a mano en otra parte: el
   * editor no las vuelve a declarar, pero se pueden usar.
   */
  external: Face[]
}

/** Lo que tiene el libro ahora mismo. */
export function readFontSetup(book: EpubBook): FontSetup {
  const cssPath = styleSheetFor(book)
  let roles = noRoles
  const managed: Face[] = []
  const external: Face[] = []

  for (const f of book.files.values()) {
    if (f.mediaType !== 'text/css' || f.text == null) continue
    const from = f.text.indexOf(START)
    const to = f.text.indexOf(END)
    const inside = from >= 0 && to > from ? f.text.slice(from, to) : ''
    const outside = inside ? f.text.slice(0, from) + f.text.slice(to) : f.text
    if (inside && f.path === cssPath) {
      managed.push(...parseFaces(inside, f.path))
      const saved = inside.match(/\/\* ajustes: (\{.*?\}) \*\//)?.[1]
      if (saved) {
        try { roles = { ...noRoles, ...JSON.parse(saved) } } catch { /* se queda sin papeles */ }
      }
    }
    external.push(...parseFaces(outside, f.path))
  }

  const known = new Set([...managed, ...external].map(f => f.path))
  // Las que están en el libro pero nadie declara todavía.
  const loose = [...book.files.values()]
    .filter(f => isFontPath(f.path) && !known.has(f.path))
    .map(f => ({ path: f.path, ...guessFromName(f.path) }))

  return {
    cssPath,
    faces: [...managed.filter(f => book.files.has(f.path)), ...loose],
    roles,
    external: external.filter(f => book.files.has(f.path)),
  }
}

/** Los estilos que faltan de una familia y que un lector tendrá que inventarse. */
export function missingStyles(faces: Face[], family: string): string[] {
  const of = faces.filter(f => f.family === family)
  if (!of.length) return []
  const has = (bold: boolean, italic: boolean) =>
    of.some(f => (bold ? f.weight >= 600 : f.weight < 600) && f.italic === italic)
  const out: string[] = []
  if (!has(false, true)) out.push('cursiva')
  if (!has(true, false)) out.push('negrita')
  if (!has(true, true) && (has(false, true) || has(true, false))) out.push('negrita cursiva')
  return out
}

export interface NewFont {
  name: string
  bytes: Uint8Array
  family: string
  weight: number
  italic: boolean
}

export interface FontChanges {
  faces: Face[]
  add: NewFont[]
  remove: string[]
  roles: FontRoles
}

/** Ruta libre dentro de la carpeta: «Lora.ttf», «Lora-2.ttf»… */
function freePath(book: EpubBook, dir: string, name: string): string {
  const at = (n: string) => [dir, n].filter(Boolean).join('/')
  if (!book.files.has(at(name))) return at(name)
  const dot = name.lastIndexOf('.')
  let k = 2
  while (book.files.has(at(`${name.slice(0, dot)}-${k}${name.slice(dot)}`))) k++
  return at(`${name.slice(0, dot)}-${k}${name.slice(dot)}`)
}

const FONT_MEDIA: Record<FontFormat, string> = { ttf: 'font/ttf', otf: 'font/otf', woff: 'font/woff', woff2: 'font/woff2' }

/**
 * Aplica los cambios: mete los archivos nuevos, quita los que sobran y
 * reescribe el bloque. Devuelve la hoja tocada, o null si el libro no tiene
 * ninguna donde escribir.
 */
export function applyFonts(book: EpubBook, ch: FontChanges, fontDir: string): { cssPath: string; added: string[] } | null {
  const cssPath = styleSheetFor(book)
  const css = cssPath ? book.files.get(cssPath) : undefined
  if (!cssPath || !css || css.text == null) return null

  for (const path of ch.remove) {
    removeFromOpf(book, path)
    book.files.delete(path)
  }

  const added: string[] = []
  const faces = ch.faces.filter(f => !ch.remove.includes(f.path))
  for (const n of ch.add) {
    const path = freePath(book, fontDir, n.name)
    book.files.set(path, { path, mediaType: FONT_MEDIA[fontFormat(path)], bytes: n.bytes })
    addToOpf(book, path)
    added.push(path)
    faces.push({ path, family: n.family, weight: n.weight, italic: n.italic })
  }

  const families = new Set(faces.map(f => f.family))
  // Un papel que apunta a una familia que ya no está se queda vacío.
  const roles: FontRoles = {
    ...ch.roles,
    body: families.has(ch.roles.body) ? ch.roles.body : '',
    headings: families.has(ch.roles.headings) ? ch.roles.headings : '',
    dropCap: families.has(ch.roles.dropCap) ? ch.roles.dropCap : '',
  }
  // Las que ya declara otra hoja a mano no se repiten aquí, pero se pueden usar.
  const external = readFontSetup(book).external
  const declared = faces.filter(f => !external.some(e => e.path === f.path))
  const extFamilies = new Set(external.map(e => e.family))
  for (const k of ['body', 'headings', 'dropCap'] as const) {
    if (!roles[k] && extFamilies.has(ch.roles[k])) roles[k] = ch.roles[k]
  }

  const empty = !declared.length && !roles.body && !roles.headings && !roles.dropCap
  css.text = writeFontsBlock(css.text, empty ? null : fontsCss(declared, roles, cssPath))
  return { cssPath, added }
}

/** Carpeta para las fuentes: donde ya haya alguna, o «Fonts» junto al OPF. */
export function fontFolder(book: EpubBook): string {
  const existing = [...book.files.values()].find(f => isFontPath(f.path))
  if (existing) return dirname(existing.path)
  return [dirname(book.opfPath), 'Fonts'].filter(Boolean).join('/')
}
