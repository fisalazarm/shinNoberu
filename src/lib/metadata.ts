// Metadatos del libro (título, autor, idioma, saga, ISBN…) y portada.
//
// Se escribe EPUB 3: dc:* para lo básico y <meta property="…"> para los
// refinamientos. La única concesión a EPUB 2 es <meta name="cover">, que
// muchos lectores siguen necesitando para mostrar la miniatura.

import { addToOpf, dirname, parseManifest, relativePath, type EpubBook } from './epub'
import {
  appendPretty, createDc, createOpf, elText, kid, kids, metadataEl, nowIso,
  opfAttr, opfDoc, removePretty, writeOpf,
} from './opfDom'
import {
  addLandmark, moveSpineToFront, navItemPath, removeManifestProperty, setManifestProperty,
} from './structure'

export interface Metadata {
  title: string
  creator: string
  /** Nombre para ordenar en la biblioteca, p. ej. "Tolkien, J. R. R.". */
  fileAs: string
  language: string
  identifier: string
  isbn: string
  publisher: string
  date: string
  description: string
  /** Etiquetas separadas por comas. */
  subjects: string
  series: string
  seriesIndex: string
}

export const emptyMetadata: Metadata = {
  title: '', creator: '', fileAs: '', language: '', identifier: '', isbn: '',
  publisher: '', date: '', description: '', subjects: '', series: '', seriesIndex: '',
}

const metas = (md: Element) => kids(md, 'meta')
const byProperty = (md: Element, property: string) =>
  metas(md).find(m => m.getAttribute('property') === property) ?? null
const byName = (md: Element, name: string) =>
  metas(md).find(m => m.getAttribute('name') === name) ?? null
const refinement = (md: Element, id: string, property: string) =>
  metas(md).find(m => m.getAttribute('refines') === `#${id}` && m.getAttribute('property') === property) ?? null

// ---------- leer ----------

export function readMetadata(book: EpubBook): Metadata {
  const doc = opfDoc(book)
  const md = doc && metadataEl(doc)
  if (!doc || !md) return { ...emptyMetadata }

  const uid = doc.documentElement.getAttribute('unique-identifier') ?? ''
  const ids = kids(md, 'identifier')
  const main = ids.find(i => i.getAttribute('id') === uid) ?? ids[0] ?? null
  const isbnEl = ids.find(
    i => i !== main && (/isbn/i.test(i.getAttribute('id') ?? '') || /isbn/i.test(opfAttr(i, 'scheme')) || /isbn/i.test(elText(i))),
  )

  const creator = kid(md, 'creator')
  const creatorId = creator?.getAttribute('id') ?? ''
  const fileAs =
    (creatorId && elText(refinement(md, creatorId, 'file-as'))) || opfAttr(creator, 'file-as') || ''

  const coll = byProperty(md, 'belongs-to-collection')
  const collId = coll?.getAttribute('id') ?? ''
  const series = elText(coll) || byName(md, 'calibre:series')?.getAttribute('content') || ''
  const seriesIndex =
    (collId && elText(refinement(md, collId, 'group-position'))) ||
    byName(md, 'calibre:series_index')?.getAttribute('content') ||
    ''

  return {
    title: elText(kid(md, 'title')),
    creator: elText(creator),
    fileAs,
    language: elText(kid(md, 'language')),
    identifier: elText(main),
    isbn: elText(isbnEl ?? null).replace(/^urn:isbn:/i, ''),
    publisher: elText(kid(md, 'publisher')),
    date: elText(kid(md, 'date')).slice(0, 10),
    description: elText(kid(md, 'description')),
    subjects: kids(md, 'subject').map(elText).filter(Boolean).join(', '),
    series,
    seriesIndex,
  }
}

// ---------- escribir ----------

function setRefinement(doc: Document, md: Element, id: string, property: string, value: string) {
  const found = metas(md).filter(
    m => m.getAttribute('refines') === `#${id}` && m.getAttribute('property') === property,
  )
  if (!value) {
    found.forEach(removePretty)
    return
  }
  let el = found[0]
  if (!el) {
    el = createOpf(doc, 'meta')
    el.setAttribute('refines', `#${id}`)
    el.setAttribute('property', property)
    appendPretty(doc, md, el)
  }
  el.textContent = value
  found.slice(1).forEach(removePretty)
}

function setProperty(doc: Document, md: Element, property: string, value: string) {
  let el = byProperty(md, property)
  if (!el) {
    el = createOpf(doc, 'meta')
    el.setAttribute('property', property)
    appendPretty(doc, md, el)
  }
  el.textContent = value
}

