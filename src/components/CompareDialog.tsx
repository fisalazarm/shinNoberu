import { useEffect, useState } from 'react'
import Modal from './Modal'
import { timeAgo } from '../lib/autosave'
import { checkpointFiles, type CheckpointMeta } from '../lib/checkpoints'
import { compareFiles, type BookChange } from '../lib/diff'
import type { EpubBook } from '../lib/epub'

interface Props {
  book: EpubBook
  meta: CheckpointMeta
  onRestore: () => void
  onClose: () => void
}

const KIND_LABEL: Record<BookChange['kind'], string> = {
  changed: 'cambiado',
  added: 'nuevo',
  removed: 'borrado',
}

export default function CompareDialog(props: Props) {
  const [changes, setChanges] = useState<BookChange[] | null>(null)
  const [missing, setMissing] = useState(false)

  useEffect(() => {
    let alive = true
    checkpointFiles(props.meta.id).then(files => {
      if (!alive) return
      if (!files) return setMissing(true)
      setChanges(compareFiles(files, props.book.files))
    })
    return () => { alive = false }
  }, [props.meta.id, props.book])

  const name = (p: string) => p.split('/').pop()

  return (
    <Modal title={`Cambios desde «${props.meta.label}»`} onClose={props.onClose} className="form">
      <p className="hint">
        Punto de control de {timeAgo(props.meta.savedAt)}. Se comparan los archivos de
        texto línea a línea; de los binarios solo se mira el tamaño.
      </p>

      {missing && <p className="error">Ese punto de control ya no está disponible.</p>}
      {!missing && changes === null && <p className="empty">Comparando…</p>}
      {changes?.length === 0 && <p className="empty">El libro está igual que entonces.</p>}

      {!!changes?.length && (
        <ul className="diff-list">
          {changes.map(c => (
            <li key={c.path} className={c.kind}>
              <span className="badge">{KIND_LABEL[c.kind]}</span>
              <span className="path" title={c.path}>{name(c.path)}</span>
              {c.diff && (
                <span className="counts">
                  {c.diff.added > 0 && <span className="plus">+{c.diff.added}</span>}
                  {c.diff.removed > 0 && <span className="minus">−{c.diff.removed}</span>}
                  {c.diff.approximate && <span className="hint">aprox.</span>}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}

      <footer>
        <span className="hint">
          {changes?.length ? `${changes.length} archivo${changes.length === 1 ? '' : 's'}` : ''}
        </span>
        <button className="ghost danger" disabled={missing} onClick={props.onRestore}>
          Volver a este punto
        </button>
        <button className="primary" onClick={props.onClose}>Cerrar</button>
      </footer>
    </Modal>
  )
}
