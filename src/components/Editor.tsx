import { useEffect, useRef } from 'react'
import { basicSetup } from 'codemirror'
import { Compartment, EditorState, type Extension } from '@codemirror/state'
import { EditorView, keymap } from '@codemirror/view'
import { indentWithTab } from '@codemirror/commands'
import { html } from '@codemirror/lang-html'
import { css } from '@codemirror/lang-css'
import { xml } from '@codemirror/lang-xml'
import { snippetKeymap, type Snippet } from '../lib/snippets'
import { pdfToParagraphs, type PdfPasteOptions } from '../lib/pdfPaste'
import { insertFootnote } from '../lib/footnotes'
import { editorTheme } from '../lib/editorTheme'
import { misspelledAt, spellcheck, spellRefresh } from '../lib/spellExtension'
import type { Theme } from '../lib/theme'

/** Dónde está el cursor, para la barra de estado. */
export interface CursorInfo {
  line: number
  col: number
  /** Carácter a la derecha del cursor, vacío al final de la línea. */
  char: string
}

/** Clic derecho sobre una palabra subrayada. */
export interface SpellMenuRequest {
  x: number
  y: number
  from: number
  to: number
  word: string
}

/** Salto pedido desde fuera (resultado de búsqueda, problema del validador). */
export interface Goto {
  path: string
  from: number
  to?: number
  /** Cambia en cada petición, incluso si es la misma posición. */
  nonce: number
}

interface Props {
  path: string
  doc: string
  snippets: Snippet[]
  /**
   * Rellena los huecos de un snippet (número de nota, variables) justo antes de
   * usarlo. null: hay que preguntar algo antes, y lo insertará quien pregunte.
   */
  prepareSnippet?: (s: Snippet) => Snippet | null
  smartPaste: boolean
  pasteOptions: PdfPasteOptions
  theme: Theme
  goto?: Goto
  /** Subrayar la ortografía (solo en XHTML). */
  spellOn: boolean
  /** Palabras que no se subrayan aunque el diccionario no las conozca. */
  spellAccepted: ReadonlySet<string>
  onSpellMenu: (m: SpellMenuRequest) => void
  onChange: (path: string, text: string) => void
  onCursor: (c: CursorInfo) => void
  onReady: (view: EditorView) => void
}

function languageFor(path: string): Extension {
  if (/\.css$/i.test(path)) return css()
  if (/\.(opf|ncx|xml)$/i.test(path)) return xml()
  return html({ matchClosingTags: true, autoCloseTags: true })
}

/** Si el cursor está dentro de un "<p></p>" vacío, devuelve su rango para reemplazarlo entero. */
function emptyParagraphAround(view: EditorView): { from: number; to: number } | null {
  const { from, to } = view.state.selection.main
  if (from !== to) return null
  const line = view.state.doc.lineAt(from)
  const m = line.text.match(/<p(\s[^>]*)?>\s*<\/p>/)
  if (!m || m.index == null) return null
  const start = line.from + m.index
  const end = start + m[0].length
  return from >= start && from <= end ? { from: start, to: end } : null
}

