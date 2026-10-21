import { useState } from 'react'
import Modal from './Modal'
import Icon from './Icon'
import {
  defaultLabel, describeDelta, formatBytes, type CheckpointMeta,
} from '../lib/checkpoints'
import { timeAgo } from '../lib/autosave'

interface Props {
  list: CheckpointMeta[]
  /** Estado del libro ahora, para decir qué ha cambiado desde cada punto. */
  now: { files: number; words: number }
  onCreate: (label: string) => void
  onRestore: (meta: CheckpointMeta) => void
  onCompare: (meta: CheckpointMeta) => void
  onDelete: (id: string) => void
  onClose: () => void
}

export default function CheckpointsDialog(props: Props) {
  const [label, setLabel] = useState(() => defaultLabel())

  return (
    <Modal title="Puntos de control" onClose={props.onClose} className="form">
      <p className="hint">
        Una copia del libro entero que puedes recuperar más tarde. El borrador automático
        te salva de un cierre inesperado; esto te salva de un reemplazo masivo que sale al revés.
      </p>

      <form
        className="cp-new"
        onSubmit={e => { e.preventDefault(); props.onCreate(label); setLabel(defaultLabel()) }}
      >
        <input
          value={label}
          onChange={e => setLabel(e.target.value)}
          placeholder="Antes de limpiar las comillas…"
          aria-label="Nombre del punto de control"
        />
        <button type="submit" className="primary">Crear punto de control</button>
      </form>

      {props.list.length === 0 ? (
        <p className="empty">Todavía no has creado ninguno.</p>
      ) : (
        <ul className="cp-list">
          {props.list.map(m => (
            <li key={m.id}>
              <div className="what">
                <strong>{m.label}</strong>
                <span className="hint">
                  {timeAgo(m.savedAt)} · {m.words.toLocaleString()} palabras ·{' '}
                  {m.files} archivos · {formatBytes(m.bytes)}
                </span>
                <span className="delta">{describeDelta(m, props.now)}</span>
              </div>
              {m.auto && <span className="badge-auto" title="Creado solo, antes de una operación masiva">auto</span>}
              <button className="ghost" onClick={() => props.onCompare(m)}>Comparar</button>
              <button onClick={() => props.onRestore(m)}>Restaurar</button>
              <button className="icon-btn danger" title="Eliminar" onClick={() => props.onDelete(m.id)}>
                <Icon name="trash" label="Eliminar" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <footer>
        <span className="hint">Se guardan los {20} más recientes.</span>
        <button className="primary" onClick={props.onClose}>Cerrar</button>
      </footer>
    </Modal>
  )
}
