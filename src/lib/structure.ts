// Estructura del libro: orden de lectura (spine), índice (nav) y toc.ncx.
//
// Los encabezados se leen con regex en vez de DOM a propósito: así se puede
// insertar el id que falta sin volver a serializar el XHTML del usuario, que
// perdería su sangría y sus comillas.

import {
  addToOpf, dirname, parseManifest, relativePath, resolvePath, spinePaths, type EpubBook,
} from './epub'
import {
  appendPretty, elText, kid, kids, manifestEl, metadataEl, opfDoc,
  removePretty, spineEl, writeOpf,
} from './opfDom'

export interface Heading {
  path: string
  id: string
  level: number
  title: string
  /** Primer encabezado del archivo: el índice enlaza al archivo, sin fragmento. */
  firstInFile: boolean
}

const HEADING_RE = /<h([1-6])\b([^>]*)>([\s\S]*?)<\/h\1\s*>/gi
const ID_ATTR = /\bid\s*=\s*"([^"]*)"/

export function escapeXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

/** Texto visible de un encabezado, sin etiquetas ni llamadas a nota. */
export function plainText(html: string): string {
  return html
    .replace(/<a\b[^>]*noteref[\s\S]*?<\/a\s*>/gi, '')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&amp;/gi, '&')
    .replace(/\s+/g, ' ')
    .trim()
}

function slug(s: string): string {
  const base = s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
  return base || 'sec'
}

function uniqueId(base: string, used: Set<string>): string {
  if (!used.has(base)) return base
  let n = 2
  while (used.has(`${base}-${n}`)) n++
  return `${base}-${n}`
}

/** Ruta del documento de navegación (EPUB 3). */
export function navItemPath(book: EpubBook): string | undefined {
  const byProp = parseManifest(book).find(i => i.properties?.split(/\s+/).includes('nav'))
  if (byProp) return byProp.path
  for (const f of book.files.values()) {
    if (f.mediaType === 'application/xhtml+xml' && /epub:type\s*=\s*"[^"]*\btoc\b/.test(f.text ?? '')) return f.path
  }
  return undefined
}

/**
 * Recoge los encabezados de los capítulos en orden de lectura.
 *
 * Con `assignIds` les pone un `id` a los que no lo tengan, lo que modifica el
 * libro; sin él solo lee, para poder mostrar una vista previa.
 */
export function collectHeadings(
  book: EpubBook,
  opts: { maxLevel?: number; assignIds?: boolean } = {},
): Heading[] {
  const maxLevel = opts.maxLevel ?? 3
  const out: Heading[] = []
  const navPath = navItemPath(book)

  for (const path of spinePaths(book)) {
    const f = book.files.get(path)
    if (f?.text == null || path === navPath) continue

    const used = new Set<string>()
    for (const m of f.text.matchAll(/\bid\s*=\s*"([^"]+)"/g)) used.add(m[1])

    const inserts: { at: number; text: string }[] = []
    let firstInFile = true

    for (const m of f.text.matchAll(HEADING_RE)) {
      const level = Number(m[1])
      const title = plainText(m[3])
      if (level > maxLevel || !title) continue
      let id = m[2].match(ID_ATTR)?.[1] ?? ''
      if (!id) {
        id = uniqueId(slug(title), used)
        used.add(id)
        if (opts.assignIds) inserts.push({ at: m.index + 3, text: ` id="${id}"` }) // justo tras "<hN"
      }
      out.push({ path, id, level, title, firstInFile })
      firstInFile = false
    }

    if (inserts.length) {
      let text = f.text
      for (const ins of inserts.reverse()) text = text.slice(0, ins.at) + ins.text + text.slice(ins.at)
      f.text = text
    }
  }
  return out
}

// ---------- árbol del índice ----------

interface TocNode { h: Heading; children: TocNode[] }

function toTree(list: Heading[]): TocNode[] {
  const roots: TocNode[] = []
  const stack: TocNode[] = []
  for (const h of list) {
    const node: TocNode = { h, children: [] }
    while (stack.length && stack[stack.length - 1].h.level >= h.level) stack.pop()
    if (stack.length) stack[stack.length - 1].children.push(node)
    else roots.push(node)
    stack.push(node)
  }
  return roots
}

function hrefFor(fromFile: string, h: Heading): string {
  return relativePath(fromFile, h.path) + (h.firstInFile ? '' : `#${h.id}`)
}