export function writeMetadata(book: EpubBook, m: Metadata): boolean {
  const doc = opfDoc(book)
  const md = doc && metadataEl(doc)
  if (!doc || !md) return false

  const setDc = (local: string, value: string): Element | null => {
    const found = kids(md, local)
    if (!value) {
      found.forEach(removePretty)
      return null
    }
    let el = found[0]
    if (!el) {
      el = createDc(doc, local)
      appendPretty(doc, md, el)
    }
    el.textContent = value
    found.slice(1).forEach(removePretty)
    return el
  }

  setDc('title', m.title || 'Libro sin título')
  setDc('language', m.language || 'es')
  setDc('publisher', m.publisher)
  setDc('date', m.date)
  setDc('description', m.description)

  // Identificadores: el principal (unique-identifier) y el ISBN aparte.
  const uid = doc.documentElement.getAttribute('unique-identifier') || 'BookId'
  doc.documentElement.setAttribute('unique-identifier', uid)
  const ids = kids(md, 'identifier')
  let main = ids.find(i => i.getAttribute('id') === uid) ?? ids[0]
  if (!main) {
    main = createDc(doc, 'identifier')
    appendPretty(doc, md, main)
  }
  main.setAttribute('id', uid)
  main.textContent = m.identifier || `urn:uuid:${crypto.randomUUID()}`

  const isbnEls = ids.filter(
    i => i !== main && (/isbn/i.test(i.getAttribute('id') ?? '') || /isbn/i.test(elText(i))),
  )
  if (m.isbn.trim()) {
    let el = isbnEls[0]
    if (!el) {
      el = createDc(doc, 'identifier')
      appendPretty(doc, md, el)
    }
    el.setAttribute('id', 'isbn')
    el.textContent = `urn:isbn:${m.isbn.replace(/[^0-9Xx]/g, '')}`
    isbnEls.slice(1).forEach(removePretty)
  } else {
    isbnEls.forEach(removePretty)
  }

  // Autor, con nombre para ordenar y rol.
  const creator = setDc('creator', m.creator)
  if (creator) {
    const cid = creator.getAttribute('id') || 'creator'
    creator.setAttribute('id', cid)
    setRefinement(doc, md, cid, 'file-as', m.fileAs)
    if (!refinement(md, cid, 'role')) {
      const role = createOpf(doc, 'meta')
      role.setAttribute('refines', `#${cid}`)
      role.setAttribute('property', 'role')
      role.setAttribute('scheme', 'marc:relators')
      role.textContent = 'aut'
      appendPretty(doc, md, role)
    }
  }

  // Etiquetas.
  kids(md, 'subject').forEach(removePretty)
  for (const s of m.subjects.split(',').map(x => x.trim()).filter(Boolean)) {
    const el = createDc(doc, 'subject')
    el.textContent = s
    appendPretty(doc, md, el)
  }

  // Saga. Se escribe en EPUB 3 y se quitan los meta de Calibre para que no contradigan.
  const colls = metas(md).filter(x => x.getAttribute('property') === 'belongs-to-collection')
  if (m.series.trim()) {
    let el = colls[0]
    if (!el) {
      el = createOpf(doc, 'meta')
      el.setAttribute('property', 'belongs-to-collection')
      appendPretty(doc, md, el)
    }
    const sid = el.getAttribute('id') || 'serie'
    el.setAttribute('id', sid)
    el.textContent = m.series.trim()
    colls.slice(1).forEach(removePretty)
    setRefinement(doc, md, sid, 'collection-type', 'series')
    setRefinement(doc, md, sid, 'group-position', m.seriesIndex.trim())
  } else {
    for (const el of colls) {
      const sid = el.getAttribute('id')
      if (sid) {
        setRefinement(doc, md, sid, 'collection-type', '')
        setRefinement(doc, md, sid, 'group-position', '')
      }
      removePretty(el)
    }
  }
  metas(md)
    .filter(x => /^calibre:series/.test(x.getAttribute('name') ?? ''))
    .forEach(removePretty)

  setProperty(doc, md, 'dcterms:modified', nowIso())

  // Refinamientos que quedaron apuntando a un id que ya no existe.
  const known = new Set([...doc.documentElement.querySelectorAll('[id]')].map(e => e.getAttribute('id')))
  for (const x of metas(md)) {
    const r = x.getAttribute('refines')
    if (r?.startsWith('#') && !known.has(r.slice(1))) removePretty(x)
  }

  writeOpf(book, doc)
  return true
}

/** Actualiza dcterms:modified. Conviene llamarlo justo antes de guardar. */
export function touchModified(book: EpubBook) {
  const doc = opfDoc(book)
  const md = doc && metadataEl(doc)
  if (!doc || !md) return
  setProperty(doc, md, 'dcterms:modified', nowIso())
  writeOpf(book, doc)
}

