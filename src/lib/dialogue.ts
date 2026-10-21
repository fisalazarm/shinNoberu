// Revisión del diálogo en castellano.
//
// La raya tiene reglas que casi nadie recuerda y que ningún corrector marca:
// va pegada a lo que abre («—Vamos», no «— Vamos»), el inciso se abre con
// espacio delante y sin espacio detrás («dijo —replicó»), y si el diálogo
// sigue después del inciso hay que cerrarlo con otra raya antes del punto
// («—dijo ella—. Y se fue»).
//
// Aquí solo se señala lo que es seguro: espaciado y rayas que faltan, comillas
// y paréntesis sin cerrar, y signos de apertura sin su pareja. Lo dudoso no se
// toca, porque en un diálogo cada excepción es del autor.

import { spinePaths, type EpubBook } from './epub'
import { navItemPath } from './structure'

export type DialogueCode =
  | 'guion'
  | 'espacio-tras-raya'
  | 'inciso-sin-espacio'
  | 'inciso-con-espacio'
  | 'cierre-inciso'
  | 'punto-antes-de-raya'
  | 'comillas'
  | 'parentesis'
  | 'apertura'

export interface DialogueIssue {
  path: string
  line: number
  from: number
  to: number
  code: DialogueCode
  message: string
  /** Texto con el que se puede reemplazar lo señalado, si el arreglo es seguro. */
  fix?: string
  /** Lo que hay ahora, para enseñarlo y para comprobar antes de escribir. */
  found: string
}

export const CODE_LABELS: Record<DialogueCode, string> = {
  guion: 'Guion en vez de raya',
  'espacio-tras-raya': 'Espacio tras la raya que abre',
  'inciso-sin-espacio': 'Falta espacio antes del inciso',
  'inciso-con-espacio': 'Espacio sobrante en el inciso',
  'cierre-inciso': 'Falta la raya que cierra el inciso',
  'punto-antes-de-raya': 'Punto antes de la raya',
  comillas: 'Comillas sin cerrar',
  parentesis: 'Paréntesis sin cerrar',
  apertura: 'Signo de apertura sin pareja',
}

const RAYA = '—'
const PARAGRAPH = /<p\b[^>]*>([\s\S]*?)<\/p\s*>/gi
const TAG = /<[^>]*>/g

const lineAt = (text: string, offset: number) => text.slice(0, offset).split('\n').length

/**
 * El texto visible de un párrafo con el mapa a su posición en el archivo: hace
 * falta para señalar el sitio exacto sin contar las etiquetas.
 */
function visible(inner: string, base: number): { text: string; map: number[] } {
  let text = ''
  const map: number[] = []
  let i = 0
  TAG.lastIndex = 0
  let m: RegExpExecArray | null
  while ((m = TAG.exec(inner))) {
    for (let k = i; k < m.index; k++) { text += inner[k]; map.push(base + k) }
    i = m.index + m[0].length
  }
  for (let k = i; k < inner.length; k++) { text += inner[k]; map.push(base + k) }
  return { text, map }
}

interface Found {
  at: number
  len: number
  code: DialogueCode
  message: string
  fix?: string
}

/** ¿Empieza el párrafo un diálogo? */
const opensDialogue = (t: string) => /^\s*[—–-]/.test(t)

const isLetter = (c: string | undefined) => !!c && /[\p{L}\p{N}]/u.test(c)

/**
 * Dónde están las rayas del párrafo, contando también los guiones y las
 * semirrayas que hacen de raya: si no, arreglar una cosa destaparía la
 * siguiente y habría que pasar dos veces.
 *
 * El orden importa y es siempre el mismo: la primera abre lo que se dice, la
 * segunda abre el inciso, la tercera lo cierra, y así.
 */
function dashes(t: string, start: number): number[] {
  const out = [start]
  for (let i = start + 1; i < t.length; i++) {
    const c = t[i]
    if (c !== RAYA && c !== '–' && c !== '-') continue
    // Un guion entre palabras (tira-y-afloja) no es una raya.
    if (c !== RAYA && isLetter(t[i - 1]) && isLetter(t[i + 1])) continue
    out.push(i)
  }
  return out
}