function renderOl(nodes: TocNode[], navFile: string, pad: string): string {
  const lines = [`${pad}<ol>`]
  for (const n of nodes) {
    const a = `<a href="${hrefFor(navFile, n.h)}">${escapeXml(n.h.title)}</a>`
    if (n.children.length) {
      lines.push(`${pad}  <li>${a}`)
      lines.push(renderOl(n.children, navFile, `${pad}    `))
      lines.push(`${pad}  </li>`)
    } else {
      lines.push(`${pad}  <li>${a}</li>`)
    }
  }
  lines.push(`${pad}</ol>`)
  return lines.join('\n')
}

export function buildNavOl(headings: Heading[], navFile: string, pad = '    '): string {
  return renderOl(toTree(headings), navFile, pad)
}

// ---------- recortar regiones del XHTML ----------

/** Rango del `<nav epub:type="…">` pedido. */
function navRegion(text: string, type: string): { start: number; end: number; open: string } | null {
  for (const m of text.matchAll(/<nav\b[^>]*>/gi)) {
    if (new RegExp(`epub:type\\s*=\\s*"[^"]*\\b${type}\\b`).test(m[0])) {
      const close = text.indexOf('</nav>', m.index)
      if (close < 0) return null
      return { start: m.index, end: close + '</nav>'.length, open: m[0] }
    }
  }
  return null
}

/** Rango del primer `<ol>…</ol>` equilibrado a partir de `from`. */
function olRange(text: string, from: number, limit: number): { start: number; end: number } | null {
  const open = /<ol\b[^>]*>/gi
  open.lastIndex = from
  const first = open.exec(text)
  if (!first || first.index >= limit) return null
  if (first[0].endsWith('/>')) return { start: first.index, end: first.index + first[0].length }

  let depth = 1
  const tag = /<ol\b[^>]*>|<\/ol\s*>/gi
  tag.lastIndex = first.index + first[0].length
  let m: RegExpExecArray | null
  while ((m = tag.exec(text))) {
    if (m[0][1] === '/') {
      if (--depth === 0) return { start: first.index, end: m.index + m[0].length }
    } else if (!m[0].endsWith('/>')) depth++
  }
  return null
}

// ---------- nav ----------

function navTemplate(cssHref?: string): string {
  const link = cssHref ? `\n  <link href="${cssHref}" rel="stylesheet" type="text/css"/>` : ''
  return `<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="es" lang="es">
<head>
  <title>Índice</title>${link}
</head>
<body>
  <nav epub:type="toc" id="toc" role="doc-toc">
    <h1>Índice</h1>
    <ol>
    </ol>
  </nav>
  <nav epub:type="landmarks" id="landmarks" hidden="">
    <ol>
    </ol>
  </nav>
</body>
</html>
`
}

/** Devuelve la ruta del nav, creándolo si el libro no tiene (EPUB 2). */
export function ensureNav(book: EpubBook): string | undefined {
  const existing = navItemPath(book)
  if (existing) return existing

  const textItem = parseManifest(book).find(i => i.mediaType === 'application/xhtml+xml')
  const dir = textItem ? dirname(textItem.path) : [dirname(book.opfPath), 'Text'].filter(Boolean).join('/')
  const path = `${dir}/toc.xhtml`
  if (book.files.has(path)) return path

  const css = [...book.files.values()].find(f => f.mediaType === 'text/css')
  book.files.set(path, {
    path,
    mediaType: 'application/xhtml+xml',
    text: navTemplate(css ? relativePath(path, css.path) : undefined),
  })
  addToOpf(book, path)
  setManifestProperty(book, path, 'nav')
  return path
}

export interface TocResult {
  headings: Heading[]
  navPath: string
  ncxPath?: string
}

/** Rehace el índice a partir de los encabezados de los capítulos. */
export function regenerateToc(
  book: EpubBook,
  opts: { maxLevel?: number; ncx?: boolean } = {},
): TocResult | null {
  const headings = collectHeadings(book, { maxLevel: opts.maxLevel, assignIds: true })
  const navPath = ensureNav(book)
  const nav = navPath ? book.files.get(navPath) : undefined
  if (!navPath || !nav?.text) return null

  const region = navRegion(nav.text, 'toc')
  const ol = buildNavOl(headings, navPath, '    ')

  if (region) {
    const inner = olRange(nav.text, region.start + region.open.length, region.end)
    if (inner) {
      nav.text = nav.text.slice(0, inner.start) + ol.trimStart() + nav.text.slice(inner.end)
    } else {
      const at = region.end - '</nav>'.length
      nav.text = `${nav.text.slice(0, at)}${ol}\n  ${nav.text.slice(at)}`
    }
  } else {
    const block = `  <nav epub:type="toc" id="toc" role="doc-toc">\n    <h1>Índice</h1>\n${ol}\n  </nav>\n`
    nav.text = nav.text.replace(/(\s*)<\/body>/i, `\n${block}$1</body>`)
  }

  const out: TocResult = { headings, navPath }
  if (opts.ncx) out.ncxPath = writeNcx(book, headings)
  return out
}

