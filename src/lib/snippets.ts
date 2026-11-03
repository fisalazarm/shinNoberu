// Snippets: envolver la selección en etiquetas o insertar un bloque.
// En el texto del snippet, "|" marca dónde queda el cursor.

import { EditorSelection } from '@codemirror/state'
import type { EditorView, KeyBinding } from '@codemirror/view'
import defaults from '../snippets.json'

/**
 * Cómo se rellena una variable `{NOMBRE}` del snippet:
 * - `noteChapter`: el capítulo donde está la llamada de la nota que se escribe.
 * - `lastChapter`: el último capítulo del orden de lectura.
 * - `current`: el archivo que se está editando.
 * - `ask`: preguntar cada vez, con la lista de archivos del libro.
 * - `{ text }`: siempre el mismo texto.
 */
export type VarRule = 'noteChapter' | 'lastChapter' | 'current' | 'ask' | { text: string }

export interface Snippet {
  name: string
  key?: string
  wrap?: [string, string]
  insert?: string
  /** Reglas de las variables del texto. Una variable sin regla se pregunta. */
  vars?: Record<string, VarRule>
}

const STORAGE_KEY = 'epub-editor.snippets'

/**
 * CodeMirror parte el atajo con /-(?!$)/ y compara la última parte con
 * `event.key`, que para esa tecla es "-". Los atajos escritos "…-minus" no
 * llegaban a dispararse nunca; se corrigen al cargarlos.
 */
function fixKey(key: string): string {
  return key.replace(/-minus$/i, '--').replace(/-plus$/i, '-+')
}

const normalize = (list: Snippet[]): Snippet[] =>
  list.map(s => (s.key ? { ...s, key: fixKey(s.key) } : s))

export function loadSnippets(): Snippet[] {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved) return normalize(JSON.parse(saved))
  } catch { /* sin almacenamiento: usa los de fábrica */ }
  return normalize(defaults as Snippet[])
}

export function saveSnippets(list: Snippet[]) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(list)) } catch { /* ignorar */ }
}

export function resetSnippets(): Snippet[] {
  try { localStorage.removeItem(STORAGE_KEY) } catch { /* ignorar */ }
  return normalize(defaults as Snippet[])
}

// ---------- atajos ----------

const MOD_NAMES: [RegExp, string][] = [
  [/^mod$/i, 'Ctrl'],
  [/^(cmd|meta|m)$/i, 'Cmd'],
  [/^a(lt)?$/i, 'Alt'],
  [/^(c|ctrl|control)$/i, 'Ctrl'],
  [/^s(hift)?$/i, 'Shift'],
]

/** "Mod-Shift--" → "Ctrl+Shift+-". Se parte igual que lo hace CodeMirror. */
export function prettyKey(key: string): string {
  const parts = key.split(/-(?!$)/)
  const name = parts.pop() ?? ''
  const mods = parts.map(m => MOD_NAMES.find(([re]) => re.test(m))?.[1] ?? m)
  const last = name === ' ' || name === 'Space' ? 'Espacio' : name.length === 1 ? name.toUpperCase() : name
  return [...mods, last].join('+')
}

/** Tecla pulsada → atajo en el formato de CodeMirror, o null si no sirve. */
export function keyFromEvent(e: Pick<KeyboardEvent, 'key' | 'ctrlKey' | 'metaKey' | 'altKey' | 'shiftKey'>): string | null {
  if (['Control', 'Meta', 'Alt', 'Shift', 'Dead'].includes(e.key)) return null

  const parts: string[] = []
  if (e.ctrlKey || e.metaKey) parts.push('Mod')
  if (e.altKey) parts.push('Alt')
  if (e.shiftKey) parts.push('Shift')
  // Una tecla suelta se comería la escritura normal.
  if (!parts.length) return null

  parts.push(e.key === ' ' ? 'Space' : e.key.length === 1 ? e.key.toLowerCase() : e.key)
  return parts.join('-')
}

const SAMPLE = 'texto seleccionado'

/** Cómo queda el snippet al usarlo. "│" marca dónde acaba el cursor. */
export function snippetPreview(s: Snippet, sample = SAMPLE): string {
  if (s.wrap) {
    const [open, close] = s.wrap
    if (open.includes('|')) {
      const [a, b] = splitCursor(open)
      return `${a}│${b}${sample}${close}`
    }
    return `${open}${sample}${close}│`
  }
  const [a, b] = splitCursor(s.insert ?? '')
  return `${a}│${b}`
}

/** Separa el texto en (antes, después) del marcador de cursor "|". */
function splitCursor(s: string): [string, string] {
  const i = s.indexOf('|')
  return i < 0 ? [s, ''] : [s.slice(0, i), s.slice(i + 1)]
}

export function applySnippet(view: EditorView, sn: Snippet): boolean {
  const tr = view.state.changeByRange(range => {
    const selected = view.state.sliceDoc(range.from, range.to)

    if (sn.wrap) {
      const [openA, openB] = splitCursor(sn.wrap[0])
      const close = sn.wrap[1]
      const text = openA + openB + selected + close
      // Si la apertura tiene "|" (p. ej. class="|"), el cursor va ahí; si no, tras el texto.
      const cursor = sn.wrap[0].includes('|')
        ? range.from + openA.length
        : range.from + openA.length + openB.length + selected.length
      const sel = sn.wrap[0].includes('|') || range.empty
        ? EditorSelection.cursor(cursor)
        : EditorSelection.range(range.from, range.from + text.length)
      return { changes: { from: range.from, to: range.to, insert: text }, range: sel }
    }

    const [a, b] = splitCursor(sn.insert ?? '')
    return {
      changes: { from: range.from, to: range.to, insert: a + b },
      range: EditorSelection.cursor(range.from + a.length),
    }
  })
  view.dispatch(tr, { scrollIntoView: true, userEvent: 'input' })
  view.focus()
  return true
}

/** Envuelve cada línea seleccionada (no vacía) en el snippet: útil para Ctrl+P sobre varias líneas. */
export function wrapLines(view: EditorView, sn: Snippet): boolean {
  if (!sn.wrap) return applySnippet(view, sn)
  const { state } = view
  const main = state.selection.main
  const fromLine = state.doc.lineAt(main.from)
  const toLine = state.doc.lineAt(main.to)
  if (fromLine.number === toLine.number) return applySnippet(view, sn)

  const [open, close] = [sn.wrap[0].replace('|', ''), sn.wrap[1]]
  const changes = []
  for (let n = fromLine.number; n <= toLine.number; n++) {
    const line = state.doc.line(n)
    const m = line.text.match(/^(\s*)(.*?)(\s*)$/)!
    if (!m[2]) continue
    const start = line.from + m[1].length
    changes.push({ from: start, to: start + m[2].length, insert: open + m[2] + close })
  }
  view.dispatch({ changes, userEvent: 'input' })
  view.focus()
  return true
}

/**
 * `prepare` se llama al pulsar el atajo, no al crearlo: así un snippet que se
 * numera solo (ver snippetNumbers.ts) usa el número que toca en ese momento.
 */
export function snippetKeymap(
  list: Snippet[],
  prepare: (s: Snippet) => Snippet | null = s => s,
): KeyBinding[] {
  return list
    .filter(s => s.key)
    .map(s => ({
      key: s.key!,
      preventDefault: true,
      run: (v: EditorView) => {
        // null: hay que preguntar algo antes (un archivo); lo inserta quien pregunta.
        const ready = prepare(s)
        return ready ? wrapLines(v, ready) : true
      },
    }))
}
