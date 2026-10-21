// Notas al pie numeradas solas.
//
// Los snippets de nota llevan el número escrito a mano, así que la segunda nota
// que insertabas chocaba con la primera (mismo id, y el enlace iba a la nota
// equivocada). Esto mira qué números ya existen en el documento y usa el siguiente.

import type { EditorView } from '@codemirror/view'

const NOTE_IDS = /\bid\s*=\s*"(?:nota|note|fn)(\d+)"/gi
const REF_IDS = /\bid\s*=\s*"(?:ref|fnref|noteref)(\d+)"/gi

export interface FootnoteEdit {
  n: number
  call: { at: number; text: string }
  aside: { at: number; text: string }
  /** Posición del cursor en el documento ya modificado: dentro de la nota. */
  cursor: number
}

/** Siguiente número de nota libre en el documento. */
export function nextFootnoteNumber(doc: string): number {
  let max = 0
  for (const re of [NOTE_IDS, REF_IDS]) {
    re.lastIndex = 0
    for (const m of doc.matchAll(re)) max = Math.max(max, Number(m[1]))
  }
  return max + 1
}

/** Dónde acaba el cuerpo del capítulo: antes de `</section>`, o de `</body>`. */
function bodyEnd(doc: string): number {
  for (const tag of ['</section>', '</body>']) {
    const i = doc.lastIndexOf(tag)
    if (i >= 0) return i
  }
  return doc.length
}

/**
 * Calcula las dos inserciones de una nota: la llamada en el cursor y el
 * `<aside>` al final del capítulo. Separado de CodeMirror para poder probarlo.
 */
export function footnoteEdit(doc: string, cursor: number): FootnoteEdit {
  const n = nextFootnoteNumber(doc)

  const call = `<a class="nota" epub:type="noteref" href="#nota${n}" id="ref${n}" role="doc-noteref">[${n}]</a>`

  const close = bodyEnd(doc)
  const lineStart = doc.lastIndexOf('\n', close - 1) + 1
  const pad = doc.slice(lineStart, close)
  const ind = /^[ \t]*$/.test(pad) ? `${pad}  ` : '  '

  const aside =
    `${ind}<aside class="nota-trad" epub:type="footnote" id="nota${n}" role="doc-footnote">\n` +
    `${ind}  <p><a href="#ref${n}">[${n}]</a> </p>\n` +
    `${ind}</aside>\n`

  // El cursor acaba tras "</a> ", listo para escribir el texto de la nota.
  const inAside = aside.indexOf('</a> ') + '</a> '.length
  // Si la llamada va antes del aside (lo normal), el aside se desplaza.
  const cursorOut = lineStart >= cursor ? lineStart + call.length + inAside : lineStart + inAside

  return {
    n,
    call: { at: cursor, text: call },
    aside: { at: lineStart, text: aside },
    cursor: cursorOut,
  }
}

/** Inserta una nota al pie numerada en el editor. */
export function insertFootnote(view: EditorView): boolean {
  const doc = view.state.doc.toString()
  const edit = footnoteEdit(doc, view.state.selection.main.head)
  const changes = [
    { from: edit.call.at, insert: edit.call.text },
    { from: edit.aside.at, insert: edit.aside.text },
  ].sort((a, b) => a.from - b.from)

  view.dispatch({
    changes,
    selection: { anchor: edit.cursor },
    scrollIntoView: true,
    userEvent: 'input',
  })
  view.focus()
  return true
}
