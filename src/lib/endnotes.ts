// Notas al final: pasar las notas al pie de cada capítulo a un capítulo de
// notas al final del libro, y la vuelta.
//
// En una traducción con muchas N. del T., las notas al pie interrumpen la
// lectura en cada página; juntas al final, el lector va cuando quiere. Lo
// delicado no es mover el texto sino que los enlaces sigan funcionando en los
// dos sentidos y que la numeración sea una sola para todo el libro.
//
// La página de notas la gestiona el editor (clase `notas-al-final` en el
// body). Convertir dos veces no duplica nada: antes de volver a juntarlas, se
// devuelven a su sitio y se numeran de nuevo desde el principio.

import {
  addToOpf, dirname, relativePath, removeFromOpf, resolvePath, spinePaths, type EpubBook,
} from './epub'
import { navItemPath } from './structure'

export const NOTES_FILE = 'Notas.xhtml'
export const NOTES_CLASS = 'notas-al-final'
const NOTES_TITLE = 'Notas'

const CALL = /<a\b[^>]*\bepub:type\s*=\s*"noteref"[^>]*>[\s\S]*?<\/a>/gi
const ASIDE = /[ \t]*<aside\b[^>]*\bepub:type\s*=\s*"footnote"[^>]*>([\s\S]*?)<\/aside>[ \t]*\n?/gi
/** El enlace de vuelta con el que empieza el texto de una nota: «[3]». */
const BACKLINK = /<a\b[^>]*href\s*=\s*"[^"]*#[^"]*"[^>]*>\s*\[?\s*\d+\s*\]?\s*<\/a>\s*/i

const attr = (tag: string, name: string) =>
  tag.match(new RegExp(`\\b${name}\\s*=\\s*"([^"]*)"`, 'i'))?.[1] ?? ''

const isNotesPage = (text: string | undefined) =>
  !!text && new RegExp(`<body\\b[^>]*class\\s*=\\s*"[^"]*\\b${NOTES_CLASS}\\b`, 'i').test(text)
const isCourtesy = (text: string) => /<body\b[^>]*class\s*=\s*"[^"]*\bcortesia\b/i.test(text)

/** La página de notas al final que gestiona el editor, si la hay. */
export function notesPagePath(book: EpubBook): string | null {
  for (const path of spinePaths(book)) {
    if (isNotesPage(book.files.get(path)?.text)) return path
  }
  return null
}

/** Capítulos que pueden llevar notas: ni el nav, ni la página de notas. */
function chapters(book: EpubBook): string[] {
  const nav = navItemPath(book)
  return spinePaths(book).filter(p => {
    const text = book.files.get(p)?.text
    return p !== nav && text != null && !isNotesPage(text)
  })
}

/** El texto de una nota, sin el enlace de vuelta del principio. */
function noteBody(inner: string): string {
  const paragraphs = [...inner.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/gi)].map(m => m[1].trim())
  const parts = paragraphs.length ? paragraphs : [inner.trim()]
  parts[0] = parts[0].replace(BACKLINK, '').trim()
  return parts.filter(Boolean).map(p => `<p>${p}</p>`).join('')
}

/** Notas al pie del libro, contando solo las que tienen llamada y texto. */
export function countFootnotes(book: EpubBook): number {
  let n = 0
  for (const path of chapters(book)) {
    const text = book.files.get(path)!.text!
    const ids = new Set([...text.matchAll(ASIDE)].map(m => attr(m[0], 'id')))
    for (const m of text.matchAll(CALL)) {
      const href = attr(m[0], 'href')
      if (href.startsWith('#') && ids.has(href.slice(1))) n++
    }
  }
  return n
}

/** Cuántas notas hay en la página de notas al final. */
export function countEndnotes(book: EpubBook): number {
  const path = notesPagePath(book)
  const text = path ? book.files.get(path)?.text : undefined
  return text ? [...text.matchAll(/<li\b[^>]*epub:type\s*=\s*"endnote"/gi)].length : 0
}

export const NOTES_CSS = `body.${NOTES_CLASS} h1 { text-align: center; margin: 1.5em 0 1.2em; }
body.${NOTES_CLASS} ol { list-style: none; margin: 0; padding: 0; }
body.${NOTES_CLASS} li { margin: 0.7em 0; font-size: 0.9em; }
body.${NOTES_CLASS} li p { text-indent: 0; margin: 0 0 0.3em; }
`

const MARK = '/* === notas al final (las gestiona el editor) === */'

function sheetOf(book: EpubBook, paths: string[]): string | null {
  for (const path of paths) {
    const href = book.files.get(path)?.text?.match(/<link\b[^>]*href\s*=\s*"([^"]+\.css)"/i)?.[1]
    if (!href) continue
    const css = resolvePath(path, href)
    if (book.files.has(css)) return css
  }
  return null
}

function ensureCss(book: EpubBook, sheet: string | null) {
  if (!sheet) return
  const css = book.files.get(sheet)
  if (css?.text == null || css.text.includes(MARK)) return
  css.text = `${css.text.replace(/\s*$/, '\n\n')}${MARK}\n\n${NOTES_CSS}`
}

interface Entry {
  n: number
  from: string
  body: string
}

