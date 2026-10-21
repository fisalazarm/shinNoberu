// Importar un manuscrito de Word.
//
// Un .docx es un zip con XML dentro, así que no hace falta nada que no tengamos
// ya: JSZip para abrirlo y DOMParser para leerlo.
//
// Lo que se conserva es lo que significa algo en una novela: los títulos (para
// partir en capítulos), la cursiva, la negrita, los saltos de línea, las
// imágenes, las listas y las notas al pie. Lo que Word mete y no significa nada
// —fuentes, tamaños, colores, interlineados, estilos de párrafo— se tira: eso
// lo pone después la hoja de estilos del libro, que es su sitio.

import JSZip from 'jszip'
import { addToOpf, guessMediaType, spinePaths, type EpubBook } from './epub'
import { fold } from './names'

const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'
const R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'

/** Marca de las imágenes hasta saber en qué carpeta acabarán. */
export const IMG_TOKEN = '%IMG%'

export interface DocxImage {
  /** Nombre del archivo tal como se usará en el EPUB. */
  name: string
  bytes: Uint8Array
  mediaType: string
}

export interface Block {
  tag: 'h1' | 'h2' | 'h3' | 'p'
  html: string
  /** Nivel del título, 0 si es un párrafo normal. */
  level: number
  centered?: boolean
  /** Es un punto de una lista. */
  listItem?: boolean
}

export interface DocxDoc {
  blocks: Block[]
  images: DocxImage[]
  /** Notas al pie encontradas, por su id de Word. */
  notes: Map<string, string>
  /** Cuántos párrafos vacíos se descartaron: suele ser el interlineado de Word. */
  dropped: number
}

const kids = (el: Element | null, name: string): Element[] =>
  el ? [...el.children].filter(c => c.localName === name) : []
const kid = (el: Element | null, name: string): Element | null => kids(el, name)[0] ?? null

const wAttr = (el: Element | null, name: string): string | null =>
  el ? el.getAttributeNS(W, name) ?? el.getAttribute(`w:${name}`) : null

/** En Word, `<w:i/>` es cursiva y `<w:i w:val="0"/>` es cursiva apagada. */
function flag(rPr: Element | null, name: string): boolean {
  const e = kid(rPr, name)
  if (!e) return false
  const v = wAttr(e, 'val')
  return v == null || !/^(0|false|off)$/i.test(v)
}

const escape = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

/**
 * Nivel de título del párrafo, 0 si no lo es.
 *
 * Se mira el nombre del estilo —que cambia con el idioma de Word: Heading1,
 * Ttulo1, Titre1— y, si no dice nada, el nivel de esquema, que es el mismo
 * dato en todos los idiomas.
 */
export function headingLevel(p: Element): number {
  const pPr = kid(p, 'pPr')
  const style = wAttr(kid(pPr, 'pStyle'), 'val') ?? ''
  const m = fold(style).replace(/[\s_-]/g, '').match(/^(?:heading|titulo|ttulo|titre|berschrift)([1-6])$/)
  if (m) return Number(m[1])

  const outline = wAttr(kid(pPr, 'outlineLvl'), 'val')
  if (outline != null && /^[0-5]$/.test(outline)) return Number(outline) + 1
  return 0
}

interface Seg {
  text: string
  i: boolean
  b: boolean
}

/** Junta los trozos seguidos que van igual: Word parte una palabra en tres. */
function merge(segs: Seg[]): Seg[] {
  const out: Seg[] = []
  for (const s of segs) {
    const last = out[out.length - 1]
    if (last && last.i === s.i && last.b === s.b) last.text += s.text
    else out.push({ ...s })
  }
  return out
}

function wrap(segs: Seg[]): string {
  return merge(segs)
    .filter(s => s.text)
    .map(s => {
      let html = escape(s.text)
      if (s.b) html = `<strong>${html}</strong>`
      if (s.i) html = `<em>${html}</em>`
      return html
    })
    .join('')
}

interface RunContext {
  rels: Map<string, string>
  media: Map<string, string>
  notes: Set<string>
}

/** Convierte los `w:r` de un párrafo (o de un hipervínculo) en HTML. */
function runsToHtml(parent: Element, ctx: RunContext): string {
  let html = ''
  let segs: Seg[] = []
  const flush = () => { html += wrap(segs); segs = [] }

  for (const el of parent.children) {
    if (el.localName === 'hyperlink') {
      flush()
      const target = ctx.rels.get(el.getAttributeNS(R, 'id') ?? '')
      const inner = runsToHtml(el, ctx)
      html += target && /^https?:/i.test(target) ? `<a href="${escape(target)}">${inner}</a>` : inner
      continue
    }
    if (el.localName !== 'r') continue

    const rPr = kid(el, 'rPr')
    const i = flag(rPr, 'i')
    const b = flag(rPr, 'b')

    for (const c of el.children) {
      switch (c.localName) {
        case 't':
          segs.push({ text: c.textContent ?? '', i, b })
          break
        case 'tab':
          segs.push({ text: ' ', i, b })
          break
        case 'br':
          flush()
          html += '<br/>'
          break
        case 'drawing':
        case 'pict': {
          flush()
          const blip = c.getElementsByTagNameNS('*', 'blip')[0]
          const id = blip?.getAttributeNS(R, 'embed') ?? blip?.getAttribute('r:embed')
          const name = id ? ctx.media.get(id) : undefined
          if (name) html += `<img src="${IMG_TOKEN}${name}" alt=""/>`
          break
        }
        case 'footnoteReference': {
          flush()
          const id = wAttr(c, 'id')
          // Las notas automáticas de Word (separadores) llevan id 0 y -1.
          if (id && Number(id) > 0) {
            ctx.notes.add(id)
            html += `<a class="nota" epub:type="noteref" href="#nota${id}" id="ref${id}" role="doc-noteref">[${id}]</a>`
          }
          break
        }
      }
    }
  }
  flush()
  return html
}

