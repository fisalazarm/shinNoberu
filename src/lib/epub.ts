// Modelo de un EPUB en memoria: un mapa ruta-en-el-zip → contenido.
// Los archivos de texto se guardan como string para editarlos; el resto como bytes.

import JSZip from 'jszip'

export interface EpubFile {
  path: string // ruta dentro del zip, p. ej. "OEBPS/Text/Cap01.xhtml"
  mediaType: string
  text?: string
  bytes?: Uint8Array
}

export interface EpubBook {
  files: Map<string, EpubFile>
  opfPath: string
}

const TEXT_EXT = /\.(x?html?|css|opf|ncx|xml|txt|js|svg)$/i

const MEDIA_BY_EXT: Record<string, string> = {
  xhtml: 'application/xhtml+xml',
  html: 'application/xhtml+xml',
  css: 'text/css',
  opf: 'application/oebps-package+xml',
  ncx: 'application/x-dtbncx+xml',
  xml: 'application/xml',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  gif: 'image/gif',
  webp: 'image/webp',
  svg: 'image/svg+xml',
  ttf: 'font/ttf',
  otf: 'font/otf',
  woff: 'font/woff',
  woff2: 'font/woff2',
  js: 'application/javascript',
}

export function guessMediaType(path: string): string {
  const ext = path.split('.').pop()?.toLowerCase() ?? ''
  return MEDIA_BY_EXT[ext] ?? 'application/octet-stream'
}

export function isTextFile(path: string): boolean {
  return TEXT_EXT.test(path) || path === 'mimetype'
}

// ---------- rutas ----------

export function dirname(p: string): string {
  const i = p.lastIndexOf('/')
  return i < 0 ? '' : p.slice(0, i)
}

/** Resuelve una ruta relativa (href de un archivo) contra el archivo que la contiene. */
export function resolvePath(fromFile: string, href: string): string {
  const clean = decodeURIComponent(href.split('#')[0].split('?')[0])
  const parts = (clean.startsWith('/') ? [] : dirname(fromFile).split('/')).filter(Boolean)
  for (const seg of clean.split('/')) {
    if (!seg || seg === '.') continue
    if (seg === '..') parts.pop()
    else parts.push(seg)
  }
  return parts.join('/')
}

/** Ruta relativa desde el archivo `fromFile` hasta `toPath`. */
export function relativePath(fromFile: string, toPath: string): string {
  const from = dirname(fromFile).split('/').filter(Boolean)
  const to = toPath.split('/')
  let i = 0
  while (i < from.length && i < to.length - 1 && from[i] === to[i]) i++
  return [...Array(from.length - i).fill('..'), ...to.slice(i).map(encodeURIComponent)].join('/')
}

// ---------- abrir / guardar ----------

export async function loadEpub(data: Uint8Array | ArrayBuffer): Promise<EpubBook> {
  const zip = await JSZip.loadAsync(data)
  const files = new Map<string, EpubFile>()

  for (const entry of Object.values(zip.files)) {
    if (entry.dir) continue
    const path = entry.name
    const f: EpubFile = { path, mediaType: guessMediaType(path) }
    if (isTextFile(path)) f.text = await entry.async('string')
    else f.bytes = await entry.async('uint8array')
    files.set(path, f)
  }

  const container = files.get('META-INF/container.xml')?.text
  const opfPath =
    container?.match(/full-path\s*=\s*"([^"]+)"/)?.[1] ??
    [...files.keys()].find(p => p.endsWith('.opf'))
  if (!opfPath) throw new Error('No se encontró el archivo .opf (¿es un EPUB válido?)')

  // Usa los media-type declarados en el OPF cuando existen.
  for (const item of parseManifest({ files, opfPath })) {
    const f = files.get(item.path)
    if (f) f.mediaType = item.mediaType
  }

  return { files, opfPath }
}

export async function saveEpub(book: EpubBook): Promise<Uint8Array> {
  const zip = new JSZip()
  // El "mimetype" debe ir primero y sin comprimir.
  zip.file('mimetype', 'application/epub+zip', { compression: 'STORE' })
  for (const f of book.files.values()) {
    if (f.path === 'mimetype') continue
    zip.file(f.path, f.text ?? f.bytes ?? '')
  }
  return zip.generateAsync({
    type: 'uint8array',
    compression: 'DEFLATE',
    compressionOptions: { level: 9 },
    mimeType: 'application/epub+zip',
  })
}

// ---------- OPF ----------

const escRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

export interface ManifestItem {
  id: string
  href: string
  path: string
  mediaType: string
  properties?: string
}

function parseOpf(book: EpubBook): Document | null {
  const text = book.files.get(book.opfPath)?.text
  if (!text) return null
  const doc = new DOMParser().parseFromString(text, 'application/xml')
  return doc.querySelector('parsererror') ? null : doc
}

export function parseManifest(book: EpubBook): ManifestItem[] {
  const doc = parseOpf(book)
  if (!doc) return []
  return [...doc.getElementsByTagName('item')].map(el => {
    const href = el.getAttribute('href') ?? ''
    return {
      id: el.getAttribute('id') ?? '',
      href,
      path: resolvePath(book.opfPath, href),
      mediaType: el.getAttribute('media-type') ?? guessMediaType(href),
      properties: el.getAttribute('properties') ?? undefined,
    }
  })
}

/** Rutas de los documentos en el orden de lectura (spine). */
export function spinePaths(book: EpubBook): string[] {
  const doc = parseOpf(book)
  if (!doc) return []
  const byId = new Map(parseManifest(book).map(i => [i.id, i.path]))
  return [...doc.getElementsByTagName('itemref')]
    .map(el => byId.get(el.getAttribute('idref') ?? ''))
    .filter((p): p is string => !!p)
}

/** Agrega un archivo al manifest (y al spine si es un documento). */
export function addToOpf(book: EpubBook, path: string, opts: { spineAfter?: string } = {}) {
  const opf = book.files.get(book.opfPath)
  if (!opf?.text) return
  const href = relativePath(book.opfPath, path)
  const mediaType = guessMediaType(path)
  const base = path.split('/').pop()!.replace(/[^A-Za-z0-9_.-]/g, '_')
  const id = /^[A-Za-z_]/.test(base) ? base : `x${base}`

  let text = opf.text
  if (!text.includes(`href="${href}"`)) {
    text = text.replace(
      /(\s*)<\/manifest>/,
      `$1  <item id="${id}" href="${href}" media-type="${mediaType}"/>$1</manifest>`,
    )
  }
  if (mediaType === 'application/xhtml+xml' && !text.includes(`idref="${id}"`)) {
    const afterId = opts.spineAfter && parseManifest(book).find(i => i.path === opts.spineAfter)?.id
    const ref = `<itemref idref="${id}"/>`
    const afterRe = afterId && new RegExp(`(<itemref[^>]*idref="${escRe(afterId)}"[^>]*/>)`)
    if (afterRe && afterRe.test(text)) text = text.replace(afterRe, `$1\n    ${ref}`)
    else text = text.replace(/(\s*)<\/spine>/, `$1  ${ref}$1</spine>`)
  }
  opf.text = text
}

export function removeFromOpf(book: EpubBook, path: string) {
  const opf = book.files.get(book.opfPath)
  if (!opf?.text) return
  const item = parseManifest(book).find(i => i.path === path)
  if (!item) return
  opf.text = opf.text
    .replace(new RegExp(`\\s*<item\\b[^>]*\\bid="${escRe(item.id)}"[^>]*/>`), '')
    .replace(new RegExp(`\\s*<itemref\\b[^>]*\\bidref="${escRe(item.id)}"[^>]*/>`), '')
}
