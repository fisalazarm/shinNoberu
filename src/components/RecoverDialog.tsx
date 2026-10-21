import Modal from './Modal'
import { timeAgo, type Draft } from '../lib/autosave'

interface Props {
  draft: Draft
  onRecover: () => void
  onDiscard: () => void
}

export default function RecoverDialog({ draft, onRecover, onDiscard }: Props) {
  const docs = [...draft.files.values()].filter(f => f.mediaType === 'application/xhtml+xml').length

  return (
    <Modal title="Hay un borrador sin guardar" onClose={onRecover}>
      <div className="recover-box">
        <div className="what">
          <strong>{draft.fileName}</strong>
          <span className="hint">
            Guardado solo {timeAgo(draft.savedAt)}, con {draft.files.size} archivos
            {docs ? ` (${docs} de texto)` : ''}.
          </span>
        </div>
      </div>

      <p className="hint">
        El editor guarda un borrador mientras trabajas, por si se cierra el navegador.
        Si lo descartas no se puede deshacer.
      </p>

      <footer>
        <button className="ghost danger" onClick={onDiscard}>Descartar y empezar de cero</button>
        <button className="primary" onClick={onRecover}>Recuperar</button>
      </footer>
    </Modal>
  )
}