function checkDashes(t: string): Found[] {
  const out: Found[] = []
  const start = t.search(/\S/)
  if (start < 0 || !opensDialogue(t)) return out

  const pos = dashes(t, start)

  for (const [k, i] of pos.entries()) {
    if (t[i] !== RAYA) {
      out.push({
        at: i,
        len: 1,
        code: 'guion',
        message: k === 0
          ? 'El diálogo se abre con raya (—), no con guion.'
          : 'El inciso se marca con raya (—), no con guion.',
        fix: RAYA,
      })
    }

    // Las que cierran el inciso van pegadas por delante y sueltas por detrás;
    // las que abren, al revés.
    const closes = k > 0 && k % 2 === 0
    const spaceAfter = t.slice(i + 1).match(/^[ \t]+/)

    if (k > 0 && !closes && !/\s/.test(t[i - 1] ?? ' ')) {
      out.push({
        at: i,
        len: 0,
        code: 'inciso-sin-espacio',
        message: 'Antes de la raya que abre el inciso va un espacio.',
        fix: ' ',
      })
    }
    if (!closes && spaceAfter) {
      out.push({
        at: i + 1,
        len: spaceAfter[0].length,
        code: k === 0 ? 'espacio-tras-raya' : 'inciso-con-espacio',
        message: k === 0
          ? 'La raya que abre el diálogo va pegada a lo que dice el personaje.'
          : 'La raya del inciso va pegada al verbo que la sigue.',
        fix: '',
      })
    }
    if (closes && /[ \t]/.test(t[i - 1] ?? '')) {
      out.push({
        at: i - 1,
        len: 1,
        code: 'inciso-con-espacio',
        message: 'La raya que cierra el inciso va pegada a la última palabra.',
        fix: '',
      })
    }
  }

  // El inciso se abrió y no se cerró, pero el diálogo sigue después.
  if (pos.length === 2) {
    const rest = t.slice(pos[1] + 1)
    const end = rest.match(/[.!?…]\s+\S/)
    if (end && end.index != null) {
      out.push({
        at: pos[1] + 1 + end.index,
        len: 1,
        code: 'cierre-inciso',
        message: 'Si el diálogo sigue tras el inciso, el inciso se cierra con raya antes del punto.',
        fix: `${RAYA}${end[0][0]}`,
      })
    }
  }

  // El punto va detrás de la raya que cierra, no delante.
  const bad = t.match(/([.,;:])\s*—\s*$/)
  if (bad && bad.index != null) {
    out.push({
      at: bad.index,
      len: bad[0].length,
      code: 'punto-antes-de-raya',
      message: 'El punto va después de la raya que cierra el inciso, no antes.',
      fix: `${RAYA}${bad[1]}`,
    })
  }

  return out
}

const PAIRS: [string, string, DialogueCode, string][] = [
  ['«', '»', 'comillas', 'Faltan las comillas de cierre (»).'],
  ['“', '”', 'comillas', 'Faltan las comillas de cierre (”).'],
  ['(', ')', 'parentesis', 'Falta el paréntesis de cierre.'],
  ['¿', '?', 'apertura', 'Esta pregunta no se cierra con «?».'],
  ['¡', '!', 'apertura', 'Esta exclamación no se cierra con «!».'],
]

function checkPairs(t: string): Found[] {
  const out: Found[] = []
  for (const [open, close, code, message] of PAIRS) {
    const opens = [...t].reduce((n, c) => n + (c === open ? 1 : 0), 0)
    const closes = [...t].reduce((n, c) => n + (c === close ? 1 : 0), 0)
    if (opens <= closes) continue
    // Se señala la última que quedó abierta, que es donde se ve el problema.
    const at = t.lastIndexOf(open)
    out.push({ at, len: 1, code, message })
  }
  // Las comillas rectas no tienen pareja distinta: se cuentan a pares.
  const straight = [...t].reduce((n, c) => n + (c === '"' ? 1 : 0), 0)
  if (straight % 2 === 1) {
    out.push({ at: t.lastIndexOf('"'), len: 1, code: 'comillas', message: 'Queda una comilla recta suelta.' })
  }
  return out
}

/** Repasa el libro entero. Solo los capítulos: el índice no tiene diálogo. */
export function reviewDialogue(book: EpubBook): DialogueIssue[] {
  const nav = navItemPath(book)
  const out: DialogueIssue[] = []

  for (const path of spinePaths(book)) {
    if (path === nav) continue
    const text = book.files.get(path)?.text
    if (text == null) continue

    PARAGRAPH.lastIndex = 0
    let m: RegExpExecArray | null
    while ((m = PARAGRAPH.exec(text))) {
      const base = m.index + m[0].indexOf(m[1], m[0].indexOf('>'))
      const { text: t, map } = visible(m[1], base)
      if (!t.trim()) continue

      for (const f of [...checkDashes(t), ...checkPairs(t)]) {
        const from = map[Math.min(f.at, map.length - 1)] ?? base
        const to = f.len ? (map[Math.min(f.at + f.len - 1, map.length - 1)] ?? from) + 1 : from
        out.push({
          path,
          line: lineAt(text, from),
          from,
          to,
          code: f.code,
          message: f.message,
          fix: f.fix,
          found: t.slice(f.at, f.at + Math.max(f.len, 1)),
        })
      }
    }
  }

  return out.sort((a, b) => a.path.localeCompare(b.path) || a.from - b.from)
}

/**
 * Aplica los arreglos seguros. De atrás hacia delante dentro de cada archivo,
 * y comprobando antes que lo que hay sigue siendo lo que se vio.
 */
export function fixDialogue(book: EpubBook, issues: DialogueIssue[]): number {
  const byFile = new Map<string, DialogueIssue[]>()
  for (const i of issues) {
    if (i.fix == null) continue
    byFile.set(i.path, [...(byFile.get(i.path) ?? []), i])
  }

  let done = 0
  for (const [path, list] of byFile) {
    const f = book.files.get(path)
    if (f?.text == null) continue
    let text = f.text
    for (const i of [...list].sort((a, b) => b.from - a.from)) {
      if (i.to > i.from && text.slice(i.from, i.to) !== i.found) continue
      text = text.slice(0, i.from) + i.fix + text.slice(i.to)
      done++
    }
    f.text = text
  }
  return done
}

export const fixable = (list: DialogueIssue[]) => list.filter(i => i.fix != null)

export function countByCode(list: DialogueIssue[]): Record<string, number> {
  const out: Record<string, number> = {}
  for (const i of list) out[i.code] = (out[i.code] ?? 0) + 1
  return out
}
