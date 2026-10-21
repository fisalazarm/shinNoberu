// Concordancia de nombres propios.
//
// En una novela larga el mismo personaje acaba escrito de tres maneras:
// Kazuto, Kasuto, Kazutto. Nadie lo ve leyendo, porque cada variante aparece a
// cien páginas de la otra, y es carísimo de arreglar después de publicar.
//
// Lo que hace esto es juntar las variantes que se parecen y decir cuántas veces
// sale cada una y en qué capítulos, para poder unificarlas.
//
// Distinguir un nombre propio de la primera palabra de una frase no se puede
// hacer con seguridad sin entender el texto, así que se usa la regla que mejor
// funciona en la práctica: es nombre propio lo que aparece en mayúscula en
// mitad de una frase y no aparece nunca en minúscula.

import { spinePaths, type EpubBook } from './epub'
import { textRanges } from './searchBook'
import { navItemPath } from './structure'

export interface NameHit {
  path: string
  offset: number
  line: number
}

export interface Variant {
  word: string
  count: number
  /** Capítulos donde aparece, en orden de lectura. */
  chapters: string[]
  /** La primera aparición, para poder ir a verla. */
  first: NameHit
}

export interface NameGroup {
  /** La forma más usada: la que se propone como buena. */
  main: string
  total: number
  variants: Variant[]
}

/** Por debajo de esto hay demasiados falsos amigos ("El", "Un"). */
const MIN_LENGTH = 3
/** Un nombre que sale una sola vez en todo el libro no dice nada. */
const MIN_COUNT = 1

const WORD = /[\p{Lu}\p{Ll}][\p{L}\p{M}]*(?:['’-][\p{L}\p{M}]+)*/gu
/** Lo que puede haber entre el punto y la palabra siguiente sin romper la frase. */
const SKIP = new Set([' ', '\t', '\n', '\r', '"', "'", '«', '»', '“', '”', '‘', '’', '(', '[', '¿', '¡', '—', '–', '-', '*'])
const ENDS = new Set(['.', '!', '?', '…', ':', ';'])

const isUpper = (w: string) => w[0] !== w[0].toLowerCase()

/** Sin tildes y en minúscula: así "Nicolás" y "Nicolas" son el mismo nombre. */
export const fold = (w: string) =>
  w.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

/**
 * ¿La palabra abre la frase? Si abre, su mayúscula no significa nada: puede ser
 * cualquier palabra.
 */
function opensSentence(text: string, start: number, rangeStart: number): boolean {
  let i = start - 1
  while (i >= rangeStart && SKIP.has(text[i])) i--
  // Pegada a una etiqueta (un <p> nuevo, un <em>): cuenta como principio.
  if (i < rangeStart) return true
  return ENDS.has(text[i])
}

interface Tally {
  word: string
  count: number
  /** Veces que aparece en mitad de una frase. */
  inside: number
  lower: number
  chapters: Set<string>
  first?: NameHit
}

/** Distancia de edición, con tope: en cuanto se pasa, da igual cuánto más sea. */
export function distance(a: string, b: string, max: number): number {
  if (Math.abs(a.length - b.length) > max) return max + 1
  let prev = [...Array(b.length + 1).keys()]
  for (let i = 1; i <= a.length; i++) {
    const row = [i]
    let best = i
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      row[j] = Math.min(prev[j] + 1, row[j - 1] + 1, prev[j - 1] + cost)
      best = Math.min(best, row[j])
    }
    if (best > max) return max + 1
    prev = row
  }
  return prev[b.length]
}

/** Cuánto puede diferenciarse una variante de otra para ser la misma. */
const tolerance = (word: string) => (word.length <= 5 ? 1 : 2)

function tally(book: EpubBook): Map<string, Tally> {
  const nav = navItemPath(book)
  const out = new Map<string, Tally>()

  for (const path of spinePaths(book)) {
    if (path === nav) continue
    const text = book.files.get(path)?.text
    if (text == null) continue

    for (const [start, end] of textRanges(text)) {
      const slice = text.slice(start, end)
      WORD.lastIndex = 0
      let m: RegExpExecArray | null
      while ((m = WORD.exec(slice))) {
        const word = m[0]
        if (word.length < MIN_LENGTH) continue
        const at = start + m.index

        const entry = out.get(word) ?? { word, count: 0, inside: 0, lower: 0, chapters: new Set<string>() }
        entry.count++
        entry.chapters.add(path)
        if (isUpper(word)) {
          if (!opensSentence(text, at, start)) entry.inside++
          entry.first ??= { path, offset: at, line: text.slice(0, at).split('\n').length }
        } else {
          entry.lower++
        }
        out.set(word, entry)
      }
    }
  }
  return out
}

/**
 * Nombres propios del libro, agrupados por parecido. Los grupos con más de una
 * variante van primero: son los que hay que mirar.
 */
export function findNames(book: EpubBook): NameGroup[] {
  const counts = tally(book)
  const order = spinePaths(book)

  // La misma palabra en minúscula en otra parte del libro delata que no es un
  // nombre: "rosa" la flor frente a "Rosa" la persona se queda fuera, y es
  // preferible callar a señalar de más.
  const lowerSeen = new Map<string, number>()
  for (const t of counts.values()) {
    if (t.lower) lowerSeen.set(fold(t.word), (lowerSeen.get(fold(t.word)) ?? 0) + t.lower)
  }

  const names = [...counts.values()]
    .filter(t => t.inside > 0 && !lowerSeen.has(fold(t.word)) && t.count > MIN_COUNT - 1)
    .sort((a, b) => b.count - a.count || a.word.localeCompare(b.word))

  const groups: { head: string; members: Tally[] }[] = []
  for (const t of names) {
    const key = fold(t.word)
    const found = groups.find(g => {
      const head = fold(g.head)
      return head[0] === key[0] && distance(head, key, tolerance(key)) <= tolerance(key)
    })
    if (found) found.members.push(t)
    else groups.push({ head: t.word, members: [t] })
  }

  return groups
    .map(g => ({
      main: g.members[0].word,
      total: g.members.reduce((n, m) => n + m.count, 0),
      variants: g.members.map(m => ({
        word: m.word,
        count: m.count,
        chapters: order.filter(p => m.chapters.has(p)),
        first: m.first!,
      })),
    }))
    .sort((a, b) =>
      (b.variants.length > 1 ? 1 : 0) - (a.variants.length > 1 ? 1 : 0) || b.total - a.total)
}

/** Los grupos que tienen más de una forma escrita: lo que hay que unificar. */
export const inconsistent = (groups: NameGroup[]) => groups.filter(g => g.variants.length > 1)
