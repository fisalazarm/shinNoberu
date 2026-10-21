// Limpieza del libro: lo que no usa nadie y lo que apunta a ninguna parte.
//
// El validador ya avisa de los enlaces rotos, pero avisar no es arreglar. Aquí
// se calcula qué archivos siguen vivos y se propone un arreglo concreto para
// cada enlace que se ha quedado colgando.
//
// Vivo no es «estar en el manifest»: es que se pueda llegar desde alguna raíz
// del libro. Por eso se recorre el grafo entero. Un CSS al que solo enlazaba un
// capítulo que ya borraste está tan huérfano como el capítulo.

import {
  parseManifest, relativePath, resolvePath, spinePaths, type EpubBook,
} from './epub'
import { coverImagePath } from './metadata'
import { navItemPath } from './structure'

const EXTERNAL = /^(?:[a-z][a-z0-9+.-]*:|\/\/)/i
const REFERENCE =
  /\b(?:href|src|xlink:href)\s*=\s*"([^"]*)"|\burl\(\s*(['"]?)([^'")]+)\2\s*\)/gi

/** Lo que nunca se considera basura, aunque nadie lo enlace. */
const ESSENTIAL = /^(?:mimetype|META-INF\/)/

const lineAt = (text: string, offset: number) => text.slice(0, offset).split('\n').length

/** Las referencias de un archivo, ya resueltas a rutas del libro. */
function linksOf(book: EpubBook, path: string): string[] {
  const text = book.files.get(path)?.text
  if (text == null) return []
  const out: string[] = []
  for (const m of text.matchAll(REFERENCE)) {
    const raw = (m[1] ?? m[3] ?? '').trim()
    if (!raw || EXTERNAL.test(raw) || raw.startsWith('#')) continue
    const [target] = raw.split('#')
    if (target) out.push(resolvePath(path, target))
  }
  return out
}

/**
 * Por dónde se entra al libro: el orden de lectura, el índice, la portada y el
 * NCX. Todo lo demás tiene que colgar de alguno de ellos.
 */
export function rootsOf(book: EpubBook): string[] {
  const roots = new Set<string>(spinePaths(book))
  const nav = navItemPath(book)
  if (nav) roots.add(nav)
  const cover = coverImagePath(book)
  if (cover) roots.add(cover)
  // El NCX no lo enlaza nadie: lo declara el spine con toc="…".
  for (const i of parseManifest(book)) {
    if (i.mediaType === 'application/x-dtbncx+xml') roots.add(i.path)
  }
  return [...roots].filter(p => book.files.has(p))
}

/** Archivos a los que se llega desde las raíces, siguiendo enlace tras enlace. */
export function reachable(book: EpubBook): Set<string> {
  const seen = new Set<string>()
  const queue = rootsOf(book)
  while (queue.length) {
    const path = queue.shift()!
    if (seen.has(path) || !book.files.has(path)) continue
    seen.add(path)
    for (const next of linksOf(book, path)) {
      if (!seen.has(next)) queue.push(next)
    }
  }
  return seen
}

export interface Orphan {
  path: string
  mediaType: string
  bytes: number
  /** En el manifest pero sin nadie que lo use, o ni siquiera en el manifest. */
  inManifest: boolean
}

const sizeOf = (book: EpubBook, path: string): number => {
  const f = book.files.get(path)
  if (!f) return 0
  if (f.bytes) return f.bytes.length
  return f.text ? new Blob([f.text]).size : 0
}

/** Archivos que no usa nadie. Ordenados por tamaño: pesa más lo que más ocupa. */
export function findOrphans(book: EpubBook): Orphan[] {
  const live = reachable(book)
  const inManifest = new Set(parseManifest(book).map(i => i.path))
  const out: Orphan[] = []

  for (const f of book.files.values()) {
    if (f.path === book.opfPath || ESSENTIAL.test(f.path)) continue
    if (live.has(f.path)) continue
    out.push({
      path: f.path,
      mediaType: f.mediaType,
      bytes: sizeOf(book, f.path),
      inManifest: inManifest.has(f.path),
    })
  }
  return out.sort((a, b) => b.bytes - a.bytes || a.path.localeCompare(b.path))
}

export interface Suggestion {
  /** El valor que debería tener el atributo. */
  raw: string
  why: string
}

export interface BrokenLink {
  file: string
  line: number
  /** Posición del valor del atributo, no de la etiqueta. */
  from: number
  to: number
  raw: string
  /** Lo que falta: el archivo o el ancla dentro de él. */
  kind: 'file' | 'fragment'
  suggestion?: Suggestion
}

const base = (p: string) => p.split('/').pop() ?? p
const stem = (p: string) => base(p).replace(/\.[^.]*$/, '')

function idsOf(text: string): string[] {
  return [...text.matchAll(/\bid\s*=\s*"([^"]+)"/g)].map(m => m[1])
}

/**
 * Un arreglo solo se propone cuando no hay duda: un único archivo del libro con
 * ese nombre, o un único id que coincide salvo mayúsculas. Adivinar de más
 * sería peor que no proponer nada.
 */
function suggestFile(book: EpubBook, from: string, target: string, fragment: string): Suggestion | undefined {
  const wanted = base(target).toLowerCase()
  const hits = [...book.files.keys()].filter(p => base(p).toLowerCase() === wanted)
  // Lo mismo pero con otra extensión: el típico .html que se guardó como .xhtml.
  const byStem = hits.length
    ? hits
    : [...book.files.keys()].filter(
        p => stem(p).toLowerCase() === stem(target).toLowerCase() && /\.x?html?$/i.test(p),
      )
  if (byStem.length !== 1) return undefined
  const rel = relativePath(from, byStem[0])
  return {
    raw: fragment ? `${rel}#${fragment}` : rel,
    why: `el archivo está en ${byStem[0].split('/').slice(0, -1).join('/') || 'la raíz'}`,
  }
}

function suggestFragment(book: EpubBook, target: string, raw: string, fragment: string): Suggestion | undefined {
  const text = book.files.get(target)?.text
  if (text == null) return undefined
  const ids = idsOf(text)
  const hits = ids.filter(id => id.toLowerCase() === fragment.toLowerCase())
  if (hits.length !== 1) return undefined
  return { raw: raw.replace(`#${fragment}`, `#${hits[0]}`), why: `el id real es "${hits[0]}"` }
}

/** Enlaces internos que no llevan a ninguna parte, con su posible arreglo. */
export function findBrokenLinks(book: EpubBook): BrokenLink[] {
  const out: BrokenLink[] = []

  for (const f of book.files.values()) {
    if (f.text == null) continue
    if (f.path === book.opfPath) continue // el manifest declara, no enlaza

    for (const m of f.text.matchAll(REFERENCE)) {
      const raw = (m[1] ?? m[3] ?? '').trim()
      if (!raw || EXTERNAL.test(raw) || raw.startsWith('/')) continue

      const [target, fragment] = raw.split('#')
      const targetPath = target ? resolvePath(f.path, target) : f.path
      const exists = book.files.has(targetPath)
      if (exists && (!fragment || idsOf(book.files.get(targetPath)!.text ?? '').includes(fragment))) continue
      // Un archivo sin texto (una imagen) no tiene ids que comprobar.
      if (exists && fragment && book.files.get(targetPath)!.text == null) continue

      // El hueco exacto del valor dentro del atributo, para poder cambiarlo.
      const whole = m[0]
      const at = m.index + whole.indexOf(raw, whole.indexOf('=') + 1)

      out.push({
        file: f.path,
        line: lineAt(f.text, m.index),
        from: at,
        to: at + raw.length,
        raw,
        kind: exists ? 'fragment' : 'file',
        suggestion: exists
          ? suggestFragment(book, targetPath, raw, fragment)
          : suggestFile(book, f.path, target, fragment ?? ''),
      })
    }
  }
  return out.sort((a, b) => a.file.localeCompare(b.file) || a.from - b.from)
}

/**
 * Aplica los arreglos elegidos. De atrás hacia delante dentro de cada archivo,
 * para que las posiciones sigan valiendo mientras se cambia el texto.
 */
export function fixLinks(book: EpubBook, links: BrokenLink[]): number {
  const byFile = new Map<string, BrokenLink[]>()
  for (const l of links) {
    if (!l.suggestion) continue
    byFile.set(l.file, [...(byFile.get(l.file) ?? []), l])
  }

  let done = 0
  for (const [path, list] of byFile) {
    const f = book.files.get(path)
    if (f?.text == null) continue
    let text = f.text
    for (const l of [...list].sort((a, b) => b.from - a.from)) {
      // Si el archivo cambió por debajo, se deja estar antes que escribir mal.
      if (text.slice(l.from, l.to) !== l.raw) continue
      text = text.slice(0, l.from) + l.suggestion!.raw + text.slice(l.to)
      done++
    }
    f.text = text
  }
  return done
}

/** Borra los huérfanos elegidos, también del manifest. */
export function removeOrphans(book: EpubBook, paths: string[]): number {
  let done = 0
  for (const path of paths) {
    if (!book.files.has(path)) continue
    removeFromManifest(book, path)
    book.files.delete(path)
    done++
  }
  return done
}

/**
 * Quita del manifest la entrada de un archivo. No se usa `removeFromOpf` de
 * epub.ts porque aquel también toca el spine, y un huérfano no está en él.
 */
function removeFromManifest(book: EpubBook, path: string) {
  const opf = book.files.get(book.opfPath)
  if (!opf?.text) return
  const item = parseManifest(book).find(i => i.path === path)
  if (!item) return
  opf.text = opf.text.replace(
    new RegExp(`\\s*<item\\b[^>]*\\bid\\s*=\\s*"${item.id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"[^>]*/>`, 'i'),
    '',
  )
}

export const totalBytes = (list: Orphan[]) => list.reduce((n, o) => n + o.bytes, 0)

export function prettyBytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} kB`
  return `${(n / (1024 * 1024)).toFixed(1)} MB`
}
