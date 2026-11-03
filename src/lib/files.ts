// Operaciones sobre un archivo suelto del libro.

import {
  addToOpf, dirname, parseManifest, relativePath, resolvePath, spinePaths, type EpubBook,
} from './epub'

const REFERENCE = /(href|src|xlink:href)="([^"#]+)(#[^"]*)?"|url\((['"]?)([^'")]+)\4\)/g

/**
 * Cambia el nombre de un archivo y arregla todo lo que apunta a él: enlaces,
 * imágenes, hojas de estilo, el manifest y el índice. false si el nombre nuevo
 * ya está ocupado.
 */
export function renameFile(book: EpubBook, oldPath: string, newPath: string): boolean {
  const src = book.files.get(oldPath)
  if (!src || oldPath === newPath || book.files.has(newPath)) return false

  for (const f of book.files.values()) {
    if (f.text == null) continue
    // El propio archivo también: puede enlazarse a sí mismo («Cap01.xhtml#n1»).
    f.text = f.text.replace(REFERENCE, (m, attr, href, frag, q, cssHref) => {
      const h = href ?? cssHref
      if (!h || /^[a-z]+:/i.test(h) || resolvePath(f.path, h) !== oldPath) return m
      const from = f.path === oldPath ? newPath : f.path
      const rel = relativePath(from, newPath)
      return attr ? `${attr}="${rel}${frag ?? ''}"` : `url(${q}${rel}${q})`
    })
  }
  book.files.delete(oldPath)
  book.files.set(newPath, { ...src, path: newPath })
  return true
}

// ---------- renombrar en serie ----------

export interface Rename {
  from: string
  to: string
}

const SLOT = /\{(n+)\}/

/**
 * El nombre del archivo `n` de la serie. `{n}` es el número tal cual, `{nn}`
 * con dos cifras, `{nnn}` con tres: «Cap{nn}.xhtml» → «Cap07.xhtml».
 */
export function seriesName(pattern: string, n: number): string {
  return pattern.replace(SLOT, (_, digits: string) => String(n).padStart(digits.length, '0'))
}

/**
 * Qué nombre recibe cada archivo, en el orden dado (el de lectura). Si el
 * patrón no sirve o pisaría un archivo que no está en la serie, da el motivo.
 */
export function planSeries(
  book: EpubBook,
  paths: string[],
  pattern: string,
  start: number,
): { plan: Rename[]; error?: string } {
  const p = pattern.trim()
  if (!SLOT.test(p)) return { plan: [], error: 'El nombre necesita {n}, {nn} o {nnn} donde va el número.' }
  if (/[\\/:*?"<>|]/.test(p.replace(SLOT, ''))) return { plan: [], error: 'El nombre no puede llevar / \\ : * ? " < > |' }
  if (!/\.x?html?$/i.test(p)) return { plan: [], error: 'El nombre tiene que acabar en .xhtml (o .html).' }

  const plan = paths.map((from, k) => ({ from, to: `${dirname(from)}/${seriesName(p, start + k)}` }))
  const moving = new Set(paths)
  const seen = new Set<string>()
  for (const r of plan) {
    if (seen.has(r.to)) return { plan, error: `Dos archivos acabarían llamándose ${r.to.split('/').pop()}.` }
    seen.add(r.to)
    if (r.to !== r.from && book.files.has(r.to) && !moving.has(r.to)) {
      return { plan, error: `Ya hay un ${r.to.split('/').pop()} que no está en la serie.` }
    }
  }
  return { plan }
}

/**
 * Aplica la serie. Va en dos pasadas, con nombres provisionales por medio,
 * porque «Cap02 → Cap01» y «Cap01 → Cap02» a la vez se pisarían.
 */
export function renameSeries(book: EpubBook, plan: Rename[]): number {
  const todo = plan.filter(r => r.from !== r.to)
  const temp = todo.map((r, k) => ({ ...r, tmp: `${dirname(r.from)}/~serie-${k}-${r.from.split('/').pop()}` }))
  for (const r of temp) renameFile(book, r.from, r.tmp)
  for (const r of temp) renameFile(book, r.tmp, r.to)
  return todo.length
}

/** Nombre libre para la copia: "Cap01.xhtml" → "Cap01-copia.xhtml". */
export function copyPath(book: EpubBook, path: string): string {
  const dir = dirname(path)
  const file = path.split('/').pop()!
  const dot = file.lastIndexOf('.')
  const base = dot > 0 ? file.slice(0, dot) : file
  const ext = dot > 0 ? file.slice(dot) : ''

  const at = (suffix: string) => [dir, `${base}${suffix}${ext}`].filter(Boolean).join('/')
  if (!book.files.has(at('-copia'))) return at('-copia')
  let n = 2
  while (book.files.has(at(`-copia-${n}`))) n++
  return at(`-copia-${n}`)
}

/**
 * Duplica un archivo. La copia entra en el manifest y, si el original está en
 * el orden de lectura, justo detrás de él.
 *
 * Los `id` internos se repiten entre los dos archivos, y está bien: han de ser
 * únicos dentro de cada documento, no en todo el libro.
 */
export function duplicateFile(book: EpubBook, path: string): string | null {
  const src = book.files.get(path)
  if (!src) return null

  const newPath = copyPath(book, path)
  book.files.set(newPath, {
    path: newPath,
    mediaType: src.mediaType,
    text: src.text,
    // Copia de los bytes: si no, las dos entradas compartirían el búfer.
    bytes: src.bytes ? new Uint8Array(src.bytes) : undefined,
  })

  const inSpine = spinePaths(book).includes(path)
  const known = parseManifest(book).some(i => i.path === path)
  addToOpf(book, newPath, { spineAfter: inSpine && known ? path : undefined })
  return newPath
}