/** Añade (o reemplaza) una entrada en el nav de landmarks. */
export function addLandmark(book: EpubBook, type: string, path: string, label: string): boolean {
  const navPath = navItemPath(book)
  const nav = navPath ? book.files.get(navPath) : undefined
  if (!navPath || !nav?.text) return false

  const href = relativePath(navPath, path)
  const li = `      <li><a epub:type="${type}" href="${href}">${escapeXml(label)}</a></li>`
  const region = navRegion(nav.text, 'landmarks')

  if (!region) {
    const block = `  <nav epub:type="landmarks" id="landmarks" hidden="">\n    <ol>\n${li}\n    </ol>\n  </nav>\n`
    nav.text = nav.text.replace(/(\s*)<\/body>/i, `\n${block}$1</body>`)
    return true
  }

  let block = nav.text.slice(region.start, region.end)
  const already = new RegExp(`<li>\\s*<a[^>]*epub:type\\s*=\\s*"${type}"[\\s\\S]*?</li>`, 'i')
  block = already.test(block)
    ? block.replace(already, li.trim())
    : block.replace(/(\s*)<\/ol>/i, `\n${li}$1</ol>`)
  nav.text = nav.text.slice(0, region.start) + block + nav.text.slice(region.end)
  return true
}

// ---------- leer el índice ----------

export interface TocEntry {
  title: string
  /** Ruta del documento al que apunta, ya resuelta. */
  path: string
  /** Fragmento `#id`, sin la almohadilla. */
  hash: string
  children: TocEntry[]
}

const LI_OPEN = /<li\b[^>]*>/gi
const ANCHOR = /<a\b[^>]*href\s*=\s*"([^"]*)"[^>]*>([\s\S]*?)<\/a\s*>/i

/**
 * Lee el índice del nav como árbol, para poder navegarlo.
 *
 * Se recorre el texto en vez del DOM porque el nav puede estar mal formado
 * mientras se edita, y aun así conviene mostrar lo que haya.
 */
export function readToc(book: EpubBook): TocEntry[] {
  const navPath = navItemPath(book)
  const text = navPath ? book.files.get(navPath)?.text : undefined
  if (!navPath || !text) return []

  const region = navRegion(text, 'toc')
  if (!region) return []
  const root = olRange(text, region.start + region.open.length, region.end)
  if (!root) return []

  const parse = (from: number, to: number): TocEntry[] => {
    const out: TocEntry[] = []
    LI_OPEN.lastIndex = from
    let m: RegExpExecArray | null
    while ((m = LI_OPEN.exec(text)) && m.index < to) {
      const liStart = m.index + m[0].length
      const liEnd = closeOf(text, m.index, to)
      const anchor = text.slice(liStart, liEnd).match(ANCHOR)
      // Una lista anidada dentro de este <li> son sus hijos.
      const nested = olRange(text, liStart, liEnd)
      const href = anchor?.[1] ?? ''
      const [target, hash = ''] = href.split('#')

      out.push({
        title: plainText(anchor?.[2] ?? '') || '(sin título)',
        path: target ? resolvePath(navPath, target) : navPath,
        hash,
        children: nested ? parse(nested.start, nested.end) : [],
      })

      LI_OPEN.lastIndex = liEnd
    }
    return out
  }

  return parse(root.start, root.end)
}

/** Fin del `<li>` abierto en `openAt`, contando los anidados. */
function closeOf(text: string, openAt: number, limit: number): number {
  const tag = /<li\b[^>]*>|<\/li\s*>/gi
  tag.lastIndex = openAt
  let depth = 0
  let m: RegExpExecArray | null
  while ((m = tag.exec(text)) && m.index < limit) {
    if (m[0][1] === '/') {
      if (--depth === 0) return m.index
    } else if (!m[0].endsWith('/>')) depth++
  }
  return limit
}

// ---------- manifest / spine ----------

/** Pone o quita una propiedad (`nav`, `cover-image`…) en el item del manifest. */
export function setManifestProperty(
  book: EpubBook,
  path: string,
  prop: string,
  opts: { exclusive?: boolean } = {},
): boolean {
  const doc = opfDoc(book)
  const man = doc && manifestEl(doc)
  const target = parseManifest(book).find(i => i.path === path)
  if (!doc || !man || !target) return false

  for (const el of kids(man, 'item')) {
    const props = (el.getAttribute('properties') ?? '').split(/\s+/).filter(Boolean)
    const want = el.getAttribute('id') === target.id
    const at = props.indexOf(prop)
    if (want && at < 0) props.push(prop)
    if (!want && at >= 0 && opts.exclusive) props.splice(at, 1)
    if (props.length) el.setAttribute('properties', props.join(' '))
    else el.removeAttribute('properties')
  }
  writeOpf(book, doc)
  return true
}

