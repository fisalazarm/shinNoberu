import { useMemo, useState } from 'react'
import Modal from './Modal'
import type { EpubBook } from '../lib/epub'
import { planSplit, type SplitAt } from '../lib/split'

interface Props {
  book: EpubBook
  path: string
  rev: number
  /** Posición del cursor en el documento, para el modo «aquí». */
  cursor: number
  onApply: (at: SplitAt) => void
  onClose: () => void
}

type Mode = 'cursor' | 'headings'

export default function SplitDialog(props: Props) {
  const [mode, setMode] = useState<Mode>('headings')
  const [level, setLevel] = useState(1)

  const at: SplitAt = mode === 'cursor'
    ? { kind: 'cursor', offset: props.cursor }
    : { kind: 'headings', level }

  // Se depende de las piezas de `at` y no del objeto, que se crea en cada
  // render. `rev` entra a propósito: el libro se modifica en el lugar.
  const plan = useMemo(
    () => planSplit(props.book, props.path, at),
    [props.book, props.rev, props.path, mode, level, props.cursor],
  )

  const pieces = plan?.pieces ?? []
  const name = props.path.split('/').pop()
  const canSplit = pieces.length > 1

  return (
    <Modal title="Partir el capítulo" onClose={props.onClose}>
      <p className="hint">
        <code>{name}</code> se queda con el primer trozo; los demás van a archivos
        nuevos, justo detrás en el orden de lectura.
      </p>

      <div className="radio-list">
        <label>
          <input type="radio" name="split" checked={mode === 'headings'} onChange={() => setMode('headings')} />
          <span className="what">
            <strong>En cada encabezado</strong>
            <span className="hint">Un archivo por capítulo. Es lo normal tras pegar un PDF entero.</span>
          </span>
        </label>
        <label>
          <input type="radio" name="split" checked={mode === 'cursor'} onChange={() => setMode('cursor')} />
          <span className="what">
            <strong>Aquí, donde está el cursor</strong>
            <span className="hint">Corta en dos por el principio de la línea del cursor.</span>
          </span>
        </label>
      </div>

      {mode === 'headings' && (
        <div className="paste-options">
          <label>
            Cortar en
            <select value={level} onChange={e => setLevel(Number(e.target.value))}>
              <option value={1}>cada h1</option>
              <option value={2}>cada h1 y h2</option>
              <option value={3}>cada h1, h2 y h3</option>
            </select>
          </label>
        </div>
      )}

      <div className="split-preview">
        {!plan && <p className="empty">Este archivo no tiene un &lt;body&gt; que se pueda partir.</p>}
        {plan && !canSplit && (
          <p className="empty">
            {mode === 'cursor'
              ? 'No hay nada antes del cursor: pon el cursor donde quieras que empiece el capítulo nuevo.'
              : 'No se encontró ningún encabezado que no sea el primero del archivo.'}
          </p>
        )}
        {plan && canSplit && (
          <ul>
            {pieces.map((p, i) => (
              <li key={i}>
                <span className="num">{i + 1}</span>
                <span className="title">{p.title}</span>
                <span className="size">{p.chars.toLocaleString()} c</span>
                <span className="fname">{i === 0 ? name : plan.names[i - 1]}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <footer>
        <span className="hint">
          {canSplit && `${pieces.length} archivos · recuerda regenerar el índice después`}
        </span>
        <button className="ghost" onClick={props.onClose}>Cancelar</button>
        <button className="primary" disabled={!canSplit} onClick={() => props.onApply(at)}>
          Partir
        </button>
      </footer>
    </Modal>
  )
}
