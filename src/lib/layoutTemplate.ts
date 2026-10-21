// Plantillas de maquetación: llevarse de un libro al siguiente la tipografía,
// la hoja de estilos y las páginas de cortesía.
//
// Los estilos de novela y el CSS viven dentro de cada EPUB, que es lo correcto
// —el libro tiene que ser autosuficiente—, pero significa que al empezar el
// segundo libro hay que configurarlo todo otra vez. Una plantilla es una copia
// de esas decisiones guardada fuera del libro.
//
// Lo que no se guarda es el texto: el título, el autor y el año salen de los
// metadatos del libro nuevo, porque son suyos y no de la plantilla.

import { mergeCss } from './cssMerge'
import type { EpubBook } from './epub'
import {
  addFrontMatter, PIECES, renderPiece, suggestText, type PieceId,
} from './frontMatter'
import { readMetadata, writeMetadata } from './metadata'
import {
  applyNovelStyle, cssFor, defaultNovelStyle, readStyle, styleSheetFor, type NovelStyle,
} from './novelStyle'

export interface LayoutTemplate {
  name: string
  savedAt: number
  /** Ajustes de «Estilos de novela», si el libro los tenía. */
  novel: NovelStyle | null
  /** La hoja de estilos entera, tal cual. */
  css: string
  /** Qué páginas de cortesía tenía el libro. */
  pieces: PieceId[]
  /**
   * Lo que se repite en todos los libros de una misma colección. El título y
   * el autor no están aquí a propósito: son de cada libro.
   */
  imprint?: { publisher: string; language: string }
}

const STORAGE_KEY = 'epub-editor.plantillas'

/** Lo que un libro puede aportar a una plantilla. */
export function captureTemplate(book: EpubBook, name: string): LayoutTemplate | null {
  const clean = name.trim()
  if (!clean) return null

  const sheet = styleSheetFor(book)
  const pieces = PIECES.filter(p => [...book.files.keys()].some(path => path.endsWith(`/${p.file}`)))

  const m = readMetadata(book)
  return {
    name: clean,
    savedAt: Date.now(),
    novel: readStyle(book),
    css: (sheet && book.files.get(sheet)?.text) || '',
    pieces: pieces.map(p => p.id),
    imprint: m.publisher || m.language ? { publisher: m.publisher, language: m.language } : undefined,
  }
}

function read(): LayoutTemplate[] {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (!saved) return []
    const list = JSON.parse(saved)
    if (!Array.isArray(list)) return []
    return list.filter((t): t is LayoutTemplate => !!t && typeof t.name === 'string')
  } catch {
    return []
  }
}

function write(list: LayoutTemplate[]) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(list)) } catch { /* sin almacenamiento */ }
}

/** Las más recientes primero. */
export const loadTemplates = (): LayoutTemplate[] =>
  [...read()].sort((a, b) => b.savedAt - a.savedAt)

/** Guarda o reemplaza por nombre. */
export function saveTemplate(t: LayoutTemplate): LayoutTemplate[] {
  write([t, ...read().filter(x => x.name !== t.name)])
  return loadTemplates()
}

export function deleteTemplate(name: string): LayoutTemplate[] {
  write(read().filter(t => t.name !== name))
  return loadTemplates()
}

export interface ApplyOptions {
  novel: boolean
  /**
   * Qué hacer con la hoja de estilos del libro: dejarla, reemplazarla por la
   * de la plantilla, o quedarse con la suya y añadirle lo que le falte.
   */
  css: 'no' | 'replace' | 'merge'
  pieces: boolean
  /** Editorial e idioma de la plantilla. */
  imprint: boolean
}

export const defaultApplyOptions: ApplyOptions = {
  novel: true,
  css: 'merge',
  pieces: true,
  imprint: true,
}

export interface ApplyResult {
  /** Qué se hizo, en palabras, para el aviso de deshacer. */
  done: string[]
  /** Lo que no se pudo hacer y por qué. */
  skipped: string[]
}

