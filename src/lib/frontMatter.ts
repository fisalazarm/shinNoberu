// Preliminares y cortesía: portadilla, portada interior, créditos, dedicatoria
// y colofón.
//
// Son las páginas que distinguen un libro maquetado de un documento exportado,
// y las que nadie escribe a mano porque todas dicen casi lo mismo. Se generan
// con lo que ya está en los metadatos.
//
// Van al principio del orden de lectura y en el orden de siempre: portadilla,
// portada, créditos, dedicatoria. El colofón va al final.
//
// Se apuntan en los «landmarks» del índice, que es donde un lector busca la
// página de créditos, pero no en la lista del índice: nadie quiere un índice
// que empiece por «Portadilla».

import {
  addToOpf, dirname, parseManifest, relativePath, resolvePath, spinePaths, type EpubBook,
} from './epub'
import { readMetadata } from './metadata'
import { navItemPath } from './structure'

export type PieceId = 'portadilla' | 'portada' | 'creditos' | 'dedicatoria' | 'colofon'

export interface Piece {
  id: PieceId
  /** Cómo se llama en el diálogo. */
  label: string
  /** Para qué sirve, en una línea. */
  about: string
  file: string
  /** Tipo que entiende un lector de EPUB, para los landmarks. */
  epubType: string
  /** Al final del libro en vez de al principio. */
  atEnd?: boolean
}

export const PIECES: Piece[] = [
  {
    id: 'portadilla',
    label: 'Portadilla',
    about: 'Solo el título, en una página suelta. Es lo primero que se abre.',
    file: 'Portadilla.xhtml',
    epubType: 'frontmatter',
  },
  {
    id: 'portada',
    label: 'Portada interior',
    about: 'Título, autor y editorial. La portada de dentro, no la imagen de fuera.',
    file: 'Portada.xhtml',
    epubType: 'titlepage',
  },
  {
    id: 'creditos',
    label: 'Página de créditos',
    about: 'Copyright, ISBN, editorial y la reserva de derechos.',
    file: 'Creditos.xhtml',
    epubType: 'copyright-page',
  },
  {
    id: 'dedicatoria',
    label: 'Dedicatoria',
    about: 'Una línea, centrada y en cursiva, en su propia página.',
    file: 'Dedicatoria.xhtml',
    epubType: 'dedication',
  },
  {
    id: 'colofon',
    label: 'Colofón',
    about: 'La nota del final: cuándo se terminó el libro y con qué se compuso.',
    file: 'Colofon.xhtml',
    epubType: 'colophon',
    atEnd: true,
  },
]

export interface FrontMatterText {
  title: string
  author: string
  publisher: string
  year: string
  isbn: string
  dedication: string
  colophon: string
}

const escape = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

/** Lo que se puede rellenar solo, sacado de los metadatos del libro. */
export function suggestText(book: EpubBook): FrontMatterText {
  const m = readMetadata(book)
  const year = (m.date || '').slice(0, 4) || String(new Date().getFullYear())
  return {
    title: m.title || 'Título del libro',
    author: m.creator || 'Autor',
    publisher: m.publisher || '',
    year,
    isbn: m.isbn || '',
    dedication: '',
    colophon: `Este libro se terminó de componer en ${year}.`,
  }
}

function page(title: string, cssHref: string | undefined, epubType: string, body: string): string {
  const link = cssHref ? `\n  <link href="${cssHref}" rel="stylesheet" type="text/css"/>` : ''
  return `<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">
<head>
  <title>${escape(title)}</title>${link}
</head>
<body epub:type="${epubType}" class="cortesia">
${body}
</body>
</html>
`
}

/** El XHTML de una pieza, ya relleno. */
export function renderPiece(piece: Piece, t: FrontMatterText, cssHref?: string): string {
  const title = escape(t.title)
  const author = escape(t.author)
  const publisher = escape(t.publisher)

  switch (piece.id) {
    case 'portadilla':
      return page(t.title, cssHref, piece.epubType, `  <h1 class="portadilla">${title}</h1>`)

    case 'portada':
      return page(t.title, cssHref, piece.epubType, [
        `  <h1 class="titulo">${title}</h1>`,
        `  <p class="autor">${author}</p>`,
        publisher ? `  <p class="editorial">${publisher}</p>` : '',
      ].filter(Boolean).join('\n'))

    case 'creditos':
      return page('Créditos', cssHref, piece.epubType, [
        `  <p class="credito">© ${escape(t.year)} ${author}</p>`,
        publisher ? `  <p class="credito">© ${escape(t.year)} ${publisher}</p>` : '',
        t.isbn ? `  <p class="credito">ISBN: ${escape(t.isbn)}</p>` : '',
        '  <p class="credito">Todos los derechos reservados. Queda prohibida la reproducción total o parcial de esta obra por cualquier medio sin autorización escrita de los titulares del copyright.</p>',
      ].filter(Boolean).join('\n'))

    case 'dedicatoria':
      return page('Dedicatoria', cssHref, piece.epubType,
        `  <p class="dedicatoria">${escape(t.dedication)}</p>`)

    case 'colofon':
      return page('Colofón', cssHref, piece.epubType,
        `  <p class="colofon">${escape(t.colophon)}</p>`)
  }
}