/** Quita una propiedad de todos los items del manifest. */
export function removeManifestProperty(book: EpubBook, prop: string): boolean {
  const doc = opfDoc(book)
  const man = doc && manifestEl(doc)
  if (!doc || !man) return false
  for (const el of kids(man, 'item')) {
    const props = (el.getAttribute('properties') ?? '').split(/\s+/).filter(Boolean)
    const at = props.indexOf(prop)
    if (at < 0) continue
    props.splice(at, 1)
    if (props.length) el.setAttribute('properties', props.join(' '))
    else el.removeAttribute('properties')
  }
  writeOpf(book, doc)
  return true
}

function itemrefFor(book: EpubBook, doc: Document, path: string): Element | null {
  const sp = spineEl(doc)
  const id = parseManifest(book).find(i => i.path === path)?.id
  if (!sp || !id) return null
  return kids(sp, 'itemref').find(r => r.getAttribute('idref') === id) ?? null
}

// Los itemref se reordenan cambiando sus atributos en vez de mover los nodos:
// así no se toca la sangría del OPF.
const attrsOf = (el: Element) => [...el.attributes].map(a => [a.name, a.value] as [string, string])
const resetAttrs = (el: Element, list: [string, string][]) => {
  for (const a of [...el.attributes]) el.removeAttribute(a.name)
  for (const [n, v] of list) el.setAttribute(n, v)
}

/** Mueve un capítulo en el orden de lectura. `delta` es -1 (antes) o +1 (después). */
export function moveSpineItem(book: EpubBook, path: string, delta: number): boolean {
  const doc = opfDoc(book)
  const sp = doc && spineEl(doc)
  if (!doc || !sp) return false
  const refs = kids(sp, 'itemref')
  const ref = itemrefFor(book, doc, path)
  const i = ref ? refs.indexOf(ref) : -1
  const j = i + delta
  if (i < 0 || j < 0 || j >= refs.length) return false

  const a = attrsOf(refs[i])
  const b = attrsOf(refs[j])
  resetAttrs(refs[i], b)
  resetAttrs(refs[j], a)

  writeOpf(book, doc)
  return true
}

/**
 * Lleva un capítulo a otro sitio del orden de lectura: justo delante de
 * `before`, o al final si es null. Es lo que hace soltarlo al arrastrar.
 */
export function moveSpineBefore(book: EpubBook, path: string, before: string | null): boolean {
  const doc = opfDoc(book)
  const sp = doc && spineEl(doc)
  if (!doc || !sp || path === before) return false
  const refs = kids(sp, 'itemref')
  const from = refs.indexOf(itemrefFor(book, doc, path)!)
  const target = before == null ? refs.length : refs.indexOf(itemrefFor(book, doc, before)!)
  if (from < 0 || target < 0) return false

  const attrs = refs.map(attrsOf)
  const [moved] = attrs.splice(from, 1)
  // Al quitarlo, lo que iba detrás sube un puesto.
  const to = target > from ? target - 1 : target
  if (to === from) return false
  attrs.splice(to, 0, moved)
  refs.forEach((el, k) => resetAttrs(el, attrs[k]))

  writeOpf(book, doc)
  return true
}

/**
 * Tras cambiar el orden de lectura, pone las entradas de primer nivel del
 * índice en el orden nuevo. Solo si antes seguían el orden de lectura: si
 * alguien las ordenó a mano de otra forma, se respeta. Los niveles de dentro
 * viajan con su entrada.
 */
