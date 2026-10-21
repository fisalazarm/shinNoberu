import { useMemo } from 'react'
import Modal from './Modal'
import type { EpubBook } from '../lib/epub'
import { prettyBytes } from '../lib/housekeeping'
import { reviewRelease, verdict, type Opens } from '../lib/release'

interface Props {
  book: EpubBook
  /** Cambia con cada modificación del libro: fuerza a repasar otra vez. */
  rev: number
  onOpen: (what: Opens) => void
  onClose: () => void
}

const DOT: Record<string, string> = { ok: '●', warn: '●', error: '●' }

export default function ReleaseDialog(props: Props) {
  const r = useMemo(() => reviewRelease(props.book), [props.book, props.rev])
  const errores = r.blocks.filter(b => b.level === 'error').length
  const avisos = r.blocks.filter(b => b.level === 'warn').length

  return (
    <Modal title="Antes de publicar" onClose={props.onClose} wide>
      <div className={`verdict ${r.level}`}>
        <span className="dot">{DOT[r.level]}</span>
        <div className="what">
          <strong>{verdict(r.level)}</strong>
          <span className="hint">
            {errores > 0 && `${errores} bloque${errores === 1 ? '' : 's'} con problemas`}
            {errores > 0 && avisos > 0 && ' · '}
            {avisos > 0 && `${avisos} con avisos`}
            {!errores && !avisos && 'Las nueve revisiones pasan.'}
          </span>
        </div>
        <span className="weigh">{r.words.toLocaleString('es')} palabras · {prettyBytes(r.bytes)}</span>
      </div>

      <ul className="release-list">
        {r.blocks.map(b => (
          <li key={b.id} className={b.level}>
            <span className="dot">{DOT[b.level]}</span>
            <span className="who">{b.label}</span>
            <span className="what">
              {b.summary}
              {b.advice && <span className="hint"> {b.advice}</span>}
            </span>
            {b.opens && (
              <button className="ghost small" onClick={() => props.onOpen(b.opens!)}>
                {b.level === 'ok' ? 'Ver' : 'Arreglar'}
              </button>
            )}
          </li>
        ))}
      </ul>

      <footer>
        <span className="hint">
          Se revisa lo mismo que miran las tiendas y lo que se nota al leer. Nada de esto cambia el libro.
        </span>
        <button className="ghost" onClick={props.onClose}>Cerrar</button>
      </footer>
    </Modal>
  )
}
