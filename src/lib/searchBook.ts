// Buscar y reemplazar en todos los archivos del libro.
//
// Ctrl+F de CodeMirror solo mira el archivo abierto; esto recorre el libro
// entero, que es lo que hace falta para arreglos tipográficos (comillas,
// rayas de diálogo) en una novela de cuarenta capítulos.
//
// Por defecto se salta lo que hay dentro de las etiquetas: un reemplazo de `"`
// por `«` en todo el libro, si no, reescribiría cada href y cada xmlns y
// dejaría el EPUB ilegible.

import { isTextFile, type EpubBook } from './epub'

export interface SearchOptions {
  query: string
  caseSensitive: boolean
  regex: boolean
  wholeWord: boolean
  /** Buscar solo en el texto visible, no dentro de `<…>`. */
  onlyText: boolean
  /**
   * Buscar como si las etiquetas no existieran: encuentra «de una vez»
   * aunque un <em> parta la frase por la mitad.
   */
  ignoreTags: boolean
  /** `text`: solo los XHTML. `all`: también CSS, OPF, nav… */
  scope: 'text' | 'all'
}

export const defaultSearchOptions: SearchOptions = {
  query: '',
  caseSensitive: false,
  regex: false,
  wholeWord: false,
  onlyText: true,
  ignoreTags: false,
  scope: 'text',
}

export interface Match {
  path: string
  from: number
  to: number
  line: number
  before: string
  hit: string
  after: string
  /**
   * Lo encontrado atraviesa una etiqueta. Se puede ir hasta ahí, pero no
   * reemplazarlo: hacerlo se llevaría por delante el marcado de en medio.
   */
  spansTags?: boolean
}

export interface FileHits {
  path: string
  matches: Match[]
}

export interface SearchResult {
  files: FileHits[]
  total: number
  /** Regex inválida escrita por el usuario. */
  error?: string
  /** Se alcanzó el tope de resultados. */
  truncated?: boolean
}

const MAX_MATCHES = 1000
const CONTEXT = 60

type Range = [number, number]

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

function sourceOf(o: SearchOptions): string {
  const base = o.regex ? o.query : escapeRe(o.query)
  return o.wholeWord ? `\\b(?:${base})\\b` : base
}

/** Regex de búsqueda, o un mensaje si la que escribió el usuario no compila. */
export function buildRegex(o: SearchOptions, global = true): RegExp | string {
  if (!o.query) return 'Escribe algo que buscar.'
  try {
    return new RegExp(sourceOf(o), `${global ? 'g' : ''}${o.caseSensitive ? '' : 'i'}`)
  } catch (e) {
    return e instanceof Error ? e.message : String(e)
  }
}

/** Tramos del texto que quedan fuera de las etiquetas y los comentarios. */
export function textRanges(text: string): Range[] {
  const out: Range[] = []
  let i = 0
  while (i < text.length) {
    const lt = text.indexOf('<', i)
    if (lt < 0) {
      out.push([i, text.length])
      break
    }
    if (lt > i) out.push([i, lt])
    if (text.startsWith('<!--', lt)) {
      const close = text.indexOf('-->', lt + 4)
      i = close < 0 ? text.length : close + 3
    } else {
      const gt = text.indexOf('>', lt)
      i = gt < 0 ? text.length : gt + 1
    }
  }
  return out
}

const rangesFor = (text: string, onlyText: boolean): Range[] =>
  onlyText ? textRanges(text) : [[0, text.length]]

/**
 * El texto visible de un archivo, todo seguido, con el mapa que devuelve cada
 * carácter a su posición en el original.
 */
function project(text: string): { plain: string; map: number[] } {
  let plain = ''
  const map: number[] = []
  for (const [start, end] of textRanges(text)) {
    for (let i = start; i < end; i++) {
      plain += text[i]
      map.push(i)
    }
  }
  return { plain, map }
}

/** Recorre las coincidencias de un archivo, tramo a tramo. */
function* scan(text: string, re: RegExp, o: Pick<SearchOptions, 'onlyText' | 'ignoreTags'>) {
  if (o.ignoreTags) {
    const { plain, map } = project(text)
    re.lastIndex = 0
    let m: RegExpExecArray | null
    while ((m = re.exec(plain))) {
      const a = m.index
      const b = a + m[0].length
      if (m[0].length === 0) { re.lastIndex++; continue }
      const from = map[a]
      const to = map[b - 1] + 1
      // Si en el original ocupa más de lo que ocupa en el texto plano, es que
      // hay etiquetas por medio.
      yield { from, length: to - from, spansTags: to - from !== m[0].length, m }
    }
    return
  }

  for (const [start, end] of rangesFor(text, o.onlyText)) {
    const slice = text.slice(start, end)
    re.lastIndex = 0
    let m: RegExpExecArray | null
    while ((m = re.exec(slice))) {
      yield { from: start + m.index, length: m[0].length, spansTags: false, m }
      if (m[0].length === 0) re.lastIndex++ // coincidencias vacías: no bloquear el bucle
    }
  }
}