// ---------- portada ----------

/** Imagen de portada declarada en el libro, si hay alguna. */
export function coverImagePath(book: EpubBook): string | undefined {
  const items = parseManifest(book)
  const byProp = items.find(i => i.properties?.split(/\s+/).includes('cover-image'))
  if (byProp) return byProp.path

  const doc = opfDoc(book)
  const md = doc && metadataEl(doc)
  const id = md ? byName(md, 'cover')?.getAttribute('content') : null
  const legacy = id && items.find(i => i.id === id)
  if (legacy) return legacy.path

  return items.find(i => i.mediaType.startsWith('image/') && /cover|portada/i.test(i.path))?.path
}

/**
 * Documento XHTML de portada, si existe.
 *
 * El nav queda fuera a propósito: lleva un landmark con epub:type="cover" que,
 * si no, lo haría pasar por la portada.
 */
export function coverDocPath(book: EpubBook): string | undefined {
  const navPath = navItemPath(book)
  const docs = [...book.files.values()].filter(
    f => f.mediaType === 'application/xhtml+xml' && f.path !== navPath,
  )
  return (
    docs.find(f => /epub:type\s*=\s*"[^"]*\bcover\b/.test(f.text ?? ''))?.path ??
    docs.find(f => /(^|\/)(cover|portada)\.x?html?$/i.test(f.path))?.path
  )
}

function coverXhtml(title: string, imgHref: string): string {
  return `<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="es" lang="es">
<head>
  <title>${title}</title>
  <style type="text/css">
    body { margin: 0; padding: 0; text-align: center; }
    .portada { margin: 0; padding: 0; height: 100vh; }
    .portada img { height: 100%; max-width: 100%; object-fit: contain; }
  </style>
</head>
<body>
  <section class="portada" epub:type="cover" role="doc-cover">
    <img alt="Portada" src="${imgHref}"/>
  </section>
</body>
</html>
`
}

/**
 * Marca una imagen como portada: la declara en el manifest y en los metadatos,
 * crea (o actualiza) el XHTML de portada y lo pone primero en el orden de lectura.
 */
export function setCover(book: EpubBook, imagePath: string): boolean {
  if (!book.files.has(imagePath)) return false
  if (!parseManifest(book).some(i => i.path === imagePath)) addToOpf(book, imagePath)

  setManifestProperty(book, imagePath, 'cover-image', { exclusive: true })

  // <meta name="cover"> para los lectores que aún lo esperan.
  const doc = opfDoc(book)
  const md = doc && metadataEl(doc)
  const id = parseManifest(book).find(i => i.path === imagePath)?.id
  if (doc && md && id) {
    let el = byName(md, 'cover')
    if (!el) {
      el = createOpf(doc, 'meta')
      el.setAttribute('name', 'cover')
      appendPretty(doc, md, el)
    }
    el.setAttribute('content', id)
    writeOpf(book, doc)
  }

  // Documento de portada.
  const title = readMetadata(book).title || 'Portada'
  let docPath = coverDocPath(book)
  if (docPath) {
    const f = book.files.get(docPath)
    if (f?.text != null) {
      const href = relativePath(docPath, imagePath)
      // Hay portadas hechas con <img> y otras con <svg><image xlink:href>.
      f.text = f.text
        .replace(/(<img\b[^>]*\bsrc\s*=\s*")[^"]*(")/i, `$1${href}$2`)
        .replace(/(<image\b[^>]*\bxlink:href\s*=\s*")[^"]*(")/i, `$1${href}$2`)
    }
  } else {
    const textItem = parseManifest(book).find(i => i.mediaType === 'application/xhtml+xml')
    const dir = textItem ? dirname(textItem.path) : [dirname(book.opfPath), 'Text'].filter(Boolean).join('/')
    docPath = `${dir}/cover.xhtml`
    book.files.set(docPath, {
      path: docPath,
      mediaType: 'application/xhtml+xml',
      text: coverXhtml(title, relativePath(docPath, imagePath)),
    })
    addToOpf(book, docPath)
  }

  moveSpineToFront(book, docPath)
  addLandmark(book, 'cover', docPath, 'Portada')
  return true
}

/** Quita la portada: deja de declararla, pero no borra la imagen ni el XHTML. */
export function clearCover(book: EpubBook): boolean {
  removeManifestProperty(book, 'cover-image')

  const doc = opfDoc(book)
  const md = doc && metadataEl(doc)
  if (!doc || !md) return false
  const el = byName(md, 'cover')
  if (el) removePretty(el)
  writeOpf(book, doc)
  return true
}
