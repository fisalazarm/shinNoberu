// Leer y escribir el OPF como DOM. El resto del proyecto lo edita con regex
// (ver addToOpf en epub.ts), pero los metadatos tienen demasiados campos
// y namespaces para eso.
//
// DOMParser descarta la declaración <?xml ...?>, así que writeOpf la repone.

import type { EpubBook } from './epub'

export const OPF_NS = 'http://www.idpf.org/2007/opf'
export const DC_NS = 'http://purl.org/dc/elements/1.1/'

const DECL = /^\s*<\?xml[^>]*\?>/

/** Parsea el OPF. `null` si está mal formado (el panel de problemas lo explica). */
export function opfDoc(book: EpubBook): Document | null {
  const text = book.files.get(book.opfPath)?.text
  if (!text) return null
  const doc = new DOMParser().parseFromString(text, 'application/xml')
  return doc.querySelector('parsererror') ? null : doc
}

export function writeOpf(book: EpubBook, doc: Document) {
  const f = book.files.get(book.opfPath)
  if (!f) return
  const decl = f.text?.match(DECL)?.[0].trim() ?? '<?xml version="1.0" encoding="utf-8"?>'
  f.text = `${decl}\n${new XMLSerializer().serializeToString(doc.documentElement)}\n`
}

/** Hijos directos con ese nombre local, sin mirar el prefijo del namespace. */
export function kids(parent: Element | null, local: string): Element[] {
  return parent ? [...parent.children].filter(e => e.localName === local) : []
}

export function kid(parent: Element | null, local: string): Element | null {
  return kids(parent, local)[0] ?? null
}

export function metadataEl(doc: Document): Element | null {
  return kid(doc.documentElement, 'metadata')
}

export function manifestEl(doc: Document): Element | null {
  return kid(doc.documentElement, 'manifest')
}

export function spineEl(doc: Document): Element | null {
  return kid(doc.documentElement, 'spine')
}

export const elText = (el: Element | null) => (el?.textContent ?? '').trim()

/** Crea un elemento en el namespace del OPF (normalmente sin prefijo). */
export function createOpf(doc: Document, local: string): Element {
  const ns = doc.documentElement.namespaceURI
  return ns ? doc.createElementNS(ns, local) : doc.createElement(local)
}

/** Crea un `dc:algo`. El serializador añade xmlns:dc si hiciera falta. */
export function createDc(doc: Document, local: string): Element {
  return doc.createElementNS(DC_NS, `dc:${local}`)
}

/** Añade un hijo antes del salto de línea final, para no estropear la sangría. */
export function appendPretty(doc: Document, parent: Element, child: Element, indent = '    ') {
  const pad = doc.createTextNode(`\n${indent}`)
  const trailing = parent.lastChild?.nodeType === 3 ? parent.lastChild : null
  if (trailing) {
    parent.insertBefore(pad, trailing)
    parent.insertBefore(child, trailing)
  } else {
    parent.appendChild(pad)
    parent.appendChild(child)
  }
}

/** Quita un elemento junto con el espacio en blanco que lo precede. */
export function removePretty(el: Element) {
  const prev = el.previousSibling
  if (prev?.nodeType === 3 && !(prev.textContent ?? '').trim()) prev.parentNode?.removeChild(prev)
  el.parentNode?.removeChild(el)
}

/** Atributo con prefijo opf: (los EPUB 2 usan opf:scheme, opf:file-as…). */
export function opfAttr(el: Element | null, local: string): string {
  if (!el) return ''
  return el.getAttributeNS(OPF_NS, local) || el.getAttribute(`opf:${local}`) || ''
}

export const nowIso = () => new Date().toISOString().replace(/\.\d+Z$/, 'Z')
