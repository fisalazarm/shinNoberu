// Subrayado de ortografía en el editor.
//
// Tras cada pausa al escribir se sacan las palabras del documento, se
// preguntan al diccionario las que no se conocían (casi ninguna después del
// primer vistazo) y se subrayan las dudosas. La palabra que se está
// escribiendo no se marca hasta que el cursor sale de ella: ver «ach» en rojo
// a media palabra solo distrae.

import { StateEffect, StateField, type Extension } from '@codemirror/state'
import { Decoration, EditorView, ViewPlugin, type DecorationSet, type ViewUpdate } from '@codemirror/view'
import { isAccepted, spellTokens, type Token } from './spell'
import { misspelled } from './spellClient'

const setMarks = StateEffect.define<DecorationSet>()
/** Que se vuelva a mirar todo: cambió la lista de palabras aceptadas. */
export const spellRefresh = StateEffect.define<null>()

const mark = Decoration.mark({ class: 'cm-misspelled' })

export const misspelledField = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(marks, tr) {
    marks = marks.map(tr.changes)
    for (const e of tr.effects) if (e.is(setMarks)) marks = e.value
    return marks
  },
  provide: f => EditorView.decorations.from(f),
})

/** La palabra subrayada que hay en una posición, si hay alguna. */
export function misspelledAt(view: EditorView, pos: number): Token | null {
  const marks = view.state.field(misspelledField, false)
  let found: Token | null = null
  marks?.between(pos, pos, (from, to) => {
    found = { from, to, word: view.state.sliceDoc(from, to) }
    return false
  })
  return found
}

/** Cuántas palabras hay subrayadas ahora mismo. */
export const misspelledCount = (view: EditorView) => view.state.field(misspelledField, false)?.size ?? 0

export function spellcheck(accepted: () => ReadonlySet<string>, onCount?: (n: number) => void): Extension {
  const plugin = ViewPlugin.fromClass(class {
    timer = 0
    /** Se dejó sin marcar la palabra del cursor: al salir de ella hay que mirar. */
    heldBack = false
    /** La vista ya no existe (otro archivo, se cerró): la respuesta se tira. */
    dead = false

    view: EditorView

    constructor(view: EditorView) {
      this.view = view
      this.schedule(30)
    }

    update(u: ViewUpdate) {
      const refresh = u.transactions.some(t => t.effects.some(e => e.is(spellRefresh)))
      if (u.docChanged || refresh) this.schedule(u.docChanged ? 450 : 30)
      else if (u.selectionSet && this.heldBack) this.schedule(150)
    }

    schedule(ms: number) {
      clearTimeout(this.timer)
      this.timer = window.setTimeout(() => this.run(), ms)
    }

    async run() {
      const view = this.view
      const doc = view.state.doc
      const tokens = spellTokens(doc.toString())
      const ok = accepted()
      const candidates = tokens.filter(t => !isAccepted(t.word, ok))
      const bad = await misspelled(candidates.map(t => t.word))
      // Si el texto cambió mientras se preguntaba, ya vendrá otra pasada.
      if (this.dead || view.state.doc !== doc) return

      const head = view.state.selection.main.head
      this.heldBack = false
      const ranges = []
      for (const t of candidates) {
        if (!bad.has(t.word)) continue
        if (head === t.to && view.hasFocus) { this.heldBack = true; continue }
        ranges.push(mark.range(t.from, t.to))
      }
      view.dispatch({ effects: setMarks.of(Decoration.set(ranges)) })
      onCount?.(ranges.length)
    }

    destroy() {
      this.dead = true
      clearTimeout(this.timer)
    }
  })
  return [misspelledField, plugin]
}