export default function Editor(props: Props) {
  const host = useRef<HTMLDivElement>(null)
  const view = useRef<EditorView | null>(null)
  const states = useRef(new Map<string, EditorState>()) // conserva el historial de deshacer por archivo
  const currentPath = useRef(props.path)
  const latest = useRef(props)
  latest.current = props
  const rawNextPaste = useRef(false)

  /** Avisa de dónde está el cursor y qué carácter tiene delante. */
  const report = (state: EditorState) => {
    const head = state.selection.main.head
    const line = state.doc.lineAt(head)
    // Se leen dos unidades por si el carácter es un par suplente.
    const next = state.sliceDoc(head, Math.min(head + 2, state.doc.length))
    const cp = next.codePointAt(0)
    latest.current.onCursor({
      line: line.number,
      col: head - line.from + 1,
      char: cp == null ? '' : String.fromCodePoint(cp),
    })
  }

  const langConf = useRef(new Compartment())
  const keysConf = useRef(new Compartment())
  const themeConf = useRef(new Compartment())
  const spellConf = useRef(new Compartment())

  const makeSpell = (path: string): Extension =>
    latest.current.spellOn && /\.x?html?$/i.test(path)
      ? spellcheck(() => latest.current.spellAccepted)
      : []

  const makeKeys = () =>
    keymap.of([
      ...snippetKeymap(latest.current.snippets, s => (latest.current.prepareSnippet ? latest.current.prepareSnippet(s) : s)),
      {
        key: 'Mod-Shift-v', // pegar sin limpiar
        run: () => { rawNextPaste.current = true; return false },
      },
      { key: 'Mod-Alt-n', preventDefault: true, run: insertFootnote },
      indentWithTab,
    ])

  const makeState = (path: string, doc: string) =>
    EditorState.create({
      doc,
      extensions: [
        keysConf.current.of(makeKeys()),
        basicSetup,
        langConf.current.of(languageFor(path)),
        themeConf.current.of(editorTheme(latest.current.theme)),
        spellConf.current.of(makeSpell(path)),
        EditorView.lineWrapping,
        EditorView.updateListener.of(u => {
          if (u.docChanged) latest.current.onChange(currentPath.current, u.state.doc.toString())
          if (u.docChanged || u.selectionSet) report(u.state)
        }),
        EditorView.domEventHandlers({
          contextmenu(event, v) {
            const pos = v.posAtCoords({ x: event.clientX, y: event.clientY })
            const hit = pos == null ? null : misspelledAt(v, pos)
            if (!hit) return false
            event.preventDefault()
            latest.current.onSpellMenu({ x: event.clientX, y: event.clientY, ...hit })
            return true
          },
          paste(event, v) {
            const raw = rawNextPaste.current
            rawNextPaste.current = false
            const p = latest.current
            if (raw || !p.smartPaste || !/\.x?html?$/i.test(currentPath.current)) return false
            const text = event.clipboardData?.getData('text/plain') ?? ''
            // Solo limpia texto "de prosa": si ya trae etiquetas, se pega tal cual.
            if (!text.trim() || /<\/?[a-z][^>]*>/i.test(text)) return false
            event.preventDefault()
            const target = emptyParagraphAround(v) ?? v.state.selection.main
            // Cada párrafo nuevo hereda la sangría de la línea donde se pega.
            const indent = v.state.doc.lineAt(target.from).text.match(/^\s*/)![0]
            const out = pdfToParagraphs(text, p.pasteOptions).replace(/\n/g, '\n' + indent)
            v.dispatch({
              changes: { from: target.from, to: target.to, insert: out },
              selection: { anchor: target.from + out.length },
              scrollIntoView: true,
              userEvent: 'input.paste',
            })
            return true
          },
        }),
      ],
    })

  // Crear la vista una sola vez.
  useEffect(() => {
    const st = makeState(props.path, props.doc)
    states.current.set(props.path, st)
    view.current = new EditorView({ state: st, parent: host.current! })
    props.onReady(view.current)
    report(st)
    return () => view.current?.destroy()
  }, [])

  // Cambiar de archivo: guarda el estado del anterior y carga (o crea) el del nuevo.
  useEffect(() => {
    const v = view.current
    if (!v || currentPath.current === props.path) return
    states.current.set(currentPath.current, v.state)
    currentPath.current = props.path
    const cached = states.current.get(props.path)
    v.setState(cached && cached.doc.toString() === props.doc ? cached : makeState(props.path, props.doc))
    // El estado en caché guarda los compartimentos de cuando se creó: hay que
    // reponer los atajos y el tema por si cambiaron mientras estaba guardado.
    v.dispatch({
      effects: [
        keysConf.current.reconfigure(makeKeys()),
        themeConf.current.reconfigure(editorTheme(props.theme)),
        spellConf.current.reconfigure(makeSpell(props.path)),
      ],
    })
    report(v.state)
  }, [props.path])

  // Si el texto cambia desde fuera (p. ej. al renombrar o abrir otro libro), sincronizar.
  useEffect(() => {
    const v = view.current
    if (!v || currentPath.current !== props.path) return
    if (v.state.doc.toString() !== props.doc) {
      v.dispatch({ changes: { from: 0, to: v.state.doc.length, insert: props.doc } })
    }
  }, [props.doc, props.path])

  // Atajos nuevos cuando cambia la lista de snippets.
  useEffect(() => {
    view.current?.dispatch({ effects: keysConf.current.reconfigure(makeKeys()) })
  }, [props.snippets])

  // Encender o apagar la ortografía.
  useEffect(() => {
    view.current?.dispatch({ effects: spellConf.current.reconfigure(makeSpell(currentPath.current)) })
  }, [props.spellOn])

  // Se añadió una palabra al diccionario: volver a mirar.
  useEffect(() => {
    view.current?.dispatch({ effects: spellRefresh.of(null) })
  }, [props.spellAccepted])

  // Cambio de tema claro/oscuro sin perder el documento ni el historial.
  useEffect(() => {
    view.current?.dispatch({ effects: themeConf.current.reconfigure(editorTheme(props.theme)) })
  }, [props.theme])

  // Saltar a una posición concreta. Va después del cambio de archivo, así que
  // el documento correcto ya está cargado.
  useEffect(() => {
    const g = props.goto
    const v = view.current
    if (!g || !v || g.path !== props.path) return
    const max = v.state.doc.length
    const from = Math.min(g.from, max)
    const to = Math.min(g.to ?? g.from, max)
    v.dispatch({
      selection: { anchor: from, head: to },
      effects: EditorView.scrollIntoView(from, { y: 'center' }),
    })
    v.focus()
  }, [props.goto?.nonce])

  return <div className="editor" ref={host} />
}