function renderNotesPage(entries: Entry[], at: string, cssHref?: string): string {
  const link = cssHref ? `\n  <link href="${cssHref}" rel="stylesheet" type="text/css"/>` : ''
  const items = entries.map(e => {
    const back = `<a href="${relativePath(at, e.from)}#ref${e.n}" role="doc-backlink">[${e.n}]</a>`
    // El enlace de vuelta va al principio del primer párrafo, como en las notas al pie.
    const body = e.body.replace(/^<p>/, `<p>${back} `)
    return `      <li id="nota${e.n}" epub:type="endnote" role="doc-endnote">${body}</li>`
  }).join('\n')

  return `<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="es" lang="es">
<head>
  <title>${NOTES_TITLE}</title>${link}
</head>
<body class="${NOTES_CLASS}">
  <section epub:type="endnotes" role="doc-endnotes">
    <h1>${NOTES_TITLE}</h1>
    <ol>
${items}
    </ol>
  </section>
</body>
</html>
`
}

export interface ConvertResult {
  notes: number
  /** La página de notas, en la conversión hacia el final. */
  path?: string
}

/**
 * Junta todas las notas al pie en una página de notas al final, numeradas en
 * el orden en que aparecen al leer. Devuelve null si no hay ninguna.
 */
export function toEndnotes(book: EpubBook): ConvertResult | null {
  // Si ya había página, se devuelven primero a su sitio: así la numeración
  // sale entera de nuevo y no se mezclan dos tandas.
  if (notesPagePath(book)) toFootnotes(book)
  if (!countFootnotes(book)) return null

  const list = chapters(book)
  const last = [...list].reverse().find(p => !isCourtesy(book.files.get(p)!.text!)) ?? list.at(-1)
  const dir = last ? dirname(last) : dirname(book.opfPath)
  let path = `${dir}/${NOTES_FILE}`
  for (let k = 2; book.files.has(path); k++) path = `${dir}/Notas-${k}.xhtml`

  const entries: Entry[] = []
  let n = 0

  for (const chapter of list) {
    const f = book.files.get(chapter)!
    const text = f.text!
    const asides = new Map<string, string>()
    for (const m of text.matchAll(ASIDE)) asides.set(attr(m[0], 'id'), noteBody(m[1]))

    const moved = new Set<string>()
    let out = text.replace(CALL, call => {
      const href = attr(call, 'href')
      const id = href.startsWith('#') ? href.slice(1) : ''
      const body = asides.get(id)
      if (!id || body == null) return call // una llamada sin nota se deja como está
      n++
      moved.add(id)
      entries.push({ n, from: chapter, body })
      const to = relativePath(chapter, path)
      return `<a class="nota" epub:type="noteref" href="${to}#nota${n}" id="ref${n}" role="doc-noteref">[${n}]</a>`
    })
    out = out.replace(ASIDE, (whole) => (moved.has(attr(whole, 'id')) ? '' : whole))
    f.text = out
  }

  const sheet = sheetOf(book, list)
  book.files.set(path, {
    path,
    mediaType: 'application/xhtml+xml',
    text: renderNotesPage(entries, path, sheet ? relativePath(path, sheet) : undefined),
  })
  addToOpf(book, path, { spineAfter: last })
  ensureCss(book, sheet)

  return { notes: entries.length, path }
}

/** Dónde acaba el cuerpo del capítulo: antes de `</section>`, o de `</body>`. */
function bodyEnd(doc: string): number {
  for (const tag of ['</section>', '</body>']) {
    const i = doc.lastIndexOf(tag)
    if (i >= 0) return i
  }
  return doc.length
}

/**
 * Devuelve cada nota al final del capítulo que la llama, numeradas de nuevo
 * desde 1 en cada capítulo, que es como funcionan las notas al pie.
 */
export function toFootnotes(book: EpubBook): ConvertResult | null {
  const page = notesPagePath(book)
  if (!page) return null
  const pageText = book.files.get(page)!.text!

  const bodies = new Map<string, string>()
  for (const m of pageText.matchAll(/<li\b([^>]*)>([\s\S]*?)<\/li>/gi)) {
    const id = attr(m[1], 'id')
    if (id) bodies.set(id, noteBody(m[2]))
  }

  let total = 0
  for (const chapter of chapters(book)) {
    const f = book.files.get(chapter)!
    const asides: string[] = []
    let n = 0
    let out = f.text!.replace(CALL, call => {
      const href = attr(call, 'href')
      const [file, id] = href.split('#')
      if (!file || !id || resolvePath(chapter, file) !== page) return call
      const body = bodies.get(id)
      if (body == null) return call
      n++
      const back = `<a href="#ref${n}" role="doc-backlink">[${n}]</a>`
      asides.push(
        `  <aside class="nota-trad" epub:type="footnote" id="nota${n}" role="doc-footnote">\n` +
        `    ${body.replace(/^<p>/, `<p>${back} `)}\n` +
        '  </aside>\n',
      )
      return `<a class="nota" epub:type="noteref" href="#nota${n}" id="ref${n}" role="doc-noteref">[${n}]</a>`
    })
    if (!asides.length) continue
    const at = bodyEnd(out)
    const lineStart = out.lastIndexOf('\n', at - 1) + 1
    out = out.slice(0, lineStart) + asides.join('') + out.slice(lineStart)
    f.text = out
    total += asides.length
  }

  removeFromOpf(book, page)
  book.files.delete(page)
  return { notes: total }
}
