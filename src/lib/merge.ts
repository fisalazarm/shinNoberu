// Fusionar varios capítulos en uno. Lo simétrico de partir.
//
// Lo delicado no es pegar el texto, es que nada se quede apuntando al vacío:
// los enlaces y el índice que señalaban a los capítulos absorbidos tienen que
// acabar en el sitio correcto del capítulo resultante.

import { removeFromOpf, resolvePath, spinePaths, type EpubBook } from './epub'
import { docShell } from './split'

export interface MergeResult {
  kept: string
  absorbed: string[]
}

/** Id de anclaje para el punto donde empieza un capítulo absorbido. */
export function anchorFor(path: string): string {
  const base = path.split('/').pop()!.replace(/\.[^.]*$/, '')
  return `union-${base.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')}`
}

/**
 * El OPF no es contenido: su manifest declara archivos, no enlaza a ellos.
 * Reescribirlo rompería el libro, y contar sus entradas como enlaces haría
 * creer que todo está referenciado.
 */
const isContent = (book: EpubBook, path: string) => path !== book.opfPath

/**
 * ¿Hay algo en el libro que enlace a este archivo? Se miran todos, incluidos
 * los que se fusionan entre sí: un enlace de uno a otro sigue necesitando su
 * ancla después de la fusión.
 */
function referenced(book: EpubBook, target: string): boolean {
  for (const f of book.files.values()) {
    if (f.text == null || !isContent(book, f.path)) continue
    for (const m of f.text.matchAll(/\b(?:href|src)\s*=\s*"([^"]*)"/gi)) {
      const [raw] = m[1].split('#')
      if (raw && resolvePath(f.path, raw) === target) return true
    }
  }
  return false
}

/** Reapunta al capítulo que se queda lo que señalaba a uno absorbido. */
function redirect(book: EpubBook, from: string, to: string, anchor: string) {
  for (const f of book.files.values()) {
    if (f.text == null || !isContent(book, f.path)) continue
    f.text = f.text.replace(
      /\b(href|src)\s*=\s*"([^"]*)"/gi,
      (whole, attr: string, value: string) => {
        const [raw, frag] = value.split('#')
        if (!raw || /^[a-z]+:/i.test(raw) || resolvePath(f.path, raw) !== from) return whole
        // Si ya apuntaba a un id concreto, ese id sigue existiendo dentro.
        const target = relativeTo(f.path, to)
        return `${attr}="${target}#${frag || anchor}"`
      },
    )
  }
}

/** Ruta relativa sencilla entre dos archivos del libro. */
function relativeTo(fromFile: string, toPath: string): string {
  const from = fromFile.split('/').slice(0, -1)
  const to = toPath.split('/')
  let i = 0
  while (i < from.length && i < to.length - 1 && from[i] === to[i]) i++
  return [...Array(from.length - i).fill('..'), ...to.slice(i)].join('/')
}

/**
 * Fusiona los capítulos en el primero que aparezca en el orden de lectura.
 * Devuelve null si no hay al menos dos que se puedan fusionar.
 */
export function mergeChapters(book: EpubBook, paths: string[]): MergeResult | null {
  const order = spinePaths(book)
  const chosen = paths
    .filter(p => book.files.get(p)?.mediaType === 'application/xhtml+xml')
    .sort((a, b) => (order.indexOf(a) + 1 || 1e9) - (order.indexOf(b) + 1 || 1e9))
  if (chosen.length < 2) return null

  const [keep, ...rest] = chosen
  const target = book.files.get(keep)!
  const shell = docShell(target.text ?? '')
  if (!shell) return null

  const pieces: string[] = [shell.content.replace(/\s+$/, '')]

  for (const path of rest) {
    const other = docShell(book.files.get(path)?.text ?? '')
    if (!other) continue
    const body = other.content.replace(/^[\r\n]+/, '').replace(/\s+$/, '')
    // Solo se deja ancla si alguien la necesita: si no, es ruido en el libro.
    const needsAnchor = referenced(book, path)
    const anchor = needsAnchor ? `<a id="${anchorFor(path)}"></a>\n` : ''
    pieces.push(anchor + body)
  }

  target.text = shell.prologue + '\n' + pieces.join('\n') + shell.epilogue

  for (const path of rest) {
    redirect(book, path, keep, anchorFor(path))
    removeFromOpf(book, path)
    book.files.delete(path)
  }

  return { kept: keep, absorbed: rest }
}