/**
 * Pone los grupos en el texto de reemplazo: `$&`, `$1`, `$<nombre>`, `$$`.
 *
 * Hace falta hacerlo a mano porque volver a pasar la regex por el trozo
 * encontrado no sirve: una con lookbehind, como la de los espacios dobles
 * `(?<=\S) {2,}`, deja de coincidir en cuanto se la mira sin lo que tenía
 * delante, y el reemplazo no se haría nunca.
 */
function expand(replacement: string, m: RegExpExecArray): string {
  return replacement.replace(/\$(\$|&|\d{1,2}|<[^>]*>)/g, (whole, token: string) => {
    if (token === '$') return '$'
    if (token === '&') return m[0]
    if (token.startsWith('<')) return m.groups?.[token.slice(1, -1)] ?? ''
    // Como en JS: `$12` es el grupo 12 si existe, y si no el 1 seguido de "2".
    const two = Number(token)
    if (token.length === 2 && two < m.length) return m[two] ?? ''
    const one = Number(token[0])
    if (one > 0 && one < m.length) return (m[one] ?? '') + token.slice(1)
    return whole
  })
}

/** Archivos donde buscar, en orden estable. */
export function searchableFiles(book: EpubBook, scope: SearchOptions['scope']): string[] {
  return [...book.files.values()]
    .filter(f => {
      if (f.text == null || !isTextFile(f.path)) return false
      if (f.path === 'mimetype') return false
      return scope === 'all' || f.mediaType === 'application/xhtml+xml'
    })
    .map(f => f.path)
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
}

function context(text: string, from: number, to: number) {
  const lineStart = text.lastIndexOf('\n', from - 1) + 1
  const nl = text.indexOf('\n', to)
  const lineEnd = nl < 0 ? text.length : nl
  const beforeFrom = Math.max(lineStart, from - CONTEXT)
  const afterTo = Math.min(lineEnd, to + CONTEXT)
  return {
    before: (beforeFrom > lineStart ? '…' : '') + text.slice(beforeFrom, from),
    hit: text.slice(from, to),
    after: text.slice(to, afterTo) + (afterTo < lineEnd ? '…' : ''),
  }
}

export function searchBook(book: EpubBook, o: SearchOptions): SearchResult {
  const re = buildRegex(o)
  if (typeof re === 'string') return { files: [], total: 0, error: re }

  const files: FileHits[] = []
  let total = 0
  let truncated = false

  for (const path of searchableFiles(book, o.scope)) {
    const text = book.files.get(path)?.text
    if (text == null) continue

    const matches: Match[] = []
    for (const hit of scan(text, re, o)) {
      const to = hit.from + hit.length
      matches.push({
        path,
        from: hit.from,
        to,
        line: text.slice(0, hit.from).split('\n').length,
        ...context(text, hit.from, to),
        spansTags: hit.spansTags || undefined,
      })
      if (++total >= MAX_MATCHES) {
        truncated = true
        break
      }
    }
    if (matches.length) files.push({ path, matches })
    if (truncated) break
  }

  return { files, total, truncated: truncated || undefined }
}

/** En modo literal hay que escapar los `$` para que no se lean como grupos. */
function replacementFor(o: SearchOptions, replacement: string): string {
  return o.regex ? replacement : replacement.replace(/\$/g, '$$$$')
}

/**
 * Reemplaza todas las coincidencias del libro. Devuelve cuántas cambió.
 *
 * Las que atraviesan una etiqueta se dejan estar: reemplazarlas se llevaría
 * por delante el marcado de en medio.
 */
export function replaceAllInBook(book: EpubBook, o: SearchOptions, replacement: string): number {
  const scanRe = buildRegex(o)
  if (typeof scanRe === 'string') return 0
  const rep = replacementFor(o, replacement)
  let count = 0

  for (const path of searchableFiles(book, o.scope)) {
    const f = book.files.get(path)
    if (f?.text == null) continue

    const hits = [...scan(f.text, scanRe, o)].filter(h => !h.spansTags)
    if (!hits.length) continue

    // De atrás hacia delante, para que las posiciones sigan valiendo.
    let text = f.text
    for (let i = hits.length - 1; i >= 0; i--) {
      const { from, length, m } = hits[i]
      text = text.slice(0, from) + expand(rep, m) + text.slice(from + length)
    }
    f.text = text
    count += hits.length
  }
  return count
}

/** Cuántas se podrán reemplazar de verdad, para no prometer de más. */
export function replaceableCount(result: SearchResult): number {
  return result.files.reduce((n, f) => n + f.matches.filter(m => !m.spansTags).length, 0)
}

/** Reemplaza una sola coincidencia. Devuelve el texto insertado, o null. */
export function replaceMatch(
  book: EpubBook,
  m: Match,
  o: SearchOptions,
  replacement: string,
): string | null {
  const f = book.files.get(m.path)
  if (f?.text == null) return null

  const scanRe = buildRegex(o)
  if (typeof scanRe === 'string') return null

  // Comprueba que la coincidencia sigue donde estaba (el archivo pudo cambiar).
  const still = [...scan(f.text, scanRe, o)].find(h => h.from === m.from)
  // Si atraviesa una etiqueta no se toca: ver dónde está sí, cambiarlo no.
  if (!still || still.spansTags) return null

  const inserted = expand(replacementFor(o, replacement), still.m)
  f.text = f.text.slice(0, still.from) + inserted + f.text.slice(still.from + still.length)
  return inserted
}
