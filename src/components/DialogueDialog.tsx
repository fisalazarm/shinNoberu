import { useMemo, useState } from 'react'
import Modal from './Modal'
import type { EpubBook } from '../lib/epub'
import {
  CODE_LABELS, countByCode, fixable, reviewDialogue,
  type DialogueCode, type DialogueIssue,
} from '../lib/dialogue'

interface Props {
  book: EpubBook
  /** Cambia con cada modificación del libro: fuerza a repasar otra vez. */
  rev: number
  onFix: (issues: DialogueIssue[]) => void
  onGo: (path: string, from: number, to: number) => void
  onClose: () => void
}

const MAX_SHOWN = 200

export default function DialogueDialog(props: Props) {
  const [only, setOnly] = useState<DialogueCode | 'todo'>('todo')

  const all = useMemo(() => reviewDialogue(props.book), [props.book, props.rev])
  const counts = useMemo(() => countByCode(all), [all])
  const shown = only === 'todo' ? all : all.filter(i => i.code === only)
  const auto = fixable(all)

  const name = (p: string) => p.split('/').pop()
  const codes = Object.keys(CODE_LABELS) as DialogueCode[]

  return (
    <Modal title="Revisión del diálogo" onClose={props.onClose} wide>
      <div className="paste-options">
        <label>
          Mostrar
          <select value={only} onChange={e => setOnly(e.target.value as DialogueCode | 'todo')}>
            <option value="todo">Todo ({all.length})</option>
            {codes.filter(c => counts[c]).map(c => (
              <option key={c} value={c}>{CODE_LABELS[c]} ({counts[c]})</option>
            ))}
          </select>
        </label>
        <span className="hint">
          Las reglas de la raya: pegada a lo que abre, con espacio delante del inciso y sin espacio
          detrás, y cerrada antes del punto si el diálogo sigue.
        </span>
      </div>

      <div className="dialogue-list">
        {all.length === 0 && <p className="hint">El diálogo está bien puntuado en todo el libro.</p>}
        <ul>
          {shown.slice(0, MAX_SHOWN).map(i => (
            <li key={`${i.path}:${i.from}:${i.code}`} className={i.fix == null ? 'manual' : ''}>
              <button onClick={() => props.onGo(i.path, i.from, Math.max(i.to, i.from + 1))} title={`${i.path}:${i.line}`}>
                <span className="ln">{name(i.path)}:{i.line}</span>
                <span className="tag">{CODE_LABELS[i.code]}</span>
                <span className="what">{i.message}</span>
              </button>
              {i.fix == null
                ? <span className="hint no-fix">a mano</span>
                : (
                  <button className="ghost small accent" title="Arreglar solo esta" onClick={() => props.onFix([i])}>
                    Arreglar
                  </button>
                )}
            </li>
          ))}
        </ul>
        {shown.length > MAX_SHOWN && (
          <p className="hint">Se muestran los primeros {MAX_SHOWN} de {shown.length}.</p>
        )}
      </div>

      <footer>
        <span className="hint">
          {all.length > 0 && `${auto.length} se arreglan solos`}
          {all.length > auto.length && ` · ${all.length - auto.length} hay que mirarlos`}
        </span>
        <button className="ghost" onClick={props.onClose}>Cerrar</button>
        <button className="primary" disabled={!auto.length} onClick={() => props.onFix(auto)}>
          Arreglar {auto.length}
        </button>
      </footer>
    </Modal>
  )
}
