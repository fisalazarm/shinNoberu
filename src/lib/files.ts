// Operaciones sobre un archivo suelto del libro.

import { addToOpf, dirname, parseManifest, spinePaths, type EpubBook } from './epub'

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
