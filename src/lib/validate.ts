// Revisión del libro: lo que rompe un lector de EPUB y lo que solo conviene arreglar.
//
// No pretende sustituir a epubcheck: busca los fallos que de verdad aparecen
// maquetando novelas (enlaces roto, ids repetidos, archivos fuera del manifest)
// y los sitúa en el archivo y la línea para poder saltar ahí.

import { isTextFile, parseManifest, resolvePath, spinePaths, type EpubBook } from './epub'
import { kid, kids, metadataEl, opfDoc } from './opfDom'
import { coverImagePath } from './metadata'
import { navItemPath } from './structure'

export type Severity = 'error' | 'warning'

export interface Problem {
  severity: Severity
  /** Para agrupar y para los tests. */
  code: string
  file: string
  message: string
  line?: number
  offset?: number
}

const MAX_PROBLEMS = 400

const EXTERNAL = /^(?:[a-z][a-z0-9+.-]*:|\/\/)/i
/** Las cinco entidades con nombre que XML define por sí mismo. */
const XML_ENTITIES = new Set(['amp', 'lt', 'gt', 'quot', 'apos'])
const ENTITY_ERROR = /entity\b[^.]*\bnot defined|undefined entity/i
const REFERENCE =
  /\b(?:href|src|xlink:href)\s*=\s*"([^"]*)"|\burl\(\s*(['"]?)([^'")]+)\2\s*\)/gi

const lineAt = (text: string, offset: number) => text.slice(0, offset).split('\n').length

function xmlError(text: string): { message: string; line?: number } | null {
  const doc = new DOMParser().parseFromString(text, 'application/xml')
  const err = doc.querySelector('parsererror')
  if (!err) return null
  const raw = (err.textContent ?? '').replace(/\s+/g, ' ').trim()
  const m = raw.match(/error on line (\d+)(?: at column \d+)?:?\s*(.*?)(?:\s*Below is a rendering.*)?$/i)
  if (m) return { message: m[2] || raw, line: Number(m[1]) }
  return {
    message: raw
      .replace(/^This page contains the following errors:\s*/i, '')
      .replace(/\s*Below is a rendering.*$/i, ''),
  }
}

/** Ids declarados en un archivo de texto. */
function idsOf(text: string): Map<string, number[]> {
  const out = new Map<string, number[]>()
  for (const m of text.matchAll(/\bid\s*=\s*"([^"]+)"/g)) {
    const list = out.get(m[1]) ?? []
    list.push(m.index)
    out.set(m[1], list)
  }
  return out
}

export function validateBook(book: EpubBook): Problem[] {
  const problems: Problem[] = []
  const add = (p: Problem) => {
    if (problems.length < MAX_PROBLEMS) problems.push(p)
  }

  // ---------- esqueleto ----------

  const mimetype = book.files.get('mimetype')
  if (!mimetype) {
    add({ severity: 'error', code: 'no-mimetype', file: 'mimetype', message: 'Falta el archivo "mimetype" en la raíz del EPUB.' })
  } else if ((mimetype.text ?? '').trim() !== 'application/epub+zip') {
    add({ severity: 'error', code: 'bad-mimetype', file: 'mimetype', message: 'El archivo "mimetype" debe contener exactamente "application/epub+zip".' })
  }

  const container = book.files.get('META-INF/container.xml')
  if (!container) {
    add({ severity: 'error', code: 'no-container', file: 'META-INF/container.xml', message: 'Falta META-INF/container.xml, que indica dónde está el OPF.' })
  } else {
    const declared = container.text?.match(/full-path\s*=\s*"([^"]+)"/)?.[1]
    if (declared && declared !== book.opfPath) {
      add({
        severity: 'error',
        code: 'container-mismatch',
        file: 'META-INF/container.xml',
        message: `container.xml apunta a "${declared}", pero el OPF del libro es "${book.opfPath}".`,
      })
    }
  }

  // ---------- OPF ----------

  const doc = opfDoc(book)
  if (!doc) {
    const err = book.files.get(book.opfPath)?.text ? xmlError(book.files.get(book.opfPath)!.text!) : null
    add({
      severity: 'error',
      code: 'opf-malformed',
      file: book.opfPath,
      line: err?.line,
      message: `El OPF está mal formado, así que el libro no se puede leer: ${err?.message ?? 'no se pudo parsear'}.`,
    })
    return problems // sin OPF válido, el resto de las comprobaciones no significan nada
  }

  const items = parseManifest(book)
  const spine = spinePaths(book)
  const navPath = navItemPath(book)
  const version = doc.documentElement.getAttribute('version') ?? '3.0'
  const isEpub3 = version.startsWith('3')

  const md = metadataEl(doc)
  if (!md) {
    add({ severity: 'error', code: 'no-metadata', file: book.opfPath, message: 'El OPF no tiene <metadata>.' })
  } else {
    for (const [local, label] of [['title', 'el título (dc:title)'], ['language', 'el idioma (dc:language)'], ['identifier', 'el identificador (dc:identifier)']] as const) {
      if (!kid(md, local)) {
        add({ severity: 'error', code: `no-${local}`, file: book.opfPath, message: `Faltan los metadatos obligatorios: ${label}.` })
      }
    }
    if (isEpub3 && !kids(md, 'meta').some(m => m.getAttribute('property') === 'dcterms:modified')) {
      add({ severity: 'warning', code: 'no-modified', file: book.opfPath, message: 'Falta <meta property="dcterms:modified">, que EPUB 3 pide.' })
    }
  }

  if (isEpub3 && !items.some(i => i.properties?.split(/\s+/).includes('nav'))) {
    add({ severity: 'error', code: 'no-nav', file: book.opfPath, message: 'Ningún archivo está marcado como índice (properties="nav"). Usa «Índice → Regenerar».' })
  }

  if (!coverImagePath(book)) {
    add({ severity: 'warning', code: 'no-cover', file: book.opfPath, message: 'El libro no declara portada. Elígela en «Metadatos».' })
  }

  if (!spine.length) {
    add({ severity: 'error', code: 'empty-spine', file: book.opfPath, message: 'El spine está vacío: el libro no tiene orden de lectura.' })
  }

  // itemrefs que apuntan a un id que no existe
  const byId = new Map(items.map(i => [i.id, i]))
  const spineEl = kid(doc.documentElement, 'spine')
  for (const ref of kids(spineEl, 'itemref')) {
    const idref = ref.getAttribute('idref') ?? ''
    if (!byId.has(idref)) {
      add({ severity: 'error', code: 'spine-dangling', file: book.opfPath, message: `El spine incluye idref="${idref}", que no está en el manifest.` })
    }
  }

  // ---------- manifest vs. archivos reales ----------

  const inManifest = new Set(items.map(i => i.path))
  for (const item of items) {
    if (!book.files.has(item.path)) {
      add({ severity: 'error', code: 'manifest-missing-file', file: book.opfPath, message: `El manifest declara "${item.path}", pero ese archivo no está en el libro.` })
    }
  }
  for (const f of book.files.values()) {
    if (f.path === 'mimetype' || f.path === book.opfPath) continue
    if (f.path.startsWith('META-INF/')) continue
    if (!inManifest.has(f.path)) {
      add({ severity: 'warning', code: 'not-in-manifest', file: f.path, message: 'El archivo está dentro del EPUB pero no en el manifest: los lectores lo ignorarán.' })
    }
  }

  const docsNotInSpine = items.filter(
    i => i.mediaType === 'application/xhtml+xml' && i.path !== navPath && !spine.includes(i.path),
  )
  for (const i of docsNotInSpine) {
    add({ severity: 'warning', code: 'not-in-spine', file: i.path, message: 'El capítulo no está en el orden de lectura (spine), así que no se verá al leer.' })
  }

  // ---------- archivos de texto ----------

  for (const f of book.files.values()) {
    if (f.text == null || !isTextFile(f.path)) continue
    const isMarkup = /\.(x?html?|opf|ncx|xml|svg)$/i.test(f.path)

    if (isMarkup) {
      // Entidades con nombre que XHTML no define. Se buscan con regex y no con
      // el parser porque este se detiene en la primera y porque no todos los
      // navegadores la señalan igual. Una por nombre, no una por aparición.
      const seenEntities = new Set<string>()
      for (const m of f.text.matchAll(/&([A-Za-z][A-Za-z0-9]*);/g)) {
        if (XML_ENTITIES.has(m[1]) || seenEntities.has(m[1])) continue
        seenEntities.add(m[1])
        add({
          severity: 'warning',
          code: 'undefined-entity',
          file: f.path,
          line: lineAt(f.text, m.index),
          offset: m.index,
          message: `La entidad "&${m[1]};" no está definida en XHTML (solo &amp;, &lt;, &gt;, &quot; y &apos;). Usa el carácter directamente o su forma numérica, como &#160; para el espacio duro.`,
        })
      }

      const err = xmlError(f.text)
      if (err && !ENTITY_ERROR.test(err.message)) {
        add({
          severity: 'error',
          code: 'malformed',
          file: f.path,
          line: err.line,
          message: `XHTML mal formado: ${err.message}. Muchos lectores se niegan a abrir el libro.`,
        })
      }

      for (const [id, places] of idsOf(f.text)) {
        if (places.length > 1) {
          add({
            severity: 'error',
            code: 'duplicate-id',
            file: f.path,
            line: lineAt(f.text, places[1]),
            offset: places[1],
            message: `El id "${id}" está repetido ${places.length} veces. Los enlaces internos (y las notas al pie) irán al sitio equivocado.`,
          })
        }
      }

      for (const m of f.text.matchAll(/<img\b([^>]*)>/gi)) {
        if (!/\balt\s*=/.test(m[1])) {
          add({
            severity: 'warning',
            code: 'img-no-alt',
            file: f.path,
            line: lineAt(f.text, m.index),
            offset: m.index,
            message: 'La imagen no tiene atributo alt.',
          })
        }
      }
    }

    // referencias a otros archivos
    for (const m of f.text.matchAll(REFERENCE)) {
      const raw = (m[1] ?? m[3] ?? '').trim()
      if (!raw || EXTERNAL.test(raw)) continue

      const [target, fragment] = raw.split('#')
      const offset = m.index
      const line = lineAt(f.text, offset)

      if (raw.startsWith('/')) {
        add({ severity: 'warning', code: 'absolute-path', file: f.path, line, offset, message: `La ruta "${raw}" es absoluta; dentro de un EPUB deben ser relativas.` })
        continue
      }

      const targetPath = target ? resolvePath(f.path, target) : f.path
      if (target && !book.files.has(targetPath)) {
        add({ severity: 'error', code: 'broken-link', file: f.path, line, offset, message: `"${raw}" no apunta a ningún archivo del libro.` })
        continue
      }

      if (fragment) {
        const targetFile = book.files.get(targetPath)
        if (targetFile?.text != null && !idsOf(targetFile.text).has(fragment)) {
          const sameFile = targetPath === f.path
          add({
            severity: 'warning',
            code: 'broken-fragment',
            file: f.path,
            line,
            offset,
            message: `No existe el id "${fragment}"${sameFile ? ' en este archivo' : ` en ${targetPath.split('/').pop()}`}, así que el enlace no llevará a ninguna parte.`,
          })
        }
      }
    }
  }

  const rank: Record<Severity, number> = { error: 0, warning: 1 }
  return problems.sort((a, b) => rank[a.severity] - rank[b.severity] || a.file.localeCompare(b.file) || (a.line ?? 0) - (b.line ?? 0))
}

export function countBySeverity(problems: Problem[]): { errors: number; warnings: number } {
  return {
    errors: problems.filter(p => p.severity === 'error').length,
    warnings: problems.filter(p => p.severity === 'warning').length,
  }
}