/**
 * Aplica la plantilla al libro abierto.
 *
 * El orden importa: primero la hoja —que es donde escriben los demás—,
 * después los estilos de novela, que ponen su bloque dentro de ella, y al
 * final los preliminares, que ya se encuentran el CSS puesto.
 */
export function applyTemplate(
  book: EpubBook,
  t: LayoutTemplate,
  opts: ApplyOptions = defaultApplyOptions,
): ApplyResult {
  const done: string[] = []
  const skipped: string[] = []

  if (opts.css !== 'no') {
    const sheet = styleSheetFor(book)
    if (!sheet) skipped.push('el libro no tiene hoja de estilos donde escribir')
    else if (!t.css) skipped.push('la plantilla no guardó ninguna hoja')
    else if (opts.css === 'replace') {
      book.files.get(sheet)!.text = t.css
      done.push(`hoja de estilos (${sheet.split('/').pop()})`)
    } else {
      const f = book.files.get(sheet)!
      const r = mergeCss(f.text ?? '', t.css)
      f.text = r.css
      if (r.added) done.push(`${r.added} regla${r.added === 1 ? '' : 's'} de estilo`)
      else skipped.push('la hoja del libro ya tenía todo lo de la plantilla')
    }
  }

  if (opts.novel) {
    if (!t.novel) skipped.push('la plantilla no guardó estilos de novela')
    else {
      const r = applyNovelStyle(book, t.novel)
      if (!r) skipped.push('no se pudieron aplicar los estilos de novela')
      else {
        const extra = [
          r.chapters && `${r.chapters} capitular${r.chapters === 1 ? '' : 'es'}`,
          r.scenes && `${r.scenes} salto${r.scenes === 1 ? '' : 's'} de escena`,
        ].filter(Boolean)
        done.push(`estilos de novela${extra.length ? ` (${extra.join(', ')})` : ''}`)
      }
    }
  }

  if (opts.imprint) {
    const im = t.imprint
    if (!im || (!im.publisher && !im.language)) skipped.push('la plantilla no guardó editorial ni idioma')
    else {
      const m = readMetadata(book)
      // Solo se rellena lo que esté vacío: lo que el libro ya dice es suyo.
      const patch = {
        ...m,
        publisher: m.publisher || im.publisher,
        language: m.language || im.language,
      }
      const cambia = patch.publisher !== m.publisher || patch.language !== m.language
      if (!cambia) skipped.push('el libro ya tenía editorial e idioma')
      else if (writeMetadata(book, patch)) done.push('editorial e idioma')
      else skipped.push('no se pudo escribir en el OPF')
    }
  }

  if (opts.pieces) {
    if (!t.pieces.length) skipped.push('la plantilla no guardó preliminares')
    else {
      const r = addFrontMatter(book, t.pieces, suggestText(book))
      if (r.created.length) done.push(`${r.created.length} página${r.created.length === 1 ? '' : 's'} de cortesía`)
      else skipped.push('las páginas de cortesía ya estaban')
    }
  }

  return { done, skipped }
}

// ---------- la plantilla de los libros nuevos ----------

const DEFAULT_KEY = 'epub-editor.plantilla-defecto'

/** Nombre de la plantilla que se aplica sola al crear un libro. */
export function defaultTemplateName(): string {
  try {
    return localStorage.getItem(DEFAULT_KEY) ?? ''
  } catch {
    return ''
  }
}

export function setDefaultTemplate(name: string) {
  try {
    if (name) localStorage.setItem(DEFAULT_KEY, name)
    else localStorage.removeItem(DEFAULT_KEY)
  } catch { /* sin almacenamiento */ }
}

/** La plantilla con la que debe nacer un libro nuevo, si hay alguna. */
export function defaultTemplate(): LayoutTemplate | null {
  const name = defaultTemplateName()
  return name ? loadTemplates().find(t => t.name === name) ?? null : null
}