export function followSpineInToc(book: EpubBook, before: string[]): boolean {
  const navPath = navItemPath(book)
  const nav = navPath ? book.files.get(navPath) : undefined
  const text = nav?.text
  if (!navPath || !nav || text == null) return false
  const region = navRegion(text, 'toc')
  const root = region && olRange(text, region.start + region.open.length, region.end)
  if (!root) return false

  // Las entradas de primer nivel, cada una con su <li> entero.
  const items: { start: number; end: number; path: string }[] = []
  const inner = text.indexOf('>', root.start) + 1
  LI_OPEN.lastIndex = inner
  let m: RegExpExecArray | null
  while ((m = LI_OPEN.exec(text)) && m.index < root.end) {
    const close = closeOf(text, m.index, root.end)
    const gt = close >= root.end ? -1 : text.indexOf('>', close)
    // Un <li> sin cerrar o un «</li» a medias: mejor no tocar nada.
    if (gt < 0 || gt >= root.end) return false
    const end = gt + 1
    const href = text.slice(m.index, end).match(ANCHOR)?.[1] ?? ''
    const target = href.split('#')[0]
    items.push({ start: m.index, end, path: target ? resolvePath(navPath, target) : navPath })
    LI_OPEN.lastIndex = end
  }
  if (items.length < 2) return false

  const after = spinePaths(book)
  const rank = (order: string[], p: string) => order.indexOf(p)
  if (items.some(it => rank(before, it.path) < 0 || rank(after, it.path) < 0)) return false
  const wasInOrder = items.every((it, k) => k === 0 || rank(before, items[k - 1].path) <= rank(before, it.path))
  if (!wasInOrder) return false

  const sorted = [...items].sort((a, b) => rank(after, a.path) - rank(after, b.path))
  if (sorted.every((it, k) => it === items[k])) return false

  // Cada hueco entre entradas (saltos de línea, sangría) se queda donde estaba.
  let out = text.slice(0, items[0].start)
  sorted.forEach((it, k) => {
    out += text.slice(it.start, it.end)
    out += k + 1 < items.length ? text.slice(items[k].end, items[k + 1].start) : ''
  })
  nav.text = out + text.slice(items[items.length - 1].end)
  return true
}

/** Deja un documento como primero del orden de lectura (para la portada). */
export function moveSpineToFront(book: EpubBook, path: string): boolean {
  const doc = opfDoc(book)
  const sp = doc && spineEl(doc)
  if (!doc || !sp) return false
  const ref = itemrefFor(book, doc, path)
  if (!ref) return false
  if (sp.firstElementChild === ref) return true

  removePretty(ref)
  const first = sp.firstElementChild
  if (first) {
    sp.insertBefore(ref, first)
    sp.insertBefore(doc.createTextNode('\n    '), first)
  } else {
    appendPretty(doc, sp, ref)
  }
  writeOpf(book, doc)
  return true
}

// ---------- toc.ncx (lectores antiguos) ----------

function ncxPoints(nodes: TocNode[], ncxFile: string, counter: { n: number }, pad: string): string {
  return nodes
    .map(node => {
      const id = `np-${++counter.n}`
      const order = counter.n
      const inner = node.children.length ? `\n${ncxPoints(node.children, ncxFile, counter, `${pad}  `)}` : ''
      return (
        `${pad}<navPoint id="${id}" playOrder="${order}">\n` +
        `${pad}  <navLabel><text>${escapeXml(node.h.title)}</text></navLabel>\n` +
        `${pad}  <content src="${hrefFor(ncxFile, node.h)}"/>${inner}\n` +
        `${pad}</navPoint>`
      )
    })
    .join('\n')
}

/** Genera toc.ncx y lo deja referenciado desde el spine. Devuelve su ruta. */
export function writeNcx(book: EpubBook, headings: Heading[]): string | undefined {
  const doc = opfDoc(book)
  const md = doc && metadataEl(doc)
  if (!doc || !md) return undefined

  const uid = elText(kid(md, 'identifier'))
  const title = elText(kid(md, 'title'))
  const author = elText(kid(md, 'creator'))
  const path = [dirname(book.opfPath), 'toc.ncx'].filter(Boolean).join('/')
  const depth = Math.max(1, ...headings.map(h => h.level))
  const body = headings.length ? `\n${ncxPoints(toTree(headings), path, { n: 0 }, '    ')}\n  ` : '\n  '

  book.files.set(path, {
    path,
    mediaType: 'application/x-dtbncx+xml',
    text: `<?xml version="1.0" encoding="utf-8"?>
<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1" xml:lang="es">
  <head>
    <meta name="dtb:uid" content="${escapeXml(uid)}"/>
    <meta name="dtb:depth" content="${depth}"/>
    <meta name="dtb:totalPageCount" content="0"/>
    <meta name="dtb:maxPageNumber" content="0"/>
  </head>
  <docTitle><text>${escapeXml(title)}</text></docTitle>
  <docAuthor><text>${escapeXml(author)}</text></docAuthor>
  <navMap>${body}</navMap>
</ncx>
`,
  })

  addToOpf(book, path)
  const id = parseManifest(book).find(i => i.path === path)?.id
  if (id) {
    const doc2 = opfDoc(book)
    const sp2 = doc2 && spineEl(doc2)
    if (doc2 && sp2) {
      sp2.setAttribute('toc', id)
      writeOpf(book, doc2)
    }
  }
  return path
}
