// Revisión de las notas: que cada llamada lleve a su nota y cada nota vuelva
// a su llamada, con el número que toca.
//
// El validador ya avisa de los enlaces que no llevan a ninguna parte. Lo que no
// ve es el enlace que lleva al sitio equivocado: la vuelta de la nota 3 que
// salta a la llamada 4, el ❮07❯ cuya nota es la 8, la nota que se quedó sin
// llamada al borrar un párrafo, el número que se saltó al renumerar. Todo eso
// es un EPUB válido, y lo encuentra quien lee.
//
// No se depende de un formato: hay libros con epub:type="noteref", con
// <sup>❮03❯</sup>, con [3] a secas, notas al pie en <aside> o todas juntas en
// notas.xhtml. Una llamada se reconoce por su epub:type o su role, o por ser un
// enlace a otra parte cuyo texto es solo un número. Su nota es el elemento al
// que apunta, y la vuelta es el enlace que hay dentro de la nota.

import { resolvePath, spinePaths, type EpubBook } from './epub'
import { contextOf } from './spell'
import { navItemPath } from './structure'

export type NoteCode =
  | 'rota'
  | 'vuelta-rota'
  | 'vuelta-equivocada'
  | 'sin-vuelta'
  | 'repetida'
  | 'huerfana'
  | 'numero-distinto'
  | 'saltado'
  | 'repetido'
  | 'desordenado'

export interface NoteIssue {
  code: NoteCode
  severity: 'error' | 'warning'
  message: string
  path: string
  from: number
  to: number
  /** El texto de alrededor, para reconocerla en la lista. */
  context: string
}

export const NOTE_LABELS: Record<NoteCode, string> = {
  rota: 'Llamadas que no llevan a ninguna nota',
  'vuelta-rota': 'Vueltas que no llevan a ninguna parte',
  'vuelta-equivocada': 'Vueltas que llevan a otra llamada',
  'sin-vuelta': 'Notas sin enlace de vuelta',
  repetida: 'Notas con más de una llamada',
  huerfana: 'Notas a las que no llama nadie',
  'numero-distinto': 'Número de la llamada distinto del de la nota',
  saltado: 'Números saltados',
  repetido: 'Números repetidos',
  desordenado: 'Números fuera de orden',
}

export interface NoteReport {
  calls: number
  notes: number
  issues: NoteIssue[]
}

interface Anchor {
  path: string
  start: number
  end: number
  id?: string
  /** Archivo y fragmento al que lleva. */
  target: string
  frag: string
  text: string
  explicit: 'call' | 'back' | null
}

interface Element {
  path: string
  id: string
  tag: string
  start: number
  end: number
  role: string
}

const ANCHOR = /<a\b([^>]*)>([\s\S]*?)<\/a\s*>/gi
const WITH_ID = /<([a-zA-Z][\w:-]*)\b([^>]*?)\sid\s*=\s*"([^"]+)"([^>]*)>/g
/** Texto de una llamada: un número, quizá entre corchetes o ❮❯. */
const MARK = /^[\s[(❮〔【<*†]*\d{1,4}[\s\])❯〕】>.]*$/

const attr = (attrs: string, name: string) =>
  attrs.match(new RegExp(`(?:^|\\s)${name}\\s*=\\s*"([^"]*)"`, 'i'))?.[1]

