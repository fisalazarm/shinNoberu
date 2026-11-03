// Snippets que se numeran solos.
//
// Un snippet de llamada a nota lleva el número escrito a mano, así que había
// que cambiarlo cada vez y era fácil repetir uno. Con `{}` en su lugar, el
// editor pone el que toca:
//
//   <a href="notas.xhtml#nt{}" id="rf{}"><sup>❮{}❯</sup></a>
//   → con la nota 3: <a href="notas.xhtml#nt3" id="rf3"><sup>❮03❯</sup></a>
//
// Dentro de `<sup>` el número va con dos cifras (03), que es como se ve la
// llamada en el texto; en los enlaces y los ids va tal cual (3). Si hace falta
// otra cosa, `{n}` es siempre el número solo y `{nn}` siempre con dos cifras.
//
// Qué número toca depende de lo que haga el snippet, y se deduce del propio
// libro sin tener que decírselo:
//
// - Si el libro ya enlaza a un id que el snippet crea y que todavía no existe
//   —una llamada `#nt3` sin su `<p id="nt3">`—, toca ese: es la nota que falta
//   por escribir. Así funciona el snippet del texto de la nota.
// - Si no, la más alta del libro más uno. Así funciona el de la llamada.
//
// La numeración es de todo el libro: todas las notas van al mismo archivo de
// notas, así que dos capítulos no pueden repetir número.

import { spinePaths, type EpubBook } from './epub'
import type { Snippet } from './snippets'

const SLOT = /\{(?:n|nn)?\}/

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

export const pad = (n: number) => String(n).padStart(2, '0')

/** Todo el texto de un snippet, para buscar en él de una vez. */
export const snippetText = (s: Snippet): string =>
  [s.insert ?? '', s.wrap?.[0] ?? '', s.wrap?.[1] ?? ''].join(' ')

/** ¿El snippet tiene algún hueco para el número? */
export const hasSlots = (s: Snippet): boolean => SLOT.test(snippetText(s))

/**
 * Los prefijos que el snippet numera en sus ids y anclas: en el ejemplo, `nt`
 * (de `#nt{}`) y `rf` (de `id="rf{}"`). Son los que hay que buscar en el libro
 * para saber por qué número va.
 */
export function slotPrefixes(text: string): string[] {
  const out = new Set<string>()
  for (const m of text.matchAll(/(?:\bid\s*=\s*"|#)([\w-]*?)\{(?:n|nn)?\}/g)) out.add(m[1])
  return [...out]
}

/** Solo los que el snippet crea como id: `id="nt{}"` → `nt`. */
export function definedPrefixes(text: string): string[] {
  const out = new Set<string>()
  for (const m of text.matchAll(/\bid\s*=\s*"([\w-]*?)\{(?:n|nn)?\}/g)) out.add(m[1])
  return [...out]
}

/** El número más alto que ya usa el libro con esos prefijos, o 0. */
export function lastNumber(book: EpubBook, prefixes: string[]): number {
  if (!prefixes.length) return 0
  const alt = prefixes.map(escapeRe).join('|')
  // El número tiene que acabar en la comilla: así «nt3» no se confunde con «nt3b».
  const re = new RegExp(`(?:\\bid\\s*=\\s*"|#)(?:${alt})(\\d+)"`, 'g')
  let max = 0
  for (const f of book.files.values()) {
    if (f.text == null) continue
    for (const m of f.text.matchAll(re)) max = Math.max(max, Number(m[1]))
  }
  return max
}

/** Los archivos de texto en orden de lectura; los que no están en él, detrás. */
function readingOrder(book: EpubBook): string[] {
  const spine = spinePaths(book)
  const rest = [...book.files.values()]
    .filter(f => f.text != null && !spine.includes(f.path))
    .map(f => f.path)
  return [...spine, ...rest]
}

export interface NumberChoice {
  n: number
  /** Si es una nota pendiente: el archivo donde está su llamada. */
  from?: string
}

/**
 * El número que le toca al snippet. Primero la nota pendiente más temprana en
 * orden de lectura; si no hay ninguna, la más alta más uno.
 */
export function chooseNumber(book: EpubBook, text: string): NumberChoice {
  const defined = definedPrefixes(text)
  if (defined.length) {
    const alt = defined.map(escapeRe).join('|')
    const ids = new RegExp(`\\bid\\s*=\\s*"(?:${alt})(\\d+)"`, 'g')
    const refs = new RegExp(`#(?:${alt})(\\d+)"`, 'g')

    const existing = new Set<number>()
    for (const f of book.files.values()) {
      if (f.text == null) continue
      for (const m of f.text.matchAll(ids)) existing.add(Number(m[1]))
    }
    for (const path of readingOrder(book)) {
      const text = book.files.get(path)?.text
      if (text == null) continue
      for (const m of text.matchAll(refs)) {
        const n = Number(m[1])
        if (!existing.has(n)) return { n, from: path }
      }
    }
  }
  return { n: lastNumber(book, slotPrefixes(text)) + 1 }
}

/** Pone el número en los huecos: con dos cifras dentro de `<sup>`, solo fuera. */
export function fillSlots(text: string, n: number): string {
  return text
    .replace(/<sup\b[^>]*>[\s\S]*?<\/sup>/gi, sup => sup.replace(/\{\}/g, pad(n)))
    .replace(/\{nn\}/g, pad(n))
    .replace(/\{n?\}/g, String(n))
}

/** Separador para rellenar apertura y cierre a la vez: no puede salir en un snippet. */
export const CUT = String.fromCharCode(0)

/** Aplica una transformación al texto de un snippet, apertura y cierre juntos. */
export function mapSnippet(s: Snippet, f: (text: string) => string): Snippet {
  if (s.wrap) {
    // Apertura y cierre juntos: un <sup> puede abrirse en uno y cerrarse en el otro.
    const [open, close] = f(s.wrap[0] + CUT + s.wrap[1]).split(CUT)
    return { ...s, wrap: [open, close] }
  }
  return { ...s, insert: f(s.insert ?? '') }
}

/**
 * El snippet listo para insertar, con el número que toca. Si no tiene huecos
 * se devuelve tal cual.
 */
export function numberSnippet(s: Snippet, book: EpubBook): Snippet {
  if (!hasSlots(s)) return s
  const { n } = chooseNumber(book, snippetText(s))
  return mapSnippet(s, t => fillSlots(t, n))
}
