// Página de índice visible: un «Índice» dentro del libro, como una página más.
//
// El índice de navegación (el `nav`) existe en todos los EPUB 3, pero muchos
// lectores lo esconden en un menú y algunos ni lo enseñan. Una página con la
// lista de capítulos, enlazada y colocada tras los preliminares, es lo que el
// lector espera encontrarse al hojear, y lo que genera Sigil.
//
// La página la gestiona el editor: la marca es la clase `indice-visible` del
// `body`. Mientras esté puesta, la lista se rehace sola cuando cambian los
// capítulos. Si quieres editarla a mano, quita la clase y el editor la deja en
// paz.

import {
  addToOpf, dirname, parseManifest, relativePath, removeFromOpf, resolvePath, spinePaths,
  type EpubBook,
} from './epub'
import { titleOf } from './report'
import { addLandmark, escapeXml, navItemPath } from './structure'

export const TOC_FILE = 'Indice.xhtml'
export const TOC_CLASS = 'indice-visible'
const TOC_TITLE = 'Índice'

export interface TocLine {
  path: string
  title: string
}

const isManaged = (text: string | undefined) =>
  !!text && new RegExp(`<body\\b[^>]*class\\s*=\\s*"[^"]*\\b${TOC_CLASS}\\b`, 'i').test(text)

/** La página de índice que gestiona el editor, si el libro la tiene. */
export function visibleTocPath(book: EpubBook): string | null {
  for (const path of spinePaths(book)) {
    if (isManaged(book.files.get(path)?.text)) return path
  }
  return null
}

/** Las páginas de cortesía no son capítulos: no van en el índice. */
const isCourtesy = (text: string) => /<body\b[^>]*class\s*=\s*"[^"]*\bcortesia\b/i.test(text)

/** Los capítulos en orden de lectura, con el título que se ve en cada uno. */
export function tocLines(book: EpubBook): TocLine[] {
  const nav = navItemPath(book)
  const out: TocLine[] = []
  for (const path of spinePaths(book)) {
    if (path === nav) continue
    const text = book.files.get(path)?.text
    if (text == null || isManaged(text) || isCourtesy(text)) continue
    out.push({ path, title: titleOf(text, path) })
  }
  return out
}

/** El XHTML de la página, con enlaces relativos a donde vive. */
export function renderVisibleToc(lines: TocLine[], at: string, cssHref?: string): string {
  const link = cssHref ? `\n  <link href="${cssHref}" rel="stylesheet" type="text/css"/>` : ''
  const items = lines
    .map(l => `      <li><a href="${relativePath(at, l.path)}">${escapeXml(l.title)}</a></li>`)
    .join('\n')
  return `<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="es" lang="es">
<head>
  <title>${TOC_TITLE}</title>${link}
</head>
<body class="${TOC_CLASS}">
  <!-- Esta página la rehace el editor cuando cambian los capítulos. Para
       editarla a mano, quita la clase «${TOC_CLASS}» del body. -->
  <section epub:type="toc" role="doc-toc">
    <h1>${TOC_TITLE}</h1>
    <ol>
${items}
    </ol>
  </section>
</body>
</html>
`
}

/**
 * La hoja de estilos que enlazan los capítulos. Se busca en todos, no solo en
 * el primero: un capítulo de apertura sin estilos no debe dejar la página de
 * índice sin ellos.
 */
function sheetOf(book: EpubBook): string | null {
  for (const { path } of tocLines(book)) {
    const href = book.files.get(path)?.text?.match(/<link\b[^>]*href\s*=\s*"([^"]+\.css)"/i)?.[1]
    if (!href) continue
    const css = resolvePath(path, href)
    if (book.files.has(css)) return css
  }
  return null
}

export const TOC_CSS = `body.${TOC_CLASS} h1 { text-align: center; margin: 1.5em 0 1.2em; }
body.${TOC_CLASS} ol { list-style: none; margin: 0; padding: 0; }
body.${TOC_CLASS} li { margin: 0.45em 0; text-indent: 0; }
body.${TOC_CLASS} a { text-decoration: none; color: inherit; }
`

const MARK = '/* === página de índice (la gestiona el editor) === */'

