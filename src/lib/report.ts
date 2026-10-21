// Informe del libro: cómo está repartido y qué se repite.
//
// No es un corrector: es la vista desde arriba que no da ningún lector. Un
// capítulo que es el triple que los demás, uno que se quedó en dos páginas, un
// libro que es casi todo diálogo o casi nada, y las muletillas que se cuelan
// cuando uno escribe muchas horas seguidas.
//
// Todo se mide sobre el texto visible: las etiquetas no son del libro.

import { spinePaths, type EpubBook } from './epub'
import { navItemPath, plainText } from './structure'
import { countWords } from './words'

/** Palabras por minuto de un lector de novela en castellano. */
const WPM = 230

export interface ChapterStats {
  path: string
  title: string
  words: number
  /** Minutos de lectura, redondeados hacia arriba. */
  minutes: number
  paragraphs: number
  /** Párrafos que empiezan con raya o comillas de diálogo. */
  dialogue: number
  /** La frase más larga, en palabras: delata los párrafos que se van de madre. */
  longestSentence: number
}

export interface Repeat {
  word: string
  count: number
  /** Veces por cada diez mil palabras: compara capítulos de distinto tamaño. */
  per10k: number
}

export interface BookReport {
  chapters: ChapterStats[]
  words: number
  minutes: number
  /** Proporción de párrafos de diálogo sobre el total, de 0 a 1. */
  dialogueRatio: number
  /** Capítulos que se salen mucho de la media. */
  longest?: ChapterStats
  shortest?: ChapterStats
  average: number
  repeats: Repeat[]
}

const bodyOf = (xhtml: string): string => {
  const open = xhtml.match(/<body\b[^>]*>/i)
  const close = xhtml.lastIndexOf('</body>')
  if (!open || open.index == null || close < 0) return xhtml
  return xhtml.slice(open.index + open[0].length, close)
}

/** El título que se ve: el primer encabezado, o el nombre del archivo. */
export function titleOf(xhtml: string, path: string): string {
  const h = xhtml.match(/<h[1-6]\b[^>]*>([\s\S]*?)<\/h[1-6]\s*>/i)
  const text = h ? plainText(h[1]) : ''
  return text || path.split('/').pop() || path
}

const PARAGRAPH = /<p\b[^>]*>([\s\S]*?)<\/p\s*>/gi
/** Cómo empieza un párrafo de diálogo en castellano. */
const DIALOGUE = /^\s*(?:[—–-]|«|["“])/

/**
 * Palabras que no dicen nada de cómo se escribe: si se contaran, la lista de
 * repeticiones sería siempre la misma («de», «la», «que»).
 */
const STOP = new Set([
  'el', 'la', 'los', 'las', 'un', 'una', 'unos', 'unas', 'lo', 'al', 'del',
  'de', 'a', 'en', 'y', 'o', 'u', 'que', 'se', 'su', 'sus', 'por', 'con',
  'para', 'como', 'más', 'pero', 'le', 'les', 'me', 'te', 'nos', 'mi', 'tu',
  'es', 'era', 'fue', 'ser', 'son', 'eran', 'está', 'estaba', 'había', 'ha',
  'he', 'han', 'hay', 'no', 'sí', 'ya', 'si', 'cuando', 'porque', 'muy',
  'todo', 'toda', 'todos', 'todas', 'este', 'esta', 'esto', 'ese', 'esa',
  'eso', 'aquel', 'yo', 'él', 'ella', 'ellos', 'ellas', 'nada', 'algo',
  'sin', 'sobre', 'entre', 'hasta', 'desde', 'tan', 'ni', 'o', 'otra', 'otro',
])

const WORD = /[\p{L}][\p{L}\p{M}']*/gu
const MIN_REPEAT_LENGTH = 4
const MAX_REPEATS = 12

function sentences(text: string): string[] {
  return text.split(/(?<=[.!?…])\s+/).filter(s => /[\p{L}\p{N}]/u.test(s))
}

const wordsIn = (s: string) => (s.match(WORD) ?? []).length

export function chapterStats(xhtml: string, path: string): ChapterStats {
  const body = bodyOf(xhtml).replace(/<(style|script)\b[\s\S]*?<\/\1\s*>/gi, '')
  const words = countWords(xhtml)

  let paragraphs = 0
  let dialogue = 0
  let longestSentence = 0
  PARAGRAPH.lastIndex = 0
  let m: RegExpExecArray | null
  while ((m = PARAGRAPH.exec(body))) {
    const text = plainText(m[1])
    if (!text) continue
    paragraphs++
    if (DIALOGUE.test(text)) dialogue++
    for (const s of sentences(text)) longestSentence = Math.max(longestSentence, wordsIn(s))
  }

  return {
    path,
    title: titleOf(xhtml, path),
    words,
    minutes: Math.max(1, Math.round(words / WPM)),
    paragraphs,
    dialogue,
    longestSentence,
  }
}

/** Palabras que se repiten más de la cuenta, descontando las vacías. */
export function repeatedWords(book: EpubBook): Repeat[] {
  const nav = navItemPath(book)
  const counts = new Map<string, number>()
  let total = 0

  for (const path of spinePaths(book)) {
    if (path === nav) continue
    const text = book.files.get(path)?.text
    if (text == null) continue
    const plain = plainText(bodyOf(text)).toLowerCase()
    for (const w of plain.match(WORD) ?? []) {
      total++
      if (w.length < MIN_REPEAT_LENGTH || STOP.has(w)) continue
      counts.set(w, (counts.get(w) ?? 0) + 1)
    }
  }

  if (!total) return []
  const per = 10000 / total
  return [...counts.entries()]
    .filter(([, n]) => n > 2)
    .map(([word, count]) => ({ word, count, per10k: Math.round(count * per * 10) / 10 }))
    .sort((a, b) => b.count - a.count || a.word.localeCompare(b.word))
    .slice(0, MAX_REPEATS)
}

export function bookReport(book: EpubBook): BookReport {
  const nav = navItemPath(book)
  const chapters: ChapterStats[] = []

  for (const path of spinePaths(book)) {
    if (path === nav) continue
    const text = book.files.get(path)?.text
    if (text == null) continue
    chapters.push(chapterStats(text, path))
  }

  const words = chapters.reduce((n, c) => n + c.words, 0)
  const paragraphs = chapters.reduce((n, c) => n + c.paragraphs, 0)
  const dialogue = chapters.reduce((n, c) => n + c.dialogue, 0)
  const conTexto = chapters.filter(c => c.words > 0)

  return {
    chapters,
    words,
    minutes: Math.max(1, Math.round(words / WPM)),
    dialogueRatio: paragraphs ? dialogue / paragraphs : 0,
    average: conTexto.length ? Math.round(words / conTexto.length) : 0,
    longest: conTexto.length ? conTexto.reduce((a, b) => (b.words > a.words ? b : a)) : undefined,
    shortest: conTexto.length ? conTexto.reduce((a, b) => (b.words < a.words ? b : a)) : undefined,
    repeats: repeatedWords(book),
  }
}

/** Minutos a algo que se lee de un vistazo: "1 h 20 min". */
export function prettyMinutes(min: number): string {
  if (min < 60) return `${min} min`
  const h = Math.floor(min / 60)
  const rest = min % 60
  return rest ? `${h} h ${rest} min` : `${h} h`
}

/** Un capítulo se sale de la media si es el doble o menos de la mitad. */
export const outlier = (c: ChapterStats, average: number) =>
  average > 0 && c.words > 0 && (c.words > average * 2 || c.words < average / 2)