const isCentered = (p: Element) => wAttr(kid(kid(p, 'pPr'), 'jc'), 'val') === 'center'
const isListItem = (p: Element) => !!kid(kid(p, 'pPr'), 'numPr')

function parseRels(xml: string | undefined): Map<string, string> {
  const out = new Map<string, string>()
  if (!xml) return out
  const doc = new DOMParser().parseFromString(xml, 'application/xml')
  for (const el of doc.getElementsByTagName('Relationship')) {
    const id = el.getAttribute('Id')
    const target = el.getAttribute('Target')
    if (id && target) out.set(id, target)
  }
  return out
}

/** Nombre de archivo limpio y único para una imagen de Word. */
function imageName(target: string, used: Set<string>): string {
  const base = (target.split('/').pop() ?? 'imagen').replace(/[^A-Za-z0-9_.-]/g, '_')
  let name = base
  let n = 2
  while (used.has(name)) {
    const dot = base.lastIndexOf('.')
    name = dot > 0 ? `${base.slice(0, dot)}-${n}${base.slice(dot)}` : `${base}-${n}`
    n++
  }
  used.add(name)
  return name
}

export async function readDocx(data: ArrayBuffer | Uint8Array): Promise<DocxDoc> {
  const zip = await JSZip.loadAsync(data)
  const documentXml = await zip.file('word/document.xml')?.async('string')
  if (!documentXml) throw new Error('Esto no parece un .docx: no tiene word/document.xml dentro.')

  const doc = new DOMParser().parseFromString(documentXml, 'application/xml')
  if (doc.querySelector('parsererror')) throw new Error('El .docx está dañado: su XML no se puede leer.')

  const rels = parseRels(await zip.file('word/_rels/document.xml.rels')?.async('string'))

  // Imágenes: de la relación al archivo que acabará en el EPUB.
  const images: DocxImage[] = []
  const media = new Map<string, string>()
  const used = new Set<string>()
  for (const [id, target] of rels) {
    if (!/^(media\/|\.\.\/media\/)/.test(target)) continue
    const file = zip.file(`word/${target.replace(/^\.\.\//, '')}`)
    if (!file) continue
    const name = imageName(target, used)
    media.set(id, name)
    images.push({ name, bytes: await file.async('uint8array'), mediaType: guessMediaType(name) })
  }

  const body = kid(doc.documentElement, 'body')
  const ctx: RunContext = { rels, media, notes: new Set() }
  const blocks: Block[] = []
  let dropped = 0

  for (const p of kids(body, 'p')) {
    const html = runsToHtml(p, ctx)
    if (!html.trim()) {
      dropped++ // párrafo vacío: en Word es aire, en un EPUB sería un hueco raro
      continue
    }
    const level = headingLevel(p)
    blocks.push({
      tag: level === 0 ? 'p' : (`h${Math.min(level, 3)}` as Block['tag']),
      html,
      level,
      centered: level === 0 && isCentered(p) ? true : undefined,
      listItem: level === 0 && isListItem(p) ? true : undefined,
    })
  }

  const notes = await readNotes(zip, ctx)
  return { blocks, images, notes, dropped }
}

/** El texto de las notas al pie que el documento usa. */
async function readNotes(zip: JSZip, ctx: RunContext): Promise<Map<string, string>> {
  const out = new Map<string, string>()
  if (!ctx.notes.size) return out
  const xml = await zip.file('word/footnotes.xml')?.async('string')
  if (!xml) return out

  const doc = new DOMParser().parseFromString(xml, 'application/xml')
  if (doc.querySelector('parsererror')) return out

  for (const note of kids(doc.documentElement, 'footnote')) {
    const id = wAttr(note, 'id')
    if (!id || !ctx.notes.has(id)) continue
    const text = kids(note, 'p')
      .map(p => runsToHtml(p, { ...ctx, notes: new Set() }))
      .filter(Boolean)
      .join(' ')
      .trim()
    if (text) out.set(id, text)
  }
  return out
}

export interface ChapterDraft {
  title: string
  /** El cuerpo del capítulo, listo para meter en la plantilla XHTML. */
  html: string
  words: number
  images: string[]
}