const plain = (html: string) => html.replace(/<[^>]*>/g, '').replace(/&[#a-z0-9]+;/gi, ' ').trim()

const numberIn = (s: string): number | null => {
  const m = plain(s).match(/\d+/)
  return m ? Number(m[0]) : null
}

/** Dónde se cierra el elemento que se abre en `at`, contando los anidados. */
function elementEnd(text: string, at: number, tag: string): number {
  const open = text.indexOf('>', at)
  if (open < 0) return text.length
  if (text[open - 1] === '/') return open + 1
  const re = new RegExp(`<\\/?${tag}\\b[^>]*>`, 'gi')
  re.lastIndex = open + 1
  let depth = 1
  let m: RegExpExecArray | null
  while ((m = re.exec(text))) {
    if (m[0][1] === '/') {
      if (--depth === 0) return m.index + m[0].length
    } else if (!m[0].endsWith('/>')) depth++
  }
  return text.length
}

function docs(book: EpubBook): string[] {
  const nav = navItemPath(book)
  return spinePaths(book).filter(p => p !== nav && book.files.get(p)?.text != null)
}

const key = (path: string, id: string) => `${path}#${id}`

export function checkNotes(book: EpubBook): NoteReport {
  const paths = docs(book)
  const elements = new Map<string, Element>()
  const anchors: Anchor[] = []

  for (const path of paths) {
    const text = book.files.get(path)!.text!
    for (const m of text.matchAll(WITH_ID)) {
      const tag = m[1].toLowerCase()
      const attrs = m[2] + m[4]
      const role = `${attr(attrs, 'epub:type') ?? ''} ${attr(attrs, 'role') ?? ''}`
      elements.set(key(path, m[3]), { path, id: m[3], tag, start: m.index, end: elementEnd(text, m.index, m[1]), role })
    }
    for (const m of text.matchAll(ANCHOR)) {
      const href = attr(m[1], 'href')
      if (!href || !href.includes('#') || /^[a-z]+:/i.test(href)) continue
      const [file, frag] = href.split('#')
      const types = `${attr(m[1], 'epub:type') ?? ''} ${attr(m[1], 'role') ?? ''}`
      anchors.push({
        path,
        start: m.index,
        end: m.index + m[0].length,
        id: attr(m[1], 'id'),
        target: file ? resolvePath(path, file) : path,
        frag,
        text: m[2],
        explicit: /\b(noteref|doc-noteref)\b/.test(types) ? 'call'
          : /\b(backlink|doc-backlink)\b/.test(types) ? 'back' : null,
      })
    }
  }

  const targetOf = (a: Anchor) => elements.get(key(a.target, a.frag))

  // Primero las llamadas seguras: las que lo dicen, o un número que lleva a
  // algo que no es otro enlace (si lleva a un <a>, es una vuelta).
  const calls: Anchor[] = []
  const pending: Anchor[] = []
  for (const a of anchors) {
    if (a.explicit === 'back') continue
    const t = targetOf(a)
    if (a.explicit === 'call' || (t && t.tag !== 'a' && MARK.test(plain(a.text)))) calls.push(a)
    else if (!t && MARK.test(plain(a.text))) pending.push(a)
  }

  // Las notas son lo que esas llamadas señalan.
  const notes = new Map<string, Element>()
  for (const c of calls) {
    const t = targetOf(c)
    if (t) notes.set(key(t.path, t.id), t)
  }
  const inNote = (a: Anchor) =>
    [...notes.values()].some(n => n.path === a.path && a.start >= n.start && a.end <= n.end)

  // Un número roto dentro de una nota es una vuelta rota; fuera, una llamada rota.
  for (const a of pending) if (!inNote(a)) calls.push(a)
  const isCall = new Set(calls)
  calls.sort((x, y) => paths.indexOf(x.path) - paths.indexOf(y.path) || x.start - y.start)

  const issues: NoteIssue[] = []
  const at = (path: string, from: number, to: number, code: NoteCode, message: string, label?: string) => {
    const text = book.files.get(path)!.text!
    const c = contextOf(text, from, to, 36)
    issues.push({
      code,
      severity: code === 'rota' || code === 'vuelta-rota' ? 'error' : 'warning',
      message,
      path,
      from,
      to,
      context: `${c.before}${label ?? plain(c.word)}${c.after}`.trim(),
    })
  }
  const name = (p: string) => p.split('/').pop()

  // ---------- llamada → nota ----------
  const callsOf = new Map<string, Anchor[]>()
  for (const c of calls) {
    const t = targetOf(c)
    if (!t) {
      at(c.path, c.start, c.end, 'rota', `La llamada ${plain(c.text)} lleva a «${name(c.target)}#${c.frag}», que no existe.`)
      continue
    }
    const k = key(t.path, t.id)
    callsOf.set(k, [...(callsOf.get(k) ?? []), c])
  }

  // ---------- nota → llamada ----------
  const backsOf = (n: Element) => anchors.filter(a =>
    a.path === n.path && a.start >= n.start && a.end <= n.end && !isCall.has(a))
  const withBack = [...notes.values()].filter(n => backsOf(n).length > 0).length

  for (const [k, n] of notes) {
    const mine = callsOf.get(k) ?? []
    const text = book.files.get(n.path)!.text!
    const noteLabel = `#${n.id}`

    if (mine.length > 1) {
      at(n.path, n.start, n.start, 'repetida',
        `La nota ${noteLabel} tiene ${mine.length} llamadas: ${mine.map(c => plain(c.text)).join(', ')}.`, plain(text.slice(n.start, n.end)).slice(0, 60))
    }

    const backs = backsOf(n)
    if (!backs.length) {
      // Solo se exige vuelta si el libro las usa en las demás notas.
      if (withBack > 0) at(n.path, n.start, n.start, 'sin-vuelta', `La nota ${noteLabel} no tiene enlace de vuelta a su llamada.`, plain(text.slice(n.start, n.end)).slice(0, 60))
    } else {
      const back = backs[0]
      const dest = elements.get(key(back.target, back.frag))
      if (!dest) {
        at(back.path, back.start, back.end, 'vuelta-rota', `La vuelta de la nota ${noteLabel} lleva a «${name(back.target)}#${back.frag}», que no existe.`)
      } else if (mine.length && !mine.some(c => c.path === back.target && c.id === back.frag)) {
        const real = mine[0]
        at(back.path, back.start, back.end, 'vuelta-equivocada',
          `La vuelta de la nota ${noteLabel} lleva a #${back.frag}, pero quien la llama es ${real.id ? `#${real.id}` : plain(real.text)} (${name(real.path)}).`)
      }
    }

    // El número que se ve en la llamada y el que se ve en la nota.
    const shown = backs.length ? numberIn(backs[0].text) : numberIn(text.slice(n.start, Math.min(n.end, n.start + 400)).replace(/^<[^>]*>/, ''))
    for (const c of mine) {
      const callNum = numberIn(c.text)
      if (callNum != null && shown != null && callNum !== shown) {
        at(c.path, c.start, c.end, 'numero-distinto', `La llamada dice ${callNum} pero su nota (#${n.id}) dice ${shown}.`)
      }
    }
  }

  // ---------- notas sin llamada ----------
  // Una nota sin llamada se reconoce por su epub:type, o por llamarse como las
  // demás: si las notas son nt1, nt2…, un nt9 al que nadie llama es una nota.
  const prefixes = new Set([...notes.values()]
    .filter(n => /\D\d+$/.test(n.id))
    .map(n => n.id.replace(/\d+$/, '')))
  for (const [k, e] of elements) {
    if (notes.has(k) || e.tag === 'a') continue
    const looksLikeNote = /\b(footnote|endnote|rearnote|doc-footnote|doc-endnote)\b/.test(e.role) ||
      (/\d+$/.test(e.id) && prefixes.has(e.id.replace(/\d+$/, '')))
    if (!looksLikeNote) continue
    const text = book.files.get(e.path)!.text!
    at(e.path, e.start, e.start, 'huerfana', `Nadie llama a la nota #${e.id}.`, plain(text.slice(e.start, e.end)).slice(0, 60))
  }

  // ---------- numeración en orden de lectura ----------
  // Si una llamada vuelve a 1 en otro capítulo, la cuenta empieza de nuevo:
  // hay libros que numeran por capítulo.
  let prev: Anchor | null = null
  let prevNum = 0
  const seen = new Set<number>()
  for (const c of calls) {
    const n = numberIn(c.text)
    if (n == null) continue
    if (prev && n === 1 && c.path !== prev.path) { seen.clear(); prevNum = 0 }
    if (seen.has(n)) {
      at(c.path, c.start, c.end, 'repetido', `El ${n} ya salió antes.`)
    } else if (prevNum && n > prevNum + 1) {
      const faltan = n - prevNum === 2 ? `el ${prevNum + 1}` : `del ${prevNum + 1} al ${n - 1}`
      at(c.path, c.start, c.end, 'saltado', `Después del ${prevNum} viene el ${n}: falta ${faltan}.`)
    } else if (prevNum && n < prevNum) {
      at(c.path, c.start, c.end, 'desordenado', `El ${n} va después del ${prevNum}.`)
    } else if (!prevNum && n > 1) {
      at(c.path, c.start, c.end, 'saltado', `La primera nota es la ${n}: falta${n === 2 ? ' la 1' : `n de la 1 a la ${n - 1}`}.`)
    }
    seen.add(n)
    prev = c
    prevNum = Math.max(prevNum, n)
  }

  return { calls: calls.length, notes: notes.size, issues }
}
