// Partir un capítulo en varios archivos.
//
// Es el paso que faltaba después de pegar un PDF entero: queda un XHTML
// kilométrico que hay que cortar en capítulos. Se trabaja con el texto tal cual
// (no con DOM) para no reformatear lo que el usuario ha maquetado a mano.

import { addToOpf, dirname, parseManifest, type EpubBook } from './epub'
import { escapeXml, plainText } from './structure'

/** El documento partido en tres: cabecera, contenido del capítulo y cierre. */
export interface DocShell {
  prologue: string
  content: string
  epilogue: string
}

export type SplitAt =
  | { kind: 'cursor'; offset: number }
  | { kind: 'headings'; level: number }

export interface SplitPiece {
  title: string
  content: string
  chars: number
}

export interface SplitPlan {
  pieces: SplitPiece[]
  /** Nombres de archivo de los trozos nuevos (el primero se queda en el original). */
  names: string[]
}

export interface SplitResult {
  kept: string
  created: string[]
}

const HEADING_OPEN = /<h([1-6])\b[^>]*>/gi
const BODY_OPEN = /<body\b[^>]*>/i

/**
 * Separa la cabecera del contenido. Si todo el cuerpo está envuelto en un
 * único `<section>`, el envoltorio se considera parte de la cabecera para que
 * cada trozo lo herede.
 */
export function docShell(text: string): DocShell | null {
  const open = text.match(BODY_OPEN)
  const close = text.lastIndexOf('</body>')
  if (!open || open.index == null || close < 0) return null

  const bodyStart = open.index + open[0].length
  let start = bodyStart
  let end = close

  const inner = text.slice(bodyStart, close)
  const sectionOpen = inner.match(/^\s*<section\b[^>]*>/i)
  const sectionClose = /<\/section\s*>\s*$/i.exec(inner)
  // Solo cuenta como envoltorio si no hay más <section> por medio.
  const sectionCount = (inner.match(/<section\b/gi) ?? []).length
  if (sectionOpen && sectionClose && sectionCount === 1) {
    start = bodyStart + sectionOpen[0].length
    end = bodyStart + sectionClose.index
  }

  // El salto y la sangría que preceden al cierre son del epílogo, no del
  // contenido: así cada trozo se vuelve a montar con la misma forma.
  while (end > start && /\s/.test(text[end - 1])) end--

  return {
    prologue: text.slice(0, start),
    content: text.slice(start, end),
    epilogue: text.slice(end),
  }
}

/** Título de un trozo: su primer encabezado. */
function titleOf(content: string, fallback: string): string {
  const m = content.match(/<h[1-6]\b[^>]*>([\s\S]*?)<\/h[1-6]\s*>/i)
  const t = m ? plainText(m[1]) : ''
  return t || fallback
}

/**
 * Posiciones (dentro de `content`) donde empieza cada trozo nuevo.
 *
 * Siempre caen en el principio de una línea: cortar en medio de una etiqueta
 * dejaría los dos trozos mal formados, y así cada trozo conserva su sangría.
 */
function boundaries(content: string, at: SplitAt): number[] {
  const lineStart = (i: number) => content.lastIndexOf('\n', i - 1) + 1
  /** Un corte sin nada delante no abre un trozo: ya está dentro del primero. */
  const usable = (i: number) => i > 0 && !!content.slice(0, i).trim()

  if (at.kind === 'cursor') {
    const cut = lineStart(Math.max(0, Math.min(at.offset, content.length)))
    return usable(cut) ? [cut] : []
  }

  const out = new Set<number>()
  for (const m of content.matchAll(HEADING_OPEN)) {
    if (Number(m[1]) > at.level) continue
    const cut = lineStart(m.index)
    if (usable(cut)) out.add(cut)
  }
  return [...out].sort((a, b) => a - b)
}

/** Calcula los trozos sin tocar el libro, para la vista previa del diálogo. */
export function planSplit(book: EpubBook, path: string, at: SplitAt): SplitPlan | null {
  const text = book.files.get(path)?.text
  if (text == null) return null
  const shell = docShell(text)
  if (!shell) return null

  const cuts = at.kind === 'cursor'
    ? boundaries(shell.content, { kind: 'cursor', offset: at.offset - shell.prologue.length })
    : boundaries(shell.content, at)

  const starts = [0, ...cuts]
  const base = path.split('/').pop()!.replace(/\.[^.]*$/, '')
  const ext = path.slice(path.lastIndexOf('.'))
  const dir = dirname(path)

  const pieces: SplitPiece[] = starts.map((s, i) => {
    const content = shell.content.slice(s, starts[i + 1] ?? shell.content.length)
    return {
      title: titleOf(content, i === 0 ? base : `${base} (${i + 1})`),
      content,
      chars: content.trim().length,
    }
  })

  // Nombres para los trozos 2..n, saltando los que ya existan.
  const names: string[] = []
  let n = 2
  for (let i = 1; i < pieces.length; i++) {
    while (book.files.has(`${dir}/${base}-${n}${ext}`) || names.includes(`${base}-${n}${ext}`)) n++
    names.push(`${base}-${n}${ext}`)
    n++
  }

  return { pieces, names }
}

/** Reconstruye un archivo completo con el contenido de un trozo. */
function fileFor(shell: DocShell, content: string, title?: string): string {
  const prologue = title
    ? shell.prologue.replace(/(<title\b[^>]*>)[\s\S]*?(<\/title\s*>)/i, `$1${escapeXml(title)}$2`)
    : shell.prologue
  // Se quitan los saltos de los extremos pero no la sangría de la primera
  // línea; el epílogo ya trae su propio salto y sangría (ver docShell).
  const body = content.replace(/^[\r\n]+/, '').replace(/\s+$/, '')
  return prologue + '\n' + body + shell.epilogue
}

/**
 * Parte el capítulo. El primer trozo se queda en el archivo original y los
 * demás van a archivos nuevos, metidos en el spine justo detrás.
 */
export function splitChapter(book: EpubBook, path: string, at: SplitAt): SplitResult | null {
  const file = book.files.get(path)
  if (!file || file.text == null) return null
  const shell = docShell(file.text)
  const plan = planSplit(book, path, at)
  if (!shell || !plan || plan.pieces.length < 2) return null

  const dir = dirname(path)
  const created: string[] = []
  let after = path

  for (let i = 1; i < plan.pieces.length; i++) {
    const newPath = `${dir}/${plan.names[i - 1]}`
    book.files.set(newPath, {
      path: newPath,
      mediaType: 'application/xhtml+xml',
      text: fileFor(shell, plan.pieces[i].content, plan.pieces[i].title),
    })
    addToOpf(book, newPath, { spineAfter: parseManifest(book).some(x => x.path === after) ? after : undefined })
    created.push(newPath)
    after = newPath
  }

  // El original conserva su propio <title>: solo cambia el contenido.
  file.text = fileFor(shell, plan.pieces[0].content)

  return { kept: path, created }
}
