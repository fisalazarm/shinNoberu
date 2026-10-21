import { useEffect, useMemo, useRef, useState } from 'react'
import Modal from './Modal'
import { pdfToParagraphSources, pdfToParagraphs, type PdfPasteOptions } from '../lib/pdfPaste'
import { prettyKey, type Snippet } from '../lib/snippets'

// ---------- Pedir un texto (nombre de archivo, etc.) ----------

export function PromptDialog(props: {
  title: string
  label: string
  initial: string
  onSubmit: (value: string) => void
  onClose: () => void
}) {
  const [value, setValue] = useState(props.initial)
  const input = useRef<HTMLInputElement>(null)
  useEffect(() => {
    const el = input.current
    if (!el) return
    el.focus()
    const dot = props.initial.lastIndexOf('.')
    el.setSelectionRange(0, dot > 0 ? dot : props.initial.length)
  }, [props.initial])
  return (
    <Modal title={props.title} onClose={props.onClose}>
      <form
        onSubmit={e => {
          e.preventDefault()
          if (value.trim()) props.onSubmit(value.trim())
        }}
      >
        <label className="field">
          {props.label}
          <input ref={input} value={value} onChange={e => setValue(e.target.value)} />
        </label>
        <footer>
          <button type="button" className="ghost" onClick={props.onClose}>Cancelar</button>
          <button type="submit" className="primary">Aceptar</button>
        </footer>
      </form>
    </Modal>
  )
}

// ---------- Pegado inteligente con vista previa ----------

