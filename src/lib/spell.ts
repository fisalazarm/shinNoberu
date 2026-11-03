// Ortografía: qué palabras mirar y cuándo una palabra está bien.
//
// El diccionario (Hunspell, el de LibreOffice) vive en un hilo aparte porque
// cargarlo cuesta un segundo; esto es lo que no depende de él: sacar las
// palabras del XHTML sin meterse en etiquetas ni entidades, y las reglas que
// el diccionario no cubre. Hunspell no conoce todos los superlativos ni
// diminutivos («cansadísimo», «perrito»), así que se aceptan si existe la
// palabra de la que salen.
//
// Lo que no se marca nunca: los nombres propios del libro (los mismos que
// encuentra la concordancia de nombres), lo que añadas a tu diccionario o al
// del libro, números romanos y palabras pegadas a cifras («3er», «2ª»).

import { spinePaths, type EpubBook } from './epub'
import { navItemPath } from './structure'

export interface Checker {
  correct(word: string): boolean
}

export interface Token {
  from: number
  to: number
  word: string
}

const WORD = /&[#a-z0-9]+;|[\p{L}\p{M}]+(?:['’][\p{L}\p{M}]+)*/giu
const ROMAN = /^(?=[MDCLXVI]{2,}$)M{0,4}(CM|CD|D?C{0,3})(XC|XL|L?X{0,3})(IX|IV|V?I{0,3})$/
/** Lo que, pegado a una palabra, dice que no es prosa: «3er», «user_name», «a@b». */
const GLUE = /[\d_@/\\=]/

/** Tramos del documento que son texto del cuerpo: sin etiquetas, comentarios, estilos ni scripts. */
export function bodyRanges(text: string): [number, number][] {
  const body = text.search(/<body\b/i)
  let i = body < 0 ? 0 : text.indexOf('>', body) + 1
  const out: [number, number][] = []
  while (i < text.length) {
    const lt = text.indexOf('<', i)
    if (lt < 0) { out.push([i, text.length]); break }
    if (lt > i) out.push([i, lt])
    if (text.startsWith('<!--', lt)) {
      const close = text.indexOf('-->', lt + 4)
      i = close < 0 ? text.length : close + 3
    } else if (/^<(style|script)\b/i.test(text.slice(lt, lt + 8))) {
      const name = text.slice(lt + 1, lt + 7).toLowerCase().startsWith('style') ? 'style' : 'script'
      const close = text.toLowerCase().indexOf(`</${name}`, lt)
      // A medio escribir («</style» sin su «>») se acaba ahí: volver atrás
      // dejaría el bucle dando vueltas para siempre.
      const gt = close < 0 ? -1 : text.indexOf('>', close)
      i = gt < 0 ? text.length : gt + 1
    } else {
      const gt = text.indexOf('>', lt)
      i = gt < 0 ? text.length : gt + 1
    }
  }
  return out
}

/** Las palabras que hay que revisar, con su posición en el documento. */
export function spellTokens(text: string): Token[] {
  const out: Token[] = []
  for (const [start, end] of bodyRanges(text)) {
    const slice = text.slice(start, end)
    WORD.lastIndex = 0
    let m: RegExpExecArray | null
    while ((m = WORD.exec(slice))) {
      const word = m[0]
      if (word[0] === '&' || word.length < 2) continue
      const before = slice[m.index - 1] ?? ''
      const after = slice[m.index + word.length] ?? ''
      if (GLUE.test(before) || GLUE.test(after)) continue
      out.push({ from: start + m.index, to: start + m.index + word.length, word })
    }
  }
  return out
}

/** ¿Está en alguna lista aceptada (tuya, del libro, nombres)? */
export function isAccepted(word: string, accepted: ReadonlySet<string>): boolean {
  return accepted.has(word) || accepted.has(word.toLowerCase())
}

const SUPERLATIVE = /^(.+)ísim([oa]s?)$/
const DIMINUTIVE = /^(.+?)(?:c?it|ill)([oa]s?)$/

/** Raíces posibles de un superlativo: «riquísimo» → «rico», «amabilísimo» → «amable». */
function superlativeBases(stem: string): string[] {
  const fixes = [
    stem,
    stem.replace(/qu$/, 'c'),
    stem.replace(/gu$/, 'g'),
    stem.replace(/bil$/, 'ble'),
    stem.replace(/c$/, 'z'),
  ]
  return [...new Set(fixes)].flatMap(s => [`${s}o`, `${s}a`, `${s}e`, s])
}

/**
 * ¿Está bien escrita? Además de lo que diga el diccionario, acepta una
 * palabra de diccionario escrita en mayúsculas («CAPÍTULO»), los números
 * romanos y los superlativos y diminutivos de palabras que existen.
 */
export function isCorrect(c: Checker, raw: string): boolean {
  const word = raw.normalize('NFC').replace(/’/g, "'")
  if (c.correct(word)) return true
  const lower = word.toLowerCase()
  if (word !== lower && c.correct(lower)) return true
  if (word === word.toUpperCase()) {
    if (ROMAN.test(word)) return true
    if (c.correct(lower[0].toUpperCase() + lower.slice(1))) return true
  }

  const sup = lower.match(SUPERLATIVE)
  if (sup && superlativeBases(sup[1]).some(b => c.correct(b))) return true

  const dim = lower.match(DIMINUTIVE)
  if (dim && dim[1].length >= 2) {
    const g = dim[2].startsWith('a') ? 'a' : 'o'
    const bases = [`${dim[1]}${g}`, `${dim[1]}e`, dim[1], dim[1].replace(/qu$/, 'c') + g, dim[1].replace(/gu$/, 'g') + g]
    if (bases.some(b => c.correct(b))) return true
  }
  return false
}

/** Pone a una sugerencia las mayúsculas de la palabra que reemplaza. */
export function matchCase(original: string, replacement: string): string {
  if (original.length > 1 && original === original.toUpperCase()) return replacement.toUpperCase()
  if (original[0] !== original[0].toLowerCase()) return replacement[0].toUpperCase() + replacement.slice(1)
  return replacement
}

// ---------- el libro entero ----------

export interface Hit {
  path: string
  from: number
  to: number
}

/** Los documentos donde se revisa: el orden de lectura, sin el nav. */
function docs(book: EpubBook): string[] {
  const nav = navItemPath(book)
  return spinePaths(book).filter(p => p !== nav && book.files.get(p)?.text != null)
}

/** Todas las palabras del libro con dónde sale cada una. */
export function bookWords(book: EpubBook): Map<string, Hit[]> {
  const out = new Map<string, Hit[]>()
  for (const path of docs(book)) {
    for (const t of spellTokens(book.files.get(path)!.text!)) {
      const list = out.get(t.word)
      const hit = { path, from: t.from, to: t.to }
      if (list) list.push(hit)
      else out.set(t.word, [hit])
    }
  }
  return out
}

/**
 * Cambia una palabra por otra en todo el libro, solo donde es palabra entera
 * de texto (nunca dentro de una etiqueta). Respeta las mayúsculas de cada
 * aparición. Devuelve cuántas cambió.
 */
export function replaceWord(book: EpubBook, word: string, replacement: string): number {
  let n = 0
  for (const path of docs(book)) {
    const f = book.files.get(path)!
    const hits = spellTokens(f.text!).filter(t => t.word === word)
    if (!hits.length) continue
    let text = f.text!
    for (let k = hits.length - 1; k >= 0; k--) {
      const t = hits[k]
      text = text.slice(0, t.from) + matchCase(t.word, replacement) + text.slice(t.to)
    }
    f.text = text
    n += hits.length
  }
  return n
}

/** Un trozo de texto alrededor de una aparición, para reconocerla. */
export function contextOf(text: string, from: number, to: number, span = 50): { before: string; word: string; after: string } {
  const plain = (s: string) => s.replace(/<[^>]*>/g, ' ').replace(/&[#a-z0-9]+;/gi, ' ').replace(/\s+/g, ' ')
  // Nada de antes del <body>, y si el corte cae a media etiqueta, sin su resto.
  const bodyAt = text.search(/<body\b/i)
  const floor = bodyAt < 0 ? 0 : text.indexOf('>', bodyAt) + 1
  let head = text.slice(Math.max(floor, from - span * 3), from)
  const gt = head.indexOf('>')
  if (gt >= 0 && (head.indexOf('<') < 0 || gt < head.indexOf('<'))) head = head.slice(gt + 1)
  let tail = text.slice(to, to + span * 3)
  const lt = tail.lastIndexOf('<')
  if (lt >= 0 && tail.indexOf('>', lt) < 0) tail = tail.slice(0, lt)
  const before = plain(head).trimStart()
  const after = plain(tail).trimEnd()
  return {
    before: before.length > span ? `…${before.slice(-span)}` : before,
    word: text.slice(from, to),
    after: after.length > span ? `${after.slice(0, span)}…` : after,
  }
}
