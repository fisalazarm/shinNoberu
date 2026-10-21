// Convierte texto copiado de un PDF en párrafos <p> limpios.
//
// El PDF entrega cada línea visual como un salto de línea, con espacios de más,
// palabras cortadas con guion y números de página sueltos. Aquí se reconstruyen
// los párrafos reales con algunas heurísticas ajustables.

export interface PdfPasteOptions {
  /** Una línea "corta" mide menos que este porcentaje de una línea llena (0–1). */
  shortLineRatio: number
  /** Descarta líneas que son solo un número (números de página). */
  dropPageNumbers: boolean
  /** Une "pala-" + "bra" en "palabra". */
  joinHyphenated: boolean
  /** Cada salto de línea es un párrafo (para textos que ya vienen bien). */
  oneParagraphPerLine: boolean
  /** Clase opcional para cada <p>. */
  paragraphClass: string
}

export const defaultPdfPasteOptions: PdfPasteOptions = {
  shortLineRatio: 0.85,
  dropPageNumbers: true,
  joinHyphenated: true,
  oneParagraphPerLine: false,
  paragraphClass: '',
}

const ENDS_SENTENCE = /[.!?…:」』"”»)\]]$/
const STARTS_NEW = /^(—|–|―|「|『|"|“|«)/
const SEPARATOR = /^([◇◆・*＊]\s*){1,5}$/
const LOWER_START = /^[a-záéíóúüñ]/
const HYPHEN_END = /[a-záéíóúüñ]-$/i

export function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

/** Un párrafo del resultado, y el trozo del original que lo produjo. */
export interface Paragraph {
  text: string
  from: number
  to: number
}

/** Construidos desde el código para no dejar invisibles sueltos en el fuente. */
const SOFT_HYPHEN = new RegExp(String.fromCodePoint(0x00ad), 'g')
const ODD_SPACES = new RegExp('[ \t' + String.fromCodePoint(0x00a0) + String.fromCodePoint(0x3000) + ']+', 'g')

interface SourceLine {
  text: string
  from: number
  to: number
}

/**
 * Parte el texto en líneas ya normalizadas, recordando dónde estaba cada una.
 * Se corta sobre el original, y no sobre una copia con los saltos unificados,
 * para que las posiciones sigan valiendo dentro del cuadro de texto.
 */
function sourceLines(raw: string): SourceLine[] {
  const out: SourceLine[] = []
  const breaks = /\r\n|\r|\n/g
  const push = (from: number, to: number) => {
    out.push({
      text: raw.slice(from, to).replace(SOFT_HYPHEN, '').replace(ODD_SPACES, ' ').trim(),
      from,
      to,
    })
  }

  let at = 0
  let m: RegExpExecArray | null
  while ((m = breaks.exec(raw))) {
    push(at, m.index)
    at = m.index + m[0].length
  }
  push(at, raw.length)
  return out
}

/** Los párrafos con el rango del texto original del que salieron. */
export function pdfToParagraphSources(raw: string, opts: Partial<PdfPasteOptions> = {}): Paragraph[] {
  const o = { ...defaultPdfPasteOptions, ...opts }
  const lines = sourceLines(raw)
  const isPageNumber = (l: SourceLine) => o.dropPageNumbers && /^\d{1,4}$/.test(l.text)

  if (o.oneParagraphPerLine) {
    return lines
      .filter(l => l.text && !isPageNumber(l))
      .map(l => ({ text: l.text, from: l.from, to: l.to }))
  }

  // Largo "normal" de una línea llena (percentil 75), para detectar finales de párrafo.
  const lens = lines.filter(l => l.text).map(l => l.text.length).sort((a, b) => a - b)
  const fullLine = lens[Math.floor(lens.length * 0.75)] ?? 0

  const paras: Paragraph[] = []
  let cur = ''
  let from = 0
  let to = 0
  let prevLen = 0

  const flush = () => {
    if (cur) paras.push({ text: cur, from, to })
    cur = ''
  }
  const start = (l: SourceLine) => {
    cur = l.text
    from = l.from
    to = l.to
    prevLen = l.text.length
  }

  for (const line of lines) {
    if (!line.text) { flush(); continue } // línea vacía = corte de párrafo
    if (isPageNumber(line)) continue
    if (SEPARATOR.test(line.text)) { // ◇ / *** van solos
      flush()
      paras.push({ text: line.text, from: line.from, to: line.to })
      continue
    }

    if (!cur) { start(line); continue }

    const prevWasShort = prevLen < fullLine * o.shortLineRatio
    if ((ENDS_SENTENCE.test(cur) && prevWasShort) || STARTS_NEW.test(line.text)) {
      flush()
      start(line)
      continue
    }

    if (o.joinHyphenated && HYPHEN_END.test(cur) && LOWER_START.test(line.text)) {
      cur = cur.slice(0, -1) + line.text
    } else {
      cur += ' ' + line.text
    }
    to = line.to
    prevLen = line.text.length
  }
  flush()
  return paras
}

/** Devuelve los párrafos como texto plano (útil para tests y vista previa). */
export function pdfToParagraphList(raw: string, opts: Partial<PdfPasteOptions> = {}): string[] {
  return pdfToParagraphSources(raw, opts).map(p => p.text)
}

export function pdfToParagraphs(raw: string, opts: Partial<PdfPasteOptions> = {}): string {
  const o = { ...defaultPdfPasteOptions, ...opts }
  const open = o.paragraphClass ? `<p class="${o.paragraphClass}">` : '<p>'
  return pdfToParagraphList(raw, o)
    .map(p => `${open}${escapeHtml(p)}</p>`)
    .join('\n')
}