export function PasteDialog(props: {
  options: PdfPasteOptions
  onOptions: (o: PdfPasteOptions) => void
  onInsert: (html: string) => void
  onClose: () => void
}) {
  const [raw, setRaw] = useState('')
  const [sel, setSel] = useState(-1)
  const area = useRef<HTMLTextAreaElement>(null)
  const result = useRef<HTMLDivElement>(null)
  const o = props.options
  const set = (patch: Partial<PdfPasteOptions>) => props.onOptions({ ...o, ...patch })

  const paras = useMemo(() => pdfToParagraphSources(raw, o), [raw, o])

  // Al moverse por el texto de la izquierda se marca el párrafo que sale de
  // ahí, para saber qué se está acomodando.
  //
  // Va en varios eventos y no solo en onSelect porque React lo implementa con
  // un polyfill que no se dispara siempre.
  const syncFromSource = () => {
    const el = area.current
    if (!el) return
    const { selectionStart: a, selectionEnd: b } = el

    // El que contiene al cursor; si cae en un hueco (una línea en blanco),
    // el último que quedó por encima.
    let at = paras.findIndex(p => p.from <= b && a <= p.to)
    if (at < 0) {
      for (let i = paras.length - 1; i >= 0; i--) {
        if (paras[i].from <= a) { at = i; break }
      }
    }

    setSel(at)
    if (at >= 0) result.current?.children[at]?.scrollIntoView({ block: 'nearest' })
  }

  /** Y al revés: pinchar un párrafo lleva a su origen en el cuadro de texto. */
  const goToSource = (i: number) => {
    const el = area.current
    const p = paras[i]
    if (!el || !p) return
    setSel(i)
    el.focus()
    el.setSelectionRange(p.from, p.to)
    // Chromium no siempre desplaza al seleccionar: se calcula a ojo por líneas.
    const before = raw.slice(0, p.from).split('\n').length - 1
    const lineHeight = parseFloat(getComputedStyle(el).lineHeight) || 18
    const top = before * lineHeight
    if (top < el.scrollTop || top > el.scrollTop + el.clientHeight - lineHeight * 2) {
      el.scrollTop = Math.max(0, top - el.clientHeight / 3)
    }
  }

  return (
    <Modal title="Pegado inteligente desde PDF" onClose={props.onClose} className="paste">
      <div className="paste-grid">
        <label className="field">
          Texto copiado del PDF
          <textarea
            autoFocus
            ref={area}
            value={raw}
            onChange={e => setRaw(e.target.value)}
            onSelect={syncFromSource}
            onKeyUp={syncFromSource}
            onMouseUp={syncFromSource}
            onClick={syncFromSource}
            placeholder="Pega aquí (Ctrl+V) el texto tal como sale del PDF…"
          />
        </label>
        <div className="field">
          Resultado: {paras.length} párrafo{paras.length === 1 ? '' : 's'}
          <div className="paste-result" ref={result}>
            {paras.map((p, i) => (
              <p
                key={i}
                className={i === sel ? 'sel' : ''}
                title="Ir a su origen en el texto de la izquierda"
                onClick={() => goToSource(i)}
              >
                {p.text}
              </p>
            ))}
          </div>
        </div>
      </div>
      <div className="paste-options">
        <label title="Una línea más corta que este porcentaje de una línea llena se considera fin de párrafo">
          Línea corta &lt; {Math.round(o.shortLineRatio * 100)}%
          <input
            type="range" min={50} max={100} value={Math.round(o.shortLineRatio * 100)}
            onChange={e => set({ shortLineRatio: Number(e.target.value) / 100 })}
          />
        </label>
        <label><input type="checkbox" checked={o.joinHyphenated} onChange={e => set({ joinHyphenated: e.target.checked })} /> Unir palabras cortadas con guion</label>
        <label><input type="checkbox" checked={o.dropPageNumbers} onChange={e => set({ dropPageNumbers: e.target.checked })} /> Quitar números de página</label>
        <label><input type="checkbox" checked={o.oneParagraphPerLine} onChange={e => set({ oneParagraphPerLine: e.target.checked })} /> Un párrafo por línea</label>
        <label>
          Clase del &lt;p&gt;
          <input className="small" value={o.paragraphClass} placeholder="(ninguna)" onChange={e => set({ paragraphClass: e.target.value.trim() })} />
        </label>
      </div>
      <footer>
        <span className="hint">
          Mueve el cursor por la izquierda y se marca su párrafo; pincha un párrafo y vuelve a su origen.
        </span>
        <button className="ghost" onClick={props.onClose}>Cancelar</button>
        <button className="primary" disabled={!paras.length} onClick={() => props.onInsert(pdfToParagraphs(raw, o))}>
          Insertar en el capítulo
        </button>
      </footer>
    </Modal>
  )
}

// ---------- Paleta de comandos (Ctrl+K) ----------

export function Palette(props: { snippets: Snippet[]; onPick: (s: Snippet) => void; onClose: () => void }) {
  const [q, setQ] = useState('')
  const [sel, setSel] = useState(0)
  const items = props.snippets.filter(s => s.name.toLowerCase().includes(q.toLowerCase()))
  return (
    <Modal title="Insertar snippet" onClose={props.onClose}>
      <input
        autoFocus
        className="palette-input"
        placeholder="Buscar… (↑↓ para moverte, Enter para insertar)"
        value={q}
        onChange={e => { setQ(e.target.value); setSel(0) }}
        onKeyDown={e => {
          if (e.key === 'ArrowDown') { e.preventDefault(); setSel(s => Math.min(s + 1, items.length - 1)) }
          if (e.key === 'ArrowUp') { e.preventDefault(); setSel(s => Math.max(s - 1, 0)) }
          if (e.key === 'Enter' && items[sel]) props.onPick(items[sel])
        }}
      />
      <ul className="palette-list">
        {items.map((s, i) => (
          <li key={s.name}>
            <button className={i === sel ? 'sel' : ''} onMouseEnter={() => setSel(i)} onClick={() => props.onPick(s)}>
              <span>{s.name}</span>
              {s.key && <kbd>{prettyKey(s.key)}</kbd>}
            </button>
          </li>
        ))}
      </ul>
    </Modal>
  )
}