export interface SplitOptions {
  /** Partir en los títulos de este nivel. 0: no partir. */
  splitAt: number
  /** Dónde quedarán las imágenes, visto desde el capítulo. */
  imagePrefix: string
}

export const defaultSplitOptions: SplitOptions = { splitAt: 1, imagePrefix: '../Images/' }

const countWords = (html: string) =>
  (html.replace(/<[^>]*>/g, ' ').match(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu) ?? []).length

/** Envuelve en `<ul>` los puntos de lista seguidos. */
function assemble(blocks: Block[], prefix: string): string {
  const out: string[] = []
  let inList = false

  for (const b of blocks) {
    if (b.listItem && !inList) { out.push('  <ul>'); inList = true }
    if (!b.listItem && inList) { out.push('  </ul>'); inList = false }

    const html = b.html.split(IMG_TOKEN).join(prefix)
    if (b.listItem) out.push(`    <li>${html}</li>`)
    else if (b.tag === 'p') out.push(`  <p${b.centered ? ' class="centrado"' : ''}>${html}</p>`)
    else out.push(`  <${b.tag}>${html}</${b.tag}>`)
  }
  if (inList) out.push('  </ul>')
  return out.join('\n')
}

/** Las notas que use el capítulo, al final y en el formato del editor. */
function notesFor(html: string, notes: Map<string, string>, prefix: string): string {
  const used = [...html.matchAll(/href="#nota(\d+)"/g)].map(m => m[1])
  if (!used.length) return ''
  const asides = used
    .filter(id => notes.has(id))
    .map(id =>
      `  <aside class="nota-trad" epub:type="footnote" id="nota${id}" role="doc-footnote">\n` +
      `    <p><a href="#ref${id}" role="doc-backlink">[${id}]</a> ${notes.get(id)!.split(IMG_TOKEN).join(prefix)}</p>\n` +
      '  </aside>')
  return asides.length ? `\n${asides.join('\n')}` : ''
}

/**
 * Parte el documento en capítulos por sus títulos. Lo que haya antes del
 * primer título no se pierde: va a un capítulo propio.
 */
export function toChapters(doc: DocxDoc, opts: SplitOptions = defaultSplitOptions): ChapterDraft[] {
  const groups: { title: string; blocks: Block[] }[] = []
  const open = (title: string) => groups.push({ title, blocks: [] })

  for (const b of doc.blocks) {
    const splits = opts.splitAt > 0 && b.level > 0 && b.level <= opts.splitAt
    if (splits) open(b.html.replace(/<[^>]*>/g, '').trim() || 'Sin título')
    if (!groups.length) open('Comienzo')
    groups[groups.length - 1].blocks.push(b)
  }

  return groups.map(g => {
    const body = assemble(g.blocks, opts.imagePrefix)
    const html = body + notesFor(body, doc.notes, opts.imagePrefix)
    return {
      title: g.title,
      html,
      words: countWords(body),
      images: [...body.matchAll(/src="[^"]*?([^/"]+)"/g)].map(m => m[1]),
    }
  })
}

// ---------- meter lo leído en un libro ----------

export interface ImportResult {
  chapters: string[]
  images: string[]
}

const escapeAttr = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/** Un capítulo con la misma forma que los que crea el editor. */
function chapterXhtml(title: string, cssHref: string, body: string): string {
  const inner = body.split('\n').map(l => (l ? `  ${l}` : l)).join('\n')
  return `<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="es" lang="es">
<head>
  <title>${escapeAttr(title)}</title>
  <link href="${cssHref}" rel="stylesheet" type="text/css"/>
</head>
<body>
  <section epub:type="chapter" role="doc-chapter">
${inner}
  </section>
</body>
</html>
`
}

/**
 * Escribe los capítulos y las imágenes en el libro, detrás de lo que ya haya.
 *
 * Las rutas salen de dónde están los capítulos actuales: así un libro que use
 * OEBPS/Text sigue usándolo y uno que no tenga carpetas tampoco las estrena.
 */
export function importChapters(
  book: EpubBook,
  doc: DocxDoc,
  chapters: ChapterDraft[],
  opts: { textDir: string; imagesDir: string; cssHref: string },
): ImportResult {
  const created: string[] = []
  const addedImages: string[] = []

  for (const img of doc.images) {
    const path = `${opts.imagesDir}/${img.name}`
    if (book.files.has(path)) continue
    book.files.set(path, { path, mediaType: img.mediaType, bytes: img.bytes })
    addToOpf(book, path)
    addedImages.push(path)
  }

  let n = 1
  let after = spinePaths(book).at(-1)
  for (const c of chapters) {
    let path = `${opts.textDir}/Cap${String(n).padStart(2, '0')}.xhtml`
    while (book.files.has(path)) {
      n++
      path = `${opts.textDir}/Cap${String(n).padStart(2, '0')}.xhtml`
    }
    book.files.set(path, {
      path,
      mediaType: 'application/xhtml+xml',
      text: chapterXhtml(c.title, opts.cssHref, c.html),
    })
    addToOpf(book, path, { spineAfter: after })
    after = path
    created.push(path)
    n++
  }

  return { chapters: created, images: addedImages }
}
