import { useMemo, useState } from 'react'
import Modal from './Modal'
import type { EpubBook } from '../lib/epub'
import {
  allTidyRules, changeContext, defaultTidyOptions, RULE_LABELS, tidyChanges, type TidyOptions,
} from '../lib/tidy'

interface Props {
  book: EpubBook
  rev: number
  /** Capítulo abierto; `undefined` si lo que hay abierto no es un capítulo. */
  activePath?: string
  onApply: (options: TidyOptions, only?: string) => void
  onClose: () => void
}

type Scope = 'file' | 'book'
const RULES = Object.keys(RULE_LABELS) as (keyof TidyOptions)[]
const MAX_SHOWN = 14

export default function TidyDialog(props: Props) {
  const [options, setOptions] = useState<TidyOptions>(defaultTidyOptions)
  const [scope, setScope] = useState<Scope>(props.activePath ? 'file' : 'book')

  const set = (patch: Partial<TidyOptions>) => setOptions(o => ({ ...o, ...patch }))

  const docs = useMemo(
    () =>
      [...props.book.files.values()].filter(
        f => f.mediaType === 'application/xhtml+xml' && f.text != null &&
          (scope === 'book' || f.path === props.activePath),
      ),
    // `rev` entra a propósito: el libro se modifica en el lugar.
    [props.book, props.rev, scope, props.activePath],
  )

  // Con todas las reglas activas, para poder enseñar el recuento de cada una
  // aunque esté desmarcada.
  const found = useMemo(
    () => docs.map(f => ({ path: f.path, text: f.text!, changes: tidyChanges(f.text!, allTidyRules) })),
    [docs],
  )

  const counts = useMemo(() => {
    const n: Record<string, number> = {}
    for (const r of RULES) n[r] = 0
    for (const f of found) for (const c of f.changes) n[c.rule]++
    return n
  }, [found])

  const picked = useMemo(
    () => found.flatMap(f => f.changes.filter(c => options[c.rule]).map(c => ({ ...c, text: f.text, path: f.path }))),
    [found, options],
  )

  const name = (p: string) => p.split('/').pop()

  return (
    <Modal title="Limpiar documento" onClose={props.onClose} wide>
      <div className="paste-options">
        <label>
          Dónde
          <select value={scope} onChange={e => setScope(e.target.value as Scope)}>
            <option value="file" disabled={!props.activePath}>
              {props.activePath ? `Solo ${name(props.activePath)}` : 'Solo este capítulo'}
            </option>
            <option value="book">Todo el libro</option>
          </select>
        </label>
        <span className="hint">Nunca se toca lo que hay dentro de las etiquetas.</span>
      </div>

      <div className="tidy-rules">
        {RULES.map(r => (
          <label key={r} className={counts[r] ? '' : 'none'}>
            <input
              type="checkbox"
              checked={options[r]}
              disabled={!counts[r]}
              onChange={e => set({ [r]: e.target.checked } as Partial<TidyOptions>)}
            />
            <span className="label">{RULE_LABELS[r]}</span>
            <span className="count">{counts[r]}</span>
          </label>
        ))}
      </div>

      <div className="tidy-preview">
        {picked.length === 0 ? (
          <p className="empty">No hay nada que limpiar aquí.</p>
        ) : (
          <ul>
            {picked.slice(0, MAX_SHOWN).map((c, i) => {
              const ctx = changeContext(c.text, c)
              return (
                <li key={i}>
                  {scope === 'book' && <span className="where">{name(c.path)}</span>}
                  <span className="was">{ctx.before}</span>
                  <span className="arrow">→</span>
                  <span className="now">{ctx.after}</span>
                </li>
              )
            })}
          </ul>
        )}
      </div>

      <footer>
        <span className="hint">
          {picked.length > 0 &&
            `${picked.length} cambio${picked.length === 1 ? '' : 's'}` +
              (picked.length > MAX_SHOWN ? `, se muestran los ${MAX_SHOWN} primeros` : '')}
        </span>
        <button className="ghost" onClick={props.onClose}>Cancelar</button>
        <button
          className="primary"
          disabled={!picked.length}
          onClick={() => props.onApply(options, scope === 'file' ? props.activePath : undefined)}
        >
          Limpiar ({picked.length})
        </button>
      </footer>
    </Modal>
  )
}
