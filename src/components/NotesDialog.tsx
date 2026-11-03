import { useMemo, useState } from 'react'
import Modal from './Modal'
import type { EpubBook } from '../lib/epub'
import { checkNotes, NOTE_LABELS, type NoteCode } from '../lib/noteCheck'

interface Props {
  book: EpubBook
  /** Cambia con cada modificación del libro: fuerza a repasar otra vez. */
  rev: number
  onGo: (path: string, from: number, to: number) => void
  onClose: () => void
}

const MAX_SHOWN = 200

export default function NotesDialog(props: Props) {
  const [only, setOnly] = useState<NoteCode | 'todo'>('todo')
  const report = useMemo(() => checkNotes(props.book), [props.book, props.rev])
  const all = report.issues

  const counts = useMemo(() => {
    const out: Partial<Record<NoteCode, number>> = {}
    for (const i of all) out[i.code] = (out[i.code] ?? 0) + 1
    return out
  }, [all])

  const shown = only === 'todo' ? all : all.filter(i => i.code === only)
  const errors = all.filter(i => i.severity === 'error').length
  const name = (p: string) => p.split('/').pop()
  const lineOf = (path: string, at: number) =>
    (props.book.files.get(path)?.text ?? '').slice(0, at).split('\n').length

  return (
    <Modal title="Revisión de las notas" onClose={props.onClose} wide>
      <div className="paste-options">
        <label>
          Mostrar
          <select value={only} onChange={e => setOnly(e.target.value as NoteCode | 'todo')}>
            <option value="todo">Todo ({all.length})</option>
            {(Object.keys(NOTE_LABELS) as NoteCode[]).filter(c => counts[c]).map(c => (
              <option key={c} value={c}>{NOTE_LABELS[c]} ({counts[c]})</option>
            ))}
          </select>
        </label>
        <span className="hint">
          Cada llamada tiene que llevar a su nota, cada nota volver a su llamada y los números ir
          seguidos. Pulsa un aviso para ir al sitio.
        </span>
      </div>

      <div className="dialogue-list notes-list">
        {report.calls === 0 && <p className="hint">El libro no tiene llamadas a nota.</p>}
        {report.calls > 0 && all.length === 0 && (
          <p className="hint">Las {report.notes} notas cuadran: cada una con su llamada, su vuelta y su número.</p>
        )}
        <ul>
          {shown.slice(0, MAX_SHOWN).map(i => (
            <li key={`${i.path}:${i.from}:${i.code}`} className={i.severity === 'error' ? 'error' : ''}>
              <button onClick={() => props.onGo(i.path, i.from, Math.max(i.to, i.from + 1))} title={i.context}>
                <span className="ln">{name(i.path)}:{lineOf(i.path, i.from)}</span>
                <span className="tag">{NOTE_LABELS[i.code]}</span>
                <span className="what">{i.message}</span>
              </button>
            </li>
          ))}
        </ul>
        {shown.length > MAX_SHOWN && (
          <p className="hint">Se muestran los primeros {MAX_SHOWN} de {shown.length}.</p>
        )}
      </div>

      <footer>
        <span className="hint">
          {report.calls} llamada{report.calls === 1 ? '' : 's'} · {report.notes} nota{report.notes === 1 ? '' : 's'}
          {all.length > 0 && ` · ${all.length} aviso${all.length === 1 ? '' : 's'}`}
          {errors > 0 && `, ${errors} roto${errors === 1 ? '' : 's'}`}
        </span>
        <button className="primary" onClick={props.onClose}>Cerrar</button>
      </footer>
    </Modal>
  )
}