/** El CSS de las páginas de cortesía, para añadirlo a la hoja del libro. */
export const CORTESIA_CSS = `body.cortesia {
  display: flex;
  flex-direction: column;
  justify-content: center;
  min-height: 90vh;
  text-align: center;
  hyphens: none;
}

body.cortesia p, body.cortesia h1 { text-indent: 0; }

h1.portadilla, h1.titulo {
  margin: 0 0 0.6em;
  font-size: 1.9em;
  font-weight: 400;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  page-break-before: avoid;
}

p.autor { margin: 0.4em 0 0; font-size: 1.1em; letter-spacing: 0.04em; }
p.editorial { margin-top: 2.4em; font-size: 0.85em; letter-spacing: 0.1em; text-transform: uppercase; }

p.credito { margin: 0.5em 0; font-size: 0.8em; line-height: 1.5; text-align: center; }

p.dedicatoria { font-style: italic; font-size: 1.05em; }

p.colofon { font-size: 0.85em; font-style: italic; letter-spacing: 0.03em; }
`

const MARK = '/* === páginas de cortesía (las gestiona el editor) === */'

/** Añade el CSS una sola vez: volver a generar no debe duplicarlo. */
export function ensureCss(book: EpubBook, sheet: string | null) {
  if (!sheet) return
  const css = book.files.get(sheet)
  if (css?.text == null || css.text.includes(MARK)) return
  css.text = `${css.text.replace(/\s*$/, '\n\n')}${MARK}\n\n${CORTESIA_CSS}`
}

export interface FrontMatterResult {
  created: string[]
  skipped: string[]
}

/** Dónde dejar los archivos: junto a los capítulos. */
function folderFor(book: EpubBook): string {
  const first = spinePaths(book)[0]
  return first ? dirname(first) : dirname(book.opfPath)
}

/** La hoja de estilos que enlazan los capítulos, si la hay. */
function cssFor(book: EpubBook): string | null {
  const first = spinePaths(book)[0]
  const text = first ? book.files.get(first)?.text : undefined
  const href = text?.match(/<link\b[^>]*href\s*=\s*"([^"]+\.css)"/i)?.[1]
  if (!href || !first) return null
  const path = resolvePath(first, href)
  return book.files.has(path) ? path : null
}

/** Mete la entrada en los landmarks del índice, sin tocar la lista del toc. */
export function addLandmark(book: EpubBook, path: string, epubType: string, label: string) {
  const navPath = navItemPath(book)
  if (!navPath) return
  const nav = book.files.get(navPath)
  if (nav?.text == null) return
  const start = nav.text.indexOf('epub:type="landmarks"')
  if (start < 0) return
  const end = nav.text.indexOf('</nav>', start)
  const olEnd = end < 0 ? -1 : nav.text.lastIndexOf('</ol>', end)
  if (olEnd < 0) return

  const href = relativePath(navPath!, path)
  if (nav.text.slice(start, end).includes(`href="${href}"`)) return
  const li = `  <li><a epub:type="${epubType}" href="${href}">${escape(label)}</a></li>\n    `
  nav.text = nav.text.slice(0, olEnd) + li + nav.text.slice(olEnd)
}

/**
 * Crea las piezas elegidas. Las que ya existen se dejan como están: volver a
 * entrar al diálogo no debe pisar lo que el autor haya retocado a mano.
 */
export function addFrontMatter(
  book: EpubBook,
  ids: PieceId[],
  text: FrontMatterText,
): FrontMatterResult {
  const dir = folderFor(book)
  const sheet = cssFor(book)
  const created: string[] = []
  const skipped: string[] = []

  // Al principio en orden, así que cada una se inserta detrás de la anterior.
  let after: string | undefined
  const chosen = PIECES.filter(p => ids.includes(p.id))

  for (const piece of chosen) {
    const path = `${dir}/${piece.file}`
    if (book.files.has(path)) {
      skipped.push(path)
      if (!piece.atEnd) after = path
      continue
    }

    book.files.set(path, {
      path,
      mediaType: 'application/xhtml+xml',
      text: renderPiece(piece, text, sheet ? relativePath(path, sheet) : undefined),
    })

    if (piece.atEnd) {
      addToOpf(book, path) // sin spineAfter se va al final, que es su sitio
    } else {
      // La primera no tiene detrás de quién ir: se coloca y se sube al frente.
      addToOpf(book, path, { spineAfter: after })
      if (!after) moveToFront(book, path)
      after = path
    }

    addLandmark(book, path, piece.epubType, piece.label)
    created.push(path)
  }

  ensureCss(book, sheet)
  return { created, skipped }
}

/** Lleva un itemref al principio del spine. */
function moveToFront(book: EpubBook, path: string) {
  const opf = book.files.get(book.opfPath)
  if (!opf?.text) return
  const id = parseManifest(book).find(i => i.path === path)?.id
  if (!id) return

  const ref = new RegExp(`\\s*<itemref\\b[^>]*idref="${escapeRe(id)}"[^>]*/>`)
  if (!ref.test(opf.text)) return
  opf.text = opf.text
    .replace(ref, '')
    .replace(/(<spine\b[^>]*>)/, `$1\n    <itemref idref="${id}"/>`)
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
