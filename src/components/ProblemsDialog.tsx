import Modal from './Modal'
import { countBySeverity, type Problem } from '../lib/validate'

interface Props {
  problems: Problem[]
  onRecheck: () => void
  onGo: (p: Problem) => void
  onClose: () => void
}

export default function ProblemsDialog({ problems, onRecheck, onGo, onClose }: Props) {
  const { errors, warnings } = countBySeverity(problems)

  return (
    <Modal title="Revisión del libro" onClose={onClose} wide>
      <p className="hint">
        {problems.length === 0
          ? 'No se encontró ningún problema.'
          : `${errors} error${errors === 1 ? '' : 'es'} y ${warnings} aviso${warnings === 1 ? '' : 's'}. ` +
            'Los errores impiden que algunos lectores abran el libro; los avisos solo conviene arreglarlos.'}
      </p>

      {problems.length > 0 && (
        <ul className="problem-list">
          {problems.map((p, i) => (
            <li key={i} className={p.severity}>
              <button onClick={() => onGo(p)} title={`Ir a ${p.file}`}>
                <span className="badge">{p.severity === 'error' ? 'Error' : 'Aviso'}</span>
                <span className="problem-text">{p.message}</span>
                <span className="problem-where">
                  {p.file.split('/').pop()}
                  {p.line ? `:${p.line}` : ''}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      <footer>
        <span className="hint">Haz clic en un problema para abrir el archivo donde está.</span>
        <button className="ghost" onClick={onRecheck}>Revisar de nuevo</button>
        <button className="primary" onClick={onClose}>Cerrar</button>
      </footer>
    </Modal>
  )
}
