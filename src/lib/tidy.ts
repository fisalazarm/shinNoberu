// Limpieza tipográfica del texto de un capítulo.
//
// Todo pasa por `textRanges`: lo que hay dentro de `<…>` no se toca nunca. Un
// reemplazo de comillas que entrara en los atributos dejaría el libro ilegible,
// que es justo lo que ya aprendimos con buscar y reemplazar.

import { textRanges } from './searchBook'
import type { EpubBook } from './epub'

export interface TidyOptions {
  /** Comillas rectas a latinas: "hola" → «hola». */
  quotes: boolean
  /** Guion de apertura de diálogo a raya: "- Hola" → "—Hola". */
  dashes: boolean
  /** Dos o más espacios seguidos, uno. */
  doubleSpaces: boolean
  /** Espacios raros colados del PDF, espacios normales. */
  hardSpaces: boolean
  /** Tres puntos a puntos suspensivos. */
  ellipsis: boolean
  /** Espacios al final de la línea. */
  trailing: boolean
}

export const defaultTidyOptions: TidyOptions = {
  quotes: true,
  dashes: true,
  doubleSpaces: true,
  hardSpaces: true,
  ellipsis: true,
  trailing: true,
}

/** Todas activas: sirve para contar lo que hay aunque esté desmarcado. */
export const allTidyRules: TidyOptions = {
  quotes: true,
  dashes: true,
  doubleSpaces: true,
  hardSpaces: true,
  ellipsis: true,
  trailing: true,
}

/** Ninguna activa, para encender solo una. */
export const noTidyRules: TidyOptions = {
  quotes: false,
  dashes: false,
  doubleSpaces: false,
  hardSpaces: false,
  ellipsis: false,
  trailing: false,
}

export interface TidyChange {
  from: number
  to: number
  before: string
  after: string
  rule: keyof TidyOptions
}

export const RULE_LABELS: Record<keyof TidyOptions, string> = {
  quotes: 'Comillas rectas → «latinas»',
  dashes: 'Guion de diálogo → raya',
  doubleSpaces: 'Espacios dobles',
  hardSpaces: 'Espacios raros',
  ellipsis: 'Puntos suspensivos',
  trailing: 'Espacios al final de línea',
}

/**
 * Espacios que un PDF cuela y que no se distinguen a ojo del normal: duro,
 * duro estrecho, fino, en y em. Se construyen desde el código para que no
 * queden caracteres invisibles sueltos en el fuente.
 */
const ODD_SPACE_CODES = [0x00a0, 0x202f, 0x2009, 0x2002, 0x2003]
const ODD_SPACES = ODD_SPACE_CODES.map(c => String.fromCodePoint(c)).join('')
const ODD_SPACE_RE = new RegExp(`[${ODD_SPACES}]`, 'g')

interface Rule {
  id: keyof TidyOptions
  re: RegExp
  /** `slice` es el tramo de texto y `m.index` va referido a él. */
  to: (m: RegExpExecArray, slice: string) => string | null
}

/**
 * Abre comilla si antes hay un hueco o algo que abre; si no, cierra. Al
 * principio del tramo también abre: lo anterior es una etiqueta.
 */
const opensQuote = (prev: string) => !prev || /[\s([¿¡—–-]/.test(prev)

// El orden importa: cuando dos reglas pillan el mismo sitio gana la primera.
// Por eso «espacios al final» va antes que «espacios dobles»: en "uno  \n"
// queremos que desaparezcan los dos, no que quede uno.
const RULES: Rule[] = [
  {
    id: 'quotes',
    re: /"/g,
    to: (m, slice) => (opensQuote(m.index === 0 ? '' : slice[m.index - 1]) ? '«' : '»'),
  },
  {
    // Solo al principio de línea: en mitad de una frase un guion suele ser
    // un guion de verdad.
    id: 'dashes',
    re: /(^|\n)([ \t]*)(--|[-–])(\s*)(?=\S)/g,
    to: m => `${m[1]}${m[2]}—`,
  },
  { id: 'trailing', re: /[ \t]+(?=\n)/g, to: () => '' },
  {
    // Pide algo delante en la misma línea, porque si no se comería la sangría
    // del XHTML (entre dos etiquetas también hay texto), y descarta los que
    // van al final de la línea, que son cosa de la regla anterior.
    //
    // Va en lookbehind y no en grupo para no tragarse ese carácter: si lo
    // hiciera, un «"a"  b» chocaría con la regla de las comillas y una de las
    // dos se quedaría sin aplicar.
    id: 'doubleSpaces',
    re: /(?<=\S) {2,}(?![ \t]*\n)/g,
    to: () => ' ',
  },
  { id: 'hardSpaces', re: ODD_SPACE_RE, to: () => ' ' },
  { id: 'ellipsis', re: /\.{3,}/g, to: () => '…' },
]

/** Los cambios que haría la limpieza, sin tocar nada. */
export function tidyChanges(text: string, o: TidyOptions): TidyChange[] {
  const out: TidyChange[] = []

  for (const [start, end] of textRanges(text)) {
    const slice = text.slice(start, end)
    for (const rule of RULES) {
      if (!o[rule.id]) continue
      rule.re.lastIndex = 0
      let m: RegExpExecArray | null
      while ((m = rule.re.exec(slice))) {
        const after = rule.to(m, slice)
        if (!m[0].length) rule.re.lastIndex++
        if (after == null || after === m[0]) continue
        const at = start + m.index
        out.push({ from: at, to: at + m[0].length, before: m[0], after, rule: rule.id })
      }
    }
  }

  // Dos reglas pueden pillar el mismo sitio; gana la de antes en RULES.
  const order = new Map(RULES.map((r, i) => [r.id, i]))
  out.sort((a, b) => a.from - b.from || order.get(a.rule)! - order.get(b.rule)! || b.to - a.to)
  const kept: TidyChange[] = []
  let last = -1
  for (const c of out) {
    if (c.from < last) continue
    kept.push(c)
    last = c.to
  }
  return kept
}

export function applyTidy(text: string, o: TidyOptions): string {
  let out = ''
  let prev = 0
  for (const c of tidyChanges(text, o)) {
    out += text.slice(prev, c.from) + c.after
    prev = c.to
  }
  return out + text.slice(prev)
}

/** Limpia un capítulo, o todos. Devuelve cuántos cambios hizo en cada archivo. */
export function tidyBook(
  book: EpubBook,
  o: TidyOptions,
  only?: string,
): { path: string; changes: number }[] {
  const out: { path: string; changes: number }[] = []
  for (const f of book.files.values()) {
    if (f.mediaType !== 'application/xhtml+xml' || f.text == null) continue
    if (only && f.path !== only) continue
    const n = tidyChanges(f.text, o).length
    if (!n) continue
    f.text = applyTidy(f.text, o)
    out.push({ path: f.path, changes: n })
  }
  return out
}

/** Un trozo de la línea alrededor del cambio, para enseñarlo en el diálogo. */
export function changeContext(text: string, c: TidyChange, pad = 28): { before: string; after: string } {
  const lineStart = text.lastIndexOf('\n', c.from - 1) + 1
  const nl = text.indexOf('\n', c.to)
  const lineEnd = nl < 0 ? text.length : nl
  const left = text.slice(Math.max(lineStart, c.from - pad), c.from)
  const right = text.slice(c.to, Math.min(lineEnd, c.to + pad))
  // Los espacios invisibles se marcan para poder verlos.
  const show = (s: string) => s.replace(ODD_SPACE_RE, '·')
  return {
    before: show(left + c.before + right),
    after: show(left + c.after + right),
  }
}