// ---------- llevárselas a otro ordenador ----------

const FILE_KIND = 'epub-editor.plantillas'

export function exportTemplates(list: LayoutTemplate[]): string {
  return JSON.stringify({ kind: FILE_KIND, version: 1, templates: list }, null, 2)
}

export interface ImportResult {
  added: LayoutTemplate[]
  /** Las que ya existían con ese nombre y se renombraron al entrar. */
  renamed: string[]
  error?: string
}

/** Mete en la lista lo que venga de un archivo, sin pisar lo que ya hay. */
export function importTemplates(text: string): ImportResult {
  let data: unknown
  try {
    data = JSON.parse(text)
  } catch {
    return { added: [], renamed: [], error: 'Ese archivo no es una lista de plantillas.' }
  }

  const file = data as { kind?: string; templates?: unknown }
  if (file?.kind !== FILE_KIND || !Array.isArray(file.templates)) {
    return { added: [], renamed: [], error: 'Ese archivo no es una lista de plantillas del editor.' }
  }

  const existing = loadTemplates()
  const names = new Set(existing.map(t => t.name))
  const added: LayoutTemplate[] = []
  const renamed: string[] = []

  for (const raw of file.templates) {
    const t = raw as LayoutTemplate
    if (!t || typeof t.name !== 'string' || !t.name.trim()) continue
    let name = t.name.trim()
    if (names.has(name)) {
      let n = 2
      while (names.has(`${name} (${n})`)) n++
      renamed.push(name)
      name = `${name} (${n})`
    }
    names.add(name)
    added.push({
      name,
      savedAt: typeof t.savedAt === 'number' ? t.savedAt : Date.now(),
      novel: t.novel ?? null,
      css: typeof t.css === 'string' ? t.css : '',
      pieces: Array.isArray(t.pieces) ? t.pieces : [],
      imprint: t.imprint,
    })
  }

  if (!added.length) return { added: [], renamed: [], error: 'El archivo no traía ninguna plantilla.' }
  write([...added, ...existing])
  return { added, renamed }
}

// ---------- ver cómo queda antes de aplicarla ----------

const SAMPLE = `  <h1>Capítulo uno</h1>
  <p class="capitular">La nieve llevaba tres días cayendo sobre el valle y nadie en la casa se atrevía a decir en voz alta lo que todos pensaban: que el camino no volvería a abrirse hasta la primavera.</p>
  <p>Clara dejó la taza sobre la mesa y escuchó el silencio, que era un silencio con peso.</p>
  <p class="escena">ORNAMENTO</p>
  <p>Al otro lado de la montaña el tren seguía saliendo todas las mañanas a las seis y cuarto.</p>`

/** Un capítulo de mentira con la pinta que tendría el libro con esta plantilla. */
export function previewTemplate(t: LayoutTemplate): string {
  const novel = t.novel ?? defaultNovelStyle
  const sample = SAMPLE.replace('ORNAMENTO', novel.scene || '* * *')
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><style>
html { background: #fbf8f1; color: #1b1a17; padding: 16px 20px; font-size: 15px; }
${t.css}
${t.novel ? cssFor(t.novel) : ''}
</style></head>
<body>
${sample}
</body></html>`
}

/** Las páginas de cortesía de la plantilla, tal como saldrían en este libro. */
export function previewPieces(t: LayoutTemplate, book: EpubBook): string[] {
  const text = suggestText(book)
  return PIECES.filter(p => t.pieces.includes(p.id)).map(p => renderPiece(p, text))
}

/** Resumen de lo que lleva una plantilla, para la lista. */
export function describe(t: LayoutTemplate): string {
  const partes = [
    t.novel && 'estilos de novela',
    t.css && 'hoja de estilos',
    t.pieces.length && `${t.pieces.length} preliminar${t.pieces.length === 1 ? '' : 'es'}`,
  ].filter(Boolean) as string[]
  return partes.length ? partes.join(' · ') : 'vacía'
}