function ensureCss(book: EpubBook, sheet: string | null) {
  if (!sheet) return
  const css = book.files.get(sheet)
  if (css?.text == null || css.text.includes(MARK)) return
  css.text = `${css.text.replace(/\s*$/, '\n\n')}${MARK}\n\n${TOC_CSS}`
}

/**
 * Dónde va la página: detrás de la última página de cortesía, o al principio
 * si el libro no tiene preliminares. Devuelve el capítulo tras el que va, o
 * `undefined` si va la primera.
 */
function slotFor(book: EpubBook): string | undefined {
  let last: string | undefined
  for (const path of spinePaths(book)) {
    const text = book.files.get(path)?.text ?? ''
    if (isCourtesy(text)) last = path
  }
  return last
}

/** Lleva un itemref al principio del spine. */
function moveToFront(book: EpubBook, path: string) {
  const opf = book.files.get(book.opfPath)
  const id = parseManifest(book).find(i => i.path === path)?.id
  if (!opf?.text || !id) return
  const ref = new RegExp(`\\s*<itemref\\b[^>]*idref="${id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"[^>]*/>`)
  if (!ref.test(opf.text)) return
  opf.text = opf.text.replace(ref, '').replace(/(<spine\b[^>]*>)/, `$1\n    <itemref idref="${id}"/>`)
}

export interface CreateResult {
  path: string
  /** Falso si ya existía y solo se rehízo. */
  created: boolean
  entries: number
}

/** Crea la página (o la rehace si ya estaba) y la apunta en los landmarks. */
export function createVisibleToc(book: EpubBook): CreateResult {
  const existing = visibleTocPath(book)
  if (existing) {
    refreshVisibleToc(book)
    return { path: existing, created: false, entries: tocLines(book).length }
  }

  const lines = tocLines(book)
  const dir = lines[0] ? dirname(lines[0].path) : dirname(book.opfPath)
  let path = `${dir}/${TOC_FILE}`
  // Si ya hay un Indice.xhtml que no es nuestro, no se toca: se usa otro nombre.
  for (let n = 2; book.files.has(path); n++) path = `${dir}/Indice-${n}.xhtml`

  const sheet = sheetOf(book)
  book.files.set(path, {
    path,
    mediaType: 'application/xhtml+xml',
    text: renderVisibleToc(lines, path, sheet ? relativePath(path, sheet) : undefined),
  })

  const after = slotFor(book)
  addToOpf(book, path, { spineAfter: after })
  if (!after) moveToFront(book, path)
  addLandmark(book, 'toc', path, TOC_TITLE)
  ensureCss(book, sheet)

  return { path, created: true, entries: lines.length }
}

/**
 * Rehace la lista si los capítulos cambiaron. Devuelve si escribió algo:
 * cuando no hay nada que cambiar no se toca el archivo, para no marcar el
 * libro como modificado a cada tecla.
 */
export function refreshVisibleToc(book: EpubBook): boolean {
  const path = visibleTocPath(book)
  if (!path) return false
  const f = book.files.get(path)!
  const sheet = sheetOf(book)
  const next = renderVisibleToc(tocLines(book), path, sheet ? relativePath(path, sheet) : undefined)
  if (f.text === next) return false
  f.text = next
  return true
}

/** ¿La página dice lo que hay de verdad en el libro? */
export function isStale(book: EpubBook): boolean {
  const path = visibleTocPath(book)
  if (!path) return false
  const sheet = sheetOf(book)
  const next = renderVisibleToc(tocLines(book), path, sheet ? relativePath(path, sheet) : undefined)
  return book.files.get(path)?.text !== next
}

/** Quita la página, su entrada en los landmarks y su sitio en el OPF. */
export function removeVisibleToc(book: EpubBook): boolean {
  const path = visibleTocPath(book)
  if (!path) return false

  const navPath = navItemPath(book)
  const nav = navPath ? book.files.get(navPath) : undefined
  if (nav?.text && navPath) {
    const href = relativePath(navPath, path).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    nav.text = nav.text.replace(new RegExp(`\\s*<li>\\s*<a[^>]*href="${href}"[^>]*>[\\s\\S]*?</li>`, 'i'), '')
  }
  removeFromOpf(book, path)
  book.files.delete(path)
  return true
}
